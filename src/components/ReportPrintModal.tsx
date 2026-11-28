import { useEffect, useState } from 'react';
import { FileBarChart2, Printer, Settings2, X } from 'lucide-react';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  getTodayIsoDate,
} from '../utils/ledger';

export interface PnlCategoryRow {
  category: string;
  count: number;
  amount: number;
  sharePercent: number;
}

export interface PnlInvoiceRow {
  id: string;
  isoDate: string;
  reference: string;
  clientName: string;
  companyName: string;
  note: string;
  amount: number;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  shortLabel: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface CashBookRow {
  id: string;
  isoDate: string;
  displayDate: string;
  reference: string;
  particulars: string;
  typeLabel: string;
  paymentMethod: string;
  moneyIn: number;
  moneyOut: number;
  runningBalance: number;
}

export type ReportPrintPayload =
  | {
      kind: 'pnl';
      startDate: string;
      endDate: string;
      periodLabel: string;
      totalRevenue: number;
      invoiceCount: number;
      totalExpenses: number;
      expenseCount: number;
      netProfitLoss: number;
      marginPercent: number | null;
      expenseCategories: PnlCategoryRow[];
      invoiceRows: PnlInvoiceRow[];
      sixMonthTrend: MonthlyTrendPoint[];
    }
  | {
      kind: 'cashbook';
      startDate: string;
      endDate: string;
      periodLabel: string;
      accountLabel: string;
      openingBalance: number;
      hasOpeningBalance: boolean;
      totalIn: number;
      totalOut: number;
      closingBalance: number;
      rows: CashBookRow[];
    };

interface ReportPrintModalProps {
  payload: ReportPrintPayload | null;
  onClose: () => void;
}

const MILL_HEADER_STORAGE_KEY = 'indigomill_print_header_v1';

interface MillHeaderConfig {
  address: string;
  mobile: string;
}

const DEFAULT_MILL_HEADER: MillHeaderConfig = {
  address: 'Industrial Area, Madhabdi / Narayanganj, Dhaka',
  mobile: '+880 17XX-XXXXXX',
};

function loadMillHeaderConfig(): MillHeaderConfig {
  try {
    const raw = window.localStorage.getItem(MILL_HEADER_STORAGE_KEY);
    if (!raw) return DEFAULT_MILL_HEADER;
    const parsed = JSON.parse(raw) as Partial<MillHeaderConfig>;
    return {
      address:
        typeof parsed.address === 'string' && parsed.address.trim()
          ? parsed.address
          : DEFAULT_MILL_HEADER.address,
      mobile:
        typeof parsed.mobile === 'string' && parsed.mobile.trim()
          ? parsed.mobile
          : DEFAULT_MILL_HEADER.mobile,
    };
  } catch {
    return DEFAULT_MILL_HEADER;
  }
}

export function ReportPrintModal({ payload, onClose }: ReportPrintModalProps) {
  const [headerConfig, setHeaderConfig] = useState<MillHeaderConfig>(() =>
    loadMillHeaderConfig()
  );
  const [showHeaderEditor, setShowHeaderEditor] = useState(false);

  useEffect(() => {
    if (!payload) return;
    setHeaderConfig(loadMillHeaderConfig());
    setShowHeaderEditor(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payload, onClose]);

  const handleUpdateHeader = (field: keyof MillHeaderConfig, value: string) => {
    setHeaderConfig((prev) => {
      const next = { ...prev, [field]: value };
      try {
        window.localStorage.setItem(
          MILL_HEADER_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  if (!payload) return null;

  const todayIso = getTodayIsoDate();
  const formattedToday = formatIsoDate(todayIso);

  const isPnl = payload.kind === 'pnl';
  const titleEn = isPnl
    ? 'Profit & Loss Statement'
    : `${payload.accountLabel} Statement`;
  const titleBn = isPnl
    ? 'লাভ-ক্ষতি বিবরণী (P&L)'
    : 'ক্যাশ / ব্যাংক বুক বিবরণী';
  const docRef = `${isPnl ? 'RPT-PNL' : 'RPT-CBK'}-${todayIso.replaceAll('-', '')}`;

  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div
      className="print-portal-overlay fixed inset-0 z-[70] bg-slate-950/65 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-print-modal-title"
    >
      {/* Force A4 portrait page layout whenever Report Print Modal is active */}
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      {/* Backdrop click target (hidden during print) */}
      <div
        className="no-print fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="print-portal-frame relative z-10 w-full max-w-5xl max-h-[94vh] bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Non-printable Action Bar */}
        <div className="no-print px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileBarChart2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <div className="min-w-0">
              <h2
                id="report-print-modal-title"
                className="text-sm font-semibold truncate"
              >
                {titleEn} — A4 Print Preview
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                Period: {payload.periodLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHeaderEditor((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                showHeaderEditor
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Mill Header
            </button>

            <button
              type="button"
              onClick={handleTriggerPrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print A4 Report
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close report preview"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Optional Non-printable Mill Header Editor */}
        {showHeaderEditor && (
          <div className="no-print px-4 sm:px-6 py-3 bg-blue-50/70 border-b border-blue-200 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Mill Address (printed on reports &amp; statements)
                </label>
                <input
                  type="text"
                  value={headerConfig.address}
                  onChange={(e) => handleUpdateHeader('address', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Mill Mobile / Contact
                </label>
                <input
                  type="text"
                  value={headerConfig.mobile}
                  onChange={(e) => handleUpdateHeader('mobile', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Scrollable A4 Preview Canvas */}
        <div className="print-scroll-area flex-1 overflow-y-auto bg-slate-200/80 p-4 sm:p-8">
          <article className="a4-print-sheet mx-auto bg-white text-slate-900 shadow-lg border border-slate-300 w-full max-w-[210mm] min-h-[260mm] p-6 sm:p-10">
            {/* Formal Company Header */}
            <header className="border-b-2 border-slate-900 pb-4 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950 leading-snug">
                    মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্
                  </h1>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 mt-0.5">
                    Mayer Doa Washing and Processing Mills
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {headerConfig.address} · Mobile: {headerConfig.mobile}
                  </p>
                </div>

                <div className="sm:text-right shrink-0">
                  <div className="inline-block border border-slate-900 px-3 py-1.5 bg-slate-50">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-950">
                      {titleEn}
                    </p>
                    <p className="text-[11px] font-medium text-slate-700">
                      {titleBn}
                    </p>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-600 space-y-0.5 tabular-nums">
                    <p>
                      <span className="font-medium text-slate-800">Ref:</span>{' '}
                      {docRef}
                    </p>
                    <p>
                      <span className="font-medium text-slate-800">Date:</span>{' '}
                      {formattedToday}
                    </p>
                    <p>
                      <span className="font-medium text-slate-800">Period:</span>{' '}
                      {payload.periodLabel}
                    </p>
                  </div>
                </div>
              </div>
            </header>

            {payload.kind === 'pnl' ? (
              <div className="space-y-6">
                {/* Executive Summary KPI Strip */}
                <section className="grid grid-cols-3 gap-3 print-avoid-break">
                  <div className="border border-slate-300 rounded-md p-3.5 bg-slate-50/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Total Revenue (Invoices)
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-emerald-700">
                      {formatCurrency(payload.totalRevenue)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                      {formatNumber(payload.invoiceCount, 0)} delivered invoice
                      {payload.invoiceCount === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="border border-slate-300 rounded-md p-3.5 bg-slate-50/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Total Expenses (Money Out)
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-red-700">
                      {formatCurrency(payload.totalExpenses)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                      {formatNumber(payload.expenseCount, 0)} outflow record
                      {payload.expenseCount === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div
                    className={`border rounded-md p-3.5 ${
                      payload.netProfitLoss >= 0
                        ? 'border-emerald-300 bg-emerald-50/60'
                        : 'border-red-300 bg-red-50/60'
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      {payload.netProfitLoss >= 0 ? 'Net Profit' : 'Net Loss'}
                    </p>
                    <p
                      className={`mt-1.5 text-lg font-bold tabular-nums ${
                        payload.netProfitLoss >= 0
                          ? 'text-emerald-800'
                          : 'text-red-800'
                      }`}
                    >
                      {formatCurrency(payload.netProfitLoss)}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 tabular-nums">
                      {payload.marginPercent !== null
                        ? `Net Margin: ${formatNumber(payload.marginPercent, 1)}%`
                        : 'Revenue − Expenses'}
                    </p>
                  </div>
                </section>

                {/* Expense Breakdown by Category */}
                <section className="print-avoid-break">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                    1. Expense Breakdown by Category (Money Out)
                  </h3>
                  <table className="statement-print-table w-full text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="text-left px-3 py-2 border border-slate-300 font-semibold">
                          Expense Category
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold w-24">
                          Entries
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold w-24">
                          Share %
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold w-36">
                          Amount (৳)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.expenseCategories.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-4 text-center text-slate-500 border border-slate-300"
                          >
                            No expense outflows recorded in this date range.
                          </td>
                        </tr>
                      ) : (
                        payload.expenseCategories.map((cat) => (
                          <tr key={cat.category}>
                            <td className="px-3 py-1.5 border border-slate-300 font-medium text-slate-900">
                              {cat.category}
                            </td>
                            <td className="px-3 py-1.5 border border-slate-300 text-right tabular-nums text-slate-600">
                              {formatNumber(cat.count, 0)}
                            </td>
                            <td className="px-3 py-1.5 border border-slate-300 text-right tabular-nums text-slate-600">
                              {formatNumber(cat.sharePercent, 1)}%
                            </td>
                            <td className="px-3 py-1.5 border border-slate-300 text-right tabular-nums font-medium text-slate-900">
                              {formatCurrency(cat.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td className="px-3 py-2 border border-slate-300">
                          Total Expenses
                        </td>
                        <td className="px-3 py-2 border border-slate-300 text-right tabular-nums">
                          {formatNumber(payload.expenseCount, 0)}
                        </td>
                        <td className="px-3 py-2 border border-slate-300 text-right tabular-nums">
                          {payload.totalExpenses > 0 ? '100.0%' : '0.0%'}
                        </td>
                        <td className="px-3 py-2 border border-slate-300 text-right tabular-nums text-red-700">
                          {formatCurrency(payload.totalExpenses)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </section>

                {/* Last 6 Months Comparative Trend */}
                <section className="print-avoid-break">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                    2. Last 6 Months Revenue vs Expenses Summary
                  </h3>
                  <table className="statement-print-table w-full text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="text-left px-3 py-2 border border-slate-300 font-semibold">
                          Month
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold">
                          Revenue (৳)
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold">
                          Expenses (৳)
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold">
                          Net Profit / Loss (৳)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.sixMonthTrend.map((m) => (
                        <tr key={m.monthKey}>
                          <td className="px-3 py-1.5 border border-slate-300 font-medium text-slate-900">
                            {m.label}
                          </td>
                          <td className="px-3 py-1.5 border border-slate-300 text-right tabular-nums text-emerald-700">
                            {formatCurrency(m.revenue)}
                          </td>
                          <td className="px-3 py-1.5 border border-slate-300 text-right tabular-nums text-red-700">
                            {formatCurrency(m.expenses)}
                          </td>
                          <td
                            className={`px-3 py-1.5 border border-slate-300 text-right tabular-nums font-semibold ${
                              m.net >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {formatCurrency(m.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {/* Invoice Revenue Schedule */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                    3. Revenue Schedule — Delivered Order Invoices ({formatNumber(payload.invoiceRows.length, 0)})
                  </h3>
                  <table className="statement-print-table w-full text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="text-left px-3 py-2 border border-slate-300 font-semibold w-28">
                          Date
                        </th>
                        <th className="text-left px-3 py-2 border border-slate-300 font-semibold w-36">
                          Reference
                        </th>
                        <th className="text-left px-3 py-2 border border-slate-300 font-semibold">
                          Client / Description
                        </th>
                        <th className="text-right px-3 py-2 border border-slate-300 font-semibold w-36">
                          Invoice Amount (৳)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.invoiceRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-4 text-center text-slate-500 border border-slate-300"
                          >
                            No invoice revenue recorded in this date range.
                          </td>
                        </tr>
                      ) : (
                        payload.invoiceRows.map((inv) => (
                          <tr key={inv.id}>
                            <td className="px-3 py-1.5 border border-slate-300 tabular-nums text-slate-700">
                              {formatIsoDate(inv.isoDate)}
                            </td>
                            <td className="px-3 py-1.5 border border-slate-300 font-mono text-[11px] text-slate-800">
                              {inv.reference}
                            </td>
                            <td className="px-3 py-1.5 border border-slate-300 text-slate-800">
                              <span className="font-medium">{inv.clientName}</span>
                              {inv.companyName ? ` (${inv.companyName})` : ''}
                              {inv.note ? (
                                <span className="text-slate-500"> — {inv.note}</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 border border-slate-300 text-right tabular-nums font-medium text-slate-900">
                              {formatCurrency(inv.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td
                          colSpan={3}
                          className="px-3 py-2 border border-slate-300 text-right"
                        >
                          Total Invoice Revenue
                        </td>
                        <td className="px-3 py-2 border border-slate-300 text-right tabular-nums text-emerald-700">
                          {formatCurrency(payload.totalRevenue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              </div>
            ) : (
              /* Cash Book / Bank Book Printable Layout */
              <div className="space-y-5">
                {/* Summary Strip */}
                <section className="grid grid-cols-4 gap-2.5 print-avoid-break">
                  <div className="border border-slate-300 rounded-md p-3 bg-slate-50/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Opening Balance
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                      {formatCurrency(payload.openingBalance)}
                    </p>
                  </div>
                  <div className="border border-slate-300 rounded-md p-3 bg-slate-50/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Total Money In
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-emerald-700">
                      {formatCurrency(payload.totalIn)}
                    </p>
                  </div>
                  <div className="border border-slate-300 rounded-md p-3 bg-slate-50/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Total Money Out
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-red-700">
                      {formatCurrency(payload.totalOut)}
                    </p>
                  </div>
                  <div className="border border-slate-900 rounded-md p-3 bg-slate-100/80">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                      Closing Balance
                    </p>
                    <p
                      className={`mt-1 text-sm font-bold tabular-nums ${
                        payload.closingBalance >= 0
                          ? 'text-slate-950'
                          : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(payload.closingBalance)}
                    </p>
                  </div>
                </section>

                {/* Chronological Cash/Bank Ledger Table */}
                <section>
                  <table className="statement-print-table w-full text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="text-left px-2.5 py-2 border border-slate-300 font-semibold w-24">
                          Date
                        </th>
                        <th className="text-left px-2.5 py-2 border border-slate-300 font-semibold w-28">
                          Reference
                        </th>
                        <th className="text-left px-2.5 py-2 border border-slate-300 font-semibold">
                          Particulars
                        </th>
                        <th className="text-left px-2.5 py-2 border border-slate-300 font-semibold w-20">
                          Method
                        </th>
                        <th className="text-right px-2.5 py-2 border border-slate-300 font-semibold w-24">
                          In (জমা)
                        </th>
                        <th className="text-right px-2.5 py-2 border border-slate-300 font-semibold w-24">
                          Out (খরচ)
                        </th>
                        <th className="text-right px-2.5 py-2 border border-slate-300 font-semibold w-28">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.hasOpeningBalance && (
                        <tr className="bg-slate-50/80 italic text-slate-700">
                          <td className="px-2.5 py-1.5 border border-slate-300 tabular-nums">
                            {payload.startDate
                              ? formatIsoDate(payload.startDate)
                              : '—'}
                          </td>
                          <td className="px-2.5 py-1.5 border border-slate-300 font-mono text-[10px]">
                            B/F
                          </td>
                          <td
                            colSpan={4}
                            className="px-2.5 py-1.5 border border-slate-300 font-medium"
                          >
                            Opening Balance Brought Forward
                          </td>
                          <td className="px-2.5 py-1.5 border border-slate-300 text-right tabular-nums font-semibold text-slate-900">
                            {formatCurrency(payload.openingBalance)}
                          </td>
                        </tr>
                      )}

                      {payload.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-5 text-center text-slate-500 border border-slate-300"
                          >
                            No cash/bank transactions recorded in this date range.
                          </td>
                        </tr>
                      ) : (
                        payload.rows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-2.5 py-1.5 border border-slate-300 tabular-nums text-slate-700 whitespace-nowrap">
                              {row.displayDate}
                            </td>
                            <td className="px-2.5 py-1.5 border border-slate-300 font-mono text-[10px] text-slate-800 whitespace-nowrap">
                              {row.reference}
                            </td>
                            <td className="px-2.5 py-1.5 border border-slate-300 text-slate-900">
                              <span className="font-medium">{row.particulars}</span>
                              <span className="text-slate-500"> · {row.typeLabel}</span>
                            </td>
                            <td className="px-2.5 py-1.5 border border-slate-300 text-slate-700 whitespace-nowrap">
                              {row.paymentMethod}
                            </td>
                            <td className="px-2.5 py-1.5 border border-slate-300 text-right tabular-nums text-emerald-700 font-medium whitespace-nowrap">
                              {row.moneyIn > 0 ? formatCurrency(row.moneyIn) : '—'}
                            </td>
                            <td className="px-2.5 py-1.5 border border-slate-300 text-right tabular-nums text-red-700 font-medium whitespace-nowrap">
                              {row.moneyOut > 0 ? formatCurrency(row.moneyOut) : '—'}
                            </td>
                            <td
                              className={`px-2.5 py-1.5 border border-slate-300 text-right tabular-nums font-semibold whitespace-nowrap ${
                                row.runningBalance >= 0
                                  ? 'text-slate-900'
                                  : 'text-red-700'
                              }`}
                            >
                              {formatCurrency(row.runningBalance)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td
                          colSpan={4}
                          className="px-2.5 py-2 border border-slate-300 text-right"
                        >
                          Period Totals &amp; Closing Balance
                        </td>
                        <td className="px-2.5 py-2 border border-slate-300 text-right tabular-nums text-emerald-700 whitespace-nowrap">
                          {formatCurrency(payload.totalIn)}
                        </td>
                        <td className="px-2.5 py-2 border border-slate-300 text-right tabular-nums text-red-700 whitespace-nowrap">
                          {formatCurrency(payload.totalOut)}
                        </td>
                        <td
                          className={`px-2.5 py-2 border border-slate-300 text-right tabular-nums whitespace-nowrap ${
                            payload.closingBalance >= 0
                              ? 'text-slate-950'
                              : 'text-red-700'
                          }`}
                        >
                          {formatCurrency(payload.closingBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              </div>
            )}

            {/* Formal Signature Footer */}
            <footer className="mt-12 pt-8 grid grid-cols-2 gap-12 print-avoid-break">
              <div className="text-center">
                <div className="border-t border-slate-400 pt-1.5 text-xs font-medium text-slate-700">
                  Prepared By (Accountant)
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-400 pt-1.5 text-xs font-medium text-slate-700">
                  Authorized Signature (Proprietor / Director)
                </div>
              </div>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
