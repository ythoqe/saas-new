import { useMemo, useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import {
  PURCHASE_UNITS,
  type PurchaseRecord,
  type PurchaseUnit,
  type SupplierRecord,
  type SupplierWithLedgerSummary,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

interface PurchasesListViewProps {
  purchases: PurchaseRecord[];
  suppliersById: Map<string, SupplierRecord>;
  summariesBySupplierId: Map<string, SupplierWithLedgerSummary>;
  isLoading: boolean;
  onCreateNewPurchase: () => void;
  onOpenSupplierLedger: (supplier: SupplierRecord) => void;
}

export function PurchasesListView({
  purchases,
  suppliersById,
  summariesBySupplierId,
  isLoading,
  onCreateNewPurchase,
  onOpenSupplierLedger,
}: PurchasesListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>('all');

  const stats = useMemo(() => {
    let totalSpend = 0;
    const uniqueItems = new Set<string>();
    const activeSupplierIds = new Set<string>();

    for (const p of purchases) {
      totalSpend += p.totalAmount;
      uniqueItems.add(p.itemName.trim().toLowerCase());
      activeSupplierIds.add(p.supplierId);
    }

    return {
      totalCount: purchases.length,
      totalSpend: roundCurrency(totalSpend),
      uniqueItemCount: uniqueItems.size,
      activeSupplierCount: activeSupplierIds.size,
    };
  }, [purchases]);

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...purchases]
      .sort((a, b) => {
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      })
      .filter((p) => {
        if (unitFilter !== 'all' && p.unit !== (unitFilter as PurchaseUnit)) {
          return false;
        }
        if (!q) return true;
        const supplier = suppliersById.get(p.supplierId);
        return (
          p.reference.toLowerCase().includes(q) ||
          p.itemName.toLowerCase().includes(q) ||
          p.purchaseDate.toLowerCase().includes(q) ||
          (supplier?.supplierName.toLowerCase().includes(q) ?? false) ||
          (supplier?.companyName.toLowerCase().includes(q) ?? false)
        );
      });
  }, [purchases, suppliersById, searchQuery, unitFilter]);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Purchases</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.totalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Posted atomically to supplier_ledger
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Purchase Value</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : formatCurrency(stats.totalSpend)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Chemicals, jute, dyes &amp; spare parts
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Distinct Items</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.uniqueItemCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tracked inventory SKUs
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Billed Vendors</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.activeSupplierCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Suppliers with purchase history
          </p>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, item name, or supplier..."
              aria-label="Search purchases"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter purchases by unit"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
          >
            <button
              type="button"
              onClick={() => setUnitFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                unitFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Units
            </button>
            {PURCHASE_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnitFilter(u)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  unitFilter === u
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-200">
            {[1, 2, 3].map((row) => (
              <div key={row} className="px-5 py-4 flex justify-between gap-4 animate-pulse">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-4 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
              <Package className="w-5 h-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              No purchases logged yet
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
              Record jute, bleaching chemicals, dyes, or spare parts purchases to update
              inventory records and automatically credit{' '}
              <span className="font-mono text-slate-700">supplier_ledger</span>.
            </p>
            <button
              type="button"
              onClick={onCreateNewPurchase}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Log First Purchase
            </button>
          </div>
        ) : sortedAndFiltered.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              No purchases match your filters
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
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
                  <th className="py-3 px-5">Ref &amp; Date</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-5 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {sortedAndFiltered.map((p) => {
                  const supplier = suppliersById.get(p.supplierId);
                  const summary = summariesBySupplierId.get(p.supplierId);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        if (supplier) onOpenSupplierLedger(supplier);
                      }}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        supplier ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {p.reference}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatIsoDate(p.purchaseDate)}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-900">
                          {supplier ? supplier.supplierName : 'Supplier'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {supplier?.companyName}
                          {summary ? (
                            <>
                              {' '}
                              · Payable:{' '}
                              <span
                                className={`font-mono tabular-nums ${
                                  summary.totalPayable > 0
                                    ? 'text-red-700 font-medium'
                                    : 'text-slate-600'
                                }`}
                              >
                                {formatCurrency(summary.totalPayable)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        {p.itemName}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {formatNumber(p.quantity)} {p.unit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {formatCurrency(p.rate)}/{p.unit}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatCurrency(p.totalAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
