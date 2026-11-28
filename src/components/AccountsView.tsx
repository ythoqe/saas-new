import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  FileCheck2,
  Landmark,
  Plus,
  RotateCcw,
  Search,
  Smartphone,
  Wallet,
} from 'lucide-react';
import type {
  AccountRecord,
  ChequeRecord,
  ClientRecord,
  EmployeeRecord,
  MoneyInRecord,
  MoneyOutRecord,
  PaymentMethod,
  SupplierRecord,
} from '../types/mill';
import {
  computeDynamicAccountStats,
  getEffectiveAccounts,
  resolveCounterAccountDisplayName,
  resolveTransactionAccount,
} from '../utils/accounts';
import {
  formatCurrency,
  formatIsoDate,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';
import type { ChequeActionKind } from './ChequeActionModal';
import { ChequesPanel } from './ChequesPanel';

type AccountsTab = 'accounts' | 'cheques';
type FlowFilter = 'all' | 'in' | 'out' | 'transfer';

interface AccountsViewProps {
  accounts: AccountRecord[];
  moneyInRecords: MoneyInRecord[];
  moneyOutRecords: MoneyOutRecord[];
  cheques: ChequeRecord[];
  clientsById: Map<string, ClientRecord>;
  suppliersById: Map<string, SupplierRecord>;
  employeesById: Map<string, EmployeeRecord>;
  isLoading: boolean;
  canAdjustLedgers: boolean;
  onOpenAddAccount: () => void;
  onOpenTransfer: (defaultFromAccountId?: string) => void;
  onOpenReceiveCheque: () => void;
  onTriggerChequeAction: (
    cheque: ChequeRecord,
    action: ChequeActionKind
  ) => void;
  onCorrectMoneyIn: (record: MoneyInRecord) => void;
  onCorrectMoneyOut: (record: MoneyOutRecord) => void;
}

interface AccountLedgerRow {
  id: string;
  direction: 'in' | 'out';
  isTransfer: boolean;
  isOpening?: boolean;
  isoDate: string;
  createdMs: number;
  reference: string;
  accountId: string;
  accountName: string;
  accountType: PaymentMethod;
  categoryLabel: string;
  particulars: string;
  note: string;
  moneyIn: number;
  moneyOut: number;
  runningBalance: number;
  rawMoneyIn?: MoneyInRecord;
  rawMoneyOut?: MoneyOutRecord;
}

const ISO_DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const ACCOUNT_TYPE_META: Record<
  PaymentMethod,
  {
    subtitle: string;
    icon: typeof Wallet;
    accentBg: string;
    accentText: string;
    accentBorder: string;
  }
> = {
  Cash: {
    subtitle: 'Cash Account',
    icon: Wallet,
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    accentBorder: 'border-emerald-200',
  },
  Bank: {
    subtitle: 'Bank Account',
    icon: Landmark,
    accentBg: 'bg-blue-50',
    accentText: 'text-[#1e3a8a]',
    accentBorder: 'border-blue-200',
  },
  'Mobile Banking': {
    subtitle: 'Mobile Banking',
    icon: Smartphone,
    accentBg: 'bg-amber-50',
    accentText: 'text-amber-700',
    accentBorder: 'border-amber-200',
  },
};

function dateToLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolveRecordIsoDate(
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

export function AccountsView({
  accounts,
  moneyInRecords,
  moneyOutRecords,
  cheques,
  clientsById,
  suppliersById,
  employeesById,
  isLoading,
  canAdjustLedgers,
  onOpenAddAccount,
  onOpenTransfer,
  onOpenReceiveCheque,
  onTriggerChequeAction,
  onCorrectMoneyIn,
  onCorrectMoneyOut,
}: AccountsViewProps) {
  const [activeTab, setActiveTab] = useState<AccountsTab>('accounts');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('All');
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accounts),
    [accounts]
  );

  const activeAccountFilter = useMemo(() => {
    if (selectedAccountId === 'All') return 'All';
    const exists = effectiveAccounts.some((a) => a.id === selectedAccountId);
    return exists ? selectedAccountId : 'All';
  }, [selectedAccountId, effectiveAccounts]);

  const activeChequeCount = useMemo(
    () =>
      cheques.filter(
        (c) => c.status === 'Pending' || c.status === 'Endorsed to Supplier'
      ).length,
    [cheques]
  );

  // Dynamic per-account balances from Firestore accounts collection
  const accountStats = useMemo(
    () =>
      computeDynamicAccountStats(
        effectiveAccounts,
        moneyInRecords,
        moneyOutRecords
      ),
    [effectiveAccounts, moneyInRecords, moneyOutRecords]
  );

  const selectedAccountObj = useMemo(
    () =>
      activeAccountFilter === 'All'
        ? null
        : effectiveAccounts.find((a) => a.id === activeAccountFilter) ?? null,
    [activeAccountFilter, effectiveAccounts]
  );

  // Unified Account Ledger with chronological running balance per selected account scope
  const ledgerRows = useMemo<AccountLedgerRow[]>(() => {
    const rawRows: Omit<AccountLedgerRow, 'runningBalance'>[] = [];

    // Include Opening Balance entries for accounts with openingBalance > 0
    for (const acc of effectiveAccounts) {
      if (activeAccountFilter !== 'All' && acc.id !== activeAccountFilter) {
        continue;
      }
      const opening = roundCurrency(Number(acc.openingBalance) || 0);
      if (opening > 0) {
        const createdDate = timestampToDate(acc.createdAt);
        const isoDate = createdDate ? dateToLocalIso(createdDate) : '2000-01-01';
        rawRows.push({
          id: `open_${acc.id}`,
          direction: 'in',
          isTransfer: false,
          isOpening: true,
          isoDate,
          createdMs: createdDate?.getTime() ?? 0,
          reference: `OPEN-${acc.id.slice(0, 8).toUpperCase()}`,
          accountId: acc.id,
          accountName: acc.accountName,
          accountType: acc.accountType,
          categoryLabel: 'Opening Balance',
          particulars: `Opening Balance — ${acc.accountName}`,
          note: `Initial ${acc.accountType} account opening balance`,
          moneyIn: opening,
          moneyOut: 0,
        });
      }
    }

    for (const rec of moneyInRecords) {
      const resolvedAcc = resolveTransactionAccount(rec, effectiveAccounts);
      const accId = resolvedAcc?.id ?? '';
      const accName = resolvedAcc?.accountName ?? rec.accountName ?? rec.paymentMethod;
      const accType = resolvedAcc?.accountType ?? rec.paymentMethod;

      if (activeAccountFilter !== 'All' && accId !== activeAccountFilter) {
        continue;
      }

      const isoDate = resolveRecordIsoDate(rec.paymentDate, rec.createdAt);
      const isTransfer =
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-');
      const isAdjustment =
        !isTransfer &&
        (rec.source === 'adjustment' || rec.reference.startsWith('REV-'));

      let categoryLabel = 'Client Payment';
      let particulars = '';

      if (isTransfer) {
        categoryLabel = 'Transfer';
        const counterLabel = resolveCounterAccountDisplayName(
          rec,
          effectiveAccounts
        );
        particulars = `Transfer In from ${counterLabel}`;
      } else if (isAdjustment) {
        categoryLabel = 'Adjustment';
        particulars = rec.note?.trim() || 'Cash Inflow Reversal Adjustment';
      } else {
        const client = rec.clientId ? clientsById.get(rec.clientId) : undefined;
        particulars = client
          ? `${client.clientName}${client.companyName ? ` (${client.companyName})` : ''}`
          : 'Client Receipt';
      }

      rawRows.push({
        id: `in_${rec.id}`,
        direction: 'in',
        isTransfer,
        isoDate,
        createdMs: timestampToDate(rec.createdAt)?.getTime() ?? 0,
        reference: rec.reference || rec.id,
        accountId: accId,
        accountName: accName,
        accountType: accType,
        categoryLabel,
        particulars,
        note: rec.note || '',
        moneyIn: roundCurrency(Number(rec.amount) || 0),
        moneyOut: 0,
        rawMoneyIn: rec,
      });
    }

    for (const rec of moneyOutRecords) {
      const resolvedAcc = resolveTransactionAccount(rec, effectiveAccounts);
      const accId = resolvedAcc?.id ?? '';
      const accName = resolvedAcc?.accountName ?? rec.accountName ?? rec.paymentMethod;
      const accType = resolvedAcc?.accountType ?? rec.paymentMethod;

      if (activeAccountFilter !== 'All' && accId !== activeAccountFilter) {
        continue;
      }

      const isoDate = resolveRecordIsoDate(rec.paymentDate, rec.createdAt);
      const isTransfer =
        rec.source === 'transfer' ||
        rec.category === 'Transfer' ||
        rec.reference.startsWith('TRF-');

      let categoryLabel = 'Outflow';
      let particulars = '';

      if (isTransfer) {
        categoryLabel = 'Transfer';
        const counterLabel = resolveCounterAccountDisplayName(
          rec,
          effectiveAccounts
        );
        particulars = `Transfer Out to ${counterLabel}`;
      } else if (rec.source === 'adjustment') {
        categoryLabel = 'Adjustment';
        particulars = rec.note?.trim() || 'Cash Outflow Reversal Adjustment';
      } else if (rec.source === 'supplier') {
        categoryLabel = 'Supplier Payment';
        const supplier = rec.supplierId
          ? suppliersById.get(rec.supplierId)
          : undefined;
        particulars = supplier
          ? `${supplier.supplierName}${supplier.companyName ? ` (${supplier.companyName})` : ''}`
          : 'Supplier Payment';
      } else if (rec.source === 'salary') {
        categoryLabel = 'Salary';
        const employee = rec.employeeId
          ? employeesById.get(rec.employeeId)
          : undefined;
        particulars = employee
          ? `${employee.name} (${employee.department})`
          : rec.note?.trim() || 'Employee Salary';
      } else if (rec.source === 'advance') {
        categoryLabel = 'Employee Advance';
        const employee = rec.employeeId
          ? employeesById.get(rec.employeeId)
          : undefined;
        particulars = employee
          ? `${employee.name} (${employee.department})`
          : rec.note?.trim() || 'Employee Advance';
      } else {
        categoryLabel = rec.category || 'Factory Expense';
        particulars = rec.note?.trim() || `${categoryLabel} Expense`;
      }

      rawRows.push({
        id: `out_${rec.id}`,
        direction: 'out',
        isTransfer,
        isoDate,
        createdMs: timestampToDate(rec.createdAt)?.getTime() ?? 0,
        reference: rec.reference || rec.id,
        accountId: accId,
        accountName: accName,
        accountType: accType,
        categoryLabel,
        particulars,
        note: rec.note || '',
        moneyIn: 0,
        moneyOut: roundCurrency(Number(rec.amount) || 0),
        rawMoneyOut: rec,
      });
    }

    // Sort chronologically ascending (with opening balances first) to compute exact running balance
    rawRows.sort((a, b) => {
      if (Boolean(a.isOpening) !== Boolean(b.isOpening)) {
        return a.isOpening ? -1 : 1;
      }
      if (a.isoDate !== b.isoDate) return a.isoDate.localeCompare(b.isoDate);
      if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs;
      return a.id.localeCompare(b.id);
    });

    let running = 0;
    const withBalance: AccountLedgerRow[] = rawRows.map((row) => {
      running = roundCurrency(running + row.moneyIn - row.moneyOut);
      return {
        ...row,
        runningBalance: running,
      };
    });

    // Present most recent transactions at the top
    return withBalance.reverse();
  }, [
    effectiveAccounts,
    moneyInRecords,
    moneyOutRecords,
    clientsById,
    suppliersById,
    employeesById,
    activeAccountFilter,
  ]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ledgerRows.filter((row) => {
      if (flowFilter === 'in' && row.direction !== 'in') return false;
      if (flowFilter === 'out' && row.direction !== 'out') return false;
      if (flowFilter === 'transfer' && !row.isTransfer) return false;
      if (!q) return true;
      return (
        row.reference.toLowerCase().includes(q) ||
        row.particulars.toLowerCase().includes(q) ||
        row.categoryLabel.toLowerCase().includes(q) ||
        row.accountName.toLowerCase().includes(q) ||
        row.accountType.toLowerCase().includes(q) ||
        row.note.toLowerCase().includes(q)
      );
    });
  }, [ledgerRows, flowFilter, searchQuery]);

  const filteredTotals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const row of filteredRows) {
      totalIn += row.moneyIn;
      totalOut += row.moneyOut;
    }
    return {
      totalIn: roundCurrency(totalIn),
      totalOut: roundCurrency(totalOut),
      net: roundCurrency(totalIn - totalOut),
    };
  }, [filteredRows]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <div className="w-7 h-7 border-2 border-slate-300 border-t-[#1e3a8a] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">
          Loading accounts &amp; balances...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module Sub-Navigation: Accounts & Transfers vs Cheques + Add New Account Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'accounts'
                ? 'bg-white text-[#1e3a8a] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            Accounts &amp; Transfers
            <span
              className={`px-1.5 py-0.5 text-[11px] font-semibold rounded tabular-nums ${
                activeTab === 'accounts'
                  ? 'bg-blue-50 text-[#1e3a8a]'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {formatNumber(accountStats.list.length, 0)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cheques')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'cheques'
                ? 'bg-white text-[#1e3a8a] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="w-4 h-4 shrink-0" />
            Cheques
            {activeChequeCount > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[11px] font-semibold rounded tabular-nums ${
                  activeTab === 'cheques'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-amber-200/80 text-amber-900'
                }`}
              >
                {formatNumber(activeChequeCount, 0)}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab === 'accounts' && activeChequeCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('cheques')}
              className="text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-md transition-colors cursor-pointer"
            >
              {formatNumber(activeChequeCount, 0)} active cheque
              {activeChequeCount === 1 ? '' : 's'} awaiting clearance →
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAddAccount}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4 shrink-0" />
            + Add New Account
          </button>
        </div>
      </div>

      {activeTab === 'cheques' ? (
        <ChequesPanel
          cheques={cheques}
          onOpenReceiveCheque={onOpenReceiveCheque}
          onTriggerAction={onTriggerChequeAction}
        />
      ) : (
        <>
          {/* Dynamic Account Balance Cards rendered from accounts collection */}
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accountStats.list.map((stats) => {
              const { account } = stats;
              const meta =
                ACCOUNT_TYPE_META[account.accountType] ??
                ACCOUNT_TYPE_META.Bank;
              const Icon = meta.icon;
              const isSelected = activeAccountFilter === account.id;
              const isNegative = stats.balance < 0;
              const displayTotalIn = roundCurrency(
                stats.openingBalance + stats.totalIn
              );

              return (
                <div
                  key={account.id}
                  className={`bg-white rounded-lg border transition-all p-5 flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#1e3a8a] ring-2 ring-[#1e3a8a]/15 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {account.accountName}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.accentBg} ${meta.accentText} ${meta.accentBorder}`}
                          >
                            {account.accountType}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {stats.openingBalance > 0
                            ? `Opening Balance: ${formatCurrency(stats.openingBalance)}`
                            : meta.subtitle}
                        </p>
                      </div>
                      <div
                        className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${meta.accentBg} ${meta.accentBorder} ${meta.accentText}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        Current Live Balance
                      </p>
                      <p
                        className={`mt-1 text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
                          isNegative ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {formatCurrency(stats.balance)}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs tabular-nums">
                      <div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                          Total In
                        </p>
                        <p className="font-semibold text-emerald-700 mt-0.5">
                          {formatCurrency(displayTotalIn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <ArrowUpRight className="w-3 h-3 text-red-600" />
                          Total Out
                        </p>
                        <p className="font-semibold text-red-700 mt-0.5">
                          {formatCurrency(stats.totalOut)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedAccountId(isSelected ? 'All' : account.id)
                      }
                      className={`text-xs font-medium cursor-pointer transition-colors ${
                        isSelected
                          ? 'text-[#1e3a8a] font-semibold'
                          : 'text-slate-600 hover:text-[#1e3a8a]'
                      }`}
                    >
                      {isSelected
                        ? 'Showing in Ledger ✓'
                        : `View Ledger (${formatNumber(stats.txnCount, 0)})`}
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenTransfer(account.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1e3a8a] bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 rounded-md transition-colors cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      Transfer
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Combined Liquidity Strip + Primary Transfer & Add Account CTAs */}
          <section className="bg-slate-900 text-white rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Combined Liquid Balance ({accountStats.list.length}{' '}
                  {accountStats.list.length === 1 ? 'Account' : 'Accounts'})
                </p>
                <p
                  className={`text-xl sm:text-2xl font-bold tabular-nums mt-0.5 ${
                    accountStats.combinedBalance >= 0
                      ? 'text-emerald-300'
                      : 'text-red-300'
                  }`}
                >
                  {formatCurrency(accountStats.combinedBalance)}
                </p>
              </div>
              <div className="hidden sm:block h-9 w-px bg-slate-700" />
              <div className="text-xs text-slate-300 tabular-nums space-y-0.5">
                <p>
                  Total Money In (incl. Opening):{' '}
                  <strong className="text-emerald-300">
                    {formatCurrency(
                      roundCurrency(
                        accountStats.combinedOpening + accountStats.combinedIn
                      )
                    )}
                  </strong>
                </p>
                <p>
                  Total Money Out:{' '}
                  <strong className="text-red-300">
                    {formatCurrency(accountStats.combinedOut)}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onOpenAddAccount}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                + Add New Account
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenTransfer(
                    activeAccountFilter === 'All'
                      ? effectiveAccounts[0]?.id
                      : activeAccountFilter
                  )
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] hover:bg-blue-700 border border-blue-400/30 rounded-md transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Account Transfer
              </button>
            </div>
          </section>

          {/* Tabular Account Ledger */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {/* Ledger Header & Dynamic Account Filter */}
            <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Account Ledger
                    {selectedAccountObj
                      ? ` — ${selectedAccountObj.accountName} (${selectedAccountObj.accountType})`
                      : ' — All Accounts'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    All money_in and money_out transactions across client
                    receipts, supplier payments, expenses, payroll, and
                    inter-account transfers
                  </p>
                </div>

                {/* Dynamic Account Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId('All')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      activeAccountFilter === 'All'
                        ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    All Accounts
                  </button>
                  {effectiveAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                        activeAccountFilter === acc.id
                          ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {acc.accountName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by reference, account name, client, supplier, category, or note..."
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                  />
                </div>

                {/* Flow Type Filter */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'All Entries' },
                      { id: 'in', label: 'Money In' },
                      { id: 'out', label: 'Money Out' },
                      { id: 'transfer', label: 'Transfers Only' },
                    ] as const
                  ).map((flow) => (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => setFlowFilter(flow.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                        flowFilter === flow.id
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {flow.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 whitespace-nowrap">Reference</th>
                    <th className="px-4 py-3 whitespace-nowrap">Account</th>
                    <th className="px-4 py-3">Category &amp; Particulars</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      Money In (জমা)
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      Money Out (খরচ)
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      Balance
                    </th>
                    {canAdjustLedgers && (
                      <th className="px-4 py-3 text-right whitespace-nowrap">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canAdjustLedgers ? 8 : 7}
                        className="px-4 py-12 text-center text-sm text-slate-500"
                      >
                        No transactions match the selected account and filter
                        criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const typeMeta =
                        ACCOUNT_TYPE_META[row.accountType] ??
                        ACCOUNT_TYPE_META.Bank;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            {formatIsoDate(row.isoDate)}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-700 whitespace-nowrap">
                            {row.reference}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${typeMeta.accentBg} ${typeMeta.accentText} ${typeMeta.accentBorder}`}
                            >
                              {row.accountName}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[220px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                  row.isTransfer
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : row.direction === 'in'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {row.categoryLabel}
                              </span>
                              <span className="text-xs font-medium text-slate-900">
                                {row.particulars}
                              </span>
                            </div>
                            {row.note && row.note !== row.particulars && (
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-md">
                                {row.note}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                            {row.moneyIn > 0
                              ? formatCurrency(row.moneyIn)
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-red-700 whitespace-nowrap">
                            {row.moneyOut > 0
                              ? formatCurrency(row.moneyOut)
                              : '—'}
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
                          {canAdjustLedgers && (
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {row.rawMoneyIn && !row.isTransfer && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCorrectMoneyIn(row.rawMoneyIn!)
                                  }
                                  title="Create append-only reversal adjustment"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Adjust
                                </button>
                              )}
                              {row.rawMoneyOut && !row.isTransfer && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCorrectMoneyOut(row.rawMoneyOut!)
                                  }
                                  title="Create append-only reversal adjustment"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Adjust
                                </button>
                              )}
                              {(row.isTransfer || row.isOpening) && (
                                <span className="text-[11px] text-slate-400">
                                  {row.isOpening ? 'Opening' : 'Paired'}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr className="text-xs font-bold text-slate-900">
                    <td colSpan={4} className="px-4 py-3 text-right">
                      Filtered Totals ({formatNumber(filteredRows.length, 0)}{' '}
                      {filteredRows.length === 1 ? 'entry' : 'entries'})
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatCurrency(filteredTotals.totalIn)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-700 whitespace-nowrap">
                      {formatCurrency(filteredTotals.totalOut)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${
                        filteredTotals.net >= 0
                          ? 'text-slate-950'
                          : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(filteredTotals.net)}
                    </td>
                    {canAdjustLedgers && <td className="px-4 py-3" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
