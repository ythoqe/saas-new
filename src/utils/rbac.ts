import type { NavSection, UserRole } from '../types/mill';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'hmmojjammalhoq@gmail.com';

const ROLE_SECTIONS: Record<UserRole, ReadonlySet<NavSection>> = {
  admin: new Set<NavSection>([
    'overview',
    'clients',
    'orders',
    'new-order',
    'suppliers',
    'purchases',
    'new-purchase',
    'inventory',
    'expenses',
    'employees',
    'ledger',
    'users',
  ]),
  manager: new Set<NavSection>([
    'clients',
    'orders',
    'new-order',
    'suppliers',
    'purchases',
    'new-purchase',
    'inventory',
  ]),
  accountant: new Set<NavSection>([
    'overview',
    'clients',
    'suppliers',
    'expenses',
    'ledger',
  ]),
};

export function normalizeUserRole(role: unknown): UserRole {
  if (role === 'admin' || role === 'manager' || role === 'accountant') {
    return role;
  }
  return 'manager';
}

export function canAccessSection(
  role: UserRole | undefined | null,
  section: NavSection
): boolean {
  const safeRole = normalizeUserRole(role);
  return ROLE_SECTIONS[safeRole]?.has(section) ?? false;
}

export function getDefaultSectionForRole(
  role: UserRole | undefined | null
): NavSection {
  if (normalizeUserRole(role) === 'manager') {
    return 'orders';
  }
  return 'overview';
}

export function isAdminRole(role: UserRole | undefined | null): boolean {
  return normalizeUserRole(role) === 'admin';
}

export function canCreateClientsOrSuppliers(
  role: UserRole | undefined | null
): boolean {
  const safeRole = normalizeUserRole(role);
  return safeRole === 'admin' || safeRole === 'manager';
}

export function canManagePayments(role: UserRole | undefined | null): boolean {
  const safeRole = normalizeUserRole(role);
  return safeRole === 'admin' || safeRole === 'accountant';
}

export function canAdjustLedgers(role: UserRole | undefined | null): boolean {
  const safeRole = normalizeUserRole(role);
  return safeRole === 'admin' || safeRole === 'accountant';
}

export function canViewOrders(role: UserRole | undefined | null): boolean {
  const safeRole = normalizeUserRole(role);
  return safeRole === 'admin' || safeRole === 'manager';
}

export function canViewInventory(role: UserRole | undefined | null): boolean {
  const safeRole = normalizeUserRole(role);
  return safeRole === 'admin' || safeRole === 'manager';
}

export function canViewCashflow(role: UserRole | undefined | null): boolean {
  const safeRole = normalizeUserRole(role);
  return safeRole === 'admin' || safeRole === 'accountant';
}

export function canViewEmployees(role: UserRole | undefined | null): boolean {
  return normalizeUserRole(role) === 'admin';
}

export function getRoleBadgeClasses(role: UserRole | undefined | null): string {
  switch (normalizeUserRole(role)) {
    case 'admin':
      return 'bg-[#1e3a8a]/10 text-[#1e3a8a] border border-[#1e3a8a]/25';
    case 'manager':
      return 'bg-amber-50 text-amber-800 border border-amber-200';
    case 'accountant':
      return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  }
}
