import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Wallet,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  SALARY_PAYMENT_METHODS,
  SALARY_VALIDATION,
  type AccountRecord,
  type EmployeeAdvanceRecord,
  type EmployeeRecord,
  type SalaryPaymentMethod,
  type SalaryPaymentRecord,
} from '../types/mill';
import { getEffectiveAccounts } from '../utils/accounts';
import {
  formatCurrency,
  formatIsoDate,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

interface PaySalaryModalProps {
  employee: EmployeeRecord | null;
  advances: EmployeeAdvanceRecord[];
  salaryPayments: SalaryPaymentRecord[];
  ownerId: string;
  accounts: AccountRecord[];
  onClose: () => void;
  onSalaryPaid: (
    employee: EmployeeRecord,
    salaryMonth: string,
    netSalary: number,
    salaryRef: string,
    paymentMethod: SalaryPaymentMethod,
    deductedCount: number
  ) => void;
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return yearMonth;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

export function PaySalaryModal({
  employee,
  advances,
  salaryPayments,
  ownerId,
  accounts,
  onClose,
  onSalaryPaid,
}: PaySalaryModalProps) {
  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accounts, ownerId),
    [accounts, ownerId]
  );

  const [salaryMonth, setSalaryMonth] = useState(() =>
    getTodayIsoDate().slice(0, 7)
  );
  const [basicSalaryInput, setBasicSalaryInput] = useState('');
  const [overtimeInput, setOvertimeInput] = useState('0');
  const [bonusInput, setBonusInput] = useState('0');
  const [advanceDeductionInput, setAdvanceDeductionInput] = useState('0');
  const [markAdvancesDeducted, setMarkAdvancesDeducted] = useState(true);
  const [paymentDate, setPaymentDate] = useState(() => getTodayIsoDate());
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    () => effectiveAccounts[0]?.id ?? 'default_cash'
  );
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Undeducted advances for this employee in the chosen month
  const pendingMonthAdvances = useMemo(() => {
    if (!employee || !SALARY_VALIDATION.monthPattern.test(salaryMonth)) {
      return [];
    }
    return advances
      .filter(
        (adv) =>
          adv.employeeId === employee.id &&
          adv.advanceDate.startsWith(salaryMonth) &&
          !adv.deducted
      )
      .sort((a, b) => a.advanceDate.localeCompare(b.advanceDate));
  }, [employee, advances, salaryMonth]);

  // Already-deducted advances in the chosen month (for transparency)
  const alreadyDeductedMonthAdvances = useMemo(() => {
    if (!employee || !SALARY_VALIDATION.monthPattern.test(salaryMonth)) {
      return [];
    }
    return advances.filter(
      (adv) =>
        adv.employeeId === employee.id &&
        adv.advanceDate.startsWith(salaryMonth) &&
        adv.deducted
    );
  }, [employee, advances, salaryMonth]);

  const autoAdvanceTotal = useMemo(() => {
    let sum = 0;
    for (const adv of pendingMonthAdvances) {
      sum += Number(adv.amount) || 0;
    }
    return roundCurrency(sum);
  }, [pendingMonthAdvances]);

  const existingMonthPayments = useMemo(() => {
    if (!employee || !SALARY_VALIDATION.monthPattern.test(salaryMonth)) {
      return [];
    }
    return salaryPayments.filter(
      (sal) => sal.employeeId === employee.id && sal.salaryMonth === salaryMonth
    );
  }, [employee, salaryPayments, salaryMonth]);

  // Reset form when employee opens
  useEffect(() => {
    if (employee) {
      const today = getTodayIsoDate();
      setSalaryMonth(today.slice(0, 7));
      setBasicSalaryInput(String(employee.basicSalary));
      setOvertimeInput('0');
      setBonusInput('0');
      setPaymentDate(today);
      setSelectedAccountId(effectiveAccounts[0]?.id ?? 'default_cash');
      setNote('');
      setErrorMsg(null);
    }
  }, [employee, effectiveAccounts]);

  // Auto-populate Advance Deduction whenever employee or selected month's pending advances change
  useEffect(() => {
    if (!employee) return;
    setAdvanceDeductionInput(String(autoAdvanceTotal));
    setMarkAdvancesDeducted(pendingMonthAdvances.length > 0);
  }, [employee, salaryMonth, autoAdvanceTotal, pendingMonthAdvances.length]);

  useEffect(() => {
    if (!employee) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [employee, isSubmitting, onClose]);

  if (!employee) return null;

  const selectedAccount =
    effectiveAccounts.find((acc) => acc.id === selectedAccountId) ??
    effectiveAccounts[0];
  const paymentMethod: SalaryPaymentMethod =
    selectedAccount?.accountType ?? 'Cash';

  const parsedBasic = Number(basicSalaryInput);
  const parsedOvertime = overtimeInput.trim() === '' ? 0 : Number(overtimeInput);
  const parsedBonus = bonusInput.trim() === '' ? 0 : Number(bonusInput);
  const parsedAdvance =
    advanceDeductionInput.trim() === '' ? 0 : Number(advanceDeductionInput);

  const isBasicValid =
    Number.isFinite(parsedBasic) &&
    parsedBasic > 0 &&
    parsedBasic <= SALARY_VALIDATION.maxBasic;
  const isOvertimeValid =
    Number.isFinite(parsedOvertime) &&
    parsedOvertime >= 0 &&
    parsedOvertime <= SALARY_VALIDATION.maxBonusOrOvertime;
  const isBonusValid =
    Number.isFinite(parsedBonus) &&
    parsedBonus >= 0 &&
    parsedBonus <= SALARY_VALIDATION.maxBonusOrOvertime;
  const isAdvanceValid =
    Number.isFinite(parsedAdvance) &&
    parsedAdvance >= 0 &&
    parsedAdvance <= SALARY_VALIDATION.maxAmount;

  const cleanBasic = isBasicValid ? roundCurrency(parsedBasic) : 0;
  const cleanOvertime = isOvertimeValid ? roundCurrency(parsedOvertime) : 0;
  const cleanBonus = isBonusValid ? roundCurrency(parsedBonus) : 0;
  const cleanAdvance = isAdvanceValid ? roundCurrency(parsedAdvance) : 0;

  const grossSalary = roundCurrency(cleanBasic + cleanOvertime + cleanBonus);
  const netSalary = roundCurrency(grossSalary - cleanAdvance);
  const isNegativeNet = netSalary < 0;

  const willMarkAdvances =
    markAdvancesDeducted && pendingMonthAdvances.length > 0 && cleanAdvance > 0;

  const monthLabel = formatMonthLabel(salaryMonth);

  const canSubmit =
    !isSubmitting &&
    isBasicValid &&
    isOvertimeValid &&
    isBonusValid &&
    isAdvanceValid &&
    !isNegativeNet &&
    SALARY_VALIDATION.monthPattern.test(salaryMonth) &&
    SALARY_VALIDATION.datePattern.test(paymentDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!SALARY_VALIDATION.monthPattern.test(salaryMonth)) {
      setErrorMsg('Please select a valid salary month (YYYY-MM).');
      return;
    }

    if (!isBasicValid) {
      setErrorMsg(
        `Basic salary must be greater than 0 and at most ${formatCurrency(SALARY_VALIDATION.maxBasic)}.`
      );
      return;
    }

    if (!isOvertimeValid || !isBonusValid) {
      setErrorMsg('Overtime and bonus must be valid non-negative numbers.');
      return;
    }

    if (!isAdvanceValid) {
      setErrorMsg('Advance deduction must be a valid non-negative number.');
      return;
    }

    if (isNegativeNet) {
      setErrorMsg(
        'Net salary cannot be negative. Reduce the advance deduction or add overtime/bonus so Net Salary is at least ৳0.00.'
      );
      return;
    }

    if (!SALARY_VALIDATION.datePattern.test(paymentDate)) {
      setErrorMsg('Payment date must be in YYYY-MM-DD format.');
      return;
    }

    if (!selectedAccount || !SALARY_PAYMENT_METHODS.includes(paymentMethod)) {
      setErrorMsg('Please select a valid payment account.');
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > SALARY_VALIDATION.noteMax) {
      setErrorMsg(
        `Note must be at most ${SALARY_VALIDATION.noteMax} characters.`
      );
      return;
    }

    const rawAutoId = doc(collection(db, 'salary_payments')).id
      .slice(0, 8)
      .toUpperCase();
    const salaryRef = `SAL-${rawAutoId}`;

    const advancesToMark = willMarkAdvances ? pendingMonthAdvances : [];
    const moneyOutNote =
      trimmedNote ||
      `Salary (${monthLabel}) — ${employee.name} (${employee.department})`;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const salaryDocRef = doc(db, 'salary_payments', salaryRef);

      // 1. Save immutable salary payment record in salary_payments
      batch.set(salaryDocRef, {
        ownerId,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        moneyOutId: netSalary > 0 ? salaryRef : '',
        reference: salaryRef,
        salaryMonth,
        paymentDate,
        basicSalary: cleanBasic,
        overtimeAmount: cleanOvertime,
        bonusAmount: cleanBonus,
        advanceDeduction: cleanAdvance,
        netSalary,
        deductedAdvanceCount: advancesToMark.length,
        paymentMethod,
        note: trimmedNote,
        createdAt: serverTimestamp(),
      });

      // 2. Atomically insert outflow in money_out linked to selected accountId when net cash is paid out
      if (netSalary > 0) {
        const moneyOutDocRef = doc(db, 'money_out', salaryRef);
        batch.set(moneyOutDocRef, {
          ownerId,
          employeeId: employee.id,
          salaryPaymentId: salaryRef,
          category: 'Salary',
          reference: salaryRef,
          amount: netSalary,
          paymentDate,
          paymentMethod,
          accountId: selectedAccount.id,
          accountName: selectedAccount.accountName,
          note: moneyOutNote.slice(0, SALARY_VALIDATION.noteMax),
          createdAt: serverTimestamp(),
        });
      }

      // 3. Mark corresponding undeducted advances as deducted so they cannot be double-deducted
      for (const adv of advancesToMark) {
        const advDocRef = doc(db, 'employee_advances', adv.id);
        batch.update(advDocRef, {
          deducted: true,
          deductedBySalaryId: salaryRef,
          deductedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `salary_payments/${salaryRef}`
        );
      }

      onSalaryPaid(
        employee,
        salaryMonth,
        netSalary,
        salaryRef,
        paymentMethod,
        advancesToMark.length
      );
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Unable to process salary payment.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-salary-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 transition-opacity"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg max-h-[92vh] bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="pay-salary-title"
                className="font-display text-base font-semibold text-slate-900 truncate"
              >
                Pay Monthly Salary
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {employee.name} · {employee.department}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close pay salary modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          {errorMsg && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {errorMsg}
            </div>
          )}

          {/* Duplicate month warning if salary already paid for selected month */}
          {existingMonthPayments.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Salary already recorded for {monthLabel}
                </p>
                <p className="mt-0.5 text-amber-800">
                  {existingMonthPayments
                    .map(
                      (p) =>
                        `${p.reference} (${formatCurrency(p.netSalary)} on ${formatIsoDate(p.paymentDate)})`
                    )
                    .join(', ')}
                  . Previously deducted advances are excluded automatically.
                </p>
              </div>
            </div>
          )}

          {/* Month & Payment Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="salaryMonth"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Salary Month <span className="text-red-600">*</span>
              </label>
              <input
                id="salaryMonth"
                type="month"
                required
                value={salaryMonth}
                onChange={(e) => setSalaryMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            <div>
              <label
                htmlFor="salaryPaymentDate"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Payment Date <span className="text-red-600">*</span>
              </label>
              <input
                id="salaryPaymentDate"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>
          </div>

          {/* Earnings Grid: Basic Salary, Overtime, Bonus */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="salaryBasic"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Basic Salary <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500">
                  ৳
                </span>
                <input
                  id="salaryBasic"
                  type="number"
                  required
                  min="1"
                  max={SALARY_VALIDATION.maxBasic}
                  step="0.01"
                  value={basicSalaryInput}
                  onChange={(e) => setBasicSalaryInput(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-2 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="salaryOvertime"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Overtime Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500">
                  ৳
                </span>
                <input
                  id="salaryOvertime"
                  type="number"
                  min="0"
                  max={SALARY_VALIDATION.maxBonusOrOvertime}
                  step="0.01"
                  value={overtimeInput}
                  onChange={(e) => setOvertimeInput(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-2 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="salaryBonus"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Bonus
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500">
                  ৳
                </span>
                <input
                  id="salaryBonus"
                  type="number"
                  min="0"
                  max={SALARY_VALIDATION.maxBonusOrOvertime}
                  step="0.01"
                  value={bonusInput}
                  onChange={(e) => setBonusInput(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-2 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            </div>
          </div>

          {/* Advance Deduction (Auto-Fetched) */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-md space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="salaryAdvanceDeduction"
                className="block text-xs font-semibold text-amber-950"
              >
                Advance Deduction ({monthLabel})
              </label>
              <span className="text-[11px] font-mono text-amber-800">
                Auto-fetched: {formatCurrency(autoAdvanceTotal)}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-amber-700">
                ৳
              </span>
              <input
                id="salaryAdvanceDeduction"
                type="number"
                min="0"
                max={SALARY_VALIDATION.maxAmount}
                step="0.01"
                value={advanceDeductionInput}
                onChange={(e) => setAdvanceDeductionInput(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm font-mono font-semibold tabular-nums text-amber-950 bg-white border border-amber-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            {pendingMonthAdvances.length > 0 ? (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex flex-wrap gap-1.5">
                  {pendingMonthAdvances.map((adv) => (
                    <span
                      key={adv.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-white border border-amber-200 text-amber-900 rounded"
                    >
                      {adv.reference}: {formatCurrency(adv.amount)} (
                      {adv.advanceDate.slice(5)})
                    </span>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-amber-950 cursor-pointer select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={markAdvancesDeducted}
                    onChange={(e) => setMarkAdvancesDeducted(e.target.checked)}
                    className="rounded border-amber-400 text-[#1e3a8a] focus:ring-[#1e3a8a]"
                  />
                  <span>
                    Mark {pendingMonthAdvances.length}{' '}
                    {pendingMonthAdvances.length === 1
                      ? 'advance'
                      : 'advances'}{' '}
                    as <strong className="font-semibold">Deducted</strong> to
                    prevent double-deduction
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-[11px] text-amber-800">
                {alreadyDeductedMonthAdvances.length > 0
                  ? `All ${alreadyDeductedMonthAdvances.length} advance(s) in ${monthLabel} were already deducted in a prior salary payment.`
                  : `No un-deducted advances recorded for ${monthLabel}.`}
              </p>
            )}
          </div>

          {/* Live Net Salary Calculation Card */}
          <div
            className={`p-4 rounded-md border space-y-2 ${
              isNegativeNet
                ? 'bg-red-50 border-red-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Basic + Overtime + Bonus</span>
              <span className="font-mono font-medium tabular-nums text-slate-900">
                {formatCurrency(grossSalary)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-amber-800">
              <span>Less: Advance Deduction</span>
              <span className="font-mono font-medium tabular-nums">
                −{formatCurrency(cleanAdvance)}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                  Net Salary Payable
                </p>
                <p className="text-[11px] text-slate-500">
                  Basic + Overtime + Bonus − Advance
                </p>
              </div>
              <p
                className={`font-mono text-xl font-bold tabular-nums ${
                  isNegativeNet
                    ? 'text-red-700'
                    : netSalary === 0
                      ? 'text-slate-700'
                      : 'text-emerald-700'
                }`}
              >
                {formatCurrency(netSalary)}
              </p>
            </div>
            {isNegativeNet && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-700 pt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Advance deduction exceeds total earnings. Adjust deduction or
                earnings to settle.
              </p>
            )}
          </div>

          {/* Payment Method / Account (Dynamic Dropdown from accounts collection) */}
          <div>
            <label
              htmlFor="salaryAccountSelect"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Payment Method / Account <span className="text-red-600">*</span>
            </label>
            <select
              id="salaryAccountSelect"
              required
              value={selectedAccount?.id ?? selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            >
              {effectiveAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} ({acc.accountType})
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="salaryNote"
                className="block text-sm font-medium text-slate-700"
              >
                Note (Optional)
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {note.length}/{SALARY_VALIDATION.noteMax}
              </span>
            </div>
            <input
              id="salaryNote"
              type="text"
              maxLength={SALARY_VALIDATION.noteMax}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`e.g. Full ${monthLabel} salary + Eid bonus...`}
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          {/* Atomic Cash Flow Summary */}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Atomically saves to{' '}
            <span className="font-mono text-slate-700">salary_payments</span>
            {netSalary > 0 ? (
              <>
                , posts{' '}
                <span className="font-mono text-slate-700">
                  {formatCurrency(netSalary)}
                </span>{' '}
                to <span className="font-mono text-slate-700">money_out</span> (
                <span className="font-mono">SAL-[AutoID]</span>, category{' '}
                <span className="font-medium text-slate-700">Salary</span>)
              </>
            ) : (
              <> (settled in full by advances; no extra cash outflow)</>
            )}
            {willMarkAdvances
              ? `, and marks ${pendingMonthAdvances.length} advance(s) as deducted.`
              : '.'}
          </p>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {isSubmitting
                ? 'Processing Salary...'
                : `Confirm Salary (${formatCurrency(Math.max(0, netSalary))})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
