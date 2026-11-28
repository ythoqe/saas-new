import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CHEQUE_VALIDATION,
  type AccountRecord,
  type ChequeRecord,
  type SupplierWithLedgerSummary,
} from '../types/mill';
import { getEffectiveAccounts } from '../utils/accounts';
import {
  formatCurrency,
  formatIsoDate,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

export type ChequeActionKind =
  | 'self_clear'
  | 'endorse'
  | 'supplier_clear'
  | 'bounce';

export interface ChequeActionTarget {
  cheque: ChequeRecord;
  action: ChequeActionKind;
}

interface ChequeActionModalProps {
  target: ChequeActionTarget | null;
  ownerId: string;
  accounts: AccountRecord[];
  supplierSummaries: SupplierWithLedgerSummary[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function generateReference(prefix: string, dateIso: string): string {
  const compact = dateIso.replaceAll('-', '');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${compact}-${suffix}`;
}

export function ChequeActionModal({
  target,
  ownerId,
  accounts,
  supplierSummaries,
  onClose,
  onSuccess,
}: ChequeActionModalProps) {
  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accounts, ownerId),
    [accounts, ownerId]
  );
  const bankAccounts = useMemo(() => {
    const banks = effectiveAccounts.filter((acc) => acc.accountType === 'Bank');
    return banks.length > 0 ? banks : effectiveAccounts;
  }, [effectiveAccounts]);

  const [actionDate, setActionDate] = useState(() => getTodayIsoDate());
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [bounceReason, setBounceReason] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setActionDate(getTodayIsoDate());
    setSelectedBankAccountId(bankAccounts[0]?.id ?? 'default_bank');
    setSelectedSupplierId(supplierSummaries[0]?.supplier.id ?? '');
    setBounceReason('');
    setExtraNote(target.cheque.note || '');
    setErrorMessage(null);
    setSubmitting(false);
  }, [target, supplierSummaries, bankAccounts]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, submitting, onClose]);

  if (!target) return null;

  const { cheque, action } = target;
  const amount = roundCurrency(cheque.amount);

  const selectedBankAccount =
    bankAccounts.find((acc) => acc.id === selectedBankAccountId) ??
    bankAccounts[0];

  const selectedSupplierSummary = supplierSummaries.find(
    (item) => item.supplier.id === selectedSupplierId
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!CHEQUE_VALIDATION.datePattern.test(actionDate)) {
      setErrorMessage('Please select a valid date.');
      return;
    }

    const cleanNote = extraNote.trim().slice(0, CHEQUE_VALIDATION.noteMax);
    setSubmitting(true);

    try {
      if (action === 'self_clear') {
        const depositAccName = selectedBankAccount?.accountName || 'Bank Account';
        const depositAccId = selectedBankAccount?.id || 'default_bank';
        const paymentId = generateReference('PAY', actionDate);
        const batch = writeBatch(db);
        const entryNote = (
          `Cheque Self Clear #${cheque.chequeNo} (${cheque.bankName}) → ${depositAccName}${cleanNote ? ` — ${cleanNote}` : ''}`
        ).slice(0, 300);

        batch.set(doc(db, 'client_ledger', paymentId), {
          ownerId,
          clientId: cheque.clientId,
          txn_type: 'payment',
          debit: 0,
          credit: amount,
          note: entryNote,
          reference: paymentId,
          createdAt: serverTimestamp(),
        });

        batch.set(doc(db, 'money_in', paymentId), {
          ownerId,
          clientId: cheque.clientId,
          ledgerEntryId: paymentId,
          reference: paymentId,
          amount,
          paymentDate: actionDate,
          paymentMethod: 'Bank',
          accountId: depositAccId,
          accountName: depositAccName,
          note: entryNote,
          createdAt: serverTimestamp(),
        });

        batch.update(doc(db, 'cheques', cheque.id), {
          status: 'Cleared (Self)',
          clearedDate: actionDate,
          moneyInId: paymentId,
          clientLedgerEntryId: paymentId,
          note: cleanNote,
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        onSuccess(
          `Cheque #${cheque.chequeNo} cleared to ${depositAccName} (${formatCurrency(amount)}). Account balance increased and ${cheque.clientName}'s due reduced (${paymentId}).`
        );
        return;
      }

      if (action === 'endorse') {
        if (!selectedSupplierSummary) {
          setErrorMessage('Please select a supplier to endorse this cheque to.');
          setSubmitting(false);
          return;
        }
        const supplierName = selectedSupplierSummary.supplier.supplierName
          .trim()
          .slice(0, 120);

        await updateDoc(doc(db, 'cheques', cheque.id), {
          status: 'Endorsed to Supplier',
          endorsedSupplierId: selectedSupplierSummary.supplier.id,
          endorsedSupplierName: supplierName,
          endorsedDate: actionDate,
          note: cleanNote,
          updatedAt: serverTimestamp(),
        });

        onSuccess(
          `Cheque #${cheque.chequeNo} (${formatCurrency(amount)}) endorsed to ${supplierName}. Ledgers remain unchanged until cleared.`
        );
        return;
      }

      if (action === 'supplier_clear') {
        if (!cheque.endorsedSupplierId) {
          setErrorMessage('Missing endorsed supplier on this cheque.');
          setSubmitting(false);
          return;
        }
        const supplierLedgerId = generateReference('CHQS', actionDate);
        const clientLedgerId = generateReference('CHQC', actionDate);
        const supplierDisplay = cheque.endorsedSupplierName || 'Supplier';

        const supplierNote = (
          `Endorsed Cheque #${cheque.chequeNo} (${cheque.bankName}) from ${cheque.clientName} cleared by supplier${cleanNote ? ` — ${cleanNote}` : ''}`
        ).slice(0, 300);

        const clientNote = (
          `Cheque #${cheque.chequeNo} (${cheque.bankName}) cleared via endorsement to ${supplierDisplay}${cleanNote ? ` — ${cleanNote}` : ''}`
        ).slice(0, 300);

        const batch = writeBatch(db);

        batch.set(doc(db, 'supplier_ledger', supplierLedgerId), {
          ownerId,
          supplierId: cheque.endorsedSupplierId,
          txn_type: 'payment',
          debit: amount,
          credit: 0,
          reference: supplierLedgerId,
          note: supplierNote,
          createdAt: serverTimestamp(),
        });

        batch.set(doc(db, 'client_ledger', clientLedgerId), {
          ownerId,
          clientId: cheque.clientId,
          txn_type: 'payment',
          debit: 0,
          credit: amount,
          reference: clientLedgerId,
          note: clientNote,
          createdAt: serverTimestamp(),
        });

        batch.update(doc(db, 'cheques', cheque.id), {
          status: 'Cleared (Supplier)',
          clearedDate: actionDate,
          supplierLedgerEntryId: supplierLedgerId,
          clientLedgerEntryId: clientLedgerId,
          note: cleanNote,
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        onSuccess(
          `Cheque #${cheque.chequeNo} (${formatCurrency(amount)}) cleared by ${supplierDisplay}. Supplier payable and ${cheque.clientName}'s due both reduced atomically.`
        );
        return;
      }

      // action === 'bounce'
      const cleanReason = bounceReason
        .trim()
        .slice(0, CHEQUE_VALIDATION.bounceReasonMax);

      await updateDoc(doc(db, 'cheques', cheque.id), {
        status: 'Bounced',
        bouncedDate: actionDate,
        bounceReason: cleanReason,
        note: cleanNote,
        updatedAt: serverTimestamp(),
      });

      onSuccess(
        `Cheque #${cheque.chequeNo} marked as Bounced. Bank balance and party ledgers were not modified.`
      );
    } catch (err) {
      try {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `cheques/${cheque.id}/${action}`
        );
      } catch (wrapped) {
        setErrorMessage(
          wrapped instanceof Error
            ? wrapped.message
            : 'Unable to update cheque status. Please try again.'
        );
      }
      setSubmitting(false);
    }
  };

  const config = {
    self_clear: {
      title: 'Self Clear Cheque (Deposit to Bank)',
      subtitle: 'Atomic update: Cheque + Bank Money In + Client Ledger Credit',
      headerBg: 'bg-emerald-900',
      icon: Building2,
      iconTone: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200',
      dateLabel: 'Bank Deposit / Clearing Date',
      ctaLabel: 'Confirm Self Clear',
      ctaClass: 'bg-emerald-700 hover:bg-emerald-800',
    },
    endorse: {
      title: 'Endorse Cheque to Supplier',
      subtitle: 'Hand over client cheque to a vendor (does not alter ledgers yet)',
      headerBg: 'bg-indigo-950',
      icon: Send,
      iconTone: 'bg-indigo-500/20 border-indigo-400/30 text-indigo-200',
      dateLabel: 'Endorsement Date',
      ctaLabel: 'Endorse Cheque',
      ctaClass: 'bg-[#1e3a8a] hover:bg-[#1e40af]',
    },
    supplier_clear: {
      title: 'Confirm Cleared by Supplier',
      subtitle: 'Atomic update: Cheque + Supplier Payable Debit + Client Due Credit',
      headerBg: 'bg-teal-900',
      icon: CheckCircle2,
      iconTone: 'bg-teal-500/20 border-teal-400/30 text-teal-200',
      dateLabel: 'Supplier Clearing Date',
      ctaLabel: 'Mark Cleared by Supplier',
      ctaClass: 'bg-teal-700 hover:bg-teal-800',
    },
    bounce: {
      title: 'Mark Cheque as Bounced',
      subtitle: 'Record dishonored/failed cheque without touching bank or ledgers',
      headerBg: 'bg-red-950',
      icon: XCircle,
      iconTone: 'bg-red-500/20 border-red-400/30 text-red-200',
      dateLabel: 'Bounce / Dishonor Date',
      ctaLabel: 'Confirm Bounced',
      ctaClass: 'bg-red-700 hover:bg-red-800',
    },
  }[action];

  const HeaderIcon = config.icon;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cheque-action-modal-title"
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
        <div
          className={`px-6 py-4 text-white flex items-center justify-between gap-3 ${config.headerBg}`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${config.iconTone}`}
            >
              <HeaderIcon className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="cheque-action-modal-title"
                className="text-sm font-semibold"
              >
                {config.title}
              </h2>
              <p className="text-[11px] text-white/75">{config.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close cheque action modal"
            className="p-1.5 text-white/75 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800"
            >
              {errorMessage}
            </div>
          )}

          {/* Cheque Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[11px] text-slate-400">Client</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {cheque.clientName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Cheque Amount</p>
              <p className="text-base font-bold tabular-nums text-slate-950 mt-0.5">
                {formatCurrency(amount)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Bank &amp; Cheque No</p>
              <p className="font-medium text-slate-800 mt-0.5">
                {cheque.bankName}{' '}
                <span className="font-mono text-slate-500">
                  #{cheque.chequeNo}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Cheque Date</p>
              <p className="font-medium text-slate-800 tabular-nums mt-0.5">
                {formatIsoDate(cheque.chequeDate)}
              </p>
            </div>
            {cheque.endorsedSupplierName && (
              <div className="col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Endorsed Supplier
                </span>
                <span className="font-semibold text-indigo-800">
                  {cheque.endorsedSupplierName}
                </span>
              </div>
            )}
          </div>

          {/* Action-Specific Controls */}
          {action === 'self_clear' && (
            <div>
              <label
                htmlFor="cheque-deposit-bank-select"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Deposit Into Bank Account
              </label>
              <select
                id="cheque-deposit-bank-select"
                value={selectedBankAccount?.id ?? selectedBankAccountId}
                onChange={(e) => setSelectedBankAccountId(e.target.value)}
                disabled={submitting}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} ({acc.accountType})
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === 'endorse' && (
            <div>
              <label
                htmlFor="endorse-supplier-select"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Select Supplier
              </label>
              {supplierSummaries.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
                  No suppliers found. Add a supplier before endorsing a cheque.
                </div>
              ) : (
                <select
                  id="endorse-supplier-select"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  disabled={submitting}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                >
                  {supplierSummaries.map((item) => (
                    <option key={item.supplier.id} value={item.supplier.id}>
                      {item.supplier.supplierName} ({item.supplier.companyName})
                      — Payable: {formatCurrency(item.totalPayable)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Date Field */}
          <div>
            <label
              htmlFor="cheque-action-date"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              {config.dateLabel}
            </label>
            <input
              id="cheque-action-date"
              type="date"
              required
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
            />
          </div>

          {action === 'bounce' && (
            <div>
              <label
                htmlFor="cheque-bounce-reason"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Bounce Reason (Optional)
              </label>
              <input
                id="cheque-bounce-reason"
                type="text"
                maxLength={CHEQUE_VALIDATION.bounceReasonMax}
                placeholder="e.g., Insufficient funds, Signature mismatch, Payment stopped"
                value={bounceReason}
                onChange={(e) => setBounceReason(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>
          )}

          {/* Note */}
          <div>
            <label
              htmlFor="cheque-action-note"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Note (Optional)
            </label>
            <input
              id="cheque-action-note"
              type="text"
              maxLength={CHEQUE_VALIDATION.noteMax}
              placeholder="Add reference or deposit slip details"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
            />
          </div>

          {/* Atomic Accounting Effect Preview */}
          {action === 'self_clear' && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-950 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Atomic Batch Posting Preview
              </p>
              <ul className="space-y-1 pl-5 list-disc text-emerald-900 tabular-nums">
                <li>
                  <strong>Bank Account (money_in):</strong> +
                  {formatCurrency(amount)} (Bank)
                </li>
                <li>
                  <strong>Client Ledger ({cheque.clientName}):</strong> Credit{' '}
                  {formatCurrency(amount)} (reduces due)
                </li>
                <li>
                  <strong>Cheque Status:</strong> Pending{' '}
                  <ArrowRight className="inline w-3 h-3" /> Cleared (Self)
                </li>
              </ul>
            </div>
          )}

          {action === 'endorse' && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md text-xs text-indigo-950">
              Endorsing transfers custody of the cheque to the selected supplier
              without changing your Bank Balance or Supplier Payable until the
              supplier cashes it.
            </div>
          )}

          {action === 'supplier_clear' && (
            <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-md text-xs text-teal-950 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-700" />
                Atomic Batch Posting Preview
              </p>
              <ul className="space-y-1 pl-5 list-disc text-teal-900 tabular-nums">
                <li>
                  <strong>
                    Supplier Ledger ({cheque.endorsedSupplierName || 'Supplier'}):
                  </strong>{' '}
                  Debit {formatCurrency(amount)} (reduces payable)
                </li>
                <li>
                  <strong>Client Ledger ({cheque.clientName}):</strong> Credit{' '}
                  {formatCurrency(amount)} (settles client due)
                </li>
                <li>
                  <strong>Our Bank Account:</strong> Unchanged (cashed directly by
                  supplier)
                </li>
              </ul>
            </div>
          )}

          {action === 'bounce' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                Marking this cheque as <strong>Bounced</strong> is final and
                leaves Bank Balance, Client Due, and Supplier Payable untouched.
              </span>
            </div>
          )}

          {/* Footer Buttons */}
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
                (action === 'endorse' && supplierSummaries.length === 0)
              }
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-md transition-colors cursor-pointer disabled:opacity-50 ${config.ctaClass}`}
            >
              {submitting ? 'Processing...' : config.ctaLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
