import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Banknote,
  Building2,
  CalendarDays,
  Layers,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  TrendingDown,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_VALIDATION,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpenseRecord,
  type MoneyOutRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

interface ExpensesViewProps {
  ownerId: string;
  expenses: ExpenseRecord[];
  moneyOutRecords: MoneyOutRecord[];
  isLoading: boolean;
  focusFormSignal: number;
  onExpenseCreated: (
    expenseRef: string,
    category: ExpenseCategory,
    amount: number,
    paymentMethod: ExpensePaymentMethod
  ) => void;
  onCorrectMoneyOut: (record: MoneyOutRecord) => void;
}

const CATEGORY_BADGE_CLASSES: Record<ExpenseCategory, string> = {
  Salary: 'bg-blue-50 text-[#1e3a8a] border-blue-200',
  Electricity: 'bg-amber-50 text-amber-800 border-amber-200',
  Rent: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Transport: 'bg-sky-50 text-sky-800 border-sky-200',
  Maintenance: 'bg-orange-50 text-orange-800 border-orange-200',
  Food: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Office: 'bg-slate-100 text-slate-700 border-slate-200',
  Other: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

function getCurrentMonthLabel(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  if (!year || !month) return 'This Month';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

function getIsoDateFallbackMs(isoDate: string): number {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(isoDate)) return 0;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function ExpensesView({
  ownerId,
  expenses,
  moneyOutRecords,
  isLoading,
  focusFormSignal,
  onExpenseCreated,
  onCorrectMoneyOut,
}: ExpensesViewProps) {
  const { t, translateExpenseCategory, translatePaymentMethod } = useLanguage();
  const todayIso = getTodayIsoDate();
  const currentYearMonth = todayIso.slice(0, 7);
  const currentMonthLabel = useMemo(
    () => getCurrentMonthLabel(todayIso),
    [todayIso]
  );

  // Add Expense form state
  const [expenseDate, setExpenseDate] = useState(() => getTodayIsoDate());
  const [category, setCategory] = useState<ExpenseCategory>('Salary');
  const [amountInput, setAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<ExpensePaymentMethod>('Cash');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expense list filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusFormSignal > 0 && amountInputRef.current) {
      amountInputRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      amountInputRef.current.focus();
    }
  }, [focusFormSignal]);

  const parsedAmount = Number(amountInput);
  const isValidAmount =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= EXPENSE_VALIDATION.maxAmount;
  const cleanAmount = isValidAmount ? roundCurrency(parsedAmount) : null;

  const methodIcons: Record<ExpensePaymentMethod, typeof Banknote> = {
    Cash: Banknote,
    Bank: Building2,
  };

  // Real-time KPIs & category breakdown
  const stats = useMemo(() => {
    let thisMonthTotal = 0;
    let thisMonthCount = 0;
    let allTimeTotal = 0;
    let thisMonthCash = 0;
    let thisMonthBank = 0;
    const categoryTotalsThisMonth = new Map<ExpenseCategory, number>();
    const categoryTotalsAllTime = new Map<ExpenseCategory, number>();

    for (const exp of expenses) {
      const amt = Number(exp.amount) || 0;
      allTimeTotal += amt;
      categoryTotalsAllTime.set(
        exp.category,
        roundCurrency((categoryTotalsAllTime.get(exp.category) ?? 0) + amt)
      );

      if (exp.expenseDate.startsWith(currentYearMonth)) {
        thisMonthTotal += amt;
        thisMonthCount += 1;
        if (exp.paymentMethod === 'Cash') {
          thisMonthCash += amt;
        } else {
          thisMonthBank += amt;
        }
        categoryTotalsThisMonth.set(
          exp.category,
          roundCurrency((categoryTotalsThisMonth.get(exp.category) ?? 0) + amt)
        );
      }
    }

    let topCategory: { name: ExpenseCategory; amount: number } | null = null;
    for (const [cat, total] of categoryTotalsThisMonth.entries()) {
      if (!topCategory || total > topCategory.amount) {
        topCategory = { name: cat, amount: total };
      }
    }

    const sortedCategories = Array.from(categoryTotalsAllTime.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      thisMonthTotal: roundCurrency(thisMonthTotal),
      thisMonthCount,
      allTimeTotal: roundCurrency(allTimeTotal),
      allTimeCount: expenses.length,
      thisMonthCash: roundCurrency(thisMonthCash),
      thisMonthBank: roundCurrency(thisMonthBank),
      topCategory,
      sortedCategories,
    };
  }, [expenses, currentYearMonth]);

  // Sorted & filtered expenses list
  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...expenses]
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ??
          getIsoDateFallbackMs(a.expenseDate);
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ??
          getIsoDateFallbackMs(b.expenseDate);
        return timeB - timeA;
      })
      .filter((exp) => {
        if (
          categoryFilter !== 'all' &&
          exp.category !== (categoryFilter as ExpenseCategory)
        ) {
          return false;
        }
        if (
          methodFilter !== 'all' &&
          exp.paymentMethod !== (methodFilter as ExpensePaymentMethod)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          exp.reference.toLowerCase().includes(q) ||
          exp.category.toLowerCase().includes(q) ||
          exp.description.toLowerCase().includes(q) ||
          exp.expenseDate.toLowerCase().includes(q) ||
          exp.paymentMethod.toLowerCase().includes(q)
        );
      });
  }, [expenses, searchQuery, categoryFilter, methodFilter]);

  const filteredSubtotal = useMemo(() => {
    let sum = 0;
    for (const exp of filteredExpenses) {
      sum += Number(exp.amount) || 0;
    }
    return roundCurrency(sum);
  }, [filteredExpenses]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    categoryFilter !== 'all' ||
    methodFilter !== 'all';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!EXPENSE_VALIDATION.datePattern.test(expenseDate)) {
      setFormError('Expense date must be in YYYY-MM-DD format.');
      return;
    }

    if (!EXPENSE_CATEGORIES.includes(category)) {
      setFormError('Please select a valid expense category.');
      return;
    }

    if (cleanAmount === null) {
      setFormError(
        `Please enter a valid amount greater than 0 and at most ${formatCurrency(EXPENSE_VALIDATION.maxAmount)}.`
      );
      return;
    }

    if (!EXPENSE_PAYMENT_METHODS.includes(paymentMethod)) {
      setFormError('Please choose Cash or Bank as payment method.');
      return;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > EXPENSE_VALIDATION.descriptionMax) {
      setFormError(
        `Description must be at most ${EXPENSE_VALIDATION.descriptionMax} characters.`
      );
      return;
    }

    const rawAutoId = doc(collection(db, 'expenses')).id
      .slice(0, 8)
      .toUpperCase();
    const expenseRef = `EXP-${rawAutoId}`;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const expenseDocRef = doc(db, 'expenses', expenseRef);
      const moneyOutDocRef = doc(db, 'money_out', expenseRef);

      // 1. Save factory expense record in append-only expenses collection
      batch.set(expenseDocRef, {
        ownerId,
        moneyOutId: expenseRef,
        reference: expenseRef,
        expenseDate,
        category,
        amount: cleanAmount,
        paymentMethod,
        description: trimmedDescription,
        createdAt: serverTimestamp(),
      });

      // 2. Atomically insert matching outflow in money_out so Net Cash Balance updates immediately
      batch.set(moneyOutDocRef, {
        ownerId,
        expenseId: expenseRef,
        category,
        reference: expenseRef,
        amount: cleanAmount,
        paymentDate: expenseDate,
        paymentMethod,
        note: trimmedDescription,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `expenses/${expenseRef}`
        );
      }

      setAmountInput('');
      setDescription('');
      onExpenseCreated(expenseRef, category, cleanAmount, paymentMethod);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to record factory expense.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section aria-label="Expense summary metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* Total Expense This Month */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('expenses.kpi.thisMonth')}
              </p>
              <CalendarDays className="w-4 h-4 text-red-600 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-red-700">
              {isLoading ? '—' : formatCurrency(stats.thisMonthTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {currentMonthLabel} · {stats.thisMonthCount}{' '}
              {stats.thisMonthCount === 1
                ? t('common.entry')
                : t('common.entries')}
            </p>
          </div>

          {/* Cash vs Bank Outflow (This Month) */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('expenses.kpi.paymentSplit')}
              </p>
              <Banknote className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : formatCurrency(stats.thisMonthCash)}{' '}
              <span className="text-xs font-sans font-normal text-slate-500">
                {translatePaymentMethod('Cash')}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {translatePaymentMethod('Bank')}{' '}
              {isLoading ? '—' : formatCurrency(stats.thisMonthBank)}
            </p>
          </div>

          {/* Top Category This Month */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('expenses.kpi.topCategory')}
              </p>
              <Layers className="w-4 h-4 text-[#1e3a8a] shrink-0" />
            </div>
            <p className="mt-2 font-display text-xl font-semibold text-slate-900 truncate">
              {isLoading
                ? '—'
                : stats.topCategory
                  ? translateExpenseCategory(stats.topCategory.name)
                  : t('common.noneYet')}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {isLoading
                ? '—'
                : stats.topCategory
                  ? formatCurrency(stats.topCategory.amount)
                  : t('expenses.kpi.noExpensesMonth')}
            </p>
          </div>

          {/* All-Time Factory Expenses */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                {t('expenses.kpi.allTime')}
              </p>
              <TrendingDown className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : formatCurrency(stats.allTimeTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.allTimeCount} {t('expenses.kpi.syncedSub')}{' '}
              {stats.allTimeCount === 1
                ? t('common.record')
                : t('common.records')}
            </p>
          </div>
        </div>
      </section>

      {/* Main Responsive Split: Add Expense Form (Left) + Expense List (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Add Expense Form Card */}
        <section
          aria-labelledby="add-expense-heading"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200">
            <h2
              id="add-expense-heading"
              className="font-display text-base font-semibold text-slate-900"
            >
              {t('expenses.form.title')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('expenses.form.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {formError}
              </div>
            )}

            {/* Date & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              <div>
                <label
                  htmlFor="expenseDate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('expenses.form.date')}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="expenseDate"
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="expenseCategory"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t('expenses.form.category')}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <select
                  id="expenseCategory"
                  required
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as ExpenseCategory)
                  }
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {translateExpenseCategory(cat)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label
                htmlFor="expenseAmount"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('expenses.form.amount')}{' '}
                <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                  ৳
                </span>
                <input
                  ref={amountInputRef}
                  id="expenseAmount"
                  type="number"
                  required
                  min="0.01"
                  max={EXPENSE_VALIDATION.maxAmount}
                  step="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            </div>

            {/* Payment Method (Cash / Bank) */}
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('expenses.form.paymentMethod')}{' '}
                <span className="text-red-600">*</span>
              </span>
              <div
                role="group"
                aria-label="Expense payment method"
                className="grid grid-cols-2 gap-2.5"
              >
                {EXPENSE_PAYMENT_METHODS.map((method) => {
                  const Icon = methodIcons[method];
                  const selected = paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{translatePaymentMethod(method)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description / Note */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="expenseDescription"
                  className="block text-sm font-medium text-slate-700"
                >
                  {t('expenses.form.description')}
                </label>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {description.length}/{EXPENSE_VALIDATION.descriptionMax}
                </span>
              </div>
              <textarea
                id="expenseDescription"
                rows={3}
                maxLength={EXPENSE_VALIDATION.descriptionMax}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('expenses.form.descriptionPlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a] resize-none"
              />
            </div>

            {/* Atomic Cash Flow Callout */}
            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 leading-relaxed">
              Atomic batch writes to{' '}
              <span className="font-mono text-slate-800">expenses</span> and{' '}
              <span className="font-mono text-slate-800">money_out</span> with
              reference <span className="font-mono">EXP-[AutoID]</span>,
              updating Net Cash Balance immediately.
            </div>

            <button
              type="submit"
              disabled={isSubmitting || cleanAmount === null}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              {isSubmitting
                ? t('expenses.form.saving')
                : t('expenses.form.recordBtn')}
            </button>
          </form>
        </section>

        {/* Expense List & Category Breakdown (Right) */}
        <section
          aria-labelledby="expense-list-heading"
          className="xl:col-span-8 space-y-5"
        >
          {/* Category Breakdown Strip (when expenses exist) */}
          {!isLoading && stats.sortedCategories.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 sm:px-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  {t('expenses.spendByCategory')}
                </h3>
                {categoryFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className="text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer"
                  >
                    {t('expenses.showAllCategories')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.sortedCategories.map((item) => {
                  const isSelected = categoryFilter === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() =>
                        setCategoryFilter(isSelected ? 'all' : item.name)
                      }
                      className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-medium">
                        {translateExpenseCategory(item.name)}
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          isSelected ? 'text-blue-100' : 'text-slate-500'
                        }`}
                      >
                        {formatCurrency(item.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expense Table Card */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-4 sm:px-5 border-b border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="expense-list-heading"
                    className="font-display text-base font-semibold text-slate-900"
                  >
                    {t('expenses.list.title')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('expenses.list.subtitle')}
                  </p>
                </div>
                {hasActiveFilters && (
                  <span className="font-mono text-xs font-semibold tabular-nums text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md">
                    {t('expenses.list.filtered')}:{' '}
                    {formatCurrency(filteredSubtotal)}
                  </span>
                )}
              </div>

              {/* Filter Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('expenses.searchPlaceholder')}
                    aria-label="Search expenses"
                    className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>

                <select
                  aria-label="Filter expenses by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  <option value="all">
                    {t('expenses.filter.allCategories')}
                  </option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {translateExpenseCategory(cat)}
                    </option>
                  ))}
                </select>

                <div
                  role="group"
                  aria-label="Filter expenses by payment method"
                  className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start sm:self-auto"
                >
                  <button
                    type="button"
                    onClick={() => setMethodFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      methodFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t('common.all')}
                  </button>
                  {EXPENSE_PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setMethodFilter(method)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        methodFilter === method
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {translatePaymentMethod(method)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="divide-y divide-slate-200">
                {[1, 2, 3, 4].map((row) => (
                  <div
                    key={row}
                    className="px-5 py-4 flex justify-between gap-4 animate-pulse"
                  >
                    <div className="h-4 w-48 bg-slate-200 rounded" />
                    <div className="h-4 w-24 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : expenses.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
                  <Receipt className="w-5 h-5" />
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t('expenses.empty.title')}
                </h3>
                <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
                  {t('expenses.empty.desc')}
                </p>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="py-14 px-6 text-center">
                <p className="text-sm font-medium text-slate-900">
                  {t('expenses.empty.noMatch')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setMethodFilter('all');
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
                      <th className="py-3 px-5">{t('common.refAndDate')}</th>
                      <th className="py-3 px-4">
                        {t('expenses.table.category')}
                      </th>
                      <th className="py-3 px-4">
                        {t('expenses.table.description')}
                      </th>
                      <th className="py-3 px-4">{t('common.method')}</th>
                      <th className="py-3 px-4 text-right">
                        {t('common.amount')}
                      </th>
                      <th className="py-3 px-5 text-right">
                        {t('common.action')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredExpenses.map((exp) => {
                      const linkedMoneyOut =
                        moneyOutRecords.find(
                          (m) =>
                            m.id === exp.moneyOutId ||
                            m.expenseId === exp.id ||
                            m.reference === exp.reference
                        ) ?? null;
                      return (
                        <tr
                          key={exp.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <p className="font-mono text-xs font-semibold text-slate-900">
                              {exp.reference}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {formatIsoDate(exp.expenseDate)}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded border ${
                                CATEGORY_BADGE_CLASSES[exp.category] ??
                                'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {translateExpenseCategory(exp.category)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs break-words">
                            {exp.description || '—'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                              {exp.paymentMethod === 'Bank' ? (
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <Banknote className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              {translatePaymentMethod(exp.paymentMethod)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold tabular-nums text-red-700 whitespace-nowrap">
                            −{formatCurrency(exp.amount)}
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            {linkedMoneyOut ? (
                              <button
                                type="button"
                                onClick={() => onCorrectMoneyOut(linkedMoneyOut)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                {t('common.correctAdjust')}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
