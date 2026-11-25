import React, { useMemo, useState } from 'react';
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { ArrowLeft, Boxes, CheckCircle2, Plus } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  INVENTORY_ITEM_PRESETS,
  INVENTORY_VALIDATION,
  LEDGER_VALIDATION,
  PURCHASE_UNITS,
  PURCHASE_VALIDATION,
  type InventoryItem,
  type PurchaseUnit,
  type SupplierRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

const COMMON_MILL_ITEMS = INVENTORY_ITEM_PRESETS.filter((p) => p !== 'Other');

export interface PurchaseStockSummary {
  itemName: string;
  addedQty: number;
  unit: PurchaseUnit;
  newStock: number;
}

interface NewPurchasePageProps {
  ownerId: string;
  suppliers: SupplierRecord[];
  inventoryItems: InventoryItem[];
  onCancel: () => void;
  onAddSupplier: () => void;
  onOpenInventory: () => void;
  onPurchaseCreated: (
    purchaseRef: string,
    supplierName: string,
    totalAmount: number,
    stockSummary?: PurchaseStockSummary
  ) => void;
}

export function NewPurchasePage({
  ownerId,
  suppliers,
  inventoryItems,
  onCancel,
  onAddSupplier,
  onOpenInventory,
  onPurchaseCreated,
}: NewPurchasePageProps) {
  const sortedSuppliers = useMemo(
    () =>
      [...suppliers].sort((a, b) =>
        a.supplierName.localeCompare(b.supplierName)
      ),
    [suppliers]
  );

  const sortedInventory = useMemo(
    () =>
      [...inventoryItems].sort((a, b) =>
        a.itemName.localeCompare(b.itemName)
      ),
    [inventoryItems]
  );

  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => getTodayIsoDate());
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
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

  const explicitInventoryItem = useMemo(
    () =>
      selectedInventoryId && selectedInventoryId !== 'custom'
        ? sortedInventory.find((i) => i.id === selectedInventoryId) ?? null
        : null,
    [sortedInventory, selectedInventoryId]
  );

  // Also auto-match if user typed an exact existing inventory item name with matching unit
  const autoMatchedInventoryItem = useMemo(() => {
    if (explicitInventoryItem) return explicitInventoryItem;
    const trimmed = itemName.trim().toLowerCase();
    if (!trimmed) return null;
    return (
      sortedInventory.find(
        (i) => i.itemName.trim().toLowerCase() === trimmed && i.unit === unit
      ) ?? null
    );
  }, [explicitInventoryItem, itemName, unit, sortedInventory]);

  const linkedInventoryItem = explicitInventoryItem ?? autoMatchedInventoryItem;

  const parsedQty = Number(quantity);
  const parsedRate = Number(rate);

  const calculatedTotal =
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    Number.isFinite(parsedRate) &&
    parsedRate > 0
      ? roundCurrency(parsedQty * parsedRate)
      : null;

  const projectedNewStock =
    linkedInventoryItem && Number.isFinite(parsedQty) && parsedQty > 0
      ? roundCurrency(linkedInventoryItem.currentStock + parsedQty)
      : null;

  const handleInventorySelectChange = (value: string) => {
    setSelectedInventoryId(value);
    if (value && value !== 'custom') {
      const found = sortedInventory.find((i) => i.id === value);
      if (found) {
        setItemName(found.itemName);
        setUnit(found.unit);
      }
    } else if (value === 'custom') {
      setItemName('');
    }
  };

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

    const trimmedItem = (linkedInventoryItem?.itemName ?? itemName).trim();
    const resolvedUnit = linkedInventoryItem?.unit ?? unit;

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

    if (!PURCHASE_UNITS.includes(resolvedUnit)) {
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
    const ledgerNote = `${trimmedItem} — ${formatNumber(cleanQty)} ${resolvedUnit} @ ${formatCurrency(cleanRate)}/${resolvedUnit} (${purchaseDate})`.slice(
      0,
      LEDGER_VALIDATION.noteMax
    );

    setIsSubmitting(true);
    try {
      const purchaseDocRef = doc(db, 'purchases', purchaseRefId);
      const supplierLedgerRef = doc(db, 'supplier_ledger', purchaseRefId);

      const purchasePayload = {
        ownerId,
        supplierId,
        ledgerEntryId: purchaseRefId,
        reference: purchaseRefId,
        purchaseDate,
        itemName: trimmedItem,
        quantity: cleanQty,
        unit: resolvedUnit,
        rate: cleanRate,
        totalAmount: cleanTotal,
        createdAt: serverTimestamp(),
      };

      const supplierLedgerPayload = {
        ownerId,
        supplierId,
        txn_type: 'purchase',
        credit: cleanTotal,
        debit: 0,
        reference: purchaseRefId,
        note: ledgerNote,
        createdAt: serverTimestamp(),
      };

      let stockSummary: PurchaseStockSummary | undefined;

      if (linkedInventoryItem) {
        const inventoryDocRef = doc(db, 'inventory', linkedInventoryItem.id);
        const movementDocRef = doc(
          db,
          'stock_movements',
          `STK-${purchaseRefId}`
        );
        const movementNote = `Purchased from ${selectedSupplier.supplierName} (${purchaseRefId})`.slice(
          0,
          INVENTORY_VALIDATION.noteMax
        );

        try {
          await runTransaction(db, async (tx) => {
            // Firestore transactions require all reads before writes
            const invSnap = await tx.get(inventoryDocRef);
            if (!invSnap.exists()) {
              throw new Error(
                'Selected inventory item no longer exists. Please refresh or choose another item.'
              );
            }

            const latestStock = roundCurrency(
              Number(invSnap.data().currentStock ?? 0)
            );
            const nextStock = roundCurrency(latestStock + cleanQty);

            if (nextStock > INVENTORY_VALIDATION.maxStock) {
              throw new Error(
                `Adding ${formatNumber(cleanQty)} ${resolvedUnit} exceeds maximum stock limit (${INVENTORY_VALIDATION.maxStock.toLocaleString()}).`
              );
            }

            // 1. Save purchase record
            tx.set(purchaseDocRef, purchasePayload);

            // 2. Credit supplier_ledger (increases payable)
            tx.set(supplierLedgerRef, supplierLedgerPayload);

            // 3. Automatically increase Current Stock in inventory
            tx.update(inventoryDocRef, {
              currentStock: nextStock,
              updatedAt: serverTimestamp(),
            });

            // 4. Record immutable purchase stock-in movement
            tx.set(movementDocRef, {
              ownerId,
              inventoryItemId: linkedInventoryItem.id,
              itemName: linkedInventoryItem.itemName,
              unit: linkedInventoryItem.unit,
              type: 'purchase',
              quantity: cleanQty,
              previousStock: latestStock,
              resultingStock: nextStock,
              movementDate: purchaseDate,
              reference: purchaseRefId,
              note: movementNote,
              createdAt: serverTimestamp(),
            });

            stockSummary = {
              itemName: linkedInventoryItem.itemName,
              addedQty: cleanQty,
              unit: linkedInventoryItem.unit,
              newStock: nextStock,
            };
          });
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message.startsWith('Selected inventory item') ||
              error.message.startsWith('Adding '))
          ) {
            throw error;
          }
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `purchases/${purchaseRefId}`
          );
        }
      } else {
        const batch = writeBatch(db);
        batch.set(purchaseDocRef, purchasePayload);
        batch.set(supplierLedgerRef, supplierLedgerPayload);

        try {
          await batch.commit();
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.WRITE,
            `purchases/${purchaseRefId}`
          );
        }
      }

      onPurchaseCreated(
        purchaseRefId,
        selectedSupplier.supplierName,
        cleanTotal,
        stockSummary
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
              Saving a purchase credits{' '}
              <span className="font-mono text-slate-700">supplier_ledger</span>{' '}
              and automatically increases stock in{' '}
              <span className="font-mono text-slate-700">inventory</span> when
              linked to a tracked item.
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
                      {supplier.supplierName} — {supplier.companyName} (
                      {supplier.mobile})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Inventory Item Link Selector */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="purchaseInventorySelect"
                  className="block text-sm font-medium text-slate-700"
                >
                  Inventory Item (Auto-Restock)
                </label>
                <button
                  type="button"
                  onClick={onOpenInventory}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  Manage Inventory
                </button>
              </div>
              <select
                id="purchaseInventorySelect"
                value={selectedInventoryId}
                onChange={(e) => handleInventorySelectChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              >
                <option value="">
                  {sortedInventory.length > 0
                    ? 'Select tracked inventory item to auto-increase stock...'
                    : 'No inventory items yet — enter custom item below'}
                </option>
                {sortedInventory.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.itemName} ({inv.unit}) — Current Stock:{' '}
                    {formatNumber(inv.currentStock)} {inv.unit}
                  </option>
                ))}
                <option value="custom">
                  Custom / Non-Inventory Item (manual entry)
                </option>
              </select>
              {linkedInventoryItem && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Linked to Inventory:{' '}
                  <strong>{linkedInventoryItem.itemName}</strong> stock will
                  increase automatically upon saving.
                </p>
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
                  readOnly={Boolean(explicitInventoryItem)}
                  maxLength={PURCHASE_VALIDATION.itemNameMax}
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Jute, Bleaching, Soda, Spare Parts"
                  className={`w-full px-3.5 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a] ${
                    explicitInventoryItem
                      ? 'bg-slate-50 text-slate-700 cursor-not-allowed'
                      : 'bg-white'
                  }`}
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
                  disabled={Boolean(explicitInventoryItem)}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as PurchaseUnit)}
                  className={`w-full px-3.5 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a] ${
                    explicitInventoryItem
                      ? 'bg-slate-50 text-slate-700 cursor-not-allowed'
                      : 'bg-white'
                  }`}
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
                {calculatedTotal !== null
                  ? formatCurrency(calculatedTotal)
                  : '৳0.00'}
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

        {/* Right Atomic Ledger & Inventory Preview */}
        <aside className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Atomic Posting Preview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Writes to <span className="font-mono">purchases</span>,{' '}
              <span className="font-mono">supplier_ledger</span>
              {linkedInventoryItem ? (
                <>
                  , <span className="font-mono">inventory</span> &amp;{' '}
                  <span className="font-mono">stock_movements</span>
                </>
              ) : null}{' '}
              atomically
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
              <dt className="text-xs text-slate-500">Supplier Credit (+Debt)</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-red-700">
                {calculatedTotal !== null
                  ? formatCurrency(calculatedTotal)
                  : '৳0.00'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-xs text-slate-500">Inventory Stock Sync</dt>
              <dd className="font-mono text-xs tabular-nums text-right">
                {linkedInventoryItem ? (
                  <span className="font-semibold text-emerald-700">
                    {formatNumber(linkedInventoryItem.currentStock)} →{' '}
                    {formatNumber(
                      projectedNewStock ?? linkedInventoryItem.currentStock
                    )}{' '}
                    {linkedInventoryItem.unit}
                  </span>
                ) : (
                  <span className="text-slate-400">Not linked</span>
                )}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-slate-500 leading-relaxed pt-3 border-t border-slate-200">
            Reference{' '}
            <span className="font-mono text-slate-700">PUR-[AutoID]</span> is
            generated automatically and linked identically across supplier
            payables and inventory history.
          </p>
        </aside>
      </div>
    </div>
  );
}
