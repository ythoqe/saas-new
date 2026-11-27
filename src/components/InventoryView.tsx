import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Check,
  CheckCircle2,
  Edit2,
  History,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  INVENTORY_ITEM_PRESETS,
  INVENTORY_UNITS,
  INVENTORY_VALIDATION,
  type InventoryItem,
  type InventoryItemPreset,
  type InventoryUnit,
  type StockMovementRecord,
  type StockMovementType,
} from '../types/mill';
import {
  formatDateTime,
  formatIsoDate,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';
import {
  StockAdjustmentModal,
  type StockAdjustmentDirection,
} from './StockAdjustmentModal';

interface InventoryViewProps {
  ownerId: string;
  items: InventoryItem[];
  movements: StockMovementRecord[];
  isLoading: boolean;
  isAdmin: boolean;
  focusFormSignal: number;
  onNavigateNewPurchase: () => void;
  onDeleteItem: (item: InventoryItem) => void;
  onFeedback: (message: string) => void;
}

type ActiveTab = 'items' | 'history';
type StockStatusFilter = 'all' | 'low' | 'healthy';

function getMovementBadge(type: StockMovementType): {
  label: string;
  classes: string;
  isPositive: boolean;
} {
  switch (type) {
    case 'in':
      return {
        label: 'Stock In',
        classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        isPositive: true,
      };
    case 'purchase':
      return {
        label: 'Purchase In',
        classes: 'bg-blue-50 text-[#1e3a8a] border-blue-200',
        isPositive: true,
      };
    case 'opening':
      return {
        label: 'Opening Stock',
        classes: 'bg-slate-100 text-slate-700 border-slate-200',
        isPositive: true,
      };
    case 'out':
      return {
        label: 'Stock Out',
        classes: 'bg-amber-50 text-amber-800 border-amber-200',
        isPositive: false,
      };
  }
}

export function InventoryView({
  ownerId,
  items,
  movements,
  isLoading,
  isAdmin,
  focusFormSignal,
  onNavigateNewPurchase,
  onDeleteItem,
  onFeedback,
}: InventoryViewProps) {
  const { t, translateStockMovementType } = useLanguage();

  // Add / Edit Item Form State
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<InventoryItemPreset>('Jute');
  const [customItemName, setCustomItemName] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('KG');
  const [minStockInput, setMinStockInput] = useState('50');
  const [initialStockInput, setInitialStockInput] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // List & History State
  const [activeTab, setActiveTab] = useState<ActiveTab>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [historyItemIdFilter, setHistoryItemIdFilter] = useState<string>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');

  // Stock In/Out Modal State
  const [adjustingState, setAdjustingState] = useState<{
    itemId: string;
    direction: StockAdjustmentDirection;
  } | null>(null);

  const presetSelectRef = useRef<HTMLSelectElement | null>(null);

  const startEditItem = (item: InventoryItem) => {
    if (!isAdmin) return;
    setEditingItem(item);
    const isPreset = (INVENTORY_ITEM_PRESETS as readonly string[]).includes(
      item.itemName
    );
    if (isPreset && item.itemName !== 'Other') {
      setSelectedPreset(item.itemName as InventoryItemPreset);
      setCustomItemName('');
    } else {
      setSelectedPreset('Other');
      setCustomItemName(item.itemName);
    }
    setUnit(item.unit);
    setMinStockInput(String(item.minStockLevel));
    setInitialStockInput(String(item.currentStock));
    setFormError(null);
    if (presetSelectRef.current) {
      presetSelectRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      presetSelectRef.current.focus();
    }
  };

  const cancelEditItem = () => {
    setEditingItem(null);
    setSelectedPreset('Jute');
    setCustomItemName('');
    setUnit('KG');
    setMinStockInput('50');
    setInitialStockInput('0');
    setFormError(null);
  };

  useEffect(() => {
    if (focusFormSignal > 0 && presetSelectRef.current) {
      presetSelectRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      presetSelectRef.current.focus();
    }
  }, [focusFormSignal]);

  const adjustingItem = useMemo(
    () =>
      adjustingState
        ? items.find((i) => i.id === adjustingState.itemId) ?? null
        : null,
    [adjustingState, items]
  );

  // KPIs
  const stats = useMemo(() => {
    let lowStockCount = 0;
    let purchaseRestockCount = 0;

    for (const item of items) {
      if (item.currentStock < item.minStockLevel) {
        lowStockCount += 1;
      }
    }

    for (const mov of movements) {
      if (mov.type === 'purchase') {
        purchaseRestockCount += 1;
      }
    }

    return {
      totalItems: items.length,
      lowStockCount,
      healthyCount: items.length - lowStockCount,
      totalMovements: movements.length,
      purchaseRestockCount,
    };
  }, [items, movements]);

  // Sorted & Filtered Inventory Items (Low stock items surfaced first when equal)
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...items]
      .sort((a, b) => {
        const aLow = a.currentStock < a.minStockLevel ? 0 : 1;
        const bLow = b.currentStock < b.minStockLevel ? 0 : 1;
        if (aLow !== bLow) return aLow - bLow;
        return a.itemName.localeCompare(b.itemName);
      })
      .filter((item) => {
        const isLow = item.currentStock < item.minStockLevel;
        if (statusFilter === 'low' && !isLow) return false;
        if (statusFilter === 'healthy' && isLow) return false;
        if (unitFilter !== 'all' && item.unit !== (unitFilter as InventoryUnit)) {
          return false;
        }
        if (!q) return true;
        return (
          item.itemName.toLowerCase().includes(q) ||
          item.unit.toLowerCase().includes(q)
        );
      });
  }, [items, searchQuery, statusFilter, unitFilter]);

  // Sorted & Filtered Movements
  const filteredMovements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...movements]
      .sort((a, b) => {
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      })
      .filter((mov) => {
        if (
          historyItemIdFilter !== 'all' &&
          mov.inventoryItemId !== historyItemIdFilter
        ) {
          return false;
        }
        if (
          historyTypeFilter !== 'all' &&
          mov.type !== (historyTypeFilter as StockMovementType)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          mov.itemName.toLowerCase().includes(q) ||
          mov.reference.toLowerCase().includes(q) ||
          mov.note.toLowerCase().includes(q) ||
          mov.movementDate.toLowerCase().includes(q)
        );
      });
  }, [movements, historyItemIdFilter, historyTypeFilter, searchQuery]);

  const resolvedItemName =
    selectedPreset === 'Other' ? customItemName.trim() : selectedPreset;

  const duplicateItem = useMemo(() => {
    const target = resolvedItemName.toLowerCase();
    if (!target) return null;
    return (
      items.find(
        (i) =>
          i.id !== editingItem?.id &&
          i.itemName.trim().toLowerCase() === target &&
          i.unit === unit
      ) ?? null
    );
  }, [items, resolvedItemName, unit, editingItem?.id]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (
      resolvedItemName.length < INVENTORY_VALIDATION.itemNameMin ||
      resolvedItemName.length > INVENTORY_VALIDATION.itemNameMax
    ) {
      setFormError(
        selectedPreset === 'Other'
          ? `Please enter a custom item name (1–${INVENTORY_VALIDATION.itemNameMax} characters).`
          : 'Please select a valid item name.'
      );
      return;
    }

    if (duplicateItem) {
      setFormError(
        `"${duplicateItem.itemName}" (${duplicateItem.unit}) is already tracked in Inventory. Use the Stock In button on that row to add stock.`
      );
      return;
    }

    if (!INVENTORY_UNITS.includes(unit)) {
      setFormError('Please choose KG, Liter, or Pcs.');
      return;
    }

    const parsedMin = Number(minStockInput);
    if (
      !Number.isFinite(parsedMin) ||
      parsedMin < 0 ||
      parsedMin > INVENTORY_VALIDATION.maxStock
    ) {
      setFormError(
        `Minimum Stock Alert Level must be between 0 and ${INVENTORY_VALIDATION.maxStock.toLocaleString()}.`
      );
      return;
    }

    const cleanMin = roundCurrency(parsedMin);

    if (editingItem) {
      setIsSubmitting(true);
      try {
        const itemDocRef = doc(db, 'inventory', editingItem.id);
        try {
          await updateDoc(itemDocRef, {
            itemName: resolvedItemName,
            unit,
            minStockLevel: cleanMin,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `inventory/${editingItem.id}`
          );
        }
        cancelEditItem();
        onFeedback(
          `Updated inventory item "${resolvedItemName}" (${unit}, min alert ${formatNumber(cleanMin)} ${unit}).`
        );
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : 'Unable to update inventory item.'
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const parsedInitial = Number(initialStockInput);
    if (
      !Number.isFinite(parsedInitial) ||
      parsedInitial < 0 ||
      parsedInitial > INVENTORY_VALIDATION.maxStock
    ) {
      setFormError(
        `Initial Current Stock must be between 0 and ${INVENTORY_VALIDATION.maxStock.toLocaleString()}.`
      );
      return;
    }

    const cleanInitial = roundCurrency(parsedInitial);

    const rawAutoId = doc(collection(db, 'inventory')).id
      .slice(0, 8)
      .toUpperCase();
    const itemId = `ITM-${rawAutoId}`;
    const openingMovId = `STK-OPEN-${rawAutoId}`;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const itemDocRef = doc(db, 'inventory', itemId);

      batch.set(itemDocRef, {
        ownerId,
        itemName: resolvedItemName,
        unit,
        minStockLevel: cleanMin,
        currentStock: cleanInitial,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (cleanInitial > 0) {
        const movDocRef = doc(db, 'stock_movements', openingMovId);
        batch.set(movDocRef, {
          ownerId,
          inventoryItemId: itemId,
          itemName: resolvedItemName,
          unit,
          type: 'opening',
          quantity: cleanInitial,
          previousStock: 0,
          resultingStock: cleanInitial,
          movementDate: getTodayIsoDate(),
          reference: itemId,
          note: 'Initial opening stock registered',
          createdAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `inventory/${itemId}`
        );
      }

      setCustomItemName('');
      setInitialStockInput('0');
      onFeedback(
        `Added "${resolvedItemName}" (${formatNumber(cleanInitial)} ${unit}, min alert ${formatNumber(cleanMin)} ${unit}) to Inventory.`
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to add inventory item.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <section aria-label="Inventory summary metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* Total Tracked Items */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('inventory.kpi.trackedMaterials')}
              </p>
              <Boxes className="w-4 h-4 text-[#1e3a8a] shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : stats.totalItems}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.healthyCount} {t('inventory.kpi.healthySub')}
            </p>
          </div>

          {/* Low Stock Alerts */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('items');
              setStatusFilter(statusFilter === 'low' ? 'all' : 'low');
            }}
            className="p-5 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('inventory.kpi.lowStockAlerts')}
              </p>
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  stats.lowStockCount > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              />
            </div>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                stats.lowStockCount > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {isLoading ? '—' : stats.lowStockCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.lowStockCount > 0
                ? t('inventory.kpi.clickToFilter')
                : t('inventory.kpi.allHealthy')}
            </p>
          </button>

          {/* Total Movements */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('inventory.kpi.stockMovements')}
              </p>
              <History className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : stats.totalMovements}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t('inventory.kpi.loggedIn')}
            </p>
          </div>

          {/* Restocked via Purchases */}
          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  {t('inventory.kpi.purchaseRestocks')}
                </p>
                <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {isLoading ? '—' : stats.purchaseRestockCount}
              </p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {t('inventory.kpi.autoSynced')}
              </span>
              <button
                type="button"
                onClick={onNavigateNewPurchase}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                <ShoppingCart className="w-3 h-3" />
                {t('cta.newPurchase')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split: Add Item Form (Left) + Inventory Table & History (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Add / Edit Item Form */}
        <section
          aria-labelledby="add-inventory-heading"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-2">
            <div>
              <h2
                id="add-inventory-heading"
                className="font-display text-base font-semibold text-slate-900"
              >
                {editingItem
                  ? `${t('inventory.form.editTitle')}: ${editingItem.itemName}`
                  : t('inventory.form.addTitle')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingItem
                  ? t('inventory.form.editSubtitle')
                  : t('inventory.form.addSubtitle')}
              </p>
            </div>
            {editingItem && (
              <button
                type="button"
                onClick={cancelEditItem}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                title={t('inventory.form.cancelEdit')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <form onSubmit={handleAddItem} className="p-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {formError}
              </div>
            )}

            {/* Item Name Preset Dropdown */}
            <div>
              <label
                htmlFor="inventoryItemPreset"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('inventory.form.itemName')}{' '}
                <span className="text-red-600">*</span>
              </label>
              <select
                ref={presetSelectRef}
                id="inventoryItemPreset"
                required
                value={selectedPreset}
                onChange={(e) =>
                  setSelectedPreset(e.target.value as InventoryItemPreset)
                }
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              >
                {INVENTORY_ITEM_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Name when "Other" selected */}
            {selectedPreset === 'Other' && (
              <div>
                <label
                  htmlFor="customInventoryName"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('inventory.form.customItemName')}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="customInventoryName"
                  type="text"
                  required
                  maxLength={INVENTORY_VALIDATION.itemNameMax}
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  placeholder="e.g. Hydrogen Peroxide, Boiler Valve"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            )}

            {/* Unit */}
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('inventory.form.unit')}{' '}
                <span className="text-red-600">*</span>
              </span>
              <div
                role="group"
                aria-label="Inventory item unit"
                className="grid grid-cols-3 gap-2"
              >
                {INVENTORY_UNITS.map((u) => {
                  const selected = unit === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Min Alert Level & Initial Current Stock */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              <div>
                <label
                  htmlFor="minStockLevel"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('inventory.form.minStock')} ({unit}){' '}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="minStockLevel"
                  type="number"
                  required
                  min="0"
                  max={INVENTORY_VALIDATION.maxStock}
                  step="0.01"
                  value={minStockInput}
                  onChange={(e) => setMinStockInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              {!editingItem ? (
                <div>
                  <label
                    htmlFor="initialCurrentStock"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    {t('inventory.form.initialStock')} ({unit}){' '}
                    <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="initialCurrentStock"
                    type="number"
                    required
                    min="0"
                    max={INVENTORY_VALIDATION.maxStock}
                    step="0.01"
                    value={initialStockInput}
                    onChange={(e) => setInitialStockInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                  {t('inventory.table.currentStock')}:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {formatNumber(editingItem.currentStock)} {editingItem.unit}
                  </span>{' '}
                  ({t('inventory.form.currentStockNote')})
                </div>
              )}
            </div>

            {duplicateItem && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
                <strong>{duplicateItem.itemName}</strong> ({duplicateItem.unit})
                already exists with{' '}
                <span className="font-mono font-semibold">
                  {formatNumber(duplicateItem.currentStock)}{' '}
                  {duplicateItem.unit}
                </span>
                . Use Stock In on the table to add quantity.
              </div>
            )}

            <div className="space-y-2">
              <button
                type="submit"
                disabled={isSubmitting || Boolean(duplicateItem)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {editingItem ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    {isSubmitting
                      ? t('inventory.form.saving')
                      : t('common.saveChanges')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 shrink-0" />
                    {isSubmitting
                      ? t('inventory.form.adding')
                      : t('inventory.form.addBtn')}
                  </>
                )}
              </button>

              {editingItem && (
                <div className={isAdmin ? 'grid grid-cols-2 gap-2' : ''}>
                  <button
                    type="button"
                    onClick={cancelEditItem}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    {t('inventory.form.cancelEdit')}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingItem;
                        cancelEditItem();
                        onDeleteItem(target);
                      }}
                      disabled={isSubmitting}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('inventory.form.deleteItem')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </section>

        {/* Right: Inventory List & Movement History */}
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Header & Tabs */}
          <div className="p-4 sm:px-5 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Inventory views"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'items'}
                  onClick={() => setActiveTab('items')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'items'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('inventory.tab.items')} ({items.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'history'}
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'history'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('inventory.tab.history')} ({movements.length})
                </button>
              </div>

              {activeTab === 'items' && stats.lowStockCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {stats.lowStockCount}{' '}
                  {stats.lowStockCount === 1
                    ? t('inventory.lowStockItemSingular')
                    : t('inventory.lowStockItemPlural')}
                </span>
              )}
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    activeTab === 'items'
                      ? t('inventory.searchItemsPlaceholder')
                      : t('inventory.searchHistoryPlaceholder')
                  }
                  aria-label="Search inventory"
                  className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              {activeTab === 'items' ? (
                <>
                  <select
                    aria-label="Filter by stock status"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as StockStatusFilter)
                    }
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  >
                    <option value="all">{t('purchases.filter.allStatus')}</option>
                    <option value="low">{t('inventory.filter.lowOnly')}</option>
                    <option value="healthy">
                      {t('inventory.filter.healthyStock')}
                    </option>
                  </select>

                  <div
                    role="group"
                    aria-label="Filter by unit"
                    className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start sm:self-auto"
                  >
                    <button
                      type="button"
                      onClick={() => setUnitFilter('all')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        unitFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('common.all')}
                    </button>
                    {INVENTORY_UNITS.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnitFilter(u)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                          unitFilter === u
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <select
                    aria-label="Filter movements by item"
                    value={historyItemIdFilter}
                    onChange={(e) => setHistoryItemIdFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  >
                    <option value="all">{t('inventory.filter.allItems')}</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.itemName} ({it.unit})
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter movements by type"
                    value={historyTypeFilter}
                    onChange={(e) => setHistoryTypeFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  >
                    <option value="all">{t('inventory.filter.allTypes')}</option>
                    <option value="in">{t('inventory.movement.in')}</option>
                    <option value="out">{t('inventory.movement.out')}</option>
                    <option value="purchase">
                      {t('inventory.movement.purchase')}
                    </option>
                    <option value="opening">
                      {t('inventory.movement.opening')}
                    </option>
                  </select>
                </>
              )}
            </div>
          </div>

          {/* Tab 1: Inventory List Table */}
          {activeTab === 'items' && (
            <>
              {isLoading ? (
                <div className="divide-y divide-slate-200">
                  {[1, 2, 3, 4].map((row) => (
                    <div
                      key={row}
                      className="px-5 py-4 flex justify-between gap-4 animate-pulse"
                    >
                      <div className="h-4 w-44 bg-slate-200 rounded" />
                      <div className="h-4 w-32 bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {t('inventory.empty.title')}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
                    {t('inventory.empty.desc')}
                  </p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    {t('inventory.empty.noMatch')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setUnitFilter('all');
                    }}
                    className="mt-4 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    {t('common.clearFilters')}
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5">
                          {t('inventory.table.itemName')}
                        </th>
                        <th className="py-3 px-4 text-right">
                          {t('inventory.table.currentStock')}
                        </th>
                        <th className="py-3 px-4 text-right">
                          {t('inventory.table.minAlert')}
                        </th>
                        <th className="py-3 px-4">{t('common.status')}</th>
                        <th className="py-3 px-5 text-right">
                          {t('common.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredItems.map((item) => {
                        const isLowStock =
                          item.currentStock < item.minStockLevel;
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isLowStock
                                ? 'bg-red-50/35 hover:bg-red-50/60'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="py-3.5 px-5">
                              <p className="font-medium text-slate-900">
                                {item.itemName}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                                {t('inventory.updated')}{' '}
                                {formatDateTime(
                                  timestampToDate(item.updatedAt)
                                )}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <span
                                className={`font-mono text-sm font-semibold tabular-nums ${
                                  isLowStock
                                    ? 'text-red-700'
                                    : 'text-slate-900'
                                }`}
                              >
                                {formatNumber(item.currentStock)} {item.unit}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                              {formatNumber(item.minStockLevel)} {item.unit}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isLowStock ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  {t('inventory.lowStockBadge')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  {t('inventory.inStockBadge')}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAdjustingState({
                                      itemId: item.id,
                                      direction: 'in',
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer"
                                >
                                  <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                                  {t('inventory.action.stockIn')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAdjustingState({
                                      itemId: item.id,
                                      direction: 'out',
                                    })
                                  }
                                  disabled={item.currentStock <= 0}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer"
                                >
                                  <ArrowDownCircle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                                  {t('inventory.action.stockOut')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHistoryItemIdFilter(item.id);
                                    setActiveTab('history');
                                  }}
                                  title={t('inventory.tab.history')}
                                  aria-label={`View stock history for ${item.itemName}`}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEditItem(item)}
                                      title={t('common.edit')}
                                      aria-label={`Edit ${item.itemName}`}
                                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteItem(item)}
                                      title={t('common.delete')}
                                      aria-label={`Delete ${item.itemName}`}
                                      className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Stock Movement History Table */}
          {activeTab === 'history' && (
            <>
              {isLoading ? (
                <div className="divide-y divide-slate-200">
                  {[1, 2, 3, 4].map((row) => (
                    <div
                      key={row}
                      className="px-5 py-4 flex justify-between gap-4 animate-pulse"
                    >
                      <div className="h-4 w-44 bg-slate-200 rounded" />
                      <div className="h-4 w-32 bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    {t('inventory.empty.noHistory')}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('inventory.empty.noHistoryDesc')}
                  </p>
                  {(historyItemIdFilter !== 'all' ||
                    historyTypeFilter !== 'all' ||
                    searchQuery.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryItemIdFilter('all');
                        setHistoryTypeFilter('all');
                        setSearchQuery('');
                      }}
                      className="mt-4 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                    >
                      {t('inventory.clearHistoryFilters')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5">{t('common.refAndDate')}</th>
                        <th className="py-3 px-4">{t('inventory.table.item')}</th>
                        <th className="py-3 px-4">{t('inventory.table.type')}</th>
                        <th className="py-3 px-4 text-right">
                          {t('inventory.table.qtyChange')}
                        </th>
                        <th className="py-3 px-4 text-right">
                          {t('inventory.table.resulting')}
                        </th>
                        <th className="py-3 px-5">{t('common.note')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredMovements.map((mov) => {
                        const badge = getMovementBadge(mov.type);
                        return (
                          <tr
                            key={mov.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <p className="font-mono text-xs font-semibold text-slate-900">
                                {mov.reference || mov.id}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatIsoDate(mov.movementDate)}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                              {mov.itemName}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${badge.classes}`}
                              >
                                {translateStockMovementType(mov.type)}
                              </span>
                            </td>
                            <td
                              className={`py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                                badge.isPositive
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {badge.isPositive ? '+' : '−'}
                              {formatNumber(mov.quantity)} {mov.unit}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                              {formatNumber(mov.resultingStock)} {mov.unit}
                            </td>
                            <td className="py-3.5 px-5 text-xs text-slate-600 max-w-xs break-words">
                              {mov.note || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Stock In / Stock Out Modal */}
      <StockAdjustmentModal
        item={adjustingItem}
        direction={adjustingState?.direction ?? 'in'}
        ownerId={ownerId}
        onClose={() => setAdjustingState(null)}
        onAdjusted={(item, direction, qty, resultingStock) => {
          setAdjustingState(null);
          const actionText =
            direction === 'in'
              ? `Stock In: +${formatNumber(qty)} ${item.unit}`
              : `Stock Out: −${formatNumber(qty)} ${item.unit}`;
          onFeedback(
            `${actionText} for ${item.itemName}. Current stock is now ${formatNumber(resultingStock)} ${item.unit}.`
          );
        }}
      />
    </div>
  );
}
