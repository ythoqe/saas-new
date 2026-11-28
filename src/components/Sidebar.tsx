import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  Layers,
  LogOut,
  Package,
  PlusCircle,
  Receipt,
  Shield,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { useLanguage } from '../contexts/LanguageContext';
import type { NavSection, UserRole } from '../types/mill';
import { canAccessSection, getRoleBadgeClasses } from '../utils/rbac';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  user: User;
  userRole: UserRole;
  onSignOut: () => void;
  clientCount: number;
  orderCount: number;
  supplierCount: number;
  purchaseCount: number;
  inventoryCount: number;
  lowStockCount: number;
  expenseCount: number;
  employeeCount: number;
  ledgerCount: number;
  userCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  user,
  userRole = 'manager',
  onSignOut,
  clientCount,
  orderCount,
  supplierCount,
  purchaseCount,
  inventoryCount,
  lowStockCount,
  expenseCount,
  employeeCount,
  ledgerCount,
  userCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { t, translateRole } = useLanguage();

  const isAccountant = userRole === 'accountant';

  const allNavGroups: {
    heading: string;
    items: {
      id: NavSection;
      label: string;
      icon: typeof Users;
      count?: number;
      alertCount?: number;
    }[];
  }[] = [
    {
      heading: t('nav.group.overview'),
      items: [
        {
          id: 'overview',
          label: t('nav.overview'),
          icon: LayoutDashboard,
        },
      ],
    },
    {
      heading: t('nav.group.receivables'),
      items: [
        {
          id: 'clients',
          label: isAccountant ? t('nav.clientPayments') : t('nav.clients'),
          icon: Users,
          count: clientCount,
        },
        {
          id: 'orders',
          label: t('nav.orders'),
          icon: ClipboardList,
          count: orderCount,
        },
        {
          id: 'new-order',
          label: t('nav.newOrder'),
          icon: PlusCircle,
        },
      ],
    },
    {
      heading: t('nav.group.payables'),
      items: [
        {
          id: 'suppliers',
          label: isAccountant ? t('nav.supplierPayments') : t('nav.suppliers'),
          icon: Truck,
          count: supplierCount,
        },
        {
          id: 'purchases',
          label: t('nav.purchases'),
          icon: Package,
          count: purchaseCount,
        },
        {
          id: 'new-purchase',
          label: t('nav.newPurchase'),
          icon: ShoppingCart,
        },
        {
          id: 'inventory',
          label: t('nav.inventory'),
          icon: Boxes,
          count: inventoryCount,
          alertCount: lowStockCount,
        },
      ],
    },
    {
      heading: t('nav.group.staffCosts'),
      items: [
        {
          id: 'employees',
          label: t('nav.employees'),
          icon: UserCheck,
          count: employeeCount,
        },
        {
          id: 'expenses',
          label: t('nav.expenses'),
          icon: Receipt,
          count: expenseCount,
        },
      ],
    },
    {
      heading: t('nav.group.reports'),
      items: [
        {
          id: 'accounts',
          label: t('nav.accounts'),
          icon: Landmark,
        },
        {
          id: 'reports',
          label: t('nav.reports'),
          icon: BarChart3,
        },
        {
          id: 'ledger',
          label: t('nav.ledger'),
          icon: BookOpen,
          count: ledgerCount,
        },
      ],
    },
    {
      heading: t('nav.group.admin'),
      items: [
        {
          id: 'users',
          label: t('nav.users'),
          icon: Shield,
          count: userCount,
        },
      ],
    },
  ];

  const navGroups = allNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessSection(userRole, item.id)),
    }))
    .filter((group) => group.items.length > 0);

  const handleNavClick = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#0f172a] text-slate-200 border-r border-slate-800 select-none">
      {/* Brand header */}
      <div className="min-h-16 px-4 py-2.5 flex items-center justify-between gap-2 border-b border-slate-800/90 shrink-0">
        <div
          className="flex items-center gap-3 min-w-0"
          title="মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্"
        >
          <div className="w-8 h-8 rounded-md bg-[#1e3a8a] border border-blue-400/20 flex items-center justify-center text-white shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block font-display text-sm font-semibold tracking-tight text-white leading-tight truncate">
              Mayer Doa washing
            </span>
            <span className="block text-[11px] font-normal text-slate-400 leading-snug mt-0.5 break-words">
              মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Grouped Navigation links */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.heading} className="space-y-1">
            <p className="px-3 mb-2 text-xs font-medium text-slate-400">
              {group.heading}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                    isActive
                      ? 'bg-[#1e3a8a] text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-blue-200' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {typeof item.alertCount === 'number' && item.alertCount > 0 && (
                      <span
                        title={`${item.alertCount} ${t('inventory.kpi.lowStockAlerts')}`}
                        className="px-1.5 py-0.5 rounded bg-red-600 text-[10px] font-mono font-semibold text-white tabular-nums leading-none"
                      >
                        {item.alertCount} {t('common.low')}
                      </span>
                    )}
                    {typeof item.count === 'number' && (
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          isActive ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Operator profile & Sign Out */}
      <div className="p-4 border-t border-slate-800/90 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName ?? 'Operator avatar'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200 shrink-0">
              {(user.displayName || user.email || 'M').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.displayName || t('nav.millOperator')}
              </p>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded shrink-0 ${getRoleBadgeClasses(
                  userRole
                )}`}
              >
                {translateRole(userRole)}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t('nav.signOut')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
