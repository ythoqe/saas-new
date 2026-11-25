import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  CheckCircle2,
  History,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
} from 'lucide-react';
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
  focusFormSignal: number;
  onNavigateNewPurchase: () => void;
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
  focusFormSignal,
  onNavigateNewPurchase,
  onFeedback,
}: InventoryViewProps) {
  // Add Item Form State
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
        (i) => i.itemName.trim().toLowerCase() === target && i.unit === unit
      ) ?? null
    );
  }, [items, resolvedItemName, unit]);

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

    const cleanMin = roundCurrency(parsedMin);
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
                Tracked Materials
              </p>
              <Boxes className="w-4 h-4 text-[#1e3a8a] shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : stats.totalItems}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.healthyCount} healthy · chemicals, jute &amp; spares
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
                Low Stock Alerts
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
                ? 'Click to filter items below minimum'
                : 'All stock levels above minimum'}
            </p>
          </button>

          {/* Total Movements */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Stock Movements
              </p>
              <History className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : stats.totalMovements}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Logged in{' '}
              <span className="font-mono text-slate-600">stock_movements</span>
            </p>
          </div>

          {/* Restocked via Purchases */}
          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Purchase Restocks
                </p>
                <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {isLoading ? '—' : stats.purchaseRestockCount}
              </p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Auto-synced</span>
              <button
                type="button"
                onClick={onNavigateNewPurchase}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                <ShoppingCart className="w-3 h-3" />
                New Purchase
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split: Add Item Form (Left) + Inventory Table & History (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Add Item Form */}
        <section
          aria-labelledby="add-inventory-heading"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200">
            <h2
              id="add-inventory-heading"
              className="font-display text-base font-semibold text-slate-900"
            >
              Add Item
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Register chemicals, dyes, jute, or spare parts with reorder alerts
            </p>
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
                Item Name <span className="text-red-600">*</span>
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
                  Custom Item Name <span className="text-red-600">*</span>
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
                Unit <span className="text-red-600">*</span>
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
                  Minimum Stock Alert Level ({unit}){' '}
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

              <div>
                <label
                  htmlFor="initialCurrentStock"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Initial Current Stock ({unit}){' '}
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

            <button
              type="submit"
              disabled={isSubmitting || Boolean(duplicateItem)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              {isSubmitting ? 'Adding Item...' : 'Add Inventory Item'}
            </button>
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
                  Inventory List ({items.length})
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
                  Movement History ({movements.length})
                </button>
              </div>

              {activeTab === 'items' && stats.lowStockCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {stats.lowStockCount} Low Stock{' '}
                  {stats.lowStockCount === 1 ? 'Item' : 'Items'}
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
                      ? 'Search chemical, dye, jute, or spare part...'
                      : 'Search item, reference, date, or note...'
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
                    <option value="all">All Status</option>
                    <option value="low">Low Stock Only</option>
                    <option value="healthy">Healthy Stock</option>
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
                      All
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
                    <option value="all">All Items</option>
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
                    <option value="all">All Types</option>
                    <option value="in">Stock In</option>
                    <option value="out">Stock Out</option>
                    <option value="purchase">Purchase In</option>
                    <option value="opening">Opening Stock</option>
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
                    No inventory items registered yet
                  </h3>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
                    Use the Add Item form to register Jute, Bleaching, Soda,
                    Acid, Blue, BMB, or Spare Parts. Once added, New Purchases
                    can automatically restock them.
                  </p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    No inventory items match your filters
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
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5">Item Name</th>
                        <th className="py-3 px-4 text-right">Current Stock</th>
                        <th className="py-3 px-4 text-right">
                          Min Alert Level
                        </th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-5 text-right">Actions</th>
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
                                Updated{' '}
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
                                  Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  In Stock
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
                                  Stock In
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
                                  Stock Out
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHistoryItemIdFilter(item.id);
                                    setActiveTab('history');
                                  }}
                                  title="View movement history"
                                  aria-label={`View stock history for ${item.itemName}`}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
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
                    No stock movements recorded yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Stock In, Stock Out, opening stock, and linked Purchase
                    restocks appear here in real time.
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
                      Clear History Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5">Ref &amp; Date</th>
                        <th className="py-3 px-4">Item</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4 text-right">Qty Change</th>
                        <th className="py-3 px-4 text-right">Resulting</th>
                        <th className="py-3 px-5">Note</th>
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
                                {badge.label}
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
