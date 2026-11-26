import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { RotateCcw, Save, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  PURCHASE_UNITS,
  PURCHASE_VALIDATION,
  type PurchaseRecord,
  type PurchaseUnit,
  type SupplierRecord,
} from '../types/mill';
import { formatCurrency, roundCurrency } from '../utils/ledger';

interface EditPurchaseModalProps {
  purchase: PurchaseRecord | null;
  supplier: SupplierRecord | null;
  ownerId: string;
  onClose: () => void;
  onUpdated: (message: string) => void;
}

export function EditPurchaseModal({
  purchase,
  supplier,
  ownerId,
  onClose,
  onUpdated,
}: EditPurchaseModalProps) {
  const [purchaseDate, setPurchaseDate] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<PurchaseUnit>('KG');
  const [rate, setRate] = useState('');
  const [postLedgerAdjustment, setPostLedgerAdjustment] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (purchase) {
      setPurchaseDate(purchase.purchaseDate);
      setItemName(purchase.itemName);
      setQuantity(String(purchase.quantity));
      setUnit(purchase.unit);
      setRate(String(purchase.rate));
      setPostLedgerAdjustment(true);
      setError(null);
      setIsSaving(false);
    }
  }, [purchase]);

  useEffect(() => {
    if (!purchase) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [purchase, isSaving, onClose]);

  if (!purchase) return null;

  const parsedQty = Number(quantity);
  const parsedRate = Number(rate);
  const newTotalAmount =
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    Number.isFinite(parsedRate) &&
    parsedRate > 0
      ? roundCurrency(parsedQty * parsedRate)
      : null;

  const amountDelta =
    newTotalAmount !== null
      ? roundCurrency(newTotalAmount - purchase.totalAmount)
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (purchase.status === 'Paid') {
      setError('Paid purchases cannot be edited.');
      return;
    }

    if (!PURCHASE_VALIDATION.datePattern.test(purchaseDate)) {
      setError('Purchase Date must be in YYYY-MM-DD format.');
      return;
    }

    const trimmedItem = itemName.trim();
    if (
      trimmedItem.length < PURCHASE_VALIDATION.itemNameMin ||
      trimmedItem.length > PURCHASE_VALIDATION.itemNameMax
    ) {
      setError(
        `Item Name is required and must be at most ${PURCHASE_VALIDATION.itemNameMax} characters.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedQty) ||
      parsedQty <= 0 ||
      parsedQty > PURCHASE_VALIDATION.maxQuantity
    ) {
      setError(
        `Quantity must be greater than 0 and at most ${PURCHASE_VALIDATION.maxQuantity.toLocaleString()}.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedRate) ||
      parsedRate <= 0 ||
      parsedRate > PURCHASE_VALIDATION.maxRate
    ) {
      setError(
        `Rate must be greater than 0 and at most ${PURCHASE_VALIDATION.maxRate.toLocaleString()}.`
      );
      return;
    }

    const cleanQty = roundCurrency(parsedQty);
    const cleanRate = roundCurrency(parsedRate);
    const cleanTotal = roundCurrency(cleanQty * cleanRate);
    const delta = roundCurrency(cleanTotal - purchase.totalAmount);

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const purchaseRef = doc(db, 'purchases', purchase.id);

      batch.update(purchaseRef, {
        purchaseDate,
        itemName: trimmedItem,
        quantity: cleanQty,
        unit,
        rate: cleanRate,
        totalAmount: cleanTotal,
        status: purchase.status ?? 'Pending',
        updatedAt: serverTimestamp(),
      });

      // Because supplier_ledger is append-only, if the purchase total changed and the user checked the box,
      // post an immutable adjustment entry to keep supplier_ledger in sync.
      if (postLedgerAdjustment && Math.abs(delta) > 0 && supplier) {
        const adjRefId = `ADJ-${doc(collection(db, 'supplier_ledger')).id
          .slice(0, 8)
          .toUpperCase()}`;
        const ledgerRef = doc(db, 'supplier_ledger', adjRefId);
        const isIncrease = delta > 0;
        const absDelta = roundCurrency(Math.abs(delta));

        batch.set(ledgerRef, {
          ownerId,
          supplierId: purchase.supplierId,
          txn_type: 'adjustment',
          credit: isIncrease ? absDelta : 0,
          debit: isIncrease ? 0 : absDelta,
          reference: `ADJ-${purchase.reference}`,
          note: `Purchase edit adjustment for ${purchase.reference} (${trimmedItem}: ${formatCurrency(purchase.totalAmount)} → ${formatCurrency(cleanTotal)})`,
          createdAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `purchases/${purchase.id}`
        );
      }

      onUpdated(
        postLedgerAdjustment && Math.abs(delta) > 0 && supplier
          ? `Updated ${purchase.reference} to ${formatCurrency(cleanTotal)} and posted an append-only ledger adjustment (${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}) to ${supplier.supplierName}.`
          : `Updated purchase ${purchase.reference}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update purchase.'
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
      aria-labelledby="edit-purchase-title"
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
              id="edit-purchase-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              Edit Pending Purchase
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {purchase.reference} ·{' '}
              {supplier ? supplier.supplierName : 'Supplier'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close edit purchase modal"
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
                htmlFor="editPurchaseDate"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Purchase Date <span className="text-red-600">*</span>
              </label>
              <input
                id="editPurchaseDate"
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="editPurchaseUnit"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Unit <span className="text-red-600">*</span>
              </label>
              <select
                id="editPurchaseUnit"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value as PurchaseUnit)}
                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              >
                {PURCHASE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="editPurchaseItemName"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Item Name <span className="text-red-600">*</span>
            </label>
            <input
              id="editPurchaseItemName"
              type="text"
              required
              maxLength={PURCHASE_VALIDATION.itemNameMax}
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="editPurchaseQty"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Quantity ({unit}) <span className="text-red-600">*</span>
              </label>
              <input
                id="editPurchaseQty"
                type="number"
                required
                min="0.01"
                max={PURCHASE_VALIDATION.maxQuantity}
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="editPurchaseRate"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Rate per {unit} (৳) <span className="text-red-600">*</span>
              </label>
              <input
                id="editPurchaseRate"
                type="number"
                required
                min="0.01"
                max={PURCHASE_VALIDATION.maxRate}
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Original Total Amount:</span>
              <span className="font-mono tabular-nums text-slate-700">
                {formatCurrency(purchase.totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">
                Updated Total Amount:
              </span>
              <span className="font-mono font-semibold text-sm tabular-nums text-slate-900">
                {newTotalAmount !== null ? formatCurrency(newTotalAmount) : '—'}
              </span>
            </div>
            {Math.abs(amountDelta) > 0 && supplier && (
              <label className="pt-2 border-t border-slate-200 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={postLedgerAdjustment}
                  onChange={(e) => setPostLedgerAdjustment(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#1e3a8a] focus:ring-[#1e3a8a]"
                />
                <span className="text-slate-700 leading-snug">
                  <strong className="inline-flex items-center gap-1 text-[#1e3a8a]">
                    <RotateCcw className="w-3 h-3" />
                    Auto-Adjust Supplier Ledger:
                  </strong>{' '}
                  Post an append-only{' '}
                  {amountDelta > 0 ? 'Credit (+Payable)' : 'Debit (−Payable)'}{' '}
                  adjustment of{' '}
                  <span className="font-mono font-semibold">
                    {formatCurrency(Math.abs(amountDelta))}
                  </span>{' '}
                  to {supplier.supplierName}&apos;s ledger.
                </span>
              </label>
            )}
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
              {isSaving ? 'Saving...' : 'Save Purchase Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
