import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Save, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  FABRIC_TYPES,
  ORDER_VALIDATION,
  type ClientRecord,
  type FabricType,
  type OrderRecord,
} from '../types/mill';
import { formatCurrency, roundCurrency } from '../utils/ledger';

interface EditOrderModalProps {
  order: OrderRecord | null;
  client: ClientRecord | null;
  onClose: () => void;
  onUpdated: (orderId: string) => void;
}

export function EditOrderModal({
  order,
  client,
  onClose,
  onUpdated,
}: EditOrderModalProps) {
  const [orderDate, setOrderDate] = useState('');
  const [fabricType, setFabricType] = useState<FabricType>('মার্কিন');
  const [greyFabricThan, setGreyFabricThan] = useState('');
  const [greyFabricGaj, setGreyFabricGaj] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (order) {
      setOrderDate(order.orderDate);
      setFabricType(order.fabricType);
      setGreyFabricThan(String(order.greyFabricThan));
      setGreyFabricGaj(String(order.greyFabricGaj));
      setRate(String(order.rate));
      setError(null);
      setIsSaving(false);
    }
  }, [order]);

  useEffect(() => {
    if (!order) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [order, isSaving, onClose]);

  if (!order) return null;

  const parsedThan = Number(greyFabricThan);
  const parsedGaj = Number(greyFabricGaj);
  const parsedRate = Number(rate);
  const estimatedBill =
    Number.isFinite(parsedGaj) &&
    parsedGaj > 0 &&
    Number.isFinite(parsedRate) &&
    parsedRate > 0
      ? roundCurrency(parsedGaj * parsedRate)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (order.status !== 'Processing') {
      setError('Only orders in Processing status can be edited.');
      return;
    }

    if (!ORDER_VALIDATION.orderDatePattern.test(orderDate)) {
      setError('Order Date must be in YYYY-MM-DD format.');
      return;
    }

    if (
      !Number.isFinite(parsedThan) ||
      parsedThan <= 0 ||
      parsedThan > ORDER_VALIDATION.maxThan
    ) {
      setError(
        `Grey Fabric Than must be greater than 0 and at most ${ORDER_VALIDATION.maxThan.toLocaleString()}.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedGaj) ||
      parsedGaj <= 0 ||
      parsedGaj > ORDER_VALIDATION.maxGaj
    ) {
      setError(
        `Grey Fabric Gaj must be greater than 0 and at most ${ORDER_VALIDATION.maxGaj.toLocaleString()}.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedRate) ||
      parsedRate <= 0 ||
      parsedRate > ORDER_VALIDATION.maxRate
    ) {
      setError(
        `Rate per Gaj must be greater than 0 and at most ${ORDER_VALIDATION.maxRate.toLocaleString()}.`
      );
      return;
    }

    setIsSaving(true);
    try {
      try {
        await updateDoc(doc(db, 'orders', order.id), {
          orderDate,
          fabricType,
          greyFabricThan: roundCurrency(parsedThan),
          greyFabricGaj: roundCurrency(parsedGaj),
          rate: roundCurrency(parsedRate),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
      }
      onUpdated(order.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update this order.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-order-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/45"
        onClick={() => {
          if (!isSaving) onClose();
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="edit-order-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              Edit Processing Order
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {order.id} · {client ? client.clientName : 'Client'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close edit order modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="editOrderDate"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Order Date <span className="text-red-600">*</span>
              </label>
              <input
                id="editOrderDate"
                type="date"
                required
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="editOrderFabric"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Fabric Type <span className="text-red-600">*</span>
              </label>
              <select
                id="editOrderFabric"
                required
                value={fabricType}
                onChange={(e) => setFabricType(e.target.value as FabricType)}
                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              >
                {FABRIC_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="editOrderThan"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Grey Than <span className="text-red-600">*</span>
              </label>
              <input
                id="editOrderThan"
                type="number"
                required
                min="0.01"
                max={ORDER_VALIDATION.maxThan}
                step="0.01"
                value={greyFabricThan}
                onChange={(e) => setGreyFabricThan(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="editOrderGaj"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Grey Gaj <span className="text-red-600">*</span>
              </label>
              <input
                id="editOrderGaj"
                type="number"
                required
                min="0.01"
                max={ORDER_VALIDATION.maxGaj}
                step="0.01"
                value={greyFabricGaj}
                onChange={(e) => setGreyFabricGaj(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="editOrderRate"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Rate / Gaj (৳) <span className="text-red-600">*</span>
              </label>
              <input
                id="editOrderRate"
                type="number"
                required
                min="0.01"
                max={ORDER_VALIDATION.maxRate}
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between text-xs">
            <span className="text-slate-600">Updated Estimated Bill:</span>
            <span className="font-mono font-semibold text-sm tabular-nums text-slate-900">
              {estimatedBill !== null ? formatCurrency(estimatedBill) : '—'}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save Order Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
