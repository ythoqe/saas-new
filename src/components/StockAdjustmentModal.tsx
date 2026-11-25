import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  INVENTORY_VALIDATION,
  type InventoryItem,
} from '../types/mill';
import {
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

export type StockAdjustmentDirection = 'in' | 'out';

interface StockAdjustmentModalProps {
  item: InventoryItem | null;
  direction: StockAdjustmentDirection;
  ownerId: string;
  onClose: () => void;
  onAdjusted: (
    item: InventoryItem,
    direction: StockAdjustmentDirection,
    quantity: number,
    resultingStock: number
  ) => void;
}

export function StockAdjustmentModal({
  item,
  direction,
  ownerId,
  onClose,
  onAdjusted,
}: StockAdjustmentModalProps) {
  const [quantityInput, setQuantityInput] = useState('');
  const [movementDate, setMovementDate] = useState(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setQuantityInput('');
      setMovementDate(getTodayIsoDate());
      setNote('');
      setErrorMessage(null);
    }
  }, [item, direction]);

  if (!item) return null;

  const isStockIn = direction === 'in';
  const parsedQty = Number(quantityInput);
  const isPositiveQty =
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    parsedQty <= INVENTORY_VALIDATION.maxStock;
  const cleanQty = isPositiveQty ? roundCurrency(parsedQty) : null;

  const projectedStock =
    cleanQty !== null
      ? roundCurrency(
          isStockIn
            ? item.currentStock + cleanQty
            : item.currentStock - cleanQty
        )
      : item.currentStock;

  const exceedsAvailable = !isStockIn && cleanQty !== null && cleanQty > item.currentStock;
  const exceedsMaxStock = isStockIn && projectedStock > INVENTORY_VALIDATION.maxStock;
  const willBeLowStock =
    !exceedsAvailable && projectedStock < item.minStockLevel;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cleanQty === null) {
      setErrorMessage(
        `Please enter a valid quantity greater than 0 and at most ${INVENTORY_VALIDATION.maxStock.toLocaleString()}.`
      );
      return;
    }

    if (!INVENTORY_VALIDATION.datePattern.test(movementDate)) {
      setErrorMessage('Date must be in YYYY-MM-DD format.');
      return;
    }

    if (exceedsAvailable) {
      setErrorMessage(
        `Cannot use ${formatNumber(cleanQty)} ${item.unit}. Only ${formatNumber(item.currentStock)} ${item.unit} currently in stock.`
      );
      return;
    }

    if (exceedsMaxStock) {
      setErrorMessage(
        `Resulting stock cannot exceed ${INVENTORY_VALIDATION.maxStock.toLocaleString()} ${item.unit}.`
      );
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > INVENTORY_VALIDATION.noteMax) {
      setErrorMessage(
        `Note must be at most ${INVENTORY_VALIDATION.noteMax} characters.`
      );
      return;
    }

    const rawAutoId = doc(collection(db, 'stock_movements')).id
      .slice(0, 8)
      .toUpperCase();
    const movementRefId = `${isStockIn ? 'STK-IN' : 'STK-OUT'}-${rawAutoId}`;

    setIsSubmitting(true);
    try {
      let finalStock = projectedStock;

      try {
        await runTransaction(db, async (tx) => {
          const itemDocRef = doc(db, 'inventory', item.id);
          const itemSnap = await tx.get(itemDocRef);

          if (!itemSnap.exists()) {
            throw new Error('Inventory item no longer exists.');
          }

          const latestData = itemSnap.data();
          const latestStock = roundCurrency(Number(latestData.currentStock ?? 0));
          const computedNext = roundCurrency(
            isStockIn ? latestStock + cleanQty : latestStock - cleanQty
          );

          if (computedNext < 0) {
            throw new Error(
              `Insufficient stock. Latest available stock is ${formatNumber(latestStock)} ${item.unit}.`
            );
          }

          if (computedNext > INVENTORY_VALIDATION.maxStock) {
            throw new Error(
              `Resulting stock exceeds maximum limit (${INVENTORY_VALIDATION.maxStock.toLocaleString()}).`
            );
          }

          const movementDocRef = doc(db, 'stock_movements', movementRefId);

          tx.update(itemDocRef, {
            currentStock: computedNext,
            updatedAt: serverTimestamp(),
          });

          tx.set(movementDocRef, {
            ownerId,
            inventoryItemId: item.id,
            itemName: item.itemName,
            unit: item.unit,
            type: direction,
            quantity: cleanQty,
            previousStock: latestStock,
            resultingStock: computedNext,
            movementDate,
            reference: movementRefId,
            note: trimmedNote,
            createdAt: serverTimestamp(),
          });

          finalStock = computedNext;
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith('Insufficient stock') ||
            error.message.startsWith('Inventory item') ||
            error.message.startsWith('Resulting stock'))
        ) {
          throw error;
        }
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `inventory/${item.id}`
        );
      }

      onAdjusted(item, direction, cleanQty, finalStock);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to update inventory stock.'
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
      aria-labelledby="stock-adjustment-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-md border flex items-center justify-center shrink-0 ${
                isStockIn
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {isStockIn ? (
                <ArrowUpCircle className="w-5 h-5" />
              ) : (
                <ArrowDownCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2
                id="stock-adjustment-title"
                className="font-display text-lg font-semibold text-slate-900"
              >
                {isStockIn ? 'Stock In (Add)' : 'Stock Out (Use)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isStockIn
                  ? 'Increase stock and record an immutable receipt in stock_movements'
                  : 'Deduct factory consumption and log usage in stock_movements'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stock adjustment modal"
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

            {/* Item Context Strip */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">
                  Inventory Item
                </p>
                <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                  {item.itemName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  Min Alert: {formatNumber(item.minStockLevel)} {item.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-slate-500">Current Stock</p>
                <p
                  className={`font-mono text-base font-semibold tabular-nums mt-0.5 ${
                    item.currentStock < item.minStockLevel
                      ? 'text-red-700'
                      : 'text-slate-900'
                  }`}
                >
                  {formatNumber(item.currentStock)} {item.unit}
                </p>
              </div>
            </div>

            {/* Quantity & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="stockAdjustQty"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Quantity ({item.unit}){' '}
                    <span className="text-red-600">*</span>
                  </label>
                  {!isStockIn && item.currentStock > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuantityInput(String(item.currentStock))}
                      className="text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
                    >
                      Use All
                    </button>
                  )}
                </div>
                <input
                  id="stockAdjustQty"
                  type="number"
                  required
                  autoFocus
                  min="0.01"
                  max={
                    isStockIn
                      ? INVENTORY_VALIDATION.maxStock
                      : Math.max(0.01, item.currentStock)
                  }
                  step="0.01"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="stockAdjustDate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="stockAdjustDate"
                  type="date"
                  required
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            </div>

            {/* Note / Reason */}
            <div>
              <label
                htmlFor="stockAdjustNote"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Note / Batch Reference
              </label>
              <input
                id="stockAdjustNote"
                type="text"
                maxLength={INVENTORY_VALIDATION.noteMax}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isStockIn
                    ? 'e.g. Store return, emergency cash restock, or drum opening'
                    : 'e.g. Issued to Dyeing Vat #3 or Morning Washing Shift'
                }
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            {/* Projected Stock Summary */}
            <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-600">
                  Projected Stock After {isStockIn ? 'Stock In' : 'Stock Out'}
                </p>
                <p
                  className={`font-mono text-base font-semibold tabular-nums ${
                    exceedsAvailable || willBeLowStock
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {exceedsAvailable
                    ? 'Insufficient stock'
                    : `${formatNumber(projectedStock)} ${item.unit}`}
                </p>
              </div>
              {willBeLowStock && cleanQty !== null && (
                <div className="px-4 py-2.5 bg-red-50 flex items-center gap-2 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Warning: Stock will drop below minimum alert level (
                    {formatNumber(item.minStockLevel)} {item.unit}).
                  </span>
                </div>
              )}
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
              disabled={
                isSubmitting ||
                cleanQty === null ||
                exceedsAvailable ||
                exceedsMaxStock
              }
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
                isStockIn
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-[#1e3a8a] hover:bg-[#1e40af]'
              }`}
            >
              {isStockIn ? (
                <ArrowUpCircle className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowDownCircle className="w-4 h-4 shrink-0" />
              )}
              {isSubmitting
                ? 'Updating Stock...'
                : isStockIn
                  ? 'Confirm Stock In'
                  : 'Confirm Stock Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
