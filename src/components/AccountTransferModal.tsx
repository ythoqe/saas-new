import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Landmark,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  PAYMENT_VALIDATION,
  type AccountRecord,
  type PaymentMethod,
} from '../types/mill';
import { getEffectiveAccounts } from '../utils/accounts';
import {
  formatCurrency,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

interface AccountTransferModalProps {
  open: boolean;
  ownerId: string;
  accounts: AccountRecord[];
  initialFromAccountId?: string;
  balancesByAccountId: Record<string, number>;
  onClose: () => void;
  onSuccess: (
    fromAccountName: string,
    toAccountName: string,
    amount: number,
    transferRef: string
  ) => void;
}

function generateTransferId(dateIso: string): string {
  const compact = dateIso.replaceAll('-', '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TRF-${compact}-${randomSuffix}`;
}

function getAccountIcon(accountType: PaymentMethod) {
  if (accountType === 'Cash') return Wallet;
  if (accountType === 'Bank') return Landmark;
  return Smartphone;
}

export function AccountTransferModal({
  open,
  ownerId,
  accounts,
  initialFromAccountId,
  balancesByAccountId,
  onClose,
  onSuccess,
}: AccountTransferModalProps) {
  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accounts, ownerId),
    [accounts, ownerId]
  );

  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amountInput, setAmountInput] = useState('');
  const [transferDate, setTransferDate] = useState(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const defaultFrom =
      effectiveAccounts.find((a) => a.id === initialFromAccountId)?.id ??
      effectiveAccounts[0]?.id ??
      '';
    const defaultTo =
      effectiveAccounts.find((a) => a.id !== defaultFrom)?.id ?? defaultFrom;

    setFromAccountId(defaultFrom);
    setToAccountId(defaultTo);
    setAmountInput('');
    setTransferDate(getTodayIsoDate());
    setNote('');
    setErrorMessage(null);
    setSubmitting(false);
  }, [open, initialFromAccountId, effectiveAccounts]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const fromAccount =
    effectiveAccounts.find((a) => a.id === fromAccountId) ??
    effectiveAccounts[0];
  const toAccount =
    effectiveAccounts.find((a) => a.id === toAccountId) ??
    effectiveAccounts[1] ??
    effectiveAccounts[0];

  const parsedAmount = Number(amountInput);
  const validAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? roundCurrency(parsedAmount)
      : 0;

  const currentFromBalance = fromAccount
    ? balancesByAccountId[fromAccount.id] ?? 0
    : 0;
  const currentToBalance = toAccount
    ? balancesByAccountId[toAccount.id] ?? 0
    : 0;
  const projectedFromBalance = roundCurrency(currentFromBalance - validAmount);
  const projectedToBalance = roundCurrency(currentToBalance + validAmount);
  const exceedsAvailable = validAmount > currentFromBalance;

  const handleFromChange = (nextFromId: string) => {
    setFromAccountId(nextFromId);
    if (nextFromId === toAccountId) {
      setToAccountId(fromAccountId);
    }
    setErrorMessage(null);
  };

  const handleToChange = (nextToId: string) => {
    setToAccountId(nextToId);
    if (nextToId === fromAccountId) {
      setFromAccountId(toAccountId);
    }
    setErrorMessage(null);
  };

  const handleSwap = () => {
    setFromAccountId(toAccountId);
    setToAccountId(fromAccountId);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fromAccount || !toAccount) {
      setErrorMessage('Please select both source and destination accounts.');
      return;
    }

    if (fromAccount.id === toAccount.id) {
      setErrorMessage('Source and destination accounts must be different.');
      return;
    }

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > PAYMENT_VALIDATION.maxAmount
    ) {
      setErrorMessage(
        `Please enter a valid transfer amount greater than 0 and up to ${formatCurrency(PAYMENT_VALIDATION.maxAmount)}.`
      );
      return;
    }

    if (!PAYMENT_VALIDATION.datePattern.test(transferDate)) {
      setErrorMessage('Please select a valid transfer date.');
      return;
    }

    const trimmedNote = note.trim().slice(0, PAYMENT_VALIDATION.noteMax);
    const cleanAmount = roundCurrency(parsedAmount);
    const transferRef = generateTransferId(transferDate);

    const outNote = (
      trimmedNote
        ? `Transfer to ${toAccount.accountName} — ${trimmedNote}`
        : `Transfer to ${toAccount.accountName}`
    ).slice(0, PAYMENT_VALIDATION.noteMax);

    const inNote = (
      trimmedNote
        ? `Transfer from ${fromAccount.accountName} — ${trimmedNote}`
        : `Transfer from ${fromAccount.accountName}`
    ).slice(0, PAYMENT_VALIDATION.noteMax);

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const moneyOutRef = doc(db, 'money_out', transferRef);
      const moneyInRef = doc(db, 'money_in', transferRef);

      batch.set(moneyOutRef, {
        ownerId,
        source: 'transfer',
        category: 'Transfer',
        transferId: transferRef,
        accountId: fromAccount.id,
        accountName: fromAccount.accountName,
        counterAccountId: toAccount.id,
        counterAccountName: toAccount.accountName,
        counterAccount: toAccount.accountType,
        reference: transferRef,
        amount: cleanAmount,
        paymentDate: transferDate,
        paymentMethod: fromAccount.accountType,
        note: outNote,
        createdAt: serverTimestamp(),
      });

      batch.set(moneyInRef, {
        ownerId,
        source: 'transfer',
        category: 'Transfer',
        transferId: transferRef,
        accountId: toAccount.id,
        accountName: toAccount.accountName,
        counterAccountId: fromAccount.id,
        counterAccountName: fromAccount.accountName,
        counterAccount: fromAccount.accountType,
        reference: transferRef,
        amount: cleanAmount,
        paymentDate: transferDate,
        paymentMethod: toAccount.accountType,
        note: inNote,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      onSuccess(
        fromAccount.accountName,
        toAccount.accountName,
        cleanAmount,
        transferRef
      );
    } catch (err) {
      try {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `money_out/${transferRef}+money_in/${transferRef}`
        );
      } catch (wrapped) {
        setErrorMessage(
          wrapped instanceof Error
            ? wrapped.message
            : 'Failed to complete account transfer. Please try again.'
        );
      }
      setSubmitting(false);
    }
  };

  const FromIcon = getAccountIcon(fromAccount?.accountType ?? 'Cash');
  const ToIcon = getAccountIcon(toAccount?.accountType ?? 'Bank');

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-transfer-modal-title"
    >
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!submitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4 text-blue-200" />
            </div>
            <div>
              <h2
                id="account-transfer-modal-title"
                className="text-sm font-semibold"
              >
                Account Transfer
              </h2>
              <p className="text-[11px] text-slate-300">
                Move funds atomically between your Cash, Bank, and Mobile
                Banking accounts
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close transfer modal"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800"
            >
              {errorMessage}
            </div>
          )}

          {/* From / Swap / To Account Selector (Dynamic Accounts Dropdown) */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <label
                htmlFor="transfer-from-account"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                From Account (Source)
              </label>
              <select
                id="transfer-from-account"
                value={fromAccount?.id ?? ''}
                onChange={(e) => handleFromChange(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              >
                {effectiveAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} ({acc.accountType})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Available:{' '}
                <strong
                  className={
                    currentFromBalance >= 0
                      ? 'text-slate-800'
                      : 'text-red-700'
                  }
                >
                  {formatCurrency(currentFromBalance)}
                </strong>
              </p>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              disabled={submitting}
              title="Swap source and destination accounts"
              className="self-center sm:mb-5 inline-flex items-center justify-center p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <div>
              <label
                htmlFor="transfer-to-account"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                To Account (Destination)
              </label>
              <select
                id="transfer-to-account"
                value={toAccount?.id ?? ''}
                onChange={(e) => handleToChange(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              >
                {effectiveAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} ({acc.accountType})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Current:{' '}
                <strong
                  className={
                    currentToBalance >= 0 ? 'text-slate-800' : 'text-red-700'
                  }
                >
                  {formatCurrency(currentToBalance)}
                </strong>
              </p>
            </div>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="transfer-amount"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Transfer Amount (৳)
              </label>
              <input
                id="transfer-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={PAYMENT_VALIDATION.maxAmount}
                required
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm font-semibold tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="transfer-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Transfer Date
              </label>
              <input
                id="transfer-date"
                type="date"
                required
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label
              htmlFor="transfer-note"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Note / Deposit Slip Reference (Optional)
            </label>
            <input
              id="transfer-note"
              type="text"
              maxLength={240}
              placeholder="e.g., Cash deposited to City Bank or bKash settlement"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
            />
          </div>

          {/* Live Projected Balance Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Projected Balances After Atomic Transfer
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
              <div className="bg-white border border-slate-200 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                  <FromIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {fromAccount?.accountName ?? 'Source'}
                  </span>
                </div>
                <p
                  className={`mt-1 text-sm font-bold tabular-nums ${
                    projectedFromBalance >= 0
                      ? 'text-slate-900'
                      : 'text-red-700'
                  }`}
                >
                  {formatCurrency(projectedFromBalance)}
                </p>
                {validAmount > 0 && (
                  <p className="text-[11px] text-red-600 tabular-nums">
                    − {formatCurrency(validAmount)}
                  </p>
                )}
              </div>

              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

              <div className="bg-white border border-slate-200 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                  <ToIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {toAccount?.accountName ?? 'Destination'}
                  </span>
                </div>
                <p
                  className={`mt-1 text-sm font-bold tabular-nums ${
                    projectedToBalance >= 0
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }`}
                >
                  {formatCurrency(projectedToBalance)}
                </p>
                {validAmount > 0 && (
                  <p className="text-[11px] text-emerald-600 tabular-nums">
                    + {formatCurrency(validAmount)}
                  </p>
                )}
              </div>
            </div>

            {exceedsAvailable && fromAccount && (
              <div className="flex items-start gap-2 pt-1 text-[11px] text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Transfer exceeds current {fromAccount.accountName} balance and
                  will leave it negative ({formatCurrency(projectedFromBalance)}
                  ).
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                validAmount <= 0 ||
                !fromAccount ||
                !toAccount ||
                fromAccount.id === toAccount.id
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowLeftRight className="w-4 h-4" />
              {submitting ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
