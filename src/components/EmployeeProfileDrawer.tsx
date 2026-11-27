import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  Banknote,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Edit3,
  HandCoins,
  Phone,
  ReceiptText,
  RotateCcw,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EMPLOYEE_DEPARTMENTS,
  EMPLOYEE_VALIDATION,
  type EmployeeAdvanceRecord,
  type EmployeeRecord,
  type MoneyOutRecord,
  type SalaryPaymentRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

interface EmployeeProfileDrawerProps {
  employee: EmployeeRecord | null;
  advances: EmployeeAdvanceRecord[];
  salaryPayments: SalaryPaymentRecord[];
  moneyOutRecords: MoneyOutRecord[];
  isAdmin: boolean;
  onClose: () => void;
  onGiveAdvance: (employee: EmployeeRecord) => void;
  onPaySalary: (employee: EmployeeRecord) => void;
  onDeleteEmployee: (employee: EmployeeRecord) => void;
  onCorrectMoneyOut: (record: MoneyOutRecord) => void;
  onProfileUpdated: (message: string) => void;
}

function getIsoDateFallbackMs(isoDate: string): number {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(isoDate)) return 0;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function getCurrentMonthLabel(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  if (!year || !month) return 'This Month';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

function formatSalaryMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return yearMonth;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

export function EmployeeProfileDrawer({
  employee,
  advances,
  salaryPayments,
  moneyOutRecords,
  isAdmin,
  onClose,
  onGiveAdvance,
  onPaySalary,
  onDeleteEmployee,
  onCorrectMoneyOut,
  onProfileUpdated,
}: EmployeeProfileDrawerProps) {
  const todayIso = getTodayIsoDate();
  const currentYearMonth = todayIso.slice(0, 7);
  const currentMonthLabel = useMemo(
    () => getCurrentMonthLabel(todayIso),
    [todayIso]
  );

  const [historyTab, setHistoryTab] = useState<'salaries' | 'advances'>(
    'salaries'
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editDeptSelect, setEditDeptSelect] = useState<string>('Dyeing');
  const [editCustomDept, setEditCustomDept] = useState('');
  const [editJoiningDate, setEditJoiningDate] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      setIsEditing(false);
      setEditName(employee.name);
      setEditMobile(employee.mobile);
      const isPreset = (EMPLOYEE_DEPARTMENTS as readonly string[]).includes(
        employee.department
      );
      if (isPreset && employee.department !== 'Other') {
        setEditDeptSelect(employee.department);
        setEditCustomDept('');
      } else {
        setEditDeptSelect('Other');
        setEditCustomDept(employee.department);
      }
      setEditJoiningDate(employee.joiningDate);
      setEditSalary(String(employee.basicSalary));
      setEditError(null);
    }
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [employee, isSaving, onClose]);

  const employeeAdvances = useMemo(() => {
    if (!employee) return [];
    return advances
      .filter((adv) => adv.employeeId === employee.id)
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ??
          getIsoDateFallbackMs(a.advanceDate);
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ??
          getIsoDateFallbackMs(b.advanceDate);
        return timeB - timeA;
      });
  }, [employee, advances]);

  const employeeSalaries = useMemo(() => {
    if (!employee) return [];
    return salaryPayments
      .filter((sal) => sal.employeeId === employee.id)
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ??
          getIsoDateFallbackMs(a.paymentDate);
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ??
          getIsoDateFallbackMs(b.paymentDate);
        return timeB - timeA;
      });
  }, [employee, salaryPayments]);

  const advanceSummary = useMemo(() => {
    let pendingMonthTotal = 0;
    let pendingMonthCount = 0;
    let deductedMonthTotal = 0;
    let thisMonthTotal = 0;
    let thisMonthCount = 0;
    let allTimeTotal = 0;

    for (const adv of employeeAdvances) {
      const amt = Number(adv.amount) || 0;
      allTimeTotal += amt;
      if (adv.advanceDate.startsWith(currentYearMonth)) {
        thisMonthTotal += amt;
        thisMonthCount += 1;
        if (adv.deducted) {
          deductedMonthTotal += amt;
        } else {
          pendingMonthTotal += amt;
          pendingMonthCount += 1;
        }
      }
    }

    let totalSalariesPaidAllTime = 0;
    let paidThisMonthTotal = 0;
    for (const sal of employeeSalaries) {
      const net = Number(sal.netSalary) || 0;
      totalSalariesPaidAllTime += net;
      if (sal.salaryMonth === currentYearMonth) {
        paidThisMonthTotal += net;
      }
    }

    const cleanPendingMonth = roundCurrency(pendingMonthTotal);
    const basicSalary = employee?.basicSalary ?? 0;

    return {
      pendingMonthTotal: cleanPendingMonth,
      pendingMonthCount,
      deductedMonthTotal: roundCurrency(deductedMonthTotal),
      thisMonthTotal: roundCurrency(thisMonthTotal),
      thisMonthCount,
      allTimeTotal: roundCurrency(allTimeTotal),
      remainingSalary: roundCurrency(basicSalary - cleanPendingMonth),
      totalSalariesPaidAllTime: roundCurrency(totalSalariesPaidAllTime),
      paidThisMonthTotal: roundCurrency(paidThisMonthTotal),
    };
  }, [employeeAdvances, employeeSalaries, currentYearMonth, employee]);

  const moneyOutByIdOrRef = useMemo(() => {
    const map = new Map<string, MoneyOutRecord>();
    for (const rec of moneyOutRecords) {
      map.set(rec.id, rec);
      if (rec.reference) {
        map.set(rec.reference, rec);
      }
    }
    return map;
  }, [moneyOutRecords]);

  if (!employee) return null;

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    const trimmedName = editName.trim();
    const trimmedMobile = editMobile.trim();
    const resolvedDept =
      editDeptSelect === 'Other' ? editCustomDept.trim() : editDeptSelect;
    const parsedSalary = Number(editSalary);

    if (
      trimmedName.length < EMPLOYEE_VALIDATION.nameMin ||
      trimmedName.length > EMPLOYEE_VALIDATION.nameMax
    ) {
      setEditError(
        `Name must be between ${EMPLOYEE_VALIDATION.nameMin} and ${EMPLOYEE_VALIDATION.nameMax} characters.`
      );
      return;
    }

    if (
      trimmedMobile.length < EMPLOYEE_VALIDATION.mobileMin ||
      trimmedMobile.length > EMPLOYEE_VALIDATION.mobileMax ||
      !EMPLOYEE_VALIDATION.mobilePattern.test(trimmedMobile)
    ) {
      setEditError(
        'Mobile must be 5–25 characters using digits, +, spaces, hyphens, or parentheses.'
      );
      return;
    }

    if (
      resolvedDept.length < EMPLOYEE_VALIDATION.departmentMin ||
      resolvedDept.length > EMPLOYEE_VALIDATION.departmentMax
    ) {
      setEditError('Please select or enter a valid department name.');
      return;
    }

    if (!EMPLOYEE_VALIDATION.datePattern.test(editJoiningDate)) {
      setEditError('Joining date must be in YYYY-MM-DD format.');
      return;
    }

    if (
      !Number.isFinite(parsedSalary) ||
      parsedSalary <= 0 ||
      parsedSalary > EMPLOYEE_VALIDATION.maxSalary
    ) {
      setEditError('Please enter a valid basic monthly salary greater than 0.');
      return;
    }

    setIsSaving(true);
    try {
      const empRef = doc(db, 'employees', employee.id);
      try {
        await updateDoc(empRef, {
          name: trimmedName,
          mobile: trimmedMobile,
          department: resolvedDept,
          joiningDate: editJoiningDate,
          basicSalary: roundCurrency(parsedSalary),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `employees/${employee.id}`
        );
      }

      setIsEditing(false);
      onProfileUpdated(`Updated profile for ${trimmedName}.`);
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : 'Unable to update employee profile.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-profile-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 transition-opacity"
        onClick={() => {
          if (!isSaving) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-md bg-blue-50 border border-blue-100 text-[#1e3a8a] flex items-center justify-center shrink-0">
              <UserRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="employee-profile-title"
                className="font-display text-lg font-semibold text-slate-900 truncate"
              >
                {employee.name}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {employee.department} · Joined{' '}
                {formatIsoDate(employee.joiningDate)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteEmployee(employee)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close employee profile"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Edit Form OR Profile Info Card */}
          {isEditing ? (
            <form
              onSubmit={handleSaveEdit}
              className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  Edit Employee Profile
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditError(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {editError && (
                <div
                  role="alert"
                  className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
                >
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="editEmpName"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="editEmpName"
                    type="text"
                    required
                    maxLength={EMPLOYEE_VALIDATION.nameMax}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="editEmpMobile"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Mobile
                  </label>
                  <input
                    id="editEmpMobile"
                    type="tel"
                    required
                    maxLength={EMPLOYEE_VALIDATION.mobileMax}
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="editEmpDept"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="editEmpDept"
                    value={editDeptSelect}
                    onChange={(e) => setEditDeptSelect(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                  >
                    {EMPLOYEE_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                {editDeptSelect === 'Other' && (
                  <div>
                    <label
                      htmlFor="editEmpCustomDept"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Custom Department
                    </label>
                    <input
                      id="editEmpCustomDept"
                      type="text"
                      required
                      maxLength={EMPLOYEE_VALIDATION.departmentMax}
                      value={editCustomDept}
                      onChange={(e) => setEditCustomDept(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                )}
                <div>
                  <label
                    htmlFor="editEmpJoin"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Joining Date
                  </label>
                  <input
                    id="editEmpJoin"
                    type="date"
                    required
                    value={editJoiningDate}
                    onChange={(e) => setEditJoiningDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="editEmpSalary"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Basic Monthly Salary (৳)
                  </label>
                  <input
                    id="editEmpSalary"
                    type="number"
                    required
                    min="1"
                    max={EMPLOYEE_VALIDATION.maxSalary}
                    step="0.01"
                    value={editSalary}
                    onChange={(e) => setEditSalary(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-mono text-slate-800">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {employee.mobile}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  Joined {formatIsoDate(employee.joiningDate)}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                ID: {employee.id}
              </span>
            </div>
          )}

          {/* Monthly Advance & Salary Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-[11px] font-medium text-slate-500">
                Basic Monthly Salary
              </p>
              <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
                {formatCurrency(employee.basicSalary)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                All-time paid:{' '}
                {formatCurrency(advanceSummary.totalSalariesPaidAllTime)}
              </p>
            </div>

            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg">
              <p className="text-[11px] font-medium text-amber-800">
                Pending Advance ({currentMonthLabel})
              </p>
              <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-amber-900">
                {formatCurrency(advanceSummary.pendingMonthTotal)}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                {advanceSummary.pendingMonthCount} undeducted
                {advanceSummary.deductedMonthTotal > 0
                  ? ` · ${formatCurrency(advanceSummary.deductedMonthTotal)} deducted`
                  : ''}
              </p>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-[11px] font-medium text-slate-500">
                {advanceSummary.paidThisMonthTotal > 0
                  ? `Net Paid (${currentMonthLabel})`
                  : 'Est. Remaining Salary'}
              </p>
              <p
                className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${
                  advanceSummary.paidThisMonthTotal > 0
                    ? 'text-emerald-700'
                    : advanceSummary.remainingSalary < 0
                      ? 'text-red-700'
                      : 'text-emerald-700'
                }`}
              >
                {advanceSummary.paidThisMonthTotal > 0
                  ? formatCurrency(advanceSummary.paidThisMonthTotal)
                  : formatCurrency(advanceSummary.remainingSalary)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                All-time adv: {formatCurrency(advanceSummary.allTimeTotal)}
              </p>
            </div>
          </div>

          {/* Action Bar & History Tabs */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div
                role="tablist"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === 'salaries'}
                  onClick={() => setHistoryTab('salaries')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    historyTab === 'salaries'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ReceiptText className="w-3.5 h-3.5" />
                  Salary History ({employeeSalaries.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === 'advances'}
                  onClick={() => setHistoryTab('advances')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    historyTab === 'advances'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <HandCoins className="w-3.5 h-3.5" />
                  Weekly Advances ({employeeAdvances.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPaySalary(employee)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Pay Salary
                </button>
                <button
                  type="button"
                  onClick={() => onGiveAdvance(employee)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <HandCoins className="w-3.5 h-3.5" />
                  Give Advance
                </button>
              </div>
            </div>

            {historyTab === 'salaries' ? (
              employeeSalaries.length === 0 ? (
                <div className="py-10 px-4 text-center bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm font-medium text-slate-900">
                    No salary payments recorded yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click Pay Salary to settle monthly pay with automatic
                    deduction of pending advances.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200">
                  {employeeSalaries.map((sal) => {
                    const linkedMoneyOut = sal.moneyOutId
                      ? moneyOutByIdOrRef.get(sal.moneyOutId) ??
                        moneyOutByIdOrRef.get(sal.reference) ??
                        null
                      : null;
                    return (
                      <div
                        key={sal.id}
                        className="p-4 space-y-2.5 hover:bg-slate-50/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display text-sm font-semibold text-slate-900">
                                {formatSalaryMonthLabel(sal.salaryMonth)}
                              </span>
                              <span className="font-mono text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {sal.reference}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>Paid {formatIsoDate(sal.paymentDate)}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                {sal.paymentMethod === 'Bank' ? (
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                ) : (
                                  <Banknote className="w-3 h-3 text-slate-400" />
                                )}
                                {sal.paymentMethod}
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                Net Paid
                              </p>
                              <p className="font-mono text-sm font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                                {formatCurrency(sal.netSalary)}
                              </p>
                            </div>
                            {linkedMoneyOut && (
                              <button
                                type="button"
                                onClick={() =>
                                  onCorrectMoneyOut(linkedMoneyOut)
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3 shrink-0" />
                                Correct
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Basic</span>
                            <span className="font-mono font-medium text-slate-800 tabular-nums">
                              {formatCurrency(sal.basicSalary)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Overtime
                            </span>
                            <span className="font-mono font-medium text-slate-800 tabular-nums">
                              +{formatCurrency(sal.overtimeAmount)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Bonus</span>
                            <span className="font-mono font-medium text-slate-800 tabular-nums">
                              +{formatCurrency(sal.bonusAmount)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Advance Deducted
                            </span>
                            <span className="font-mono font-medium text-amber-700 tabular-nums">
                              −{formatCurrency(sal.advanceDeduction)}
                            </span>
                          </div>
                        </div>

                        {sal.note && (
                          <p className="text-xs text-slate-600 break-words">
                            {sal.note}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : employeeAdvances.length === 0 ? (
              <div className="py-10 px-4 text-center bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-900">
                  No advances taken yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Click Give Advance to issue a weekly salary advance and update
                  the live cash balance.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200">
                {employeeAdvances.map((adv) => {
                  const isThisMonth =
                    adv.advanceDate.startsWith(currentYearMonth);
                  const linkedMoneyOut =
                    moneyOutByIdOrRef.get(adv.moneyOutId) ??
                    moneyOutByIdOrRef.get(adv.reference) ??
                    null;
                  return (
                    <div
                      key={adv.id}
                      className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-slate-900">
                            {adv.reference}
                          </span>
                          {adv.deducted ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Deducted
                              {adv.deductedBySalaryId
                                ? ` (${adv.deductedBySalaryId})`
                                : ''}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded">
                              {isThisMonth ? 'Pending · This Month' : 'Pending'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{formatIsoDate(adv.advanceDate)}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            {adv.paymentMethod === 'Bank' ? (
                              <Building2 className="w-3 h-3 text-slate-400" />
                            ) : (
                              <Banknote className="w-3 h-3 text-slate-400" />
                            )}
                            {adv.paymentMethod}
                          </span>
                        </p>
                        {adv.note && (
                          <p className="text-xs text-slate-600 mt-1 break-words">
                            {adv.note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <p className="font-mono text-sm font-semibold tabular-nums text-red-700 whitespace-nowrap">
                          −{formatCurrency(adv.amount)}
                        </p>
                        {linkedMoneyOut && (
                          <button
                            type="button"
                            onClick={() => onCorrectMoneyOut(linkedMoneyOut)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3 shrink-0" />
                            Correct / Adjust
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
