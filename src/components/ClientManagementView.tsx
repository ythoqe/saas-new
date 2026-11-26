import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Banknote,
  BookOpen,
  Edit2,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import type { ClientRecord, ClientWithLedgerSummary } from '../types/mill';
import {
  formatCurrency,
  formatShortDate,
  getDueStatusLabel,
  roundCurrency,
} from '../utils/ledger';

type DueFilter = 'all' | 'with_due' | 'settled';
type SortOption = 'newest' | 'due_desc' | 'name_asc';

interface ClientManagementViewProps {
  summaries: ClientWithLedgerSummary[];
  isLoading: boolean;
  onAddClient: () => void;
  onEditClient: (client: ClientRecord) => void;
  onDeleteClient: (client: ClientRecord) => void;
  onOpenLedger: (client: ClientRecord) => void;
  onReceivePayment: (client: ClientRecord) => void;
}

export function ClientManagementView({
  summaries,
  isLoading,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onOpenLedger,
  onReceivePayment,
}: ClientManagementViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const aggregateStats = useMemo(() => {
    let totalDue = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let clientsWithDue = 0;

    for (const item of summaries) {
      totalDue += item.currentDue;
      totalDebit += item.totalDebit;
      totalCredit += item.totalCredit;
      if (item.currentDue > 0) clientsWithDue += 1;
    }

    return {
      totalClients: summaries.length,
      clientsWithDue,
      totalDue: roundCurrency(totalDue),
      totalDebit: roundCurrency(totalDebit),
      totalCredit: roundCurrency(totalCredit),
    };
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = summaries.filter((item) => {
      if (dueFilter === 'with_due' && item.currentDue <= 0) return false;
      if (dueFilter === 'settled' && item.currentDue > 0) return false;

      if (!q) return true;
      return (
        item.client.clientName.toLowerCase().includes(q) ||
        item.client.companyName.toLowerCase().includes(q) ||
        item.client.mobile.toLowerCase().includes(q) ||
        item.client.address.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'due_desc') {
      return [...filtered].sort((a, b) => b.currentDue - a.currentDue);
    }
    if (sortBy === 'name_asc') {
      return [...filtered].sort((a, b) =>
        a.client.clientName.localeCompare(b.client.clientName)
      );
    }
    return filtered;
  }, [summaries, searchQuery, dueFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* KPI Strip — Single-elevation flat bordered strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Clients</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : aggregateStats.totalClients}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isLoading
              ? 'Loading registry...'
              : `${aggregateStats.clientsWithDue} with active due`}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Net Current Due</p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              aggregateStats.totalDue > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {isLoading ? '—' : formatCurrency(aggregateStats.totalDue)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sum(Debit) − Sum(Credit) across ledger
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Ledger Debit</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : formatCurrency(aggregateStats.totalDebit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Opening dues & mill bills
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Ledger Credit</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
            {isLoading ? '—' : formatCurrency(aggregateStats.totalCredit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Payments & credit adjustments
          </p>
        </div>
      </div>

      {/* Main Client Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client name, company, or mobile..."
              aria-label="Search clients"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Filter Control */}
            <div
              role="group"
              aria-label="Filter clients by due status"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'with_due', label: 'With Due' },
                  { id: 'settled', label: 'Settled' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDueFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    dueFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <div className="inline-flex items-center gap-1.5 border border-slate-200 rounded-md px-2.5 py-1.5 bg-white">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                aria-label="Sort clients"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="due_desc">Highest Due</option>
                <option value="name_asc">Name (A–Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Content / States */}
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
                <div className="h-4 w-28 bg-slate-200 rounded" />
                <div className="h-4 w-24 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              No clients registered yet
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
              Add your first dyeing or washing mill client along with any previous
              opening due. Opening balances are posted automatically to{' '}
              <span className="font-mono text-slate-700">client_ledger</span>.
            </p>
            <button
              type="button"
              onClick={onAddClient}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add First Client
            </button>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              No matching clients found
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search query or status filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDueFilter('all');
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
                  <th className="py-3 px-5">Client Name & Company</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4 text-right hidden md:table-cell">
                    Total Debit
                  </th>
                  <th className="py-3 px-4 text-right hidden md:table-cell">
                    Total Credit
                  </th>
                  <th className="py-3 px-5 text-right">Current Due</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredSummaries.map((item) => {
                  const status = getDueStatusLabel(item.currentDue);
                  return (
                    <tr
                      key={item.client.id}
                      onClick={() => onOpenLedger(item.client)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-slate-900">
                          {item.client.clientName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="text-slate-600">
                            {item.client.companyName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[260px]">
                            {item.client.address}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {item.client.mobile}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap hidden md:table-cell">
                        {formatCurrency(item.totalDebit)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-700 whitespace-nowrap hidden md:table-cell">
                        {formatCurrency(item.totalCredit)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <p
                          className={`font-mono text-sm font-semibold tabular-nums ${
                            item.currentDue > 0
                              ? 'text-red-700'
                              : item.currentDue < 0
                                ? 'text-emerald-700'
                                : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(item.currentDue)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <span>{status.label}</span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {item.entryCount}{' '}
                            {item.entryCount === 1 ? 'txn' : 'txns'}
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
                          <button
                            type="button"
                            onClick={() => onReceivePayment(item.client)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Banknote className="w-3.5 h-3.5 shrink-0" />
                            Receive Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenLedger(item.client)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#1e3a8a] bg-blue-50/70 hover:bg-blue-100/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            Ledger
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditClient(item.client)}
                            aria-label={`Edit ${item.client.clientName}`}
                            title="Edit Client"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteClient(item.client)}
                            aria-label={`Delete ${item.client.clientName}`}
                            title="Delete Client"
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      </div>
    </div>
  );
}
