import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Banknote,
  Building2,
  CalendarDays,
  Check,
  Edit2,
  HandCoins,
  History,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EMPLOYEE_DEPARTMENTS,
  EMPLOYEE_VALIDATION,
  type EmployeeAdvanceRecord,
  type EmployeeDepartment,
  type EmployeeRecord,
  type MoneyOutRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

interface EmployeesViewProps {
  ownerId: string;
  employees: EmployeeRecord[];
  advances: EmployeeAdvanceRecord[];
  moneyOutRecords: MoneyOutRecord[];
  isLoading: boolean;
  isAdmin: boolean;
  focusFormSignal: number;
  onEmployeeCreated: (employeeName: string, department: string) => void;
  onEmployeeUpdated: (message: string) => void;
  onDeleteEmployee: (employee: EmployeeRecord) => void;
  onGiveAdvance: (employee: EmployeeRecord) => void;
  onOpenProfile: (employee: EmployeeRecord) => void;
  onCorrectMoneyOut: (record: MoneyOutRecord) => void;
}

const DEPARTMENT_BADGE_CLASSES: Record<string, string> = {
  Dyeing: 'bg-blue-50 text-[#1e3a8a] border-blue-200',
  Washing: 'bg-sky-50 text-sky-800 border-sky-200',
  Finishing: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Boiler: 'bg-orange-50 text-orange-800 border-orange-200',
  Maintenance: 'bg-amber-50 text-amber-800 border-amber-200',
  Store: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Admin: 'bg-slate-100 text-slate-700 border-slate-200',
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

export function EmployeesView({
  ownerId,
  employees,
  advances,
  moneyOutRecords,
  isLoading,
  isAdmin,
  focusFormSignal,
  onEmployeeCreated,
  onEmployeeUpdated,
  onDeleteEmployee,
  onGiveAdvance,
  onOpenProfile,
  onCorrectMoneyOut,
}: EmployeesViewProps) {
  const todayIso = getTodayIsoDate();
  const currentYearMonth = todayIso.slice(0, 7);
  const currentMonthLabel = useMemo(
    () => getCurrentMonthLabel(todayIso),
    [todayIso]
  );

  // Add / Edit Employee form state
  const [editingEmployee, setEditingEmployee] =
    useState<EmployeeRecord | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [departmentPreset, setDepartmentPreset] =
    useState<EmployeeDepartment>('Dyeing');
  const [customDepartment, setCustomDepartment] = useState('');
  const [joiningDate, setJoiningDate] = useState(() => getTodayIsoDate());
  const [basicSalaryInput, setBasicSalaryInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Right-panel tab & filters
  const [activeTab, setActiveTab] = useState<'employees' | 'advances'>(
    'employees'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [advanceSearch, setAdvanceSearch] = useState('');
  const [advancePeriod, setAdvancePeriod] = useState<'month' | 'all'>('month');

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const startEditEmployee = (emp: EmployeeRecord) => {
    if (!isAdmin) return;
    setEditingEmployee(emp);
    setName(emp.name);
    setMobile(emp.mobile);
    const isPreset = (EMPLOYEE_DEPARTMENTS as readonly string[]).includes(
      emp.department
    );
    if (isPreset && emp.department !== 'Other') {
      setDepartmentPreset(emp.department as EmployeeDepartment);
      setCustomDepartment('');
    } else {
      setDepartmentPreset('Other');
      setCustomDepartment(emp.department);
    }
    setJoiningDate(emp.joiningDate);
    setBasicSalaryInput(String(emp.basicSalary));
    setFormError(null);
    if (nameInputRef.current) {
      nameInputRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      nameInputRef.current.focus();
    }
  };

  const cancelEditEmployee = () => {
    setEditingEmployee(null);
    setName('');
    setMobile('');
    setDepartmentPreset('Dyeing');
    setCustomDepartment('');
    setJoiningDate(getTodayIsoDate());
    setBasicSalaryInput('');
    setFormError(null);
  };

  useEffect(() => {
    if (focusFormSignal > 0 && nameInputRef.current) {
      nameInputRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      nameInputRef.current.focus();
    }
  }, [focusFormSignal]);

  // Map employeeId -> { thisMonthTotal, thisMonthCount, allTimeTotal }
  const advancesByEmployeeId = useMemo(() => {
    const map = new Map<
      string,
      { thisMonthTotal: number; thisMonthCount: number; allTimeTotal: number }
    >();

    for (const adv of advances) {
      const prev = map.get(adv.employeeId) ?? {
        thisMonthTotal: 0,
        thisMonthCount: 0,
        allTimeTotal: 0,
      };
      const amt = Number(adv.amount) || 0;
      const isThisMonth = adv.advanceDate.startsWith(currentYearMonth);
      map.set(adv.employeeId, {
        thisMonthTotal: roundCurrency(
          prev.thisMonthTotal + (isThisMonth ? amt : 0)
        ),
        thisMonthCount: prev.thisMonthCount + (isThisMonth ? 1 : 0),
        allTimeTotal: roundCurrency(prev.allTimeTotal + amt),
      });
    }

    return map;
  }, [advances, currentYearMonth]);

  // Real-time KPI summary
  const stats = useMemo(() => {
    let totalMonthlyPayroll = 0;
    const deptSet = new Set<string>();
    for (const emp of employees) {
      totalMonthlyPayroll += Number(emp.basicSalary) || 0;
      if (emp.department) deptSet.add(emp.department);
    }

    let totalAdvanceThisMonth = 0;
    let advanceCountThisMonth = 0;
    for (const adv of advances) {
      if (adv.advanceDate.startsWith(currentYearMonth)) {
        totalAdvanceThisMonth += Number(adv.amount) || 0;
        advanceCountThisMonth += 1;
      }
    }

    const cleanPayroll = roundCurrency(totalMonthlyPayroll);
    const cleanAdvances = roundCurrency(totalAdvanceThisMonth);

    return {
      employeeCount: employees.length,
      departmentCount: deptSet.size,
      totalMonthlyPayroll: cleanPayroll,
      totalAdvanceThisMonth: cleanAdvances,
      advanceCountThisMonth,
      netEstPayroll: roundCurrency(cleanPayroll - cleanAdvances),
      availableDepartments: Array.from(deptSet).sort(),
    };
  }, [employees, advances, currentYearMonth]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...employees]
      .sort((a, b) => {
        const timeA = timestampToDate(a.createdAt)?.getTime() ?? 0;
        const timeB = timestampToDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      })
      .filter((emp) => {
        if (departmentFilter !== 'all' && emp.department !== departmentFilter) {
          return false;
        }
        if (!q) return true;
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.mobile.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q)
        );
      });
  }, [employees, searchQuery, departmentFilter]);

  // Filtered advances
  const filteredAdvances = useMemo(() => {
    const q = advanceSearch.trim().toLowerCase();
    return [...advances]
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ??
          getIsoDateFallbackMs(a.advanceDate);
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ??
          getIsoDateFallbackMs(b.advanceDate);
        return timeB - timeA;
      })
      .filter((adv) => {
        if (
          advancePeriod === 'month' &&
          !adv.advanceDate.startsWith(currentYearMonth)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          adv.reference.toLowerCase().includes(q) ||
          adv.employeeName.toLowerCase().includes(q) ||
          adv.department.toLowerCase().includes(q) ||
          adv.note.toLowerCase().includes(q) ||
          adv.advanceDate.toLowerCase().includes(q)
        );
      });
  }, [advances, advanceSearch, advancePeriod, currentYearMonth]);

  const filteredAdvancesSubtotal = useMemo(() => {
    let sum = 0;
    for (const adv of filteredAdvances) {
      sum += Number(adv.amount) || 0;
    }
    return roundCurrency(sum);
  }, [filteredAdvances]);

  const parsedSalary = Number(basicSalaryInput);
  const isSalaryValid =
    Number.isFinite(parsedSalary) &&
    parsedSalary > 0 &&
    parsedSalary <= EMPLOYEE_VALIDATION.maxSalary;

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedMobile = mobile.trim();
    const resolvedDepartment =
      departmentPreset === 'Other' ? customDepartment.trim() : departmentPreset;

    if (
      trimmedName.length < EMPLOYEE_VALIDATION.nameMin ||
      trimmedName.length > EMPLOYEE_VALIDATION.nameMax
    ) {
      setFormError(
        `Employee name must be between ${EMPLOYEE_VALIDATION.nameMin} and ${EMPLOYEE_VALIDATION.nameMax} characters.`
      );
      return;
    }

    if (
      trimmedMobile.length < EMPLOYEE_VALIDATION.mobileMin ||
      trimmedMobile.length > EMPLOYEE_VALIDATION.mobileMax ||
      !EMPLOYEE_VALIDATION.mobilePattern.test(trimmedMobile)
    ) {
      setFormError(
        'Mobile must be 5–25 characters using digits, +, spaces, hyphens, or parentheses.'
      );
      return;
    }

    if (
      resolvedDepartment.length < EMPLOYEE_VALIDATION.departmentMin ||
      resolvedDepartment.length > EMPLOYEE_VALIDATION.departmentMax
    ) {
      setFormError('Please select or enter a valid department name.');
      return;
    }

    if (!EMPLOYEE_VALIDATION.datePattern.test(joiningDate)) {
      setFormError('Joining date must be in YYYY-MM-DD format.');
      return;
    }

    if (!isSalaryValid) {
      setFormError(
        `Please enter a valid basic monthly salary greater than 0 and at most ${formatCurrency(EMPLOYEE_VALIDATION.maxSalary)}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingEmployee) {
        const empRef = doc(db, 'employees', editingEmployee.id);
        try {
          await updateDoc(empRef, {
            name: trimmedName,
            mobile: trimmedMobile,
            department: resolvedDepartment,
            joiningDate,
            basicSalary: roundCurrency(parsedSalary),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `employees/${editingEmployee.id}`
          );
        }
        cancelEditEmployee();
        onEmployeeUpdated(
          `Updated employee ${trimmedName} (${resolvedDepartment}).`
        );
        return;
      }

      const rawAutoId = doc(collection(db, 'employees')).id
        .slice(0, 8)
        .toUpperCase();
      const employeeId = `EMP-${rawAutoId}`;

      const empRef = doc(db, 'employees', employeeId);
      try {
        await setDoc(empRef, {
          ownerId,
          name: trimmedName,
          mobile: trimmedMobile,
          department: resolvedDepartment,
          joiningDate,
          basicSalary: roundCurrency(parsedSalary),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.CREATE,
          `employees/${employeeId}`
        );
      }

      setName('');
      setMobile('');
      setCustomDepartment('');
      setBasicSalaryInput('');
      setJoiningDate(getTodayIsoDate());
      onEmployeeCreated(trimmedName, resolvedDepartment);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to save employee.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section aria-label="Employee payroll and advance summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* Total Employees */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Total Employees
              </p>
              <UserCheck className="w-4 h-4 text-[#1e3a8a] shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : stats.employeeCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Across {stats.departmentCount}{' '}
              {stats.departmentCount === 1 ? 'department' : 'departments'}
            </p>
          </div>

          {/* Monthly Basic Payroll */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Basic Monthly Payroll
              </p>
              <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {isLoading ? '—' : formatCurrency(stats.totalMonthlyPayroll)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Combined basic monthly salaries
            </p>
          </div>

          {/* Total Advances This Month */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Advances This Month
              </p>
              <HandCoins className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700">
              {isLoading ? '—' : formatCurrency(stats.totalAdvanceThisMonth)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {currentMonthLabel} · {stats.advanceCountThisMonth}{' '}
              {stats.advanceCountThisMonth === 1 ? 'payout' : 'payouts'}
            </p>
          </div>

          {/* Est. Remaining Payroll */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Est. Remaining Payroll
              </p>
              <CalendarDays className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                stats.netEstPayroll < 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {isLoading ? '—' : formatCurrency(stats.netEstPayroll)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Basic payroll minus month advances
            </p>
          </div>
        </div>
      </section>

      {/* Main Responsive Split: Add Employee Form (Left) + Employee List & Advances (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Add / Edit Employee Form Card */}
        <section
          aria-labelledby="add-employee-heading"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-2">
            <div>
              <h2
                id="add-employee-heading"
                className="font-display text-base font-semibold text-slate-900"
              >
                {editingEmployee
                  ? `Edit Employee: ${editingEmployee.name}`
                  : 'Add Employee'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingEmployee
                  ? 'Update worker details or basic monthly salary'
                  : 'Register mill workers and staff to track salaries and weekly advances'}
              </p>
            </div>
            {editingEmployee && (
              <button
                type="button"
                onClick={cancelEditEmployee}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                title="Cancel editing"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <form onSubmit={handleAddEmployee} className="p-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
              >
                {formError}
              </div>
            )}

            {/* Name */}
            <div>
              <label
                htmlFor="empName"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Name <span className="text-red-600">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="empName"
                type="text"
                required
                maxLength={EMPLOYEE_VALIDATION.nameMax}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Md. Sohel Mia"
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            {/* Mobile */}
            <div>
              <label
                htmlFor="empMobile"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Mobile <span className="text-red-600">*</span>
              </label>
              <input
                id="empMobile"
                type="tel"
                required
                maxLength={EMPLOYEE_VALIDATION.mobileMax}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. 01711-000000"
                className="w-full px-3.5 py-2.5 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              />
            </div>

            {/* Department */}
            <div>
              <label
                htmlFor="empDepartment"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Department <span className="text-red-600">*</span>
              </label>
              <select
                id="empDepartment"
                required
                value={departmentPreset}
                onChange={(e) =>
                  setDepartmentPreset(e.target.value as EmployeeDepartment)
                }
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
              >
                {EMPLOYEE_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {departmentPreset === 'Other' && (
              <div>
                <label
                  htmlFor="empCustomDepartment"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Custom Department Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="empCustomDepartment"
                  type="text"
                  required
                  maxLength={EMPLOYEE_VALIDATION.departmentMax}
                  value={customDepartment}
                  onChange={(e) => setCustomDepartment(e.target.value)}
                  placeholder="e.g. Quality Control, Security"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>
            )}

            {/* Joining Date & Basic Monthly Salary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              <div>
                <label
                  htmlFor="empJoiningDate"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Joining Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="empJoiningDate"
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label
                  htmlFor="empBasicSalary"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Basic Monthly Salary <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500">
                    ৳
                  </span>
                  <input
                    id="empBasicSalary"
                    type="number"
                    required
                    min="1"
                    max={EMPLOYEE_VALIDATION.maxSalary}
                    step="0.01"
                    value={basicSalaryInput}
                    onChange={(e) => setBasicSalaryInput(e.target.value)}
                    placeholder="15000.00"
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-mono font-medium tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={isSubmitting || !isSalaryValid}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {editingEmployee ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 shrink-0" />
                    {isSubmitting ? 'Saving Employee...' : 'Add Employee'}
                  </>
                )}
              </button>

              {editingEmployee && (
                <div className={isAdmin ? 'grid grid-cols-2 gap-2' : ''}>
                  <button
                    type="button"
                    onClick={cancelEditEmployee}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingEmployee;
                        cancelEditEmployee();
                        onDeleteEmployee(target);
                      }}
                      disabled={isSubmitting}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Employee
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </section>

        {/* Employee List & Advance History (Right) */}
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Tab Switcher Header */}
          <div className="px-5 pt-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-5" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'employees'}
                onClick={() => setActiveTab('employees')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'employees'
                    ? 'border-[#1e3a8a] text-[#1e3a8a]'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <UserRound className="w-4 h-4" />
                Employee Directory
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  ({employees.length})
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'advances'}
                onClick={() => setActiveTab('advances')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'advances'
                    ? 'border-[#1e3a8a] text-[#1e3a8a]'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <History className="w-4 h-4" />
                Weekly Advance Log
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  ({advances.length})
                </span>
              </button>
            </div>
          </div>

          {activeTab === 'employees' ? (
            <>
              {/* Employee Filter Bar */}
              <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employee name, mobile, or department..."
                    aria-label="Search employees"
                    className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>

                <select
                  aria-label="Filter employees by department"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                >
                  <option value="all">All Departments</option>
                  {stats.availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {isLoading ? (
                <div className="divide-y divide-slate-200">
                  {[1, 2, 3, 4].map((row) => (
                    <div
                      key={row}
                      className="px-5 py-4 flex justify-between gap-4 animate-pulse"
                    >
                      <div className="h-4 w-44 bg-slate-200 rounded" />
                      <div className="h-4 w-28 bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : employees.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto mb-4">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    No employees added yet
                  </h3>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
                    Use the Add Employee form to register workers in Dyeing,
                    Washing, Admin, or other mill departments and issue weekly
                    advances.
                  </p>
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    No employees match your search
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setDepartmentFilter('all');
                    }}
                    className="mt-4 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5">Employee</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4 text-right">Basic Salary</th>
                        <th className="py-3 px-4 text-right">
                          Advance This Month
                        </th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredEmployees.map((emp) => {
                        const empAdv = advancesByEmployeeId.get(emp.id) ?? {
                          thisMonthTotal: 0,
                          thisMonthCount: 0,
                          allTimeTotal: 0,
                        };
                        const exceedsSalary =
                          empAdv.thisMonthTotal > emp.basicSalary;
                        const remainingEst = roundCurrency(
                          emp.basicSalary - empAdv.thisMonthTotal
                        );

                        return (
                          <tr
                            key={emp.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3.5 px-5">
                              <button
                                type="button"
                                onClick={() => onOpenProfile(emp)}
                                className="text-left group cursor-pointer"
                              >
                                <p className="font-medium text-slate-900 group-hover:text-[#1e3a8a] transition-colors">
                                  {emp.name}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                                  {emp.mobile}{' '}
                                  <span className="font-sans text-slate-400">
                                    · Joined {formatIsoDate(emp.joiningDate)}
                                  </span>
                                </p>
                              </button>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded border ${
                                  DEPARTMENT_BADGE_CLASSES[emp.department] ??
                                  'bg-zinc-100 text-zinc-700 border-zinc-200'
                                }`}
                              >
                                {emp.department}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                                {formatCurrency(emp.basicSalary)}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                                Rem: {formatCurrency(remainingEst)}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <p
                                className={`font-mono text-sm font-semibold tabular-nums ${
                                  exceedsSalary
                                    ? 'text-red-700'
                                    : empAdv.thisMonthTotal > 0
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                }`}
                              >
                                {formatCurrency(empAdv.thisMonthTotal)}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {empAdv.thisMonthCount === 0
                                  ? 'No advance'
                                  : `${empAdv.thisMonthCount} ${
                                      empAdv.thisMonthCount === 1
                                        ? 'advance'
                                        : 'advances'
                                    }`}
                              </p>
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onGiveAdvance(emp)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer"
                                >
                                  <HandCoins className="w-3.5 h-3.5 shrink-0" />
                                  Give Advance
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenProfile(emp)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                                >
                                  Profile
                                </button>
                                {isAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEditEmployee(emp)}
                                      title="Edit Employee"
                                      aria-label={`Edit ${emp.name}`}
                                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteEmployee(emp)}
                                      title="Delete Employee"
                                      aria-label={`Delete ${emp.name}`}
                                      className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Weekly Advance History Filter Bar */}
              <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={advanceSearch}
                    onChange={(e) => setAdvanceSearch(e.target.value)}
                    placeholder="Search ADV reference, employee, department, or note..."
                    aria-label="Search weekly advances"
                    className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div
                    role="group"
                    aria-label="Filter advance period"
                    className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
                  >
                    <button
                      type="button"
                      onClick={() => setAdvancePeriod('month')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        advancePeriod === 'month'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvancePeriod('all')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        advancePeriod === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Time
                    </button>
                  </div>

                  <span className="font-mono text-xs font-semibold tabular-nums text-red-700 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-md whitespace-nowrap">
                    Total: {formatCurrency(filteredAdvancesSubtotal)}
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className="p-5 space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-slate-100 rounded" />
                  ))}
                </div>
              ) : filteredAdvances.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    {advances.length === 0
                      ? 'No weekly advances issued yet'
                      : 'No advances match the selected filter'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {advances.length === 0
                      ? 'Click Give Advance beside any employee to record a payout and automatically update cash balance.'
                      : 'Switch to All Time or clear your search query.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5">Ref &amp; Date</th>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">Note</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredAdvances.map((adv) => {
                        const linkedMoneyOut =
                          moneyOutByIdOrRef.get(adv.moneyOutId) ??
                          moneyOutByIdOrRef.get(adv.reference) ??
                          null;
                        return (
                          <tr
                            key={adv.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <p className="font-mono text-xs font-semibold text-slate-900">
                                {adv.reference}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatIsoDate(adv.advanceDate)}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <p className="font-medium text-slate-900">
                                {adv.employeeName}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {adv.department}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                {adv.paymentMethod === 'Bank' ? (
                                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <Banknote className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                {adv.paymentMethod}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs break-words">
                              {adv.note || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold tabular-nums text-red-700 whitespace-nowrap">
                              −{formatCurrency(adv.amount)}
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              {linkedMoneyOut ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCorrectMoneyOut(linkedMoneyOut)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                  Correct / Adjust
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
