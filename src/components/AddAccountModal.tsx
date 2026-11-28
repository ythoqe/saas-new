import React, { useEffect, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Landmark, Plus, Smartphone, Wallet, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ACCOUNT_TYPES,
  ACCOUNT_VALIDATION,
  type AccountRecord,
  type PaymentMethod,
} from '../types/mill';
import { formatCurrency, roundCurrency } from '../utils/ledger';

interface AddAccountModalProps {
  open: boolean;
  ownerId: string;
  existingAccounts: AccountRecord[];
  onClose: () => void;
  onAccountAdded: (accountName: string, accountType: PaymentMethod) => void;
}

const QUICK_PRESETS: ReadonlyArray<{
  name: string;
  type: PaymentMethod;
}> = [
  { name: 'City Bank', type: 'Bank' },
  { name: 'Islami Bank', type: 'Bank' },
  { name: 'Dutch-Bangla Bank', type: 'Bank' },
  { name: 'bKash Merchant', type: 'Mobile Banking' },
  { name: 'Nagad', type: 'Mobile Banking' },
  { name: 'Petty Cash', type: 'Cash' },
];

export function AddAccountModal({
  open,
  ownerId,
  existingAccounts,
  onClose,
  onAccountAdded,
}: AddAccountModalProps) {
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<PaymentMethod>('Bank');
  const [openingBalanceInput, setOpeningBalanceInput] = useState('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountName('');
      setAccountType('Bank');
      setOpeningBalanceInput('0');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  const trimmedName = accountName.trim();
  const parsedOpening =
    openingBalanceInput.trim() === '' ? 0 : Number(openingBalanceInput);
  const isValidOpening =
    Number.isFinite(parsedOpening) &&
    parsedOpening >= 0 &&
    parsedOpening <= ACCOUNT_VALIDATION.maxOpeningBalance;
  const cleanOpeningBalance = isValidOpening ? roundCurrency(parsedOpening) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (
      trimmedName.length < ACCOUNT_VALIDATION.accountNameMin ||
      trimmedName.length > ACCOUNT_VALIDATION.accountNameMax
    ) {
      setErrorMessage(
        `Please enter an account name between 1 and ${ACCOUNT_VALIDATION.accountNameMax} characters (e.g., "City Bank", "bKash Merchant").`
      );
      return;
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      setErrorMessage('Please select a valid account type.');
      return;
    }

    if (cleanOpeningBalance === null) {
      setErrorMessage(
        `Opening balance must be between 0 and ${formatCurrency(ACCOUNT_VALIDATION.maxOpeningBalance)}.`
      );
      return;
    }

    const duplicate = existingAccounts.some(
      (acc) => acc.accountName.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setErrorMessage(
        `An account named "${trimmedName}" already exists. Please use a distinct account name.`
      );
      return;
    }

    const rawId = doc(collection(db, 'accounts')).id.slice(0, 10).toUpperCase();
    const accountId = `ACC-${rawId}`;

    setIsSubmitting(true);
    try {
      try {
        await setDoc(doc(db, 'accounts', accountId), {
          ownerId,
          accountName: trimmedName,
          accountType,
          openingBalance: cleanOpeningBalance,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `accounts/${accountId}`);
      }

      onAccountAdded(trimmedName, accountType);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to create account. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const TypeIcon =
    accountType === 'Cash'
      ? Wallet
      : accountType === 'Bank'
        ? Landmark
        : Smartphone;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-account-modal-title"
    >
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <TypeIcon className="w-4 h-4 text-blue-200" />
            </div>
            <div>
              <h2
                id="add-account-modal-title"
                className="text-sm font-semibold"
              >
                Add New Account
              </h2>
              <p className="text-[11px] text-slate-300">
                Create a custom Cash, Bank, or Mobile Banking account
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close add account modal"
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

          {/* Account Name + Quick Presets */}
          <div>
            <label
              htmlFor="new-account-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Account Name <span className="text-red-600">*</span>
            </label>
            <input
              id="new-account-name"
              type="text"
              required
              autoFocus
              maxLength={ACCOUNT_VALIDATION.accountNameMax}
              placeholder='e.g., "City Bank", "Islami Bank", "bKash Merchant", "Nagad"'
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
            />

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1">
                Quick fill:
              </span>
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setAccountName(preset.name);
                    setAccountType(preset.type);
                  }}
                  className="px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-colors cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Account Type Dropdown & Opening Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="new-account-type"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Account Type <span className="text-red-600">*</span>
              </label>
              <select
                id="new-account-type"
                value={accountType}
                onChange={(e) =>
                  setAccountType(e.target.value as PaymentMethod)
                }
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="new-account-opening-balance"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Opening Balance (৳)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                  ৳
                </span>
                <input
                  id="new-account-opening-balance"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={ACCOUNT_VALIDATION.maxOpeningBalance}
                  step="0.01"
                  value={openingBalanceInput}
                  onChange={(e) => setOpeningBalanceInput(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono font-semibold tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                />
              </div>
            </div>
          </div>

          {/* Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                New Account Preview
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                {trimmedName || 'Account Name'}
              </p>
              <p className="text-xs text-slate-500">{accountType}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-slate-500">Initial Balance</p>
              <p className="font-mono text-base font-bold tabular-nums text-emerald-700 mt-0.5">
                {formatCurrency(cleanOpeningBalance ?? 0)}
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                trimmedName.length === 0 ||
                cleanOpeningBalance === null
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
