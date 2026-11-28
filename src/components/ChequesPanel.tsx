import { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  Plus,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import {
  CHEQUE_STATUSES,
  type ChequeRecord,
  type ChequeStatus,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';
import type { ChequeActionKind } from './ChequeActionModal';

interface ChequesPanelProps {
  cheques: ChequeRecord[];
  onOpenReceiveCheque: () => void;
  onTriggerAction: (cheque: ChequeRecord, action: ChequeActionKind) => void;
}

type StatusFilter = 'All' | ChequeStatus;

function getStatusBadgeStyle(status: ChequeStatus): string {
  switch (status) {
    case 'Pending':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Endorsed to Supplier':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Cleared (Self)':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Cleared (Supplier)':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'Bounced':
      return 'bg-red-50 text-red-800 border-red-200';
  }
}

export function ChequesPanel({
  cheques,
  onOpenReceiveCheque,
  onTriggerAction,
}: ChequesPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Live KPI metrics + per-status counts
  const metrics = useMemo(() => {
    let pendingAmount = 0;
    let pendingCount = 0;
    let endorsedAmount = 0;
    let endorsedCount = 0;
    let clearedSelfAmount = 0;
    let clearedSelfCount = 0;
    let clearedSupplierAmount = 0;
    let clearedSupplierCount = 0;
    let bouncedAmount = 0;
    let bouncedCount = 0;

    for (const chq of cheques) {
      const amt = Number(chq.amount) || 0;
      switch (chq.status) {
        case 'Pending':
          pendingAmount += amt;
          pendingCount += 1;
          break;
        case 'Endorsed to Supplier':
          endorsedAmount += amt;
          endorsedCount += 1;
          break;
        case 'Cleared (Self)':
          clearedSelfAmount += amt;
          clearedSelfCount += 1;
          break;
        case 'Cleared (Supplier)':
          clearedSupplierAmount += amt;
          clearedSupplierCount += 1;
          break;
        case 'Bounced':
          bouncedAmount += amt;
          bouncedCount += 1;
          break;
      }
    }

    const countsByStatus: Record<StatusFilter, number> = {
      All: cheques.length,
      Pending: pendingCount,
      'Endorsed to Supplier': endorsedCount,
      'Cleared (Self)': clearedSelfCount,
      'Cleared (Supplier)': clearedSupplierCount,
      Bounced: bouncedCount,
    };

    return {
      pendingAmount: roundCurrency(pendingAmount),
      pendingCount,
      endorsedAmount: roundCurrency(endorsedAmount),
      endorsedCount,
      totalClearedAmount: roundCurrency(
        clearedSelfAmount + clearedSupplierAmount
      ),
      clearedSelfCount,
      clearedSupplierCount,
      bouncedAmount: roundCurrency(bouncedAmount),
      bouncedCount,
      countsByStatus,
    };
  }, [cheques]);

  const filteredCheques = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...cheques]
      .filter((chq) => {
        if (statusFilter !== 'All' && chq.status !== statusFilter) {
          return false;
        }
        if (!q) return true;
        return (
          chq.chequeNo.toLowerCase().includes(q) ||
          chq.bankName.toLowerCase().includes(q) ||
          chq.clientName.toLowerCase().includes(q) ||
          (chq.endorsedSupplierName ?? '').toLowerCase().includes(q) ||
          chq.id.toLowerCase().includes(q) ||
          chq.note.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.chequeDate !== b.chequeDate) {
          return b.chequeDate.localeCompare(a.chequeDate);
        }
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      });
  }, [cheques, statusFilter, searchQuery]);

  const filteredAmountTotal = useMemo(() => {
    let sum = 0;
    for (const chq of filteredCheques) {
      sum += Number(chq.amount) || 0;
    }
    return roundCurrency(sum);
  }, [filteredCheques]);

  return (
    <div className="space-y-6">
      {/* Cheque KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Pending */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'Pending' ? 'All' : 'Pending')
          }
          className={`text-left bg-white rounded-lg border p-5 transition-all cursor-pointer ${
            statusFilter === 'Pending'
              ? 'border-amber-500 ring-2 ring-amber-500/15'
              : 'border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Total Pending
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cheques in hand awaiting deposit or endorsement
              </p>
            </div>
            <div className="w-9 h-9 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-amber-700" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold tabular-nums text-slate-900">
            {formatCurrency(metrics.pendingAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {formatNumber(metrics.pendingCount, 0)} pending cheque
            {metrics.pendingCount === 1 ? '' : 's'}
          </p>
        </button>

        {/* Total Endorsed */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(
              statusFilter === 'Endorsed to Supplier'
                ? 'All'
                : 'Endorsed to Supplier'
            )
          }
          className={`text-left bg-white rounded-lg border p-5 transition-all cursor-pointer ${
            statusFilter === 'Endorsed to Supplier'
              ? 'border-indigo-500 ring-2 ring-indigo-500/15'
              : 'border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Total Endorsed
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Handed to suppliers, awaiting supplier clearance
              </p>
            </div>
            <div className="w-9 h-9 rounded-md bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
              <Send className="w-4 h-4 text-indigo-700" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold tabular-nums text-slate-900">
            {formatCurrency(metrics.endorsedAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {formatNumber(metrics.endorsedCount, 0)} endorsed cheque
            {metrics.endorsedCount === 1 ? '' : 's'}
          </p>
        </button>

        {/* Cleared (Self + Supplier) */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Total Cleared
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Self-deposited to Bank &amp; cleared by suppliers
              </p>
            </div>
            <div className="w-9 h-9 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold tabular-nums text-emerald-700">
            {formatCurrency(metrics.totalClearedAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {formatNumber(metrics.clearedSelfCount, 0)} Self ·{' '}
            {formatNumber(metrics.clearedSupplierCount, 0)} Supplier
          </p>
        </div>

        {/* Bounced */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'Bounced' ? 'All' : 'Bounced')
          }
          className={`text-left bg-white rounded-lg border p-5 transition-all cursor-pointer ${
            statusFilter === 'Bounced'
              ? 'border-red-500 ring-2 ring-red-500/15'
              : 'border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
                Bounced
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dishonored cheques (no ledger impact)
              </p>
            </div>
            <div className="w-9 h-9 rounded-md bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4 text-red-700" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold tabular-nums text-red-700">
            {formatCurrency(metrics.bouncedAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {formatNumber(metrics.bouncedCount, 0)} bounced cheque
            {metrics.bouncedCount === 1 ? '' : 's'}
          </p>
        </button>
      </section>

      {/* Cheques Register Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Cheque Register
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Track received client cheques through Bank Self Clear, Supplier
                Endorsement, or Bounce
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenReceiveCheque}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Receive Cheque
            </button>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', ...CHEQUE_STATUSES] as const).map((status) => {
                const active = statusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{status}</span>
                    <span
                      className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {metrics.countsByStatus[status]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative w-full xl:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cheque no, bank, client..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 whitespace-nowrap">Cheque Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Bank &amp; Cheque No</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 whitespace-nowrap">Status &amp; Custody</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCheques.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">
                      {cheques.length === 0
                        ? 'No cheques recorded yet'
                        : 'No cheques match the selected status or search'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {cheques.length === 0
                        ? 'Click "Receive Cheque" to log a client cheque without altering bank or client balances yet.'
                        : 'Try clearing your status filter or search query.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCheques.map((chq) => (
                  <tr key={chq.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-slate-900 tabular-nums">
                        {formatIsoDate(chq.chequeDate)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        {chq.id}
                      </p>
                    </td>

                    <td className="px-4 py-3 min-w-[160px]">
                      <p className="text-xs font-semibold text-slate-900">
                        {chq.clientName}
                      </p>
                      {chq.note && (
                        <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                          {chq.note}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 min-w-[170px]">
                      <p className="text-xs font-medium text-slate-900">
                        {chq.bankName}
                      </p>
                      <p className="text-[11px] font-mono text-slate-600">
                        No: {chq.chequeNo}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-xs font-bold text-slate-900">
                      {formatCurrency(chq.amount)}
                    </td>

                    <td className="px-4 py-3 min-w-[190px]">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${getStatusBadgeStyle(
                          chq.status
                        )}`}
                      >
                        {chq.status}
                      </span>

                      {chq.status === 'Endorsed to Supplier' &&
                        chq.endorsedSupplierName && (
                          <p className="text-[11px] text-indigo-700 mt-1">
                            To: <strong>{chq.endorsedSupplierName}</strong>
                            {chq.endorsedDate
                              ? ` · ${formatIsoDate(chq.endorsedDate)}`
                              : ''}
                          </p>
                        )}

                      {chq.status === 'Cleared (Self)' && (
                        <p className="text-[11px] text-emerald-700 mt-1 tabular-nums">
                          Bank Deposit
                          {chq.clearedDate
                            ? ` · ${formatIsoDate(chq.clearedDate)}`
                            : ''}
                          {chq.moneyInId ? ` (${chq.moneyInId})` : ''}
                        </p>
                      )}

                      {chq.status === 'Cleared (Supplier)' && (
                        <p className="text-[11px] text-teal-700 mt-1 tabular-nums">
                          {chq.endorsedSupplierName || 'Supplier'}
                          {chq.clearedDate
                            ? ` · ${formatIsoDate(chq.clearedDate)}`
                            : ''}
                        </p>
                      )}

                      {chq.status === 'Bounced' && (
                        <p className="text-[11px] text-red-700 mt-1">
                          {chq.bounceReason || 'Dishonored'}
                          {chq.bouncedDate
                            ? ` · ${formatIsoDate(chq.bouncedDate)}`
                            : ''}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {chq.status === 'Pending' && (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onTriggerAction(chq, 'self_clear')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors cursor-pointer"
                          >
                            <Building2 className="w-3 h-3" />
                            Self Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => onTriggerAction(chq, 'endorse')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded transition-colors cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            Endorse
                          </button>
                          <button
                            type="button"
                            onClick={() => onTriggerAction(chq, 'bounce')}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-red-700 bg-red-50/70 hover:bg-red-100 border border-red-200 rounded transition-colors cursor-pointer"
                          >
                            Bounce
                          </button>
                        </div>
                      )}

                      {chq.status === 'Endorsed to Supplier' && (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onTriggerAction(chq, 'supplier_clear')
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Cleared by Supplier
                          </button>
                          <button
                            type="button"
                            onClick={() => onTriggerAction(chq, 'bounce')}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-red-700 bg-red-50/70 hover:bg-red-100 border border-red-200 rounded transition-colors cursor-pointer"
                          >
                            Bounce
                          </button>
                        </div>
                      )}

                      {(chq.status === 'Cleared (Self)' ||
                        chq.status === 'Cleared (Supplier)') && (
                        <span className="text-[11px] font-mono text-slate-400">
                          {chq.moneyInId || chq.supplierLedgerEntryId || 'Settled'}
                        </span>
                      )}

                      {chq.status === 'Bounced' && (
                        <span className="text-[11px] text-red-500 font-medium">
                          Closed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredCheques.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="text-xs font-bold text-slate-900">
                  <td colSpan={3} className="px-4 py-3 text-right">
                    Total ({formatNumber(filteredCheques.length, 0)} cheque
                    {filteredCheques.length === 1 ? '' : 's'})
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {formatCurrency(filteredAmountTotal)}
                  </td>
                  <td colSpan={2} className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
