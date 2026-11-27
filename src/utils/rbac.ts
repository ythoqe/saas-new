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

export function canAccessSection(role: UserRole, section: NavSection): boolean {
  return ROLE_SECTIONS[role].has(section);
}

export function getDefaultSectionForRole(role: UserRole): NavSection {
  if (role === 'manager') {
    return 'orders';
  }
  return 'overview';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

export function canCreateClientsOrSuppliers(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

export function canManagePayments(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

export function canAdjustLedgers(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

export function canViewOrders(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

export function canViewInventory(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

export function canViewCashflow(role: UserRole): boolean {
  return role === 'admin' || role === 'accountant';
}

export function canViewEmployees(role: UserRole): boolean {
  return role === 'admin';
}

export function getRoleBadgeClasses(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-[#1e3a8a]/10 text-[#1e3a8a] border border-[#1e3a8a]/25';
    case 'manager':
      return 'bg-amber-50 text-amber-800 border border-amber-200';
    case 'accountant':
      return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  }
}
