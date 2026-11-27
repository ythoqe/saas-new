import { useMemo } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Landmark,
  Plus,
  RotateCcw,
  Truck,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type {
  ClientLedgerEntry,
  ClientRecord,
  EmployeeRecord,
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
import { canViewEmployees, canViewOrders } from '../utils/rbac';

interface DashboardOverviewProps {
  userRole: UserRole;
  ledgerEntries: ClientLedgerEntry[];
  supplierLedgerEntries: SupplierLedgerEntry[];
  orders: OrderRecord[];
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
      subType: 'supplier' | 'expense' | 'advance' | 'salary' | 'adjustment';
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

const RUNNING_STATUSES = new Set<OrderStatus>([
  'Processing',
  'Dyeing',
  'Washing',
]);

function getIsoDateFallbackMs(isoDate: string): number {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(isoDate)) return 0;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
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

export function DashboardOverview({
  userRole,
  ledgerEntries,
  supplierLedgerEntries,
  orders,
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
  const canSeeOrders = canViewOrders(userRole);
  const canSeeEmployees = canViewEmployees(userRole);

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

  // 3A. Recent Orders (Last 5)
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

  // 3B. Recent Transactions (Last 5 combined from money_in and money_out)
  const recentTransactions = useMemo<UnifiedTransaction[]>(() => {
    const incoming: UnifiedTransaction[] = moneyInRecords.map((rec) => {
      const isAdjustment =
        rec.source === 'adjustment' || rec.reference.startsWith('REV-');
      const client = clientsById.get(rec.clientId);
      const label = isAdjustment
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
                onClick={() => onNavigate('expenses')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer whitespace-nowrap"
              >
                {t('dashboard.kpi.expensesLink')}
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

      {/* Section 3: Recent Activity (2-Column Balanced Split for Admin, Full-Width Financial Feed for Accountant) */}
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
                const isAdjustment =
                  txn.reference.startsWith('REV-') ||
                  (txn.kind === 'money_out' && txn.subType === 'adjustment');
                const client = isMoneyIn
                  ? clientsById.get(txn.counterpartyId)
                  : undefined;
                const supplier =
                  !isMoneyIn &&
                  !isExpense &&
                  !isAdvance &&
                  !isSalary &&
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
                        if (isMoneyIn && client) {
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
                              isMoneyIn ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {isAdjustment
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
