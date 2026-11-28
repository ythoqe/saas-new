import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  HandCoins,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ADVANCE_PAYMENT_METHODS,
  ADVANCE_VALIDATION,
  type AccountRecord,
  type AdvancePaymentMethod,
  type EmployeeRecord,
} from '../types/mill';
import { getEffectiveAccounts } from '../utils/accounts';
import {
  formatCurrency,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

interface GiveAdvanceModalProps {
  employee: EmployeeRecord | null;
  monthAdvanceSoFar: number;
  currentMonthLabel: string;
  ownerId: string;
  accounts: AccountRecord[];
  onClose: () => void;
  onAdvanceGiven: (
    employee: EmployeeRecord,
    amount: number,
    advanceRef: string,
    paymentMethod: AdvancePaymentMethod
  ) => void;
}

export function GiveAdvanceModal({
  employee,
  monthAdvanceSoFar,
  currentMonthLabel,
  ownerId,
  accounts,
  onClose,
  onAdvanceGiven,
}: GiveAdvanceModalProps) {
  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accounts, ownerId),
    [accounts, ownerId]
  );

  const [amountInput, setAmountInput] = useState('');
  const [advanceDate, setAdvanceDate] = useState(() => getTodayIsoDate());
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    () => effectiveAccounts[0]?.id ?? 'default_cash'
  );
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (employee) {
      setAmountInput('');
      setAdvanceDate(getTodayIsoDate());
      setSelectedAccountId(effectiveAccounts[0]?.id ?? 'default_cash');
      setNote('');
      setErrorMsg(null);
    }
  }, [employee, effectiveAccounts]);

  useEffect(() => {
    if (!employee) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [employee, isSubmitting, onClose]);

  if (!employee) return null;

  const selectedAccount =
    effectiveAccounts.find((acc) => acc.id === selectedAccountId) ??
    effectiveAccounts[0];
  const paymentMethod: AdvancePaymentMethod =
    selectedAccount?.accountType ?? 'Cash';

  const currentYearMonth = getTodayIsoDate().slice(0, 7);
  const isCurrentMonthDate = advanceDate.startsWith(currentYearMonth);

  const parsedAmount = Number(amountInput);
  const isValidAmount =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= ADVANCE_VALIDATION.maxAmount;
  const cleanAmount = isValidAmount ? roundCurrency(parsedAmount) : null;

  const projectedMonthAdvance =
    cleanAmount !== null && isCurrentMonthDate
      ? roundCurrency(monthAdvanceSoFar + cleanAmount)
      : monthAdvanceSoFar;
  const projectedRemainingSalary = roundCurrency(
    employee.basicSalary - projectedMonthAdvance
  );
  const exceedsSalary = projectedRemainingSalary < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (cleanAmount === null) {
      setErrorMsg(
        `Please enter a valid advance amount greater than 0 and at most ${formatCurrency(ADVANCE_VALIDATION.maxAmount)}.`
      );
      return;
    }

    if (!ADVANCE_VALIDATION.datePattern.test(advanceDate)) {
      setErrorMsg('Advance date must be in YYYY-MM-DD format.');
      return;
    }

    if (!selectedAccount || !ADVANCE_PAYMENT_METHODS.includes(paymentMethod)) {
      setErrorMsg('Please select a valid payment account.');
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > ADVANCE_VALIDATION.noteMax) {
      setErrorMsg(
        `Note must be at most ${ADVANCE_VALIDATION.noteMax} characters.`
      );
      return;
    }

    const rawAutoId = doc(collection(db, 'employee_advances')).id
      .slice(0, 8)
      .toUpperCase();
    const advanceRef = `ADV-${rawAutoId}`;

    const moneyOutNote =
      trimmedNote ||
      `Weekly advance — ${employee.name} (${employee.department})`;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const advanceDocRef = doc(db, 'employee_advances', advanceRef);
      const moneyOutDocRef = doc(db, 'money_out', advanceRef);

      // 1. Save weekly advance in employee_advances (marked undeducted until salary settlement)
      batch.set(advanceDocRef, {
        ownerId,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        moneyOutId: advanceRef,
        reference: advanceRef,
        amount: cleanAmount,
        advanceDate,
        paymentMethod,
        note: trimmedNote,
        deducted: false,
        createdAt: serverTimestamp(),
      });

      // 2. Atomically record outflow in money_out linked to selected accountId
      batch.set(moneyOutDocRef, {
        ownerId,
        employeeId: employee.id,
        advanceId: advanceRef,
        category: 'Employee Advance',
        reference: advanceRef,
        amount: cleanAmount,
        paymentDate: advanceDate,
        paymentMethod,
        accountId: selectedAccount.id,
        accountName: selectedAccount.accountName,
        note: moneyOutNote.slice(0, ADVANCE_VALIDATION.noteMax),
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `employee_advances/${advanceRef}`
        );
      }

      onAdvanceGiven(employee, cleanAmount, advanceRef, paymentMethod);
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Unable to record employee advance.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="give-advance-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 transition-opacity"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-100 text-[#1e3a8a] flex items-center justify-center shrink-0">
              <HandCoins className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="give-advance-title"
                className="font-display text-base font-semibold text-slate-900 truncate"
              >
                Give Weekly Advance
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {employee.name} · {employee.department}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close advance modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {errorMsg}
            </div>
          )}

          {/* Employee Salary & Advance Summary */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div>
              <p className="text-[11px] font-medium text-slate-500">
                Basic Monthly Salary
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900">
                {formatCurrency(employee.basicSalary)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">
                Advance ({currentMonthLabel})
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-amber-700">
                {formatCurrency(monthAdvanceSoFar)}
              </p>
            </div>
          </div>

          {/* Advance Amount */}
          <div>
            <label
              htmlFor="advanceAmount"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Advance Amount <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                ৳
              </span>
              <input
                id="advanceAmount"
                type="number"
                required
                autoFocus
                min="0.01"
                max={ADVANCE_VALIDATION.maxAmount}
                step="0.01"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="advanceDate"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Date <span className="text-red-600">*</span>
            </label>
            <input
              id="advanceDate"
              type="date"
              required
              value={advanceDate}
              onChange={(e) => setAdvanceDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          {/* Payment Method / Account (Dynamic Dropdown from accounts collection) */}
          <div>
            <label
              htmlFor="advanceAccountSelect"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Payment Method / Account <span className="text-red-600">*</span>
            </label>
            <select
              id="advanceAccountSelect"
              required
              value={selectedAccount?.id ?? selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            >
              {effectiveAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} ({acc.accountType})
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="advanceNote"
                className="block text-sm font-medium text-slate-700"
              >
                Note (Optional)
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {note.length}/{ADVANCE_VALIDATION.noteMax}
              </span>
            </div>
            <input
              id="advanceNote"
              type="text"
              maxLength={ADVANCE_VALIDATION.noteMax}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Week 4 advance, family emergency..."
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          {/* Projected Balance Preview */}
          {cleanAmount !== null && (
            <div
              className={`p-3 rounded-md border text-xs space-y-1.5 ${
                exceedsSalary
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>
                  {isCurrentMonthDate
                    ? `Projected ${currentMonthLabel} Advance:`
                    : 'Current Month Advance:'}
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(projectedMonthAdvance)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Est. Remaining Monthly Salary:</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    exceedsSalary ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(projectedRemainingSalary)}
                </span>
              </div>
              {exceedsSalary && (
                <p className="flex items-center gap-1.5 pt-1 text-[11px] font-medium text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Monthly advances will exceed basic monthly salary.
                </p>
              )}
            </div>
          )}

          {/* Atomic Posting Info */}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Atomically saves to{' '}
            <span className="font-mono text-slate-700">employee_advances</span>{' '}
            and posts an outflow to{' '}
            <span className="font-mono text-slate-700">money_out</span> (
            <span className="font-mono">ADV-[AutoID]</span>, category{' '}
            <span className="font-medium text-slate-700">Employee Advance</span>
            ), updating Net Cash Balance immediately.
          </p>

          {/* Footer buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || cleanAmount === null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <HandCoins className="w-3.5 h-3.5 shrink-0" />
              {isSubmitting ? 'Saving Advance...' : 'Confirm Advance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
