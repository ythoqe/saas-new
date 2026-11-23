import React, { useEffect, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Banknote, Building2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LEDGER_VALIDATION,
  PAYMENT_VALIDATION,
  SUPPLIER_PAYMENT_METHODS,
  type SupplierPaymentMethod,
  type SupplierRecord,
} from '../types/mill';
import { formatCurrency, getTodayIsoDate, roundCurrency } from '../utils/ledger';

interface PaySupplierModalProps {
  supplier: SupplierRecord | null;
  currentTotalPayable: number;
  ownerId: string;
  onClose: () => void;
  onPaymentSent: (
    supplier: SupplierRecord,
    amount: number,
    paymentRef: string
  ) => void;
}

export function PaySupplierModal({
  supplier,
  currentTotalPayable,
  ownerId,
  onClose,
  onPaymentSent,
}: PaySupplierModalProps) {
  const [amountInput, setAmountInput] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => getTodayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>('Cash');
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (supplier) {
      setAmountInput('');
      setPaymentDate(getTodayIsoDate());
      setPaymentMethod('Cash');
      setNote('');
      setErrorMessage(null);
    }
  }, [supplier]);

  if (!supplier) return null;

  const parsedAmount = Number(amountInput);
  const isValidAmount =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= PAYMENT_VALIDATION.maxAmount;
  const cleanAmount = isValidAmount ? roundCurrency(parsedAmount) : null;
  const projectedPayable =
    cleanAmount !== null
      ? roundCurrency(currentTotalPayable - cleanAmount)
      : currentTotalPayable;

  const methodIcons: Record<SupplierPaymentMethod, typeof Banknote> = {
    Cash: Banknote,
    Bank: Building2,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cleanAmount === null) {
      setErrorMessage(
        `Please enter a valid payment amount greater than 0 and at most ${formatCurrency(PAYMENT_VALIDATION.maxAmount)}.`
      );
      return;
    }

    if (!PAYMENT_VALIDATION.datePattern.test(paymentDate)) {
      setErrorMessage('Payment date must be in YYYY-MM-DD format.');
      return;
    }

    if (!SUPPLIER_PAYMENT_METHODS.includes(paymentMethod)) {
      setErrorMessage('Please choose Cash or Bank.');
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > PAYMENT_VALIDATION.noteMax) {
      setErrorMessage(
        `Note must be at most ${PAYMENT_VALIDATION.noteMax} characters.`
      );
      return;
    }

    const rawAutoId = doc(collection(db, 'supplier_ledger')).id
      .slice(0, 8)
      .toUpperCase();
    const paymentRef = `SPAY-${rawAutoId}`;

    const combinedLedgerNote = trimmedNote
      ? `${paymentMethod} (${paymentDate}) — ${trimmedNote}`
      : `${paymentMethod} payment sent (${paymentDate})`;
    const safeLedgerNote = combinedLedgerNote.slice(0, LEDGER_VALIDATION.noteMax);

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const ledgerRef = doc(db, 'supplier_ledger', paymentRef);
      const moneyOutRef = doc(db, 'money_out', paymentRef);

      // 1. Atomic debit entry in append-only supplier_ledger (decreases our payable)
      batch.set(ledgerRef, {
        ownerId,
        supplierId: supplier.id,
        txn_type: 'payment',
        debit: cleanAmount,
        credit: 0,
        reference: paymentRef,
        note: safeLedgerNote,
        createdAt: serverTimestamp(),
      });

      // 2. Paired outflow record in append-only money_out
      batch.set(moneyOutRef, {
        ownerId,
        supplierId: supplier.id,
        ledgerEntryId: paymentRef,
        reference: paymentRef,
        amount: cleanAmount,
        paymentDate,
        paymentMethod,
        note: trimmedNote,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `supplier_ledger/${paymentRef}`
        );
      }

      onPaymentSent(supplier, cleanAmount, paymentRef);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to record supplier payment.'
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
      aria-labelledby="pay-supplier-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2
              id="pay-supplier-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Pay Supplier
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Posts an atomic debit to{' '}
              <span className="font-mono text-slate-700">supplier_ledger</span> and
              records outflow in{' '}
              <span className="font-mono text-slate-700">money_out</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pay supplier modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {errorMessage}
              </div>
            )}

            {/* Auto-Filled Supplier Context */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">Supplier</p>
                <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                  {supplier.supplierName}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {supplier.companyName} ·{' '}
                  <span className="font-mono tabular-nums">{supplier.mobile}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-slate-500">Total Payable</p>
                <p
                  className={`font-mono text-sm font-semibold tabular-nums mt-0.5 ${
                    currentTotalPayable > 0
                      ? 'text-red-700'
                      : currentTotalPayable < 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(currentTotalPayable)}
                </p>
              </div>
            </div>

            {/* Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="supplierPayAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Amount <span className="text-red-600">*</span>
                  </label>
                  {currentTotalPayable > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmountInput(String(currentTotalPayable))}
                      className="text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
                    >
                      Pay Full Payable
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                    ৳
                  </span>
                  <input
                    id="supplierPayAmount"
                    type="number"
                    required
                    autoFocus
                    min="0.01"
                    max={PAYMENT_VALIDATION.maxAmount}
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="supplierPayDate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Payment Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="supplierPayDate"
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            </div>

            {/* Method: Cash / Bank */}
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">
                Payment Method <span className="text-red-600">*</span>
              </span>
              <div
                role="group"
                aria-label="Supplier payment method"
                className="grid grid-cols-2 gap-2.5"
              >
                {SUPPLIER_PAYMENT_METHODS.map((method) => {
                  const Icon = methodIcons[method];
                  const selected = paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{method}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reference Note */}
            <div>
              <label
                htmlFor="supplierPayNote"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Note
              </label>
              <input
                id="supplierPayNote"
                type="text"
                maxLength={PAYMENT_VALIDATION.noteMax}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  paymentMethod === 'Bank'
                    ? 'e.g. Islami Bank cheque #781203'
                    : 'e.g. Cash voucher #118 paid at office'
                }
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            {/* Live Balance Projection */}
            <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-600">
                  Projected Remaining Payable After Payment
                </p>
                <p
                  className={`font-mono text-base font-semibold tabular-nums ${
                    projectedPayable > 0
                      ? 'text-red-700'
                      : projectedPayable < 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(projectedPayable)}
                </p>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 text-[11px] text-slate-600 leading-relaxed">
                Atomic batch writes <span className="font-mono">txn_type: "payment"</span>,{' '}
                <span className="font-mono">debit: {cleanAmount ?? 0}</span>,{' '}
                <span className="font-mono">credit: 0</span>,{' '}
                <span className="font-mono">reference: "SPAY-[AutoID]"</span> to{' '}
                <span className="font-mono text-slate-800">supplier_ledger</span> &amp;{' '}
                <span className="font-mono text-slate-800">money_out</span>.
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || cleanAmount === null}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Banknote className="w-4 h-4 shrink-0" />
              {isSubmitting ? 'Posting Payment...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
