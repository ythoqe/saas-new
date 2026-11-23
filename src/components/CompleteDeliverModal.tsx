import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LEDGER_VALIDATION,
  ORDER_VALIDATION,
  type ClientRecord,
  type OrderRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  roundCurrency,
} from '../utils/ledger';

interface CompleteDeliverModalProps {
  order: OrderRecord | null;
  client: ClientRecord | null;
  currentClientDue: number;
  ownerId: string;
  onClose: () => void;
  onDelivered: (order: OrderRecord, finalGaj: number, finalBillAmount: number) => void;
}

export function CompleteDeliverModal({
  order,
  client,
  currentClientDue,
  ownerId,
  onClose,
  onDelivered,
}: CompleteDeliverModalProps) {
  const [finalGajInput, setFinalGajInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order) {
      setFinalGajInput(String(order.greyFabricGaj));
      setErrorMessage(null);
    }
  }, [order]);

  if (!order) return null;

  const parsedFinalGaj = Number(finalGajInput);
  const isValidGaj =
    Number.isFinite(parsedFinalGaj) &&
    parsedFinalGaj > 0 &&
    parsedFinalGaj <= ORDER_VALIDATION.maxGaj;

  const cleanFinalGaj = isValidGaj ? roundCurrency(parsedFinalGaj) : null;
  const calculatedFinalBill =
    cleanFinalGaj !== null ? roundCurrency(cleanFinalGaj * order.rate) : null;

  const gajVariance =
    cleanFinalGaj !== null ? roundCurrency(cleanFinalGaj - order.greyFabricGaj) : null;
  const variancePct =
    gajVariance !== null && order.greyFabricGaj > 0
      ? roundCurrency((gajVariance / order.greyFabricGaj) * 100)
      : null;

  const projectedNewDue =
    calculatedFinalBill !== null
      ? roundCurrency(currentClientDue + calculatedFinalBill)
      : currentClientDue;

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cleanFinalGaj === null || calculatedFinalBill === null) {
      setErrorMessage(
        `Please enter a valid Final Gaj greater than 0 and at most ${ORDER_VALIDATION.maxGaj.toLocaleString()}.`
      );
      return;
    }

    if (calculatedFinalBill <= 0 || calculatedFinalBill > LEDGER_VALIDATION.maxAmount) {
      setErrorMessage(
        `Calculated Final Bill Amount must be between ৳0.01 and ${formatCurrency(LEDGER_VALIDATION.maxAmount)}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', order.id);
      const ledgerDocId = `INV_${order.id}`;
      const ledgerRef = doc(db, 'client_ledger', ledgerDocId);

      // 1. Transition Order to terminal Delivered state with final measurements
      batch.update(orderRef, {
        status: 'Delivered',
        finalGaj: cleanFinalGaj,
        finalBillAmount: calculatedFinalBill,
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Atomically insert invoice debit entry into append-only client_ledger
      batch.set(ledgerRef, {
        ownerId,
        clientId: order.clientId,
        txn_type: 'invoice',
        debit: calculatedFinalBill,
        credit: 0,
        reference: order.id,
        note: `Bill for Order ${order.id}`,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `orders/${order.id}`);
      }

      onDelivered(order, cleanFinalGaj, calculatedFinalBill);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to complete and deliver order.'
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
      aria-labelledby="complete-deliver-title"
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
              id="complete-deliver-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Complete &amp; Deliver Order
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {order.id} · {formatIsoDate(order.orderDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close delivery dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirmDelivery}>
          <div className="p-6 space-y-5">
            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {errorMessage}
              </div>
            )}

            {/* Order Context Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div>
                <p className="text-slate-500">Client</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {client ? client.clientName : 'Client'}
                </p>
                {client && (
                  <p className="text-slate-500 truncate">{client.companyName}</p>
                )}
              </div>
              <div>
                <p className="text-slate-500">Fabric &amp; Intake</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {order.fabricType}
                </p>
                <p className="font-mono tabular-nums text-slate-600">
                  {formatNumber(order.greyFabricThan)} Than ·{' '}
                  {formatNumber(order.greyFabricGaj)} Gaj
                </p>
              </div>
              <div>
                <p className="text-slate-500">Agreed Rate</p>
                <p className="font-mono font-medium tabular-nums text-slate-900 mt-0.5">
                  {formatCurrency(order.rate)} / Gaj
                </p>
              </div>
              <div>
                <p className="text-slate-500">Current Client Due</p>
                <p className="font-mono font-medium tabular-nums text-slate-900 mt-0.5">
                  {formatCurrency(currentClientDue)}
                </p>
              </div>
            </div>

            {/* Final Gaj Input */}
            <div>
              <label
                htmlFor="finalGajInput"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Final Delivered Gaj (Final_Gaj) <span className="text-red-600">*</span>
              </label>
              <input
                id="finalGajInput"
                type="number"
                required
                autoFocus
                min="0.01"
                max={ORDER_VALIDATION.maxGaj}
                step="0.01"
                value={finalGajInput}
                onChange={(e) => setFinalGajInput(e.target.value)}
                placeholder="Enter finished Gaj after dyeing/washing"
                className="w-full px-3.5 py-2.5 text-base font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
              {gajVariance !== null && variancePct !== null && (
                <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
                  Variance vs Grey ({formatNumber(order.greyFabricGaj)} Gaj):{' '}
                  <span
                    className={
                      gajVariance < 0
                        ? 'text-amber-700 font-medium'
                        : gajVariance > 0
                          ? 'text-blue-700 font-medium'
                          : 'text-slate-700'
                    }
                  >
                    {gajVariance > 0 ? '+' : ''}
                    {formatNumber(gajVariance)} Gaj ({variancePct > 0 ? '+' : ''}
                    {variancePct}%{' '}
                    {gajVariance < 0
                      ? 'shrinkage'
                      : gajVariance > 0
                        ? 'stretch'
                        : 'exact'}
                    )
                  </span>
                </p>
              )}
            </div>

            {/* Auto-Billing Calculation Breakdown */}
            <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-700">
                    Final Bill Amount (Final_Gaj × Rate)
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {cleanFinalGaj !== null ? formatNumber(cleanFinalGaj) : '0'} Gaj ×{' '}
                    {formatCurrency(order.rate)}
                  </p>
                </div>
                <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">
                  {calculatedFinalBill !== null
                    ? formatCurrency(calculatedFinalBill)
                    : '—'}
                </p>
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-4 bg-slate-50/70">
                <p className="text-xs text-slate-600">
                  Projected Client Current Due After Billing
                </p>
                <p
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    projectedNewDue > 0 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(projectedNewDue)}
                </p>
              </div>

              <div className="px-4 py-2.5 bg-slate-50 text-[11px] text-slate-600 leading-relaxed">
                Posts automatically to <span className="font-mono text-slate-800">client_ledger</span>:{' '}
                <span className="font-mono">txn_type: "invoice"</span> ·{' '}
                <span className="font-mono">
                  debit: {calculatedFinalBill ?? 0}
                </span>{' '}
                · <span className="font-mono">credit: 0</span> ·{' '}
                <span className="font-mono">reference: "{order.id}"</span> ·{' '}
                <span className="font-mono">note: "Bill for Order {order.id}"</span>
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
              disabled={isSubmitting || calculatedFinalBill === null}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {isSubmitting ? 'Posting Bill & Delivering...' : 'Confirm & Deliver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
