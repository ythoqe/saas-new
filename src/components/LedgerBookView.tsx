import { useMemo, useState } from 'react';
import { BookOpen, Printer, RotateCcw, Search } from 'lucide-react';
import type {
  ClientLedgerEntry,
  ClientRecord,
  LedgerTxnType,
} from '../types/mill';
import {
  calculateLedgerTotals,
  formatCurrency,
  formatDateTime,
  getTxnTypeLabel,
  timestampToDate,
} from '../utils/ledger';

type TypeFilter = 'all' | LedgerTxnType;

interface LedgerBookViewProps {
  entries: ClientLedgerEntry[];
  clientsById: Map<string, ClientRecord>;
  isLoading: boolean;
  onOpenLedger: (client: ClientRecord) => void;
  onPrintInvoiceEntry: (entry: ClientLedgerEntry) => void;
  onCorrectLedgerEntry: (entry: ClientLedgerEntry) => void;
}

export function LedgerBookView({
  entries,
  clientsById,
  isLoading,
  onOpenLedger,
  onPrintInvoiceEntry,
  onCorrectLedgerEntry,
}: LedgerBookViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...entries]
      .sort((a, b) => {
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      })
      .filter((entry) => {
        if (typeFilter !== 'all' && entry.txn_type !== typeFilter) return false;
        if (!q) return true;
        const client = clientsById.get(entry.clientId);
        return (
          (client?.clientName.toLowerCase().includes(q) ?? false) ||
          (client?.companyName.toLowerCase().includes(q) ?? false) ||
          entry.reference.toLowerCase().includes(q) ||
          entry.note.toLowerCase().includes(q) ||
          entry.txn_type.toLowerCase().includes(q)
        );
      });
  }, [entries, clientsById, searchQuery, typeFilter]);

  const filteredTotals = useMemo(
    () => calculateLedgerTotals(sortedAndFiltered),
    [sortedAndFiltered]
  );

  return (
    <div className="space-y-6">
      {/* Totals Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Filtered Debit Sum</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-slate-900">
            {isLoading ? '—' : formatCurrency(filteredTotals.totalDebit)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Filtered Credit Sum</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-emerald-700">
            {isLoading ? '—' : formatCurrency(filteredTotals.totalCredit)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Net Ledger Balance (Dr − Cr)</p>
          <p
            className={`mt-1.5 font-mono text-xl font-semibold tabular-nums ${
              filteredTotals.currentDue > 0
                ? 'text-red-700'
                : filteredTotals.currentDue < 0
                  ? 'text-emerald-700'
                  : 'text-slate-900'
            }`}
          >
            {isLoading ? '—' : formatCurrency(filteredTotals.currentDue)}
          </p>
        </div>
      </div>

      {/* Ledger Register Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client, reference number, or note..."
              aria-label="Search ledger entries"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter transactions by type"
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md"
          >
            {(
              [
                { id: 'all', label: 'All Types' },
                { id: 'opening', label: 'Opening' },
                { id: 'invoice', label: 'Bills' },
                { id: 'payment', label: 'Payments' },
                { id: 'adjustment', label: 'Adjustments' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  typeFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-200">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="px-5 py-4 flex justify-between gap-4 animate-pulse">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-4 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : sortedAndFiltered.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-3">
              <BookOpen className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-900">
              No ledger entries match your view
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Open any client from Client Management to record dyeing bills or payment
              receipts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Type &amp; Reference</th>
                  <th className="py-3 px-4">Note</th>
                  <th className="py-3 px-4 text-right">Debit</th>
                  <th className="py-3 px-4 text-right">Credit</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {sortedAndFiltered.map((entry) => {
                  const client = clientsById.get(entry.clientId);
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => {
                        if (client) onOpenLedger(client);
                      }}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        client ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-3 px-5 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDateTime(timestampToDate(entry.createdAt))}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-slate-900">
                          {client ? client.clientName : 'Client'}
                        </p>
                        {client && (
                          <p className="text-xs text-slate-500">{client.companyName}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="text-xs font-medium text-slate-800">
                          {getTxnTypeLabel(entry.txn_type)}
                        </p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          {entry.reference || entry.txn_type}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs break-words">
                        {entry.note || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {entry.debit > 0 ? (
                          <span className="font-medium text-slate-900">
                            {formatCurrency(entry.debit)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {entry.credit > 0 ? (
                          <span className="font-medium text-emerald-700">
                            {formatCurrency(entry.credit)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td
                        className="py-3 px-5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {entry.txn_type === 'invoice' ? (
                            <button
                              type="button"
                              onClick={() => onPrintInvoiceEntry(entry)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Printer className="w-3.5 h-3.5 shrink-0" />
                              Print Invoice
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onCorrectLedgerEntry(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                            Correct / Adjust
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
