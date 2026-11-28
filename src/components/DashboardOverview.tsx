import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Landmark,
  PackageCheck,
  Plus,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';
import type {
  ClientLedgerEntry,
  ClientRecord,
  EmployeeRecord,
  InventoryItem,
  MoneyInRecord,
  MoneyOutRecord,
  NavSection,
  OrderRecord,
  OrderStatus,
  SupplierLedgerEntry,
  SupplierRecord,
  UserRole,
} from '../types/mill';
import {
  calculateLedgerTotals,
  calculateSupplierLedgerTotals,
  formatCurrency,
  formatIsoDate,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';
import {
  canViewEmployees,
  canViewInventory,
  canViewOrders,
} from '../utils/rbac';

interface DashboardOverviewProps {
  userRole: UserRole;
  ledgerEntries: ClientLedgerEntry[];
  supplierLedgerEntries: SupplierLedgerEntry[];
  orders: OrderRecord[];
  inventoryItems: InventoryItem[];
  moneyInRecords: MoneyInRecord[];
  moneyOutRecords: MoneyOutRecord[];
  clientsById: Map<string, ClientRecord>;
  suppliersById: Map<string, SupplierRecord>;
  employeesById: Map<string, EmployeeRecord>;
  isLoading: boolean;
  onNavigate: (section: NavSection) => void;
  onStartCompleteDeliver: (order: OrderRecord) => void;
  onOpenClientLedger: (client: ClientRecord) => void;
  onOpenClientPayments: (client: ClientRecord) => void;
  onOpenSupplierPayments: (supplier: SupplierRecord) => void;
  onCorrectMoneyIn: (record: MoneyInRecord) => void;
  onCorrectMoneyOut: (record: MoneyOutRecord) => void;
}

interface MonthlyBarPoint {
  monthKey: string;
  label: string;
  shortLabel: string;
  revenue: number;
  expenses: number;
  net: number;
}

type UnifiedTransaction =
  | {
      kind: 'money_in';
      id: string;
      rawRecord: MoneyInRecord;
      reference: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      note: string;
      counterpartyId: string;
      counterpartyName: string;
      sortTimestamp: number;
    }
  | {
      kind: 'money_out';
      subType:
        | 'supplier'
        | 'expense'
        | 'advance'
        | 'salary'
        | 'transfer'
        | 'adjustment';
      id: string;
      rawRecord: MoneyOutRecord;
      reference: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      note: string;
      counterpartyId: string;
      counterpartyName: string;
      sortTimestamp: number;
    };

const ISO_DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const ORD_DATE_REGEX = /^ORD-([0-9]{4})([0-9]{2})([0-9]{2})/;

const RUNNING_STATUSES = new Set<OrderStatus>([
  'Processing',
  'Dyeing',
  'Washing',
]);

function dateToLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getIsoDateFallbackMs(isoDate: string): number {
  if (!ISO_DATE_REGEX.test(isoDate)) return 0;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
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

function getOrderStatusTone(status: OrderStatus): string {
  switch (status) {
    case 'Delivered':
      return 'text-emerald-700';
    case 'Finishing':
      return 'text-[#1e3a8a]';
    case 'Dyeing':
    case 'Washing':
    case 'Processing':
      return 'text-amber-700';
  }
}

interface CustomTooltipPayloadItem {
  payload?: MonthlyBarPoint;
}

function DashboardRevenueExpenseTooltip({
  active,
  payload,
  revenueLabel,
  expensesLabel,
  profitLabel,
  lossLabel,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  revenueLabel: string;
  expensesLabel: string;
  profitLabel: string;
  lossLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3.5 py-2.5 text-xs min-w-[210px]">
      <p className="font-semibold text-slate-900 border-b border-slate-100 pb-1.5 mb-1.5">
        {point.label}
      </p>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 font-sans text-slate-600">
            <span className="w-2 h-2 rounded-xs bg-emerald-600 shrink-0" />
            {revenueLabel}
          </span>
          <span className="font-semibold text-emerald-700">
            {formatCurrency(point.revenue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 font-sans text-slate-600">
            <span className="w-2 h-2 rounded-xs bg-red-600 shrink-0" />
            {expensesLabel}
          </span>
          <span className="font-semibold text-red-700">
            {formatCurrency(point.expenses)}
          </span>
        </div>
        <div className="pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between gap-4">
          <span className="font-sans font-medium text-slate-700">
            {point.net >= 0 ? profitLabel : lossLabel}
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

export function DashboardOverview({
  userRole,
  ledgerEntries,
  supplierLedgerEntries,
  orders,
  inventoryItems,
  moneyInRecords,
  moneyOutRecords,
  clientsById,
  suppliersById,
  employeesById,
  isLoading,
  onNavigate,
  onStartCompleteDeliver,
  onOpenClientLedger,
  onOpenClientPayments,
  onOpenSupplierPayments,
  onCorrectMoneyIn,
  onCorrectMoneyOut,
}: DashboardOverviewProps) {
  const { t, translateOrderStatus, translatePaymentMethod } = useLanguage();
  const todayIso = getTodayIsoDate();
  const currentMonthKey = todayIso.slice(0, 7);
  const canSeeOrders = canViewOrders(userRole);
  const canSeeInventory = canViewInventory(userRole);
  const canSeeEmployees = canViewEmployees(userRole);
  const showAlertsSection = canSeeInventory || canSeeOrders;

  const currentMonthDisplay = useMemo(() => {
    const [yearNum, monthNum] = todayIso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(yearNum, monthNum - 1, 1));
  }, [todayIso]);

  // 1. Financial KPIs (live from Firestore collections)
  const financialKpis = useMemo(() => {
    const clientTotals = calculateLedgerTotals(ledgerEntries);
    const supplierTotals = calculateSupplierLedgerTotals(supplierLedgerEntries);

    let totalMoneyIn = 0;
    for (const rec of moneyInRecords) {
      totalMoneyIn += Number(rec.amount) || 0;
    }

    let totalMoneyOut = 0;
    for (const rec of moneyOutRecords) {
      totalMoneyOut += Number(rec.amount) || 0;
    }

    const cleanIn = roundCurrency(totalMoneyIn);
    const cleanOut = roundCurrency(totalMoneyOut);
    const cashBankBalance = roundCurrency(cleanIn - cleanOut);

    return {
      totalReceivable: clientTotals.currentDue,
      totalClientDebit: clientTotals.totalDebit,
      totalClientCredit: clientTotals.totalCredit,
      totalPayable: supplierTotals.totalPayable,
      totalSupplierCredit: supplierTotals.totalCredit,
      totalSupplierDebit: supplierTotals.totalDebit,
      totalMoneyIn: cleanIn,
      totalMoneyOut: cleanOut,
      cashBankBalance,
    };
  }, [ledgerEntries, supplierLedgerEntries, moneyInRecords, moneyOutRecords]);

  // 2. Production & Order KPIs
  const productionKpis = useMemo(() => {
    let ordersToday = 0;
    let runningProcessing = 0;
    let pendingDelivery = 0;
    let pendingGreyGaj = 0;
    let deliveredOrdersCount = 0;
    let totalDeliveredGaj = 0;

    for (const order of orders) {
      if (order.orderDate === todayIso) {
        ordersToday += 1;
      }
      if (RUNNING_STATUSES.has(order.status)) {
        runningProcessing += 1;
      }
      if (order.status !== 'Delivered') {
        pendingDelivery += 1;
        pendingGreyGaj += Number(order.greyFabricGaj) || 0;
      } else {
        deliveredOrdersCount += 1;
        totalDeliveredGaj += Number(order.finalGaj) || 0;
      }
    }

    return {
      ordersToday,
      runningProcessing,
      pendingDelivery,
      pendingGreyGaj: roundCurrency(pendingGreyGaj),
      deliveredOrdersCount,
      totalDeliveredGaj: roundCurrency(totalDeliveredGaj),
    };
  }, [orders, todayIso]);

  // 3. Last 6 Months Revenue (client invoices) vs Expenses (operating money_out) + This Month's Summary
  const { sixMonthTrend, sixMonthTotals, thisMonthSummary } = useMemo(() => {
    const [yearNum, monthNum] = todayIso.split('-').map(Number);
    const months: MonthlyBarPoint[] = [];
    const byKey = new Map<string, MonthlyBarPoint>();

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
      const point: MonthlyBarPoint = {
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

    let monthIncome = 0;
    let monthInvoiceCount = 0;

    for (const entry of ledgerEntries) {
      if (entry.txn_type !== 'invoice') continue;
      const amt = roundCurrency(Number(entry.debit) || 0);
      if (amt <= 0) continue;

      const monthKey = getLedgerEntryIsoDate(entry).slice(0, 7);
      const bucket = byKey.get(monthKey);
      if (bucket) {
        bucket.revenue = roundCurrency(bucket.revenue + amt);
      }
      if (monthKey === currentMonthKey) {
        monthIncome = roundCurrency(monthIncome + amt);
        monthInvoiceCount += 1;
      }
    }

    let monthExpense = 0;
    let monthExpenseCount = 0;

    for (const rec of moneyOutRecords) {
      // Internal account transfers are liquidity movements, not operating expenses
      if (
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-')
      ) {
        continue;
      }
      const amt = roundCurrency(Number(rec.amount) || 0);
      if (amt <= 0) continue;

      const monthKey = getCashRecordIsoDate(
        rec.paymentDate,
        rec.createdAt
      ).slice(0, 7);
      const bucket = byKey.get(monthKey);
      if (bucket) {
        bucket.expenses = roundCurrency(bucket.expenses + amt);
      }
      if (monthKey === currentMonthKey) {
        monthExpense = roundCurrency(monthExpense + amt);
        monthExpenseCount += 1;
      }
    }

    let monthCashCollected = 0;
    for (const rec of moneyInRecords) {
      if (
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-')
      ) {
        continue;
      }
      const amt = roundCurrency(Number(rec.amount) || 0);
      if (amt <= 0) continue;
      const monthKey = getCashRecordIsoDate(
        rec.paymentDate,
        rec.createdAt
      ).slice(0, 7);
      if (monthKey === currentMonthKey) {
        monthCashCollected = roundCurrency(monthCashCollected + amt);
      }
    }

    let sixMonthRevenue = 0;
    let sixMonthExpenses = 0;
    for (const m of months) {
      m.net = roundCurrency(m.revenue - m.expenses);
      sixMonthRevenue = roundCurrency(sixMonthRevenue + m.revenue);
      sixMonthExpenses = roundCurrency(sixMonthExpenses + m.expenses);
    }

    const monthNet = roundCurrency(monthIncome - monthExpense);
    const monthMargin =
      monthIncome > 0 ? roundCurrency((monthNet / monthIncome) * 100) : null;

    return {
      sixMonthTrend: months,
      sixMonthTotals: {
        revenue: sixMonthRevenue,
        expenses: sixMonthExpenses,
        net: roundCurrency(sixMonthRevenue - sixMonthExpenses),
        hasAnyActivity: sixMonthRevenue > 0 || sixMonthExpenses > 0,
      },
      thisMonthSummary: {
        totalIncome: monthIncome,
        invoiceCount: monthInvoiceCount,
        totalExpense: monthExpense,
        expenseCount: monthExpenseCount,
        netProfitLoss: monthNet,
        marginPercent: monthMargin,
        cashCollected: monthCashCollected,
      },
    };
  }, [ledgerEntries, moneyOutRecords, moneyInRecords, todayIso, currentMonthKey]);

  // 4. Real-Time Operational Alerts: Low Stock Items & Ready-to-Deliver Orders
  const lowStockItems = useMemo(() => {
    return inventoryItems
      .filter((item) => item.currentStock < item.minStockLevel)
      .sort((a, b) => {
        const ratioA =
          a.minStockLevel > 0 ? a.currentStock / a.minStockLevel : 0;
        const ratioB =
          b.minStockLevel > 0 ? b.currentStock / b.minStockLevel : 0;
        if (ratioA !== ratioB) return ratioA - ratioB;
        return a.itemName.localeCompare(b.itemName);
      });
  }, [inventoryItems]);

  const readyToDeliverOrders = useMemo(() => {
    return orders
      .filter(
        (order) =>
          order.status === 'Finishing' || String(order.status) === 'Ready'
      )
      .sort((a, b) => {
        const timeA = getIsoDateFallbackMs(a.orderDate);
        const timeB = getIsoDateFallbackMs(b.orderDate);
        return timeA - timeB;
      });
  }, [orders]);

  // 5A. Recent Orders (Last 5)
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ??
          getIsoDateFallbackMs(a.orderDate);
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ??
          getIsoDateFallbackMs(b.orderDate);
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [orders]);

  // 5B. Recent Transactions (Last 5 combined from money_in and money_out)
  const recentTransactions = useMemo<UnifiedTransaction[]>(() => {
    const incoming: UnifiedTransaction[] = moneyInRecords.map((rec) => {
      const isTransfer =
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-');
      const isAdjustment =
        !isTransfer &&
        (rec.source === 'adjustment' || rec.reference.startsWith('REV-'));
      const client = clientsById.get(rec.clientId);
      const label = isTransfer
        ? rec.note ||
          (rec.counterAccount
            ? `Transfer from ${rec.counterAccount}`
            : 'Account Transfer')
        : isAdjustment
          ? rec.note || 'Cash Reversal Adjustment'
          : client
            ? client.clientName
            : 'Client Account';
      return {
        kind: 'money_in',
        id: `in-${rec.id}`,
        rawRecord: rec,
        reference: rec.reference || rec.id,
        amount: rec.amount,
        paymentDate: rec.paymentDate,
        paymentMethod: rec.paymentMethod,
        note: rec.note,
        counterpartyId: rec.clientId,
        counterpartyName: label,
        sortTimestamp:
          timestampToDate(rec.createdAt)?.getTime() ??
          getIsoDateFallbackMs(rec.paymentDate),
      };
    });

    const outgoing: UnifiedTransaction[] = moneyOutRecords.map((rec) => {
      const isTransfer =
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-');
      if (isTransfer) {
        return {
          kind: 'money_out',
          subType: 'transfer',
          id: `out-${rec.id}`,
          rawRecord: rec,
          reference: rec.reference || rec.id,
          amount: rec.amount,
          paymentDate: rec.paymentDate,
          paymentMethod: rec.paymentMethod,
          note: rec.note,
          counterpartyId: rec.id,
          counterpartyName:
            rec.note ||
            (rec.counterAccount
              ? `Transfer to ${rec.counterAccount}`
              : 'Account Transfer'),
          sortTimestamp:
            timestampToDate(rec.createdAt)?.getTime() ??
            getIsoDateFallbackMs(rec.paymentDate),
        };
      }

      const isAdjustment =
        rec.source === 'adjustment' || rec.reference.startsWith('REV-');
      if (isAdjustment) {
        return {
          kind: 'money_out',
          subType: 'adjustment',
          id: `out-${rec.id}`,
          rawRecord: rec,
          reference: rec.reference || rec.id,
          amount: rec.amount,
          paymentDate: rec.paymentDate,
          paymentMethod: rec.paymentMethod,
          note: rec.note,
          counterpartyId: rec.id,
          counterpartyName: rec.note || 'Cash Reversal Adjustment',
          sortTimestamp:
            timestampToDate(rec.createdAt)?.getTime() ??
            getIsoDateFallbackMs(rec.paymentDate),
        };
      }

      const isAdvance =
        rec.source === 'advance' ||
        rec.reference.startsWith('ADV-') ||
        rec.category === 'Employee Advance';
      if (isAdvance) {
        const employee = rec.employeeId
          ? employeesById.get(rec.employeeId)
          : undefined;
        const advanceLabel = employee
          ? `Employee Advance — ${employee.name}`
          : rec.note || 'Employee Advance';
        return {
          kind: 'money_out',
          subType: 'advance',
          id: `out-${rec.id}`,
          rawRecord: rec,
          reference: rec.reference || rec.id,
          amount: rec.amount,
          paymentDate: rec.paymentDate,
          paymentMethod: rec.paymentMethod,
          note: rec.note,
          counterpartyId: rec.employeeId || rec.id,
          counterpartyName: advanceLabel,
          sortTimestamp:
            timestampToDate(rec.createdAt)?.getTime() ??
            getIsoDateFallbackMs(rec.paymentDate),
        };
      }

      const isSalary =
        rec.source === 'salary' ||
        rec.reference.startsWith('SAL-') ||
        Boolean(rec.salaryPaymentId);
      if (isSalary) {
        const employee = rec.employeeId
          ? employeesById.get(rec.employeeId)
          : undefined;
        const salaryLabel = employee
          ? `Salary — ${employee.name}`
          : rec.note || 'Employee Salary';
        return {
          kind: 'money_out',
          subType: 'salary',
          id: `out-${rec.id}`,
          rawRecord: rec,
          reference: rec.reference || rec.id,
          amount: rec.amount,
          paymentDate: rec.paymentDate,
          paymentMethod: rec.paymentMethod,
          note: rec.note,
          counterpartyId: rec.employeeId || rec.id,
          counterpartyName: salaryLabel,
          sortTimestamp:
            timestampToDate(rec.createdAt)?.getTime() ??
            getIsoDateFallbackMs(rec.paymentDate),
        };
      }

      const isExpense =
        rec.source === 'expense' || rec.reference.startsWith('EXP-');
      if (isExpense) {
        const expenseLabel = rec.category
          ? `${rec.category} Expense`
          : 'Factory Expense';
        return {
          kind: 'money_out',
          subType: 'expense',
          id: `out-${rec.id}`,
          rawRecord: rec,
          reference: rec.reference || rec.id,
          amount: rec.amount,
          paymentDate: rec.paymentDate,
          paymentMethod: rec.paymentMethod,
          note: rec.note,
          counterpartyId: rec.expenseId || rec.id,
          counterpartyName: rec.note
            ? `${expenseLabel} — ${rec.note}`
            : expenseLabel,
          sortTimestamp:
            timestampToDate(rec.createdAt)?.getTime() ??
            getIsoDateFallbackMs(rec.paymentDate),
        };
      }

      const supplier = suppliersById.get(rec.supplierId);
      return {
        kind: 'money_out',
        subType: 'supplier',
        id: `out-${rec.id}`,
        rawRecord: rec,
        reference: rec.reference || rec.id,
        amount: rec.amount,
        paymentDate: rec.paymentDate,
        paymentMethod: rec.paymentMethod,
        note: rec.note,
        counterpartyId: rec.supplierId,
        counterpartyName: supplier ? supplier.supplierName : 'Supplier Account',
        sortTimestamp:
          timestampToDate(rec.createdAt)?.getTime() ??
          getIsoDateFallbackMs(rec.paymentDate),
      };
    });

    return [...incoming, ...outgoing]
      .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
      .slice(0, 5);
  }, [moneyInRecords, moneyOutRecords, clientsById, suppliersById, employeesById]);

  const monthTotalVolume =
    thisMonthSummary.totalIncome + thisMonthSummary.totalExpense;
  const incomeSharePct =
    monthTotalVolume > 0
      ? Math.round((thisMonthSummary.totalIncome / monthTotalVolume) * 100)
      : 50;

  const totalAlertCount =
    (canSeeInventory ? lowStockItems.length : 0) +
    (canSeeOrders ? readyToDeliverOrders.length : 0);

  return (
    <div className="space-y-6">
      {/* Section 1: Financial KPIs */}
      <section aria-label="Financial summary">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Total Receivable (Client Due) */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {t('dashboard.kpi.totalReceivable')}
                  </p>
                  <p
                    className={`mt-2 font-mono text-2xl sm:text-[28px] leading-tight font-semibold tabular-nums ${
                      financialKpis.totalReceivable > 0
                        ? 'text-red-700'
                        : financialKpis.totalReceivable < 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {isLoading
                      ? '—'
                      : formatCurrency(financialKpis.totalReceivable)}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md bg-blue-50 border border-blue-100 text-[#1e3a8a] flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
                Dr {formatCurrency(financialKpis.totalClientDebit)} · Cr{' '}
                {formatCurrency(financialKpis.totalClientCredit)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                <span className="font-mono tabular-nums">{clientsById.size}</span>{' '}
                {t('dashboard.kpi.registeredClients')}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('clients')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                {t('dashboard.kpi.clientsLink')}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Total Payable (Supplier Due) */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {t('dashboard.kpi.totalPayable')}
                  </p>
                  <p
                    className={`mt-2 font-mono text-2xl sm:text-[28px] leading-tight font-semibold tabular-nums ${
                      financialKpis.totalPayable > 0
                        ? 'text-amber-700'
                        : financialKpis.totalPayable < 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {isLoading
                      ? '—'
                      : formatCurrency(financialKpis.totalPayable)}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
                Cr {formatCurrency(financialKpis.totalSupplierCredit)} · Dr{' '}
                {formatCurrency(financialKpis.totalSupplierDebit)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                <span className="font-mono tabular-nums">{suppliersById.size}</span>{' '}
                {t('dashboard.kpi.activeSuppliers')}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('suppliers')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                {t('dashboard.kpi.suppliersLink')}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Net Cash Balance */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {t('dashboard.kpi.netCashBalance')}
                  </p>
                  <p
                    className={`mt-2 font-mono text-2xl sm:text-[28px] leading-tight font-semibold tabular-nums ${
                      financialKpis.cashBankBalance > 0
                        ? 'text-emerald-700'
                        : financialKpis.cashBankBalance < 0
                        ? 'text-red-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {isLoading
                      ? '—'
                      : formatCurrency(financialKpis.cashBankBalance)}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
                {t('dashboard.inLabel')} {formatCurrency(financialKpis.totalMoneyIn)} ·{' '}
                {t('dashboard.outLabel')} {formatCurrency(financialKpis.totalMoneyOut)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {t('dashboard.kpi.netCashSub')}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('accounts')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                {t('nav.accounts')}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Production & Order KPIs (Hidden for Accountant) */}
      {canSeeOrders && (
        <section aria-label="Production and order metrics">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            {/* Total Orders Today */}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  {t('dashboard.kpi.ordersToday')}
                </p>
                <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {isLoading ? '—' : formatNumber(productionKpis.ordersToday, 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('dashboard.kpi.dated')} {formatIsoDate(todayIso)}
              </p>
            </div>

            {/* Running Processing */}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  {t('dashboard.kpi.runningProcessing')}
                </p>
                <Activity className="w-4 h-4 text-amber-600 shrink-0" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700">
                {isLoading
                  ? '—'
                  : formatNumber(productionKpis.runningProcessing, 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('dashboard.kpi.runningSub')}
              </p>
            </div>

            {/* Pending Delivery */}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  {t('dashboard.kpi.pendingDelivery')}
                </p>
                <Clock className="w-4 h-4 text-[#1e3a8a] shrink-0" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {isLoading
                  ? '—'
                  : formatNumber(productionKpis.pendingDelivery, 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {formatNumber(productionKpis.pendingGreyGaj)}{' '}
                {t('dashboard.kpi.greyGajInMill')}
              </p>
            </div>

            {/* Total Delivered Gaj */}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  {t('dashboard.kpi.totalDeliveredGaj')}
                </p>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
                {isLoading
                  ? '—'
                  : `${formatNumber(productionKpis.totalDeliveredGaj)} ${t('common.gaj')}`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('dashboard.kpi.deliveredOrdersPrefix')}{' '}
                <span className="font-mono tabular-nums">
                  {productionKpis.deliveredOrdersCount}
                </span>{' '}
                {productionKpis.deliveredOrdersCount === 1
                  ? t('dashboard.kpi.deliveredOrderSingular')
                  : t('dashboard.kpi.deliveredOrderPlural')}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Section 3: 6-Month Revenue vs Expenses Chart + This Month's Summary */}
      <section
        aria-label="Revenue vs expenses trend and monthly summary"
        className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch"
      >
        {/* 6-Month Visual Bar Chart (8 columns on xl) */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-lg p-5 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('dashboard.chart.title')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('dashboard.chart.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap shrink-0 self-start"
            >
              {t('dashboard.chart.fullReport')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unboxed legend & 6-month totals */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
              <span className="text-slate-600">
                {t('dashboard.chart.revenue')}:
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {isLoading ? '—' : formatCurrency(sixMonthTotals.revenue)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-600 shrink-0" />
              <span className="text-slate-600">
                {t('dashboard.chart.expenses')}:
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {isLoading ? '—' : formatCurrency(sixMonthTotals.expenses)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <span className="text-slate-500">
                {t('dashboard.chart.sixMonthNet')}:
              </span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  sixMonthTotals.net >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {isLoading ? '—' : formatCurrency(sixMonthTotals.net)}
              </span>
            </div>
          </div>

          {/* Responsive Bar Chart */}
          <div className="flex-1 min-h-[260px] w-full pt-1">
            {isLoading ? (
              <div className="h-[260px] flex items-end justify-between gap-4 px-4 pb-6 animate-pulse">
                {[52, 74, 62, 85, 68, 90].map((h, idx) => (
                  <div key={idx} className="flex-1 flex items-end gap-1.5 h-full">
                    <div
                      className="flex-1 bg-slate-100 rounded-t"
                      style={{ height: `${h}%` }}
                    />
                    <div
                      className="flex-1 bg-slate-100 rounded-t"
                      style={{ height: `${Math.max(24, h - 22)}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sixMonthTrend}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    barGap={6}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis
                      dataKey="shortLabel"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      dy={6}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={64}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={formatCompactBdtTick}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={
                        <DashboardRevenueExpenseTooltip
                          revenueLabel={t('dashboard.chart.revenue')}
                          expensesLabel={t('dashboard.chart.expenses')}
                          profitLabel={t('dashboard.monthly.netProfit')}
                          lossLabel={t('dashboard.monthly.netLoss')}
                        />
                      }
                    />
                    <Bar
                      dataKey="revenue"
                      name={t('dashboard.chart.revenue')}
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="expenses"
                      name={t('dashboard.chart.expenses')}
                      fill="#dc2626"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {!isLoading && !sixMonthTotals.hasAnyActivity && (
            <p className="mt-2 text-xs text-slate-500 text-center">
              {t('dashboard.chart.emptyHint')}
            </p>
          )}
        </div>

        {/* This Month's Summary Card (4 columns on xl) */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  {t('dashboard.monthly.title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentMonthDisplay}
                </p>
              </div>
              <div
                className={`w-9 h-9 rounded-md border flex items-center justify-center shrink-0 ${
                  thisMonthSummary.netProfitLoss >= 0
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-red-50 border-red-100 text-red-700'
                }`}
              >
                {thisMonthSummary.netProfitLoss >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
              </div>
            </div>

            {/* Net Profit / Loss Focal Metric */}
            <div className="py-5 border-b border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  {thisMonthSummary.netProfitLoss >= 0
                    ? t('dashboard.monthly.netProfit')
                    : t('dashboard.monthly.netLoss')}
                </p>
                {!isLoading && thisMonthSummary.marginPercent !== null && (
                  <span
                    className={`font-mono text-xs font-medium tabular-nums ${
                      thisMonthSummary.netProfitLoss >= 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    }`}
                  >
                    {thisMonthSummary.marginPercent >= 0 ? '+' : ''}
                    {formatNumber(thisMonthSummary.marginPercent, 1)}%{' '}
                    <span className="font-sans text-slate-500 font-normal">
                      {t('dashboard.monthly.margin')}
                    </span>
                  </span>
                )}
              </div>
              <p
                className={`mt-1.5 font-mono text-2xl sm:text-[28px] leading-tight font-bold tabular-nums ${
                  thisMonthSummary.netProfitLoss >= 0
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                {isLoading
                  ? '—'
                  : formatCurrency(thisMonthSummary.netProfitLoss)}
              </p>

              {/* Proportional Income vs Expense ratio bar */}
              <div className="mt-4">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  {monthTotalVolume > 0 && (
                    <>
                      <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{ width: `${incomeSharePct}%` }}
                      />
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${100 - incomeSharePct}%` }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Income & Expense Breakdown Rows */}
            <div className="divide-y divide-slate-100">
              <div className="py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {t('dashboard.monthly.totalIncome')}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('dashboard.monthly.incomeSub')} ·{' '}
                    <span className="font-mono tabular-nums">
                      {formatNumber(thisMonthSummary.invoiceCount, 0)}
                    </span>
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                  {isLoading
                    ? '—'
                    : formatCurrency(thisMonthSummary.totalIncome)}
                </p>
              </div>

              <div className="py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {t('dashboard.monthly.totalExpense')}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('dashboard.monthly.expenseSub')} ·{' '}
                    <span className="font-mono tabular-nums">
                      {formatNumber(thisMonthSummary.expenseCount, 0)}
                    </span>
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold tabular-nums text-red-700 whitespace-nowrap">
                  {isLoading
                    ? '—'
                    : formatCurrency(thisMonthSummary.totalExpense)}
                </p>
              </div>

              <div className="py-3.5 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">
                  {t('dashboard.monthly.cashCollected')}
                </p>
                <p className="font-mono text-xs font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                  {isLoading
                    ? '—'
                    : formatCurrency(thisMonthSummary.cashCollected)}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
            >
              {t('dashboard.monthly.viewReports')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Section 4: Important Alerts (Real-time Low Stock & Pending Delivery / Ready Orders) */}
      {showAlertsSection && (
        <section
          aria-label="Important operational alerts"
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('dashboard.alerts.title')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isLoading ? (
                  '—'
                ) : totalAlertCount === 0 ? (
                  t('dashboard.alerts.allClear')
                ) : (
                  <>
                    {canSeeInventory && (
                      <span
                        className={
                          lowStockItems.length > 0
                            ? 'text-red-700 font-medium'
                            : 'text-slate-500'
                        }
                      >
                        <span className="font-mono tabular-nums">
                          {formatNumber(lowStockItems.length, 0)}
                        </span>{' '}
                        {t('dashboard.alerts.lowStockCount')}
                      </span>
                    )}
                    {canSeeInventory && canSeeOrders && (
                      <span className="mx-2 text-slate-300" aria-hidden="true">
                        ·
                      </span>
                    )}
                    {canSeeOrders && (
                      <span
                        className={
                          readyToDeliverOrders.length > 0
                            ? 'text-amber-700 font-medium'
                            : 'text-slate-500'
                        }
                      >
                        <span className="font-mono tabular-nums">
                          {formatNumber(readyToDeliverOrders.length, 0)}
                        </span>{' '}
                        {t('dashboard.alerts.readyCount')}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${
              canSeeInventory && canSeeOrders ? 'lg:grid-cols-2' : ''
            } divide-y lg:divide-y-0 lg:divide-x divide-slate-200`}
          >
            {/* Column 1: Low Stock Warnings */}
            {canSeeInventory && (
              <div className="flex flex-col">
                <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 ${
                        lowStockItems.length > 0
                          ? 'text-red-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <h3 className="text-xs font-semibold text-slate-900 truncate">
                      {t('dashboard.alerts.lowStockTitle')}
                    </h3>
                    {!isLoading && lowStockItems.length > 0 && (
                      <span className="font-mono text-xs font-semibold tabular-nums text-red-700">
                        ({formatNumber(lowStockItems.length, 0)})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('inventory')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t('dashboard.alerts.manageInventory')}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 divide-y divide-slate-100">
                  {isLoading ? (
                    <div className="p-5 space-y-2.5 animate-pulse">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-11 bg-slate-100 rounded" />
                      ))}
                    </div>
                  ) : lowStockItems.length === 0 ? (
                    <div className="px-5 py-8 flex items-center gap-3 text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <p className="text-xs">
                        {t('dashboard.alerts.lowStockEmpty')}
                      </p>
                    </div>
                  ) : (
                    <>
                      {lowStockItems.slice(0, 5).map((item) => {
                        const deficit = roundCurrency(
                          item.minStockLevel - item.currentStock
                        );
                        return (
                          <div
                            key={item.id}
                            className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-red-50/30 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {item.itemName}
                              </p>
                              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                                <span className="font-semibold text-red-700">
                                  {formatNumber(item.currentStock)} {item.unit}
                                </span>
                                <span className="mx-1.5 text-slate-300">/</span>
                                <span>
                                  {t('dashboard.alerts.minLabel')}{' '}
                                  {formatNumber(item.minStockLevel)} {item.unit}
                                </span>
                                <span className="mx-1.5 text-slate-300">·</span>
                                <span className="text-red-700">
                                  {t('dashboard.alerts.shortBy')}{' '}
                                  {formatNumber(deficit)} {item.unit}
                                </span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onNavigate('new-purchase')}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {t('dashboard.alerts.restock')}
                            </button>
                          </div>
                        );
                      })}
                      {lowStockItems.length > 5 && (
                        <div className="px-5 py-2.5 bg-slate-50/50 text-right">
                          <button
                            type="button"
                            onClick={() => onNavigate('inventory')}
                            className="text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer"
                          >
                            +{formatNumber(lowStockItems.length - 5, 0)}{' '}
                            {t('dashboard.alerts.viewMore')} →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Column 2: Pending Delivery (Ready / Finishing Orders not yet Delivered) */}
            {canSeeOrders && (
              <div className="flex flex-col">
                <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <PackageCheck
                      className={`w-4 h-4 shrink-0 ${
                        readyToDeliverOrders.length > 0
                          ? 'text-amber-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <h3 className="text-xs font-semibold text-slate-900 truncate">
                      {t('dashboard.alerts.pendingDeliveryTitle')}
                    </h3>
                    {!isLoading && readyToDeliverOrders.length > 0 && (
                      <span className="font-mono text-xs font-semibold tabular-nums text-amber-700">
                        ({formatNumber(readyToDeliverOrders.length, 0)})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('orders')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t('dashboard.recentOrders.allOrders')}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 divide-y divide-slate-100">
                  {isLoading ? (
                    <div className="p-5 space-y-2.5 animate-pulse">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-11 bg-slate-100 rounded" />
                      ))}
                    </div>
                  ) : readyToDeliverOrders.length === 0 ? (
                    <div className="px-5 py-8 flex items-start gap-3 text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs">
                          {t('dashboard.alerts.pendingDeliveryEmpty')}
                        </p>
                        {productionKpis.runningProcessing > 0 && (
                          <p className="text-xs text-slate-500 mt-1">
                            <span className="font-mono tabular-nums font-medium text-slate-700">
                              {formatNumber(productionKpis.runningProcessing, 0)}
                            </span>{' '}
                            {t('dashboard.alerts.inProgressNote')}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {readyToDeliverOrders.slice(0, 5).map((order) => {
                        const client = clientsById.get(order.clientId);
                        return (
                          <div
                            key={order.id}
                            className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-amber-50/30 transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (client) {
                                  onOpenClientLedger(client);
                                } else {
                                  onNavigate('orders');
                                }
                              }}
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                  {client ? client.clientName : t('common.client')}
                                </p>
                                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                                  {order.id}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                <span className="font-medium text-slate-700">
                                  {order.fabricType}
                                </span>{' '}
                                ·{' '}
                                <span className="font-mono tabular-nums">
                                  {formatNumber(order.greyFabricGaj)}{' '}
                                  {t('dashboard.recentOrders.greyGaj')}
                                </span>{' '}
                                · {formatIsoDate(order.orderDate)}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartCompleteDeliver(order)}
                              className="px-2.5 py-1.5 text-xs font-medium text-[#1e3a8a] bg-white border border-slate-200 hover:border-[#1e3a8a]/40 hover:bg-blue-50/50 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {t('dashboard.recentOrders.deliver')}
                            </button>
                          </div>
                        );
                      })}
                      {readyToDeliverOrders.length > 5 && (
                        <div className="px-5 py-2.5 bg-slate-50/50 text-right">
                          <button
                            type="button"
                            onClick={() => onNavigate('orders')}
                            className="text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer"
                          >
                            +{formatNumber(readyToDeliverOrders.length - 5, 0)}{' '}
                            {t('dashboard.alerts.viewMore')} →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 5: Recent Activity (2-Column Balanced Split for Admin, Full-Width Financial Feed for Accountant) */}
      <div
        className={`grid grid-cols-1 ${
          canSeeOrders ? 'lg:grid-cols-2' : ''
        } gap-6 items-stretch`}
      >
        {/* Recent Orders (Last 5 — Admin / Manager only) */}
        {canSeeOrders && (
          <section className="bg-white border border-slate-200 rounded-lg flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  {t('dashboard.recentOrders.title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('dashboard.recentOrders.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('orders')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                {t('dashboard.recentOrders.allOrders')}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 divide-y divide-slate-200">
              {isLoading ? (
                <div className="p-5 space-y-3 animate-pulse">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 bg-slate-100 rounded" />
                  ))}
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    {t('dashboard.recentOrders.emptyTitle')}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('dashboard.recentOrders.emptyDesc')}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('new-order')}
                    className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('dashboard.recentOrders.createFirst')}
                  </button>
                </div>
              ) : (
                recentOrders.map((order) => {
                  const client = clientsById.get(order.clientId);
                  const gajDisplay =
                    order.status === 'Delivered' && order.finalGaj !== null
                      ? `${formatNumber(order.finalGaj)} ${t('dashboard.recentOrders.finalGaj')}`
                      : `${formatNumber(order.greyFabricGaj)} ${t('dashboard.recentOrders.greyGaj')}`;

                  return (
                    <div
                      key={order.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (client) {
                            onOpenClientLedger(client);
                          } else {
                            onNavigate('orders');
                          }
                        }}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {client ? client.clientName : t('common.client')}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          <span className="font-medium text-slate-700">
                            {order.fabricType}
                          </span>{' '}
                          · {gajDisplay} · {formatIsoDate(order.orderDate)}
                        </p>
                      </button>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p
                            className={`text-xs font-semibold ${getOrderStatusTone(
                              order.status
                            )}`}
                          >
                            {translateOrderStatus(order.status)}
                          </p>
                          <p className="font-mono text-[11px] tabular-nums text-slate-500 mt-0.5">
                            {order.id}
                          </p>
                        </div>
                        {order.status !== 'Delivered' && (
                          <button
                            type="button"
                            onClick={() => onStartCompleteDeliver(order)}
                            className="px-2.5 py-1.5 text-xs font-medium text-[#1e3a8a] bg-white border border-slate-200 hover:border-[#1e3a8a]/40 hover:bg-blue-50/50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {t('dashboard.recentOrders.deliver')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Recent Transactions (Last 5 from money_in & money_out) */}
        <section className="bg-white border border-slate-200 rounded-lg flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('dashboard.recentTxns.title')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('dashboard.recentTxns.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ledger')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
            >
              {t('dashboard.recentTxns.ledgerBook')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 divide-y divide-slate-200">
            {isLoading ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded" />
                ))}
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-900">
                  {t('dashboard.recentTxns.emptyTitle')}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {t('dashboard.recentTxns.emptyDesc')}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('clients')}
                    className="px-3.5 py-2 text-xs font-medium text-[#1e3a8a] bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    {t('dashboard.recentTxns.receivePayment')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('suppliers')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    {t('dashboard.recentTxns.paySupplier')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('expenses')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    {t('dashboard.recentTxns.logExpense')}
                  </button>
                </div>
              </div>
            ) : (
              recentTransactions.map((txn) => {
                const isMoneyIn = txn.kind === 'money_in';
                const isExpense =
                  txn.kind === 'money_out' && txn.subType === 'expense';
                const isAdvance =
                  txn.kind === 'money_out' && txn.subType === 'advance';
                const isSalary =
                  txn.kind === 'money_out' && txn.subType === 'salary';
                const isTransfer =
                  txn.reference.startsWith('TRF-') ||
                  (txn.kind === 'money_out' && txn.subType === 'transfer');
                const isAdjustment =
                  !isTransfer &&
                  (txn.reference.startsWith('REV-') ||
                    (txn.kind === 'money_out' && txn.subType === 'adjustment'));
                const client =
                  isMoneyIn && !isTransfer
                    ? clientsById.get(txn.counterpartyId)
                    : undefined;
                const supplier =
                  !isMoneyIn &&
                  !isExpense &&
                  !isAdvance &&
                  !isSalary &&
                  !isTransfer &&
                  !isAdjustment
                    ? suppliersById.get(txn.counterpartyId)
                    : undefined;

                return (
                  <div
                    key={txn.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isTransfer) {
                          onNavigate('accounts');
                        } else if (isMoneyIn && client) {
                          onOpenClientPayments(client);
                        } else if (isAdvance || isSalary) {
                          if (canSeeEmployees) {
                            onNavigate('employees');
                          }
                        } else if (isExpense) {
                          onNavigate('expenses');
                        } else if (!isMoneyIn && supplier) {
                          onOpenSupplierPayments(supplier);
                        }
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div
                        className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${
                          isMoneyIn
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-red-50 border-red-100 text-red-700'
                        }`}
                      >
                        {isMoneyIn ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {txn.counterpartyName}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          <span
                            className={`font-medium ${
                              isTransfer
                                ? 'text-indigo-700'
                                : isMoneyIn
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {isTransfer
                              ? isMoneyIn
                                ? 'Transfer In'
                                : 'Transfer Out'
                              : isAdjustment
                                ? isMoneyIn
                                  ? t('dashboard.txn.reversalIn')
                                  : t('dashboard.txn.reversalOut')
                                : isMoneyIn
                                  ? t('dashboard.txn.moneyIn')
                                  : isSalary
                                    ? t('dashboard.txn.salaryOut')
                                    : isAdvance
                                      ? t('dashboard.txn.advanceOut')
                                      : isExpense
                                        ? t('dashboard.txn.expenseOut')
                                        : t('dashboard.txn.moneyOut')}
                          </span>{' '}
                          · {translatePaymentMethod(txn.paymentMethod)} ·{' '}
                          {formatIsoDate(txn.paymentDate)}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p
                          className={`font-mono text-sm font-semibold tabular-nums ${
                            isMoneyIn ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isMoneyIn ? '+' : '−'}
                          {formatCurrency(txn.amount)}
                        </p>
                        <p className="font-mono text-[11px] tabular-nums text-slate-500 mt-0.5">
                          {txn.reference}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (txn.kind === 'money_in') {
                            onCorrectMoneyIn(txn.rawRecord);
                          } else {
                            onCorrectMoneyOut(txn.rawRecord);
                          }
                        }}
                        title={t('common.correctAdjust')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        {t('common.correct')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
