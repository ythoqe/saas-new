import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Calendar,
  Landmark,
  LineChart as LineChartIcon,
  Printer,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ClientLedgerEntry,
  ClientRecord,
  EmployeeRecord,
  MoneyInRecord,
  MoneyOutRecord,
  PaymentMethod,
  SupplierRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';
import type {
  CashBookRow,
  MonthlyTrendPoint,
  PnlCategoryRow,
  PnlInvoiceRow,
  ReportPrintPayload,
} from './ReportPrintModal';

type ReportTab = 'pnl' | 'cashbook';
type DatePreset = 'this_month' | 'last_30_days' | 'last_6_months' | 'this_year' | 'all_time' | 'custom';
type CashBookAccountFilter = 'Cash' | 'Bank' | 'Mobile Banking' | 'All';
type ChartKind = 'bar' | 'line';

interface ReportsViewProps {
  ledgerEntries: ClientLedgerEntry[];
  moneyInRecords: MoneyInRecord[];
  moneyOutRecords: MoneyOutRecord[];
  clientsById: Map<string, ClientRecord>;
  suppliersById: Map<string, SupplierRecord>;
  employeesById: Map<string, EmployeeRecord>;
  isLoading: boolean;
  printTriggerSignal: number;
  onOpenPrintReport: (payload: ReportPrintPayload) => void;
}

const ISO_DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const ORD_DATE_REGEX = /^ORD-([0-9]{4})([0-9]{2})([0-9]{2})/;

function dateToLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLedgerEntryIsoDate(entry: ClientLedgerEntry): string {
  const tsDate = timestampToDate(entry.createdAt);
  if (tsDate) return dateToLocalIso(tsDate);
  const match = entry.reference?.match(ORD_DATE_REGEX);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return getTodayIsoDate();
}

function getCashRecordIsoDate(
  paymentDate: string | undefined,
  createdAt: MoneyInRecord['createdAt']
): string {
  if (paymentDate && ISO_DATE_REGEX.test(paymentDate)) {
    return paymentDate;
  }
  const tsDate = timestampToDate(createdAt);
  if (tsDate) return dateToLocalIso(tsDate);
  return getTodayIsoDate();
}

function getPresetRange(preset: Exclude<DatePreset, 'custom'>): {
  startDate: string;
  endDate: string;
} {
  const todayIso = getTodayIsoDate();
  const [y, m, d] = todayIso.split('-').map(Number);
  const now = new Date(y, m - 1, d);

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: dateToLocalIso(start), endDate: todayIso };
  }
  if (preset === 'last_30_days') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    return { startDate: dateToLocalIso(start), endDate: todayIso };
  }
  if (preset === 'last_6_months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return { startDate: dateToLocalIso(start), endDate: todayIso };
  }
  if (preset === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { startDate: dateToLocalIso(start), endDate: todayIso };
  }
  // all_time
  return { startDate: '', endDate: '' };
}

function getExpenseCategoryLabel(rec: MoneyOutRecord): string {
  if (rec.source === 'supplier') return 'Supplier Payments';
  if (rec.source === 'salary') return 'Employee Salaries';
  if (rec.source === 'advance') return 'Employee Advances';
  if (rec.source === 'adjustment') return 'Cash Adjustments (Reversals)';
  return rec.category || 'Other';
}

function formatCompactBdtTick(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}৳${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}৳${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  }
  return `${sign}৳${abs}`;
}

function getAccountFilterLabel(filter: CashBookAccountFilter): string {
  if (filter === 'Cash') return 'Cash Book (Cash)';
  if (filter === 'Bank') return 'Bank Book (Bank)';
  if (filter === 'Mobile Banking') return 'Mobile Banking Book';
  return 'Combined Cash & Bank Book (All Accounts)';
}

interface CustomTooltipPayloadItem {
  dataKey?: string;
  value?: number;
  payload?: MonthlyTrendPoint;
}

function RevenueExpenseTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3.5 py-2.5 text-xs min-w-[200px]">
      <p className="font-semibold text-slate-900 border-b border-slate-100 pb-1.5 mb-1.5">
        {point.label}
      </p>
      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-sm bg-emerald-600" />
            Revenue
          </span>
          <span className="font-semibold text-emerald-700">
            {formatCurrency(point.revenue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-sm bg-red-600" />
            Expenses
          </span>
          <span className="font-semibold text-red-700">
            {formatCurrency(point.expenses)}
          </span>
        </div>
        <div className="pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between gap-4">
          <span className="font-medium text-slate-700">
            {point.net >= 0 ? 'Net Profit' : 'Net Loss'}
          </span>
          <span
            className={`font-bold ${
              point.net >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatCurrency(point.net)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ReportsView({
  ledgerEntries,
  moneyInRecords,
  moneyOutRecords,
  clientsById,
  suppliersById,
  employeesById,
  isLoading,
  printTriggerSignal,
  onOpenPrintReport,
}: ReportsViewProps) {
  const initialRange = useMemo(() => getPresetRange('this_month'), []);
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [accountFilter, setAccountFilter] =
    useState<CashBookAccountFilter>('Cash');
  const [chartKind, setChartKind] = useState<ChartKind>('bar');

  const handleSelectPreset = (preset: Exclude<DatePreset, 'custom'>) => {
    const range = getPresetRange(preset);
    setDatePreset(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleStartDateChange = (value: string) => {
    setDatePreset('custom');
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setDatePreset('custom');
    setEndDate(value);
  };

  const normalizedStart =
    startDate && endDate && startDate > endDate ? endDate : startDate;
  const normalizedEnd =
    startDate && endDate && startDate > endDate ? startDate : endDate;

  const periodLabel = useMemo(() => {
    if (!normalizedStart && !normalizedEnd) return 'All Time (Up to Date)';
    const fromText = normalizedStart
      ? formatIsoDate(normalizedStart)
      : 'Beginning';
    const toText = normalizedEnd
      ? formatIsoDate(normalizedEnd)
      : formatIsoDate(getTodayIsoDate());
    return `${fromText} — ${toText}`;
  }, [normalizedStart, normalizedEnd]);

  // 1. Profit & Loss (P&L) Calculation — 100% accurate from Firestore client_ledger + money_out
  const pnlData = useMemo(() => {
    let revenueSum = 0;
    const invoiceRows: PnlInvoiceRow[] = [];

    for (const entry of ledgerEntries) {
      if (entry.txn_type !== 'invoice') continue;
      const isoDate = getLedgerEntryIsoDate(entry);
      if (normalizedStart && isoDate < normalizedStart) continue;
      if (normalizedEnd && isoDate > normalizedEnd) continue;

      const debitAmount = roundCurrency(Number(entry.debit) || 0);
      if (debitAmount <= 0) continue;

      revenueSum += debitAmount;
      const client = clientsById.get(entry.clientId);
      invoiceRows.push({
        id: entry.id,
        isoDate,
        reference: entry.reference || entry.id,
        clientName: client?.clientName ?? 'Unknown Client',
        companyName: client?.companyName ?? '',
        note: entry.note || '',
        amount: debitAmount,
      });
    }

    invoiceRows.sort((a, b) => {
      if (a.isoDate !== b.isoDate) return b.isoDate.localeCompare(a.isoDate);
      return b.id.localeCompare(a.id);
    });

    let expenseSum = 0;
    let expenseCount = 0;
    const categoryTotals = new Map<string, { count: number; amount: number }>();

    for (const rec of moneyOutRecords) {
      // Internal account-to-account transfers are liquidity movements, not operating expenses
      if (
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-')
      ) {
        continue;
      }
      const isoDate = getCashRecordIsoDate(rec.paymentDate, rec.createdAt);
      if (normalizedStart && isoDate < normalizedStart) continue;
      if (normalizedEnd && isoDate > normalizedEnd) continue;

      const amt = roundCurrency(Number(rec.amount) || 0);
      if (amt <= 0) continue;

      expenseSum += amt;
      expenseCount += 1;

      const catLabel = getExpenseCategoryLabel(rec);
      const prev = categoryTotals.get(catLabel) ?? { count: 0, amount: 0 };
      categoryTotals.set(catLabel, {
        count: prev.count + 1,
        amount: roundCurrency(prev.amount + amt),
      });
    }

    const totalRevenue = roundCurrency(revenueSum);
    const totalExpenses = roundCurrency(expenseSum);
    const netProfitLoss = roundCurrency(totalRevenue - totalExpenses);
    const marginPercent =
      totalRevenue > 0
        ? roundCurrency((netProfitLoss / totalRevenue) * 100)
        : null;

    const expenseCategories: PnlCategoryRow[] = Array.from(
      categoryTotals.entries()
    )
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        amount: stats.amount,
        sharePercent:
          totalExpenses > 0
            ? roundCurrency((stats.amount / totalExpenses) * 100)
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalRevenue,
      invoiceCount: invoiceRows.length,
      totalExpenses,
      expenseCount,
      netProfitLoss,
      marginPercent,
      expenseCategories,
      invoiceRows,
    };
  }, [
    ledgerEntries,
    moneyOutRecords,
    clientsById,
    normalizedStart,
    normalizedEnd,
  ]);

  // 2. Last 6 Calendar Months Revenue vs Expenses Chart Series
  const sixMonthTrend = useMemo<MonthlyTrendPoint[]>(() => {
    const todayIso = getTodayIsoDate();
    const [yearNum, monthNum] = todayIso.split('-').map(Number);
    const months: MonthlyTrendPoint[] = [];
    const byKey = new Map<string, MonthlyTrendPoint>();

    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(yearNum, monthNum - 1 - offset, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const monthKey = `${y}-${m}`;
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
      }).format(d);
      const shortLabel = new Intl.DateTimeFormat('en-US', {
        month: 'short',
      }).format(d);
      const point: MonthlyTrendPoint = {
        monthKey,
        label,
        shortLabel,
        revenue: 0,
        expenses: 0,
        net: 0,
      };
      months.push(point);
      byKey.set(monthKey, point);
    }

    for (const entry of ledgerEntries) {
      if (entry.txn_type !== 'invoice') continue;
      const monthKey = getLedgerEntryIsoDate(entry).slice(0, 7);
      const bucket = byKey.get(monthKey);
      if (bucket) {
        bucket.revenue = roundCurrency(
          bucket.revenue + (Number(entry.debit) || 0)
        );
      }
    }

    for (const rec of moneyOutRecords) {
      if (
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-')
      ) {
        continue;
      }
      const monthKey = getCashRecordIsoDate(
        rec.paymentDate,
        rec.createdAt
      ).slice(0, 7);
      const bucket = byKey.get(monthKey);
      if (bucket) {
        bucket.expenses = roundCurrency(
          bucket.expenses + (Number(rec.amount) || 0)
        );
      }
    }

    for (const point of months) {
      point.net = roundCurrency(point.revenue - point.expenses);
    }

    return months;
  }, [ledgerEntries, moneyOutRecords]);

  // 3. Cash Book / Bank Book with Accurate Opening Balance & Running Balance
  const cashBookData = useMemo(() => {
    interface RawCashEvent {
      id: string;
      isoDate: string;
      createdMs: number;
      reference: string;
      particulars: string;
      typeLabel: string;
      paymentMethod: PaymentMethod;
      moneyIn: number;
      moneyOut: number;
    }

    const matchesMethod = (method: PaymentMethod): boolean => {
      if (accountFilter === 'All') return true;
      return method === accountFilter;
    };

    const events: RawCashEvent[] = [];

    for (const rec of moneyInRecords) {
      if (!matchesMethod(rec.paymentMethod)) continue;
      const isoDate = getCashRecordIsoDate(rec.paymentDate, rec.createdAt);
      const isTransfer =
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-');
      const client = rec.clientId ? clientsById.get(rec.clientId) : undefined;
      const particulars = isTransfer
        ? rec.note?.trim() ||
          (rec.counterAccount
            ? `Transfer from ${rec.counterAccount}`
            : 'Account Transfer In')
        : rec.source === 'adjustment'
          ? rec.note?.trim() || 'Cash Inflow Adjustment'
          : client
            ? `${client.clientName}${client.companyName ? ` (${client.companyName})` : ''}`
            : rec.note?.trim() || 'Client Payment Received';

      events.push({
        id: `in_${rec.id}`,
        isoDate,
        createdMs: timestampToDate(rec.createdAt)?.getTime() ?? 0,
        reference: rec.reference || 'RCPT',
        particulars,
        typeLabel: isTransfer
          ? 'Transfer In'
          : rec.source === 'adjustment'
            ? 'Adjustment In'
            : 'Client Payment',
        paymentMethod: rec.paymentMethod,
        moneyIn: roundCurrency(Number(rec.amount) || 0),
        moneyOut: 0,
      });
    }

    for (const rec of moneyOutRecords) {
      if (!matchesMethod(rec.paymentMethod)) continue;
      const isoDate = getCashRecordIsoDate(rec.paymentDate, rec.createdAt);
      const supplier = rec.supplierId
        ? suppliersById.get(rec.supplierId)
        : undefined;
      const employee = rec.employeeId
        ? employeesById.get(rec.employeeId)
        : undefined;

      let particulars = rec.note?.trim() || '';
      let typeLabel = 'Cash Outflow';

      if (
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-')
      ) {
        typeLabel = 'Transfer Out';
        particulars =
          particulars ||
          (rec.counterAccount
            ? `Transfer to ${rec.counterAccount}`
            : 'Account Transfer Out');
      } else if (rec.source === 'supplier') {
        typeLabel = 'Supplier Payment';
        particulars = supplier
          ? `${supplier.supplierName}${supplier.companyName ? ` (${supplier.companyName})` : ''}`
          : particulars || 'Supplier Payment';
      } else if (rec.source === 'salary') {
        typeLabel = 'Employee Salary';
        particulars = employee
          ? `${employee.name} (${employee.department})`
          : particulars || 'Employee Salary Payment';
      } else if (rec.source === 'advance') {
        typeLabel = 'Employee Advance';
        particulars = employee
          ? `${employee.name} (${employee.department})`
          : particulars || 'Employee Advance';
      } else if (rec.source === 'adjustment') {
        typeLabel = 'Adjustment Out';
        particulars = particulars || 'Cash Outflow Adjustment';
      } else {
        typeLabel = rec.category ? `Expense · ${rec.category}` : 'Factory Expense';
        particulars = particulars || `${rec.category || 'General'} Expense`;
      }

      events.push({
        id: `out_${rec.id}`,
        isoDate,
        createdMs: timestampToDate(rec.createdAt)?.getTime() ?? 0,
        reference: rec.reference || 'PAY',
        particulars,
        typeLabel,
        paymentMethod: rec.paymentMethod,
        moneyIn: 0,
        moneyOut: roundCurrency(Number(rec.amount) || 0),
      });
    }

    // Sort chronologically ascending so running balance is strictly ordered
    events.sort((a, b) => {
      if (a.isoDate !== b.isoDate) return a.isoDate.localeCompare(b.isoDate);
      if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs;
      return a.id.localeCompare(b.id);
    });

    let openingBalance = 0;
    let hasOpeningBalance = false;
    let totalIn = 0;
    let totalOut = 0;
    let running = 0;
    const rows: CashBookRow[] = [];

    for (const ev of events) {
      if (normalizedStart && ev.isoDate < normalizedStart) {
        openingBalance = roundCurrency(
          openingBalance + ev.moneyIn - ev.moneyOut
        );
        running = openingBalance;
        hasOpeningBalance = true;
        continue;
      }
      if (normalizedEnd && ev.isoDate > normalizedEnd) {
        continue;
      }

      running = roundCurrency(running + ev.moneyIn - ev.moneyOut);
      totalIn = roundCurrency(totalIn + ev.moneyIn);
      totalOut = roundCurrency(totalOut + ev.moneyOut);

      rows.push({
        id: ev.id,
        isoDate: ev.isoDate,
        displayDate: formatIsoDate(ev.isoDate),
        reference: ev.reference,
        particulars: ev.particulars,
        typeLabel: ev.typeLabel,
        paymentMethod: ev.paymentMethod,
        moneyIn: ev.moneyIn,
        moneyOut: ev.moneyOut,
        runningBalance: running,
      });
    }

    const closingBalance =
      rows.length > 0
        ? rows[rows.length - 1].runningBalance
        : openingBalance;

    return {
      openingBalance,
      hasOpeningBalance: Boolean(normalizedStart),
      totalIn,
      totalOut,
      closingBalance,
      rows,
      totalMatchedAllTime: events.length,
    };
  }, [
    moneyInRecords,
    moneyOutRecords,
    clientsById,
    suppliersById,
    employeesById,
    accountFilter,
    normalizedStart,
    normalizedEnd,
  ]);

  // Build printable payload for whichever tab is active
  const triggerPrintCurrentReport = () => {
    if (activeTab === 'pnl') {
      onOpenPrintReport({
        kind: 'pnl',
        startDate: normalizedStart,
        endDate: normalizedEnd,
        periodLabel,
        totalRevenue: pnlData.totalRevenue,
        invoiceCount: pnlData.invoiceCount,
        totalExpenses: pnlData.totalExpenses,
        expenseCount: pnlData.expenseCount,
        netProfitLoss: pnlData.netProfitLoss,
        marginPercent: pnlData.marginPercent,
        expenseCategories: pnlData.expenseCategories,
        invoiceRows: pnlData.invoiceRows,
        sixMonthTrend,
      });
      return;
    }

    onOpenPrintReport({
      kind: 'cashbook',
      startDate: normalizedStart,
      endDate: normalizedEnd,
      periodLabel,
      accountLabel: getAccountFilterLabel(accountFilter),
      openingBalance: cashBookData.openingBalance,
      hasOpeningBalance: cashBookData.hasOpeningBalance,
      totalIn: cashBookData.totalIn,
      totalOut: cashBookData.totalOut,
      closingBalance: cashBookData.closingBalance,
      rows: cashBookData.rows,
    });
  };

  // Trigger print preview when the top-bar "Print Report" CTA is clicked
  const lastPrintSignalRef = useRef(printTriggerSignal);
  useEffect(() => {
    if (printTriggerSignal !== lastPrintSignalRef.current) {
      lastPrintSignalRef.current = printTriggerSignal;
      triggerPrintCurrentReport();
    }
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <div className="w-7 h-7 border-2 border-slate-300 border-t-[#1e3a8a] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading financial reports...</p>
      </div>
    );
  }

  const isProfit = pnlData.netProfitLoss >= 0;

  return (
    <div className="space-y-6">
      {/* Unified Controls Bar: Tabs + Date Range Presets + Custom Date Pickers + Print */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Report Mode Tabs */}
          <div
            className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-start"
            role="tablist"
            aria-label="Financial Report Sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pnl'}
              onClick={() => setActiveTab('pnl')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'pnl'
                  ? 'bg-white text-[#1e3a8a] shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              Profit &amp; Loss (P&amp;L)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'cashbook'}
              onClick={() => setActiveTab('cashbook')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'cashbook'
                  ? 'bg-white text-[#1e3a8a] shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              Cash Book / Bank Book
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Active Period:{' '}
              <strong className="text-slate-800 font-semibold">
                {periodLabel}
              </strong>
            </span>
            <button
              type="button"
              onClick={triggerPrintCurrentReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print {activeTab === 'pnl' ? 'P&L Statement' : 'Cash / Bank Book'}
            </button>
          </div>
        </div>

        {/* Date Range Presets + Inputs */}
        <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 mr-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Range:
            </span>
            {(
              [
                { id: 'this_month', label: 'This Month' },
                { id: 'last_30_days', label: 'Last 30 Days' },
                { id: 'last_6_months', label: 'Last 6 Months' },
                { id: 'this_year', label: 'This Year' },
                { id: 'all_time', label: 'All Time' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <span>From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <span>To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
              />
            </label>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => handleSelectPreset('all_time')}
                title="Clear date filter to show all records"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      {activeTab === 'pnl' ? (
        <div className="space-y-6">
          {/* P&L KPI Summary Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Revenue */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Revenue
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sum of delivered invoice debits (client_ledger)
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md bg-emerald-50 border border-emerald-200/80 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-emerald-700">
                  {formatCurrency(pnlData.totalRevenue)}
                </p>
                <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                  {formatNumber(pnlData.invoiceCount, 0)} invoice
                  {pnlData.invoiceCount === 1 ? '' : 's'} in selected period
                </p>
              </div>
            </div>

            {/* Total Expenses */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Expenses
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    All money_out (suppliers, salaries, advances, utilities)
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md bg-red-50 border border-red-200/80 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-red-700" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-red-700">
                  {formatCurrency(pnlData.totalExpenses)}
                </p>
                <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                  {formatNumber(pnlData.expenseCount, 0)} outflow record
                  {pnlData.expenseCount === 1 ? '' : 's'} across{' '}
                  {formatNumber(pnlData.expenseCategories.length, 0)} categor
                  {pnlData.expenseCategories.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
            </div>

            {/* Net Profit / Loss */}
            <div
              className={`border rounded-lg p-5 flex flex-col justify-between ${
                isProfit
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-red-50/70 border-red-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      isProfit ? 'text-emerald-800' : 'text-red-800'
                    }`}
                  >
                    {isProfit ? 'Net Profit' : 'Net Loss'}
                  </p>
                  <p
                    className={`text-[11px] mt-0.5 ${
                      isProfit ? 'text-emerald-700/80' : 'text-red-700/80'
                    }`}
                  >
                    Total Revenue − Total Expenses
                  </p>
                </div>
                <div
                  className={`w-9 h-9 rounded-md border flex items-center justify-center shrink-0 ${
                    isProfit
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-red-100 border-red-300 text-red-800'
                  }`}
                >
                  {isProfit ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                </div>
              </div>
              <div className="mt-4">
                <p
                  className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
                    isProfit ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  {formatCurrency(pnlData.netProfitLoss)}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                      isProfit
                        ? 'bg-emerald-200/70 text-emerald-900'
                        : 'bg-red-200/70 text-red-900'
                    }`}
                  >
                    {isProfit ? 'PROFIT' : 'LOSS'}
                  </span>
                  {pnlData.marginPercent !== null && (
                    <span
                      className={`tabular-nums font-medium ${
                        isProfit ? 'text-emerald-800' : 'text-red-800'
                      }`}
                    >
                      Margin: {formatNumber(pnlData.marginPercent, 1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 6-Month Revenue vs Expenses Visualization (Recharts) */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Revenue vs Expenses — Last 6 Months
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monthly comparison of billed invoice revenue against total cash
                  outflows ({sixMonthTrend[0]?.label} —{' '}
                  {sixMonthTrend[sixMonthTrend.length - 1]?.label})
                </p>
              </div>

              <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-slate-200 self-start">
                <button
                  type="button"
                  onClick={() => setChartKind('bar')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    chartKind === 'bar'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Bar
                </button>
                <button
                  type="button"
                  onClick={() => setChartKind('line')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    chartKind === 'line'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LineChartIcon className="w-3.5 h-3.5" />
                  Line
                </button>
              </div>
            </div>

            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartKind === 'bar' ? (
                  <BarChart
                    data={sixMonthTrend}
                    margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                    barGap={6}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactBdtTick}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={68}
                    />
                    <Tooltip
                      content={<RevenueExpenseTooltip />}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    />
                    <Bar
                      dataKey="revenue"
                      name="Revenue (Invoices)"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Bar
                      dataKey="expenses"
                      name="Expenses (Money Out)"
                      fill="#dc2626"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                ) : (
                  <LineChart
                    data={sixMonthTrend}
                    margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactBdtTick}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={68}
                    />
                    <Tooltip content={<RevenueExpenseTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue (Invoices)"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#059669' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      name="Expenses (Money Out)"
                      stroke="#dc2626"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#dc2626' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Compact 6-Month Numeric Strip */}
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {sixMonthTrend.map((m) => (
                <div
                  key={m.monthKey}
                  className="bg-slate-50 border border-slate-200/80 rounded-md px-3 py-2"
                >
                  <p className="text-[11px] font-semibold text-slate-700">
                    {m.label}
                  </p>
                  <p className="text-[11px] text-emerald-700 tabular-nums mt-1">
                    In: {formatCurrency(m.revenue)}
                  </p>
                  <p className="text-[11px] text-red-700 tabular-nums">
                    Out: {formatCurrency(m.expenses)}
                  </p>
                  <p
                    className={`text-[11px] font-semibold tabular-nums mt-0.5 pt-0.5 border-t border-slate-200/70 ${
                      m.net >= 0 ? 'text-emerald-800' : 'text-red-800'
                    }`}
                  >
                    Net: {formatCurrency(m.net)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Two-Column Breakdown: Expense Categories + Invoice Revenue Schedule */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expense Breakdown by Category */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Expense Breakdown by Category
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Itemized outflows from money_out for selected period
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-red-700">
                  {formatCurrency(pnlData.totalExpenses)}
                </span>
              </div>

              {pnlData.expenseCategories.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No expenses recorded in this date range.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 flex-1">
                  {pnlData.expenseCategories.map((cat) => (
                    <div key={cat.category} className="px-5 py-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900">
                            {cat.category}
                          </span>
                          <span className="ml-2 text-xs text-slate-400 tabular-nums">
                            ({formatNumber(cat.count, 0)}{' '}
                            {cat.count === 1 ? 'entry' : 'entries'})
                          </span>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(cat.amount)}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            {formatNumber(cat.sharePercent, 1)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500/80 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(cat.sharePercent, 1))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoice Revenue Schedule */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Invoice Revenue Details
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Delivered order invoices (client_ledger · invoice)
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(pnlData.totalRevenue)}
                </span>
              </div>

              {pnlData.invoiceRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No delivered order invoices in this date range.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-2.5">Date &amp; Ref</th>
                        <th className="px-4 py-2.5">Client</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pnlData.invoiceRows.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <p className="text-xs font-medium text-slate-800 tabular-nums">
                              {formatIsoDate(inv.isoDate)}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500">
                              {inv.reference}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-xs font-medium text-slate-900">
                              {inv.clientName}
                            </p>
                            {inv.companyName && (
                              <p className="text-[11px] text-slate-500">
                                {inv.companyName}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-emerald-700">
                            {formatCurrency(inv.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        /* TAB 2: Cash Book / Bank Book with Running Balance */
        <div className="space-y-5">
          {/* Account Method Switcher */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">
                Account Book:
              </span>
              {(
                [
                  { id: 'Cash', label: 'Cash Book', icon: Wallet },
                  { id: 'Bank', label: 'Bank Book', icon: Landmark },
                  {
                    id: 'Mobile Banking',
                    label: 'Mobile Banking',
                    icon: BookOpen,
                  },
                  { id: 'All', label: 'All Accounts', icon: BarChart3 },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = accountFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAccountFilter(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-slate-500 tabular-nums">
              Showing{' '}
              <strong className="text-slate-800">
                {formatNumber(cashBookData.rows.length, 0)}
              </strong>{' '}
              transaction{cashBookData.rows.length === 1 ? '' : 's'}
            </p>
          </section>

          {/* Cash / Bank Book Summary Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Opening Balance (B/F)
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
                {formatCurrency(cashBookData.openingBalance)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {normalizedStart
                  ? `Net balance before ${formatIsoDate(normalizedStart)}`
                  : 'Starts from inception'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Money In (জমা)
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-emerald-700">
                {formatCurrency(cashBookData.totalIn)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Receipts in selected period
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Money Out (খরচ)
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-red-700">
                {formatCurrency(cashBookData.totalOut)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Payments &amp; expenses in period
              </p>
            </div>

            <div className="bg-slate-900 text-white rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-300">
                Closing Balance
              </p>
              <p
                className={`mt-2 text-xl font-bold tabular-nums ${
                  cashBookData.closingBalance >= 0
                    ? 'text-emerald-300'
                    : 'text-red-300'
                }`}
              >
                {formatCurrency(cashBookData.closingBalance)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Opening + In − Out
              </p>
            </div>
          </section>

          {/* Cash Book / Bank Book Running Balance Table */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {getAccountFilterLabel(accountFilter)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological receipts and disbursements with live row-by-row
                  running balance
                </p>
              </div>
              <span className="text-xs text-slate-500">
                Period: <strong className="text-slate-700">{periodLabel}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 whitespace-nowrap">Reference</th>
                    <th className="px-4 py-3">Particulars / Counterparty</th>
                    <th className="px-4 py-3 whitespace-nowrap">
                      Type &amp; Method
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      In (জমা)
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      Out (খরচ)
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      Running Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashBookData.hasOpeningBalance && (
                    <tr className="bg-slate-50/80 text-slate-700 italic">
                      <td className="px-4 py-2.5 text-xs tabular-nums whitespace-nowrap">
                        {normalizedStart
                          ? formatIsoDate(normalizedStart)
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono">B/F</td>
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-medium">
                        Opening Balance Brought Forward
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatCurrency(cashBookData.openingBalance)}
                      </td>
                    </tr>
                  )}

                  {cashBookData.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-slate-500"
                      >
                        No {accountFilter === 'All' ? 'cash or bank' : accountFilter}{' '}
                        transactions found for {periodLabel}.
                      </td>
                    </tr>
                  ) : (
                    cashBookData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {row.displayDate}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-700 whitespace-nowrap">
                          {row.reference}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-900">
                          {row.particulars}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-slate-700">
                            {row.typeLabel}
                          </span>
                          <span className="ml-1.5 text-[11px] text-slate-400">
                            · {row.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                          {row.moneyIn > 0 ? formatCurrency(row.moneyIn) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-red-700 whitespace-nowrap">
                          {row.moneyOut > 0 ? formatCurrency(row.moneyOut) : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-xs font-bold tabular-nums whitespace-nowrap ${
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
                <tfoot className="bg-slate-100/90 border-t-2 border-slate-200">
                  <tr className="text-xs font-bold text-slate-900">
                    <td colSpan={4} className="px-4 py-3 text-right">
                      Period Totals &amp; Closing Balance
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatCurrency(cashBookData.totalIn)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-700 whitespace-nowrap">
                      {formatCurrency(cashBookData.totalOut)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${
                        cashBookData.closingBalance >= 0
                          ? 'text-slate-950'
                          : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(cashBookData.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
