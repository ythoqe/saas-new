import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ArrowLeft, Plus } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LEDGER_VALIDATION,
  PURCHASE_UNITS,
  PURCHASE_VALIDATION,
  type PurchaseUnit,
  type SupplierRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

const COMMON_MILL_ITEMS = [
  'Jute',
  'Bleaching',
  'Caustic Soda',
  'Hydrogen Peroxide',
  'Reactive Dye',
  'Acetic Acid',
  'Spare Parts',
] as const;

interface NewPurchasePageProps {
  ownerId: string;
  suppliers: SupplierRecord[];
  onCancel: () => void;
  onAddSupplier: () => void;
  onPurchaseCreated: (
    purchaseRef: string,
    supplierName: string,
    totalAmount: number
  ) => void;
}

export function NewPurchasePage({
  ownerId,
  suppliers,
  onCancel,
  onAddSupplier,
  onPurchaseCreated,
}: NewPurchasePageProps) {
  const sortedSuppliers = useMemo(
    () =>
      [...suppliers].sort((a, b) =>
        a.supplierName.localeCompare(b.supplierName)
      ),
    [suppliers]
  );

  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => getTodayIsoDate());
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<PurchaseUnit>('KG');
  const [rate, setRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSupplier = useMemo(
    () => sortedSuppliers.find((s) => s.id === supplierId) ?? null,
    [sortedSuppliers, supplierId]
  );

  const parsedQty = Number(quantity);
  const parsedRate = Number(rate);

  const calculatedTotal =
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    Number.isFinite(parsedRate) &&
    parsedRate > 0
      ? roundCurrency(parsedQty * parsedRate)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!supplierId || !selectedSupplier) {
      setFormError('Please select a Supplier from the dropdown.');
      return;
    }

    if (!PURCHASE_VALIDATION.datePattern.test(purchaseDate)) {
      setFormError('Purchase Date must be in YYYY-MM-DD format.');
      return;
    }

    const trimmedItem = itemName.trim();
    if (
      trimmedItem.length < PURCHASE_VALIDATION.itemNameMin ||
      trimmedItem.length > PURCHASE_VALIDATION.itemNameMax
    ) {
      setFormError(
        `Item Name is required and must be at most ${PURCHASE_VALIDATION.itemNameMax} characters.`
      );
      return;
    }

    if (
      !Number.isFinite(parsedQty) ||
      parsedQty <= 0 ||
      parsedQty > PURCHASE_VALIDATION.maxQuantity
    ) {
      setFormError(
        `Quantity must be greater than 0 and at most ${PURCHASE_VALIDATION.maxQuantity.toLocaleString()}.`
      );
      return;
    }

    if (!PURCHASE_UNITS.includes(unit)) {
      setFormError('Please select a valid Unit (KG, Liter, or Pcs).');
      return;
    }

    if (
      !Number.isFinite(parsedRate) ||
      parsedRate <= 0 ||
      parsedRate > PURCHASE_VALIDATION.maxRate
    ) {
      setFormError(
        `Rate must be greater than 0 and at most ${PURCHASE_VALIDATION.maxRate.toLocaleString()}.`
      );
      return;
    }

    const cleanQty = roundCurrency(parsedQty);
    const cleanRate = roundCurrency(parsedRate);
    const cleanTotal = roundCurrency(cleanQty * cleanRate);

    if (cleanTotal <= 0 || cleanTotal > PURCHASE_VALIDATION.maxTotalAmount) {
      setFormError(
        `Total Amount must be between ৳0.01 and ${formatCurrency(PURCHASE_VALIDATION.maxTotalAmount)}.`
      );
      return;
    }

    const rawAutoId = doc(collection(db, 'purchases')).id
      .slice(0, 8)
      .toUpperCase();
    const purchaseRefId = `PUR-${rawAutoId}`;
    const ledgerNote = `${trimmedItem} — ${formatNumber(cleanQty)} ${unit} @ ${formatCurrency(cleanRate)}/${unit} (${purchaseDate})`.slice(
      0,
      LEDGER_VALIDATION.noteMax
    );

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const purchaseDocRef = doc(db, 'purchases', purchaseRefId);
      const supplierLedgerRef = doc(db, 'supplier_ledger', purchaseRefId);

      // 1. Save immutable purchase record
      batch.set(purchaseDocRef, {
        ownerId,
        supplierId,
        ledgerEntryId: purchaseRefId,
        reference: purchaseRefId,
        purchaseDate,
        itemName: trimmedItem,
        quantity: cleanQty,
        unit,
        rate: cleanRate,
        totalAmount: cleanTotal,
        createdAt: serverTimestamp(),
      });

      // 2. Atomically insert credit into supplier_ledger (increases our payable)
      batch.set(supplierLedgerRef, {
        ownerId,
        supplierId,
        txn_type: 'purchase',
        credit: cleanTotal,
        debit: 0,
        reference: purchaseRefId,
        note: ledgerNote,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `purchases/${purchaseRefId}`
        );
      }

      onPurchaseCreated(
        purchaseRefId,
        selectedSupplier.supplierName,
        cleanTotal
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to save purchase.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Purchases
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Purchase Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Purchase Entry Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Saving a purchase atomically posts a credit entry to{' '}
              <span className="font-mono text-slate-700">supplier_ledger</span>,
              increasing your payable balance to the vendor.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {formError && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {formError}
              </div>
            )}

            {/* Supplier Dropdown */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="purchaseSupplier"
                  className="block text-sm font-medium text-slate-700"
                >
                  Supplier <span className="text-red-600">*</span>
                </label>
                <button
                  type="button"
                  onClick={onAddSupplier}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New Supplier
                </button>
              </div>
              {sortedSuppliers.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-slate-600">
                    No suppliers exist yet. Register a supplier before logging a
                    purchase.
                  </p>
                  <button
                    type="button"
                    onClick={onAddSupplier}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Create First Supplier
                  </button>
                </div>
              ) : (
                <select
                  id="purchaseSupplier"
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  <option value="">Select a registered supplier...</option>
                  {sortedSuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplierName} — {supplier.companyName} ({supplier.mobile})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Date & Item Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="purchaseDate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="purchaseDate"
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="itemName"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Item Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="itemName"
                  type="text"
                  list="mill-purchase-items"
                  required
                  maxLength={PURCHASE_VALIDATION.itemNameMax}
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Jute, Bleaching, Spare Parts"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
                <datalist id="mill-purchase-items">
                  {COMMON_MILL_ITEMS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Quantity, Unit, Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label
                  htmlFor="purchaseQuantity"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Quantity <span className="text-red-600">*</span>
                </label>
                <input
                  id="purchaseQuantity"
                  type="number"
                  required
                  min="0.01"
                  max={PURCHASE_VALIDATION.maxQuantity}
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 250"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="purchaseUnit"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Unit <span className="text-red-600">*</span>
                </label>
                <select
                  id="purchaseUnit"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as PurchaseUnit)}
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  {PURCHASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="purchaseRate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Rate (per {unit}) <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                    ৳
                  </span>
                  <input
                    id="purchaseRate"
                    type="number"
                    required
                    min="0.01"
                    max={PURCHASE_VALIDATION.maxRate}
                    step="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="e.g. 85.00"
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
              </div>
            </div>

            {/* Calculated Total Amount (Read-only display) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-700">
                  Total Amount (Quantity × Rate)
                </p>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  {parsedQty > 0 ? formatNumber(parsedQty) : '0'} {unit} ×{' '}
                  {parsedRate > 0 ? formatCurrency(parsedRate) : '৳0.00'}
                </p>
              </div>
              <p className="font-mono text-xl font-semibold tabular-nums text-slate-900">
                {calculatedTotal !== null ? formatCurrency(calculatedTotal) : '৳0.00'}
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                sortedSuppliers.length === 0 ||
                calculatedTotal === null
              }
              className="px-5 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {isSubmitting ? 'Recording Purchase...' : 'Save Purchase'}
            </button>
          </div>
        </form>

        {/* Right Atomic Ledger Preview */}
        <aside className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Atomic Payable Posting
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Writes to <span className="font-mono">purchases</span> and{' '}
              <span className="font-mono">supplier_ledger</span> together
            </p>
          </div>

          <dl className="divide-y divide-slate-200 text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">Supplier</dt>
              <dd className="text-xs font-medium text-slate-900 text-right truncate max-w-[180px]">
                {selectedSupplier ? selectedSupplier.supplierName : 'Not selected'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">Item</dt>
              <dd className="text-xs font-medium text-slate-900 text-right truncate max-w-[180px]">
                {itemName.trim() || '—'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">Quantity</dt>
              <dd className="font-mono text-xs tabular-nums text-slate-900">
                {parsedQty > 0 ? `${formatNumber(parsedQty)} ${unit}` : '—'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">Ledger Type</dt>
              <dd className="font-mono text-xs text-slate-800">
                txn_type: &quot;purchase&quot;
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">Supplier Credit (+Debt)</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-red-700">
                {calculatedTotal !== null ? formatCurrency(calculatedTotal) : '৳0.00'}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-slate-500 leading-relaxed pt-3 border-t border-slate-200">
            Reference <span className="font-mono text-slate-700">PUR-[AutoID]</span> is
            generated automatically and linked identically across both collections.
          </p>
        </aside>
      </div>
    </div>
  );
}
