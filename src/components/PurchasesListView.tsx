import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Edit2, Lock, Package, Plus, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
  isAdmin: boolean;
  onCreateNewPurchase: () => void;
  onEditPurchase: (purchase: PurchaseRecord) => void;
  onDeletePurchase: (purchase: PurchaseRecord) => void;
  onOpenSupplierLedger: (supplier: SupplierRecord) => void;
  onStatusUpdated: (message: string) => void;
}

export function PurchasesListView({
  purchases,
  suppliersById,
  summariesBySupplierId,
  isLoading,
  isAdmin,
  onCreateNewPurchase,
  onEditPurchase,
  onDeletePurchase,
  onOpenSupplierLedger,
  onStatusUpdated,
}: PurchasesListViewProps) {
  const { t, translatePurchaseStatus } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Paid'>('all');
  const [updatingPurchaseId, setUpdatingPurchaseId] = useState<string | null>(null);

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
        const effectiveStatus = p.status === 'Paid' ? 'Paid' : 'Pending';
        if (statusFilter !== 'all' && effectiveStatus !== statusFilter) {
          return false;
        }
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
  }, [purchases, suppliersById, searchQuery, unitFilter, statusFilter]);

  const handleMarkPaid = async (purchase: PurchaseRecord) => {
    if (purchase.status === 'Paid') return;
    setUpdatingPurchaseId(purchase.id);
    try {
      await updateDoc(doc(db, 'purchases', purchase.id), {
        status: 'Paid',
        updatedAt: serverTimestamp(),
      });
      onStatusUpdated(
        `Marked purchase ${purchase.reference} (${purchase.itemName}) as Paid. Editing and deletion are now locked.`
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `purchases/${purchase.id}`
      );
    } finally {
      setUpdatingPurchaseId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('purchases.kpi.totalPurchases')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.totalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('purchases.kpi.totalPurchasesSub')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('purchases.kpi.totalValue')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : formatCurrency(stats.totalSpend)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('purchases.kpi.totalValueSub')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('purchases.kpi.distinctItems')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.uniqueItemCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('purchases.kpi.distinctItemsSub')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('purchases.kpi.billedVendors')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : stats.activeSupplierCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('purchases.kpi.billedVendorsSub')}
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
              placeholder={t('purchases.searchPlaceholder')}
              aria-label="Search purchases"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Filter purchases by status"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              {(['all', 'Pending', 'Paid'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'all'
                    ? t('purchases.filter.allStatus')
                    : translatePurchaseStatus(st)}
                </button>
              ))}
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
                {t('purchases.filter.allUnits')}
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
              {t('purchases.empty.title')}
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
              {t('purchases.empty.desc')}
            </p>
            <button
              type="button"
              onClick={onCreateNewPurchase}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {t('purchases.empty.cta')}
            </button>
          </div>
        ) : sortedAndFiltered.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              {t('purchases.empty.noMatch')}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setUnitFilter('all');
                setStatusFilter('all');
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
                  <th className="py-3 px-5">{t('common.refAndDate')}</th>
                  <th className="py-3 px-4">{t('purchases.table.supplier')}</th>
                  <th className="py-3 px-4">{t('purchases.table.itemName')}</th>
                  <th className="py-3 px-4 text-right">
                    {t('purchases.table.quantity')}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t('purchases.table.rate')}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t('purchases.table.totalAmount')}
                  </th>
                  <th className="py-3 px-4">{t('common.status')}</th>
                  <th className="py-3 px-5 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {sortedAndFiltered.map((p) => {
                  const supplier = suppliersById.get(p.supplierId);
                  const summary = summariesBySupplierId.get(p.supplierId);
                  const isPending = p.status !== 'Paid';
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
                          {supplier ? supplier.supplierName : t('common.supplier')}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {supplier?.companyName}
                          {summary ? (
                            <>
                              {' '}
                              · {t('common.payable')}:{' '}
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
                      <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatCurrency(p.totalAmount)}
                      </td>
                      <td
                        className="py-3.5 px-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded border ${
                            isPending
                              ? 'text-amber-800 bg-amber-50 border-amber-200'
                              : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          {translatePurchaseStatus(isPending ? 'Pending' : 'Paid')}
                        </span>
                      </td>
                      <td
                        className="py-3.5 px-5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isPending && (
                            <button
                              type="button"
                              disabled={updatingPurchaseId === p.id}
                              onClick={() => handleMarkPaid(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              {t('purchases.action.markPaid')}
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                disabled={!isPending}
                                onClick={() => onEditPurchase(p)}
                                aria-label={`Edit purchase ${p.reference}`}
                                title={
                                  isPending
                                    ? 'Edit Purchase'
                                    : 'Paid purchases are locked and cannot be edited'
                                }
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isPending ? (
                                  <Edit2 className="w-3.5 h-3.5" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={!isPending}
                                onClick={() => onDeletePurchase(p)}
                                aria-label={`Delete purchase ${p.reference}`}
                                title={
                                  isPending
                                    ? 'Delete Purchase'
                                    : 'Paid purchases are locked and cannot be deleted'
                                }
                                className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
}
