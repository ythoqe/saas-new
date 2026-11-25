import { useEffect, useMemo, useState } from 'react';
import { Banknote, Edit2, Printer, X } from 'lucide-react';
import type {
  MoneyOutRecord,
  PurchaseRecord,
  SupplierLedgerEntry,
  SupplierRecord,
} from '../types/mill';
import {
  calculateSupplierLedgerTotals,
  formatCurrency,
  formatDateTime,
  formatIsoDate,
  formatNumber,
  getPayableStatusLabel,
  getSupplierTxnTypeLabel,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

export type SupplierDrawerTab = 'ledger' | 'purchases' | 'payments';

interface SupplierLedgerDrawerProps {
  supplier: SupplierRecord | null;
  entries: SupplierLedgerEntry[];
  purchases: PurchaseRecord[];
  moneyOutRecords: MoneyOutRecord[];
  initialTab?: SupplierDrawerTab;
  onClose: () => void;
  onEditSupplier: (supplier: SupplierRecord) => void;
  onPaySupplier: (supplier: SupplierRecord) => void;
  onPrintStatement: (supplier: SupplierRecord) => void;
}

export function SupplierLedgerDrawer({
  supplier,
  entries,
  purchases,
  moneyOutRecords,
  initialTab = 'ledger',
  onClose,
  onEditSupplier,
  onPaySupplier,
  onPrintStatement,
}: SupplierLedgerDrawerProps) {
  const [activeTab, setActiveTab] = useState<SupplierDrawerTab>(initialTab);

  useEffect(() => {
    if (supplier) {
      setActiveTab(initialTab);
    }
  }, [supplier?.id, initialTab]);

  const supplierEntries = useMemo(() => {
    if (!supplier) return [];
    const filtered = entries.filter((e) => e.supplierId === supplier.id);
    return [...filtered].sort((a, b) => {
      const timeA = timestampToDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const timeB = timestampToDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });
  }, [supplier, entries]);

  // Running payable balance: Credit increases payable, Debit decreases payable
  const rowsWithRunningPayable = useMemo(() => {
    let running = 0;
    const chronological = supplierEntries.map((entry) => {
      running = roundCurrency(
        running + (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
      );
      return { entry, runningPayable: running };
    });
    return chronological.reverse();
  }, [supplierEntries]);

  const supplierPurchases = useMemo(() => {
    if (!supplier) return [];
    return purchases
      .filter((p) => p.supplierId === supplier.id)
      .sort((a, b) => {
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      });
  }, [supplier, purchases]);

  const moneyOutByLedgerId = useMemo(() => {
    const map = new Map<string, MoneyOutRecord>();
    for (const rec of moneyOutRecords) {
      if (rec.ledgerEntryId) {
        map.set(rec.ledgerEntryId, rec);
      }
      map.set(rec.id, rec);
    }
    return map;
  }, [moneyOutRecords]);

  const paymentRows = useMemo(() => {
    return supplierEntries
      .filter((e) => e.txn_type === 'payment')
      .map((entry) => {
        const moneyOut = moneyOutByLedgerId.get(entry.id) ?? null;
        return {
          id: entry.id,
          reference: entry.reference || entry.id,
          amount: entry.debit,
          paymentDate: moneyOut?.paymentDate ?? null,
          paymentMethod: moneyOut?.paymentMethod ?? null,
          note: moneyOut ? moneyOut.note : entry.note,
          createdAt: timestampToDate(entry.createdAt),
        };
      })
      .reverse();
  }, [supplierEntries, moneyOutByLedgerId]);

  const totals = useMemo(
    () => calculateSupplierLedgerTotals(supplierEntries),
    [supplierEntries]
  );

  if (!supplier) return null;

  const status = getPayableStatusLabel(totals.totalPayable);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-ledger-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-3xl bg-white h-full border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="supplier-ledger-title"
              className="font-display text-lg font-semibold text-slate-900 truncate"
            >
              {supplier.supplierName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {supplier.companyName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{supplier.mobile}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onPaySupplier(supplier)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Banknote className="w-3.5 h-3.5 shrink-0" />
              Pay Supplier
            </button>
            <button
              type="button"
              onClick={() => onEditSupplier(supplier)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close supplier ledger"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inverted Payable Summary Strip */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="px-6 py-4 border-r border-slate-200">
            <p className="text-xs text-slate-500">Sum of Credit (Billed)</p>
            <p className="mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums text-slate-900">
              {formatCurrency(totals.totalCredit)}
            </p>
          </div>
          <div className="px-6 py-4 border-r border-slate-200">
            <p className="text-xs text-slate-500">Sum of Debit (Paid)</p>
            <p className="mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums text-emerald-700">
              {formatCurrency(totals.totalDebit)}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500">
              Total Payable ·{' '}
              <span
                className={
                  status.tone === 'payable'
                    ? 'text-red-700 font-medium'
                    : status.tone === 'advance'
                      ? 'text-emerald-700 font-medium'
                      : 'text-slate-600 font-medium'
                }
              >
                {status.label}
              </span>
            </p>
            <p
              className={`mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums ${
                totals.totalPayable > 0
                  ? 'text-red-700'
                  : totals.totalPayable < 0
                    ? 'text-emerald-700'
                    : 'text-slate-900'
              }`}
            >
              {formatCurrency(totals.totalPayable)}
            </p>
          </div>
        </div>

        {/* Tab Bar + Print Statement */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Supplier financial views"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ledger'}
                onClick={() => setActiveTab('ledger')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'ledger'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Full Ledger ({supplierEntries.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'purchases'}
                onClick={() => setActiveTab('purchases')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'purchases'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Purchases ({supplierPurchases.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'payments'}
                onClick={() => setActiveTab('payments')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'payments'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Payment History ({paymentRows.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => onPrintStatement(supplier)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              Print Statement
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Payable = Credit − Debit
          </p>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'ledger' && (
            <>
              {rowsWithRunningPayable.length === 0 ? (
                <div className="py-12 px-6 text-center border border-slate-200 rounded-md bg-slate-50/40">
                  <p className="text-sm font-medium text-slate-900">
                    No supplier ledger entries yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Purchases and supplier payments will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                          <th className="py-2.5 px-4">Date &amp; Type</th>
                          <th className="py-2.5 px-4">Reference / Note</th>
                          <th className="py-2.5 px-4 text-right">Credit (+Debt)</th>
                          <th className="py-2.5 px-4 text-right">Debit (−Paid)</th>
                          <th className="py-2.5 px-4 text-right">Payable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {rowsWithRunningPayable.map(({ entry, runningPayable }) => (
                          <tr
                            key={entry.id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="py-3 px-4 align-top whitespace-nowrap">
                              <p className="text-xs font-medium text-slate-900">
                                {getSupplierTxnTypeLabel(entry.txn_type)}
                              </p>
                              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                                {formatDateTime(timestampToDate(entry.createdAt))}
                              </p>
                            </td>
                            <td className="py-3 px-4 align-top">
                              {entry.reference ? (
                                <p className="text-xs font-mono font-medium text-slate-700">
                                  {entry.reference}
                                </p>
                              ) : null}
                              <p className="text-xs text-slate-600 mt-0.5 break-words max-w-xs">
                                {entry.note || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-4 align-top text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              {entry.credit > 0 ? (
                                <span className="text-slate-900 font-medium">
                                  {formatCurrency(entry.credit)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              {entry.debit > 0 ? (
                                <span className="text-emerald-700 font-medium">
                                  {formatCurrency(entry.debit)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  runningPayable > 0
                                    ? 'text-red-700'
                                    : runningPayable < 0
                                      ? 'text-emerald-700'
                                      : 'text-slate-700'
                                }
                              >
                                {formatCurrency(runningPayable)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'purchases' && (
            <>
              {supplierPurchases.length === 0 ? (
                <div className="py-12 px-6 text-center border border-slate-200 rounded-md bg-slate-50/40">
                  <p className="text-sm font-medium text-slate-900">
                    No purchases recorded for {supplier.supplierName}
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                          <th className="py-2.5 px-4">Ref &amp; Date</th>
                          <th className="py-2.5 px-4">Item Name</th>
                          <th className="py-2.5 px-4 text-right">Qty</th>
                          <th className="py-2.5 px-4 text-right">Rate</th>
                          <th className="py-2.5 px-4 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {supplierPurchases.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="py-3 px-4 whitespace-nowrap">
                              <p className="font-mono text-xs font-semibold text-slate-900">
                                {p.reference}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatIsoDate(p.purchaseDate)}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-slate-900">
                              {p.itemName}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-slate-700">
                              {formatNumber(p.quantity)} {p.unit}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-slate-700">
                              {formatCurrency(p.rate)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap text-slate-900">
                              {formatCurrency(p.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'payments' && (
            <>
              {paymentRows.length === 0 ? (
                <div className="py-12 px-6 text-center border border-slate-200 rounded-md bg-slate-50/40">
                  <p className="text-sm font-medium text-slate-900">
                    No payments sent to {supplier.supplierName} yet
                  </p>
                  <button
                    type="button"
                    onClick={() => onPaySupplier(supplier)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Pay Supplier
                  </button>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                          <th className="py-2.5 px-4">Payment Ref</th>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4">Method</th>
                          <th className="py-2.5 px-4">Note</th>
                          <th className="py-2.5 px-4 text-right">Amount Paid</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {paymentRows.map((pay) => (
                          <tr
                            key={pay.id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                              {pay.reference}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                              {pay.paymentDate
                                ? formatIsoDate(pay.paymentDate)
                                : formatDateTime(pay.createdAt)}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                              {pay.paymentMethod ?? 'Payment'}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 break-words max-w-xs">
                              {pay.note || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                              {formatCurrency(pay.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
