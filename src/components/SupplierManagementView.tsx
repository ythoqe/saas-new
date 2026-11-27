import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Banknote,
  BookOpen,
  Edit2,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { SupplierRecord, SupplierWithLedgerSummary } from '../types/mill';
import {
  formatCurrency,
  formatShortDate,
  getPayableStatusLabel,
  roundCurrency,
} from '../utils/ledger';

type PayableFilter = 'all' | 'payable' | 'settled';
type SortOption = 'newest' | 'payable_desc' | 'name_asc';

interface SupplierManagementViewProps {
  summaries: SupplierWithLedgerSummary[];
  isLoading: boolean;
  isAdmin: boolean;
  canCreateSupplier: boolean;
  canManagePayments: boolean;
  onAddSupplier: () => void;
  onEditSupplier: (supplier: SupplierRecord) => void;
  onDeleteSupplier: (supplier: SupplierRecord) => void;
  onOpenLedger: (supplier: SupplierRecord) => void;
  onPaySupplier: (supplier: SupplierRecord) => void;
}

export function SupplierManagementView({
  summaries,
  isLoading,
  isAdmin,
  canCreateSupplier,
  canManagePayments,
  onAddSupplier,
  onEditSupplier,
  onDeleteSupplier,
  onOpenLedger,
  onPaySupplier,
}: SupplierManagementViewProps) {
  const { t, translatePayableTone } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [payableFilter, setPayableFilter] = useState<PayableFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const aggregateStats = useMemo(() => {
    let totalPayable = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    let suppliersWithPayable = 0;

    for (const item of summaries) {
      totalPayable += item.totalPayable;
      totalCredit += item.totalCredit;
      totalDebit += item.totalDebit;
      if (item.totalPayable > 0) suppliersWithPayable += 1;
    }

    return {
      totalSuppliers: summaries.length,
      suppliersWithPayable,
      totalPayable: roundCurrency(totalPayable),
      totalCredit: roundCurrency(totalCredit),
      totalDebit: roundCurrency(totalDebit),
    };
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = summaries.filter((item) => {
      if (payableFilter === 'payable' && item.totalPayable <= 0) return false;
      if (payableFilter === 'settled' && item.totalPayable > 0) return false;

      if (!q) return true;
      return (
        item.supplier.supplierName.toLowerCase().includes(q) ||
        item.supplier.companyName.toLowerCase().includes(q) ||
        item.supplier.mobile.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'payable_desc') {
      return [...filtered].sort((a, b) => b.totalPayable - a.totalPayable);
    }
    if (sortBy === 'name_asc') {
      return [...filtered].sort((a, b) =>
        a.supplier.supplierName.localeCompare(b.supplier.supplierName)
      );
    }
    return filtered;
  }, [summaries, searchQuery, payableFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('suppliers.kpi.totalSuppliers')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : aggregateStats.totalSuppliers}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isLoading
              ? t('suppliers.kpi.loadingVendors')
              : `${aggregateStats.suppliersWithPayable} ${t('suppliers.kpi.withActivePayable')}`}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('suppliers.kpi.netPayable')}
          </p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              aggregateStats.totalPayable > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {isLoading ? '—' : formatCurrency(aggregateStats.totalPayable)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('suppliers.kpi.payableFormula')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('suppliers.kpi.totalPurchasesOpening')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : formatCurrency(aggregateStats.totalCredit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('suppliers.kpi.creditsSub')}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('suppliers.kpi.totalPaid')}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
            {isLoading ? '—' : formatCurrency(aggregateStats.totalDebit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('suppliers.kpi.debitsSub')}
          </p>
        </div>
      </div>

      {/* Suppliers Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('suppliers.searchPlaceholder')}
              aria-label="Search suppliers"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Filter suppliers by payable status"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              {(
                [
                  { id: 'all', label: t('common.all') },
                  { id: 'payable', label: t('suppliers.filter.payableDue') },
                  { id: 'settled', label: t('common.settled') },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPayableFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    payableFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1.5 border border-slate-200 rounded-md px-2.5 py-1.5 bg-white">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                aria-label="Sort suppliers"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="newest">{t('clients.sort.newest')}</option>
                <option value="payable_desc">
                  {t('suppliers.sort.highestPayable')}
                </option>
                <option value="name_asc">{t('clients.sort.nameAsc')}</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-200">
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="px-5 py-4 flex items-center justify-between gap-4 animate-pulse"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-44 bg-slate-200 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
                <div className="h-4 w-24 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              {t('suppliers.empty.title')}
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
              {t('suppliers.empty.desc')}
            </p>
            {canCreateSupplier && (
              <button
                type="button"
                onClick={onAddSupplier}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {t('suppliers.empty.cta')}
              </button>
            )}
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              {t('suppliers.empty.noMatch')}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setPayableFilter('all');
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
                    {t('suppliers.table.supplierCompany')}
                  </th>
                  <th className="py-3 px-4">{t('common.mobile')}</th>
                  <th className="py-3 px-4 text-right hidden md:table-cell">
                    {t('suppliers.table.totalCredit')}
                  </th>
                  <th className="py-3 px-4 text-right hidden md:table-cell">
                    {t('suppliers.table.totalDebit')}
                  </th>
                  <th className="py-3 px-5 text-right">
                    {t('suppliers.table.totalPayable')}
                  </th>
                  <th className="py-3 px-5 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredSummaries.map((item) => {
                  const status = getPayableStatusLabel(item.totalPayable);
                  return (
                    <tr
                      key={item.supplier.id}
                      onClick={() => onOpenLedger(item.supplier)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-slate-900">
                          {item.supplier.supplierName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.supplier.companyName}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {item.supplier.mobile}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap hidden md:table-cell">
                        {formatCurrency(item.totalCredit)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-700 whitespace-nowrap hidden md:table-cell">
                        {formatCurrency(item.totalDebit)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <p
                          className={`font-mono text-sm font-semibold tabular-nums ${
                            item.totalPayable > 0
                              ? 'text-red-700'
                              : item.totalPayable < 0
                                ? 'text-emerald-700'
                                : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(item.totalPayable)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <span>{translatePayableTone(status.tone)}</span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {item.entryCount}{' '}
                            {item.entryCount === 1
                              ? t('common.txn')
                              : t('common.txns')}
                          </span>
                          <span aria-hidden="true" className="hidden sm:inline">
                            {' '}
                            ·{' '}
                          </span>
                          <span className="hidden sm:inline">
                            {formatShortDate(item.lastActivityAt)}
                          </span>
                        </p>
                      </td>
                      <td
                        className="py-3.5 px-5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {canManagePayments && (
                            <button
                              type="button"
                              onClick={() => onPaySupplier(item.supplier)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Banknote className="w-3.5 h-3.5 shrink-0" />
                              {t('suppliers.action.paySupplier')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenLedger(item.supplier)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            {t('common.ledger')}
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditSupplier(item.supplier)}
                                aria-label={`Edit ${item.supplier.supplierName}`}
                                title={t('common.edit')}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteSupplier(item.supplier)}
                                aria-label={`Delete ${item.supplier.supplierName}`}
                                title={t('common.delete')}
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
      </div>
    </div>
  );
}
