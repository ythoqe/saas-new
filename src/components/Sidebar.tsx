import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Layers,
  LogOut,
  Package,
  PlusCircle,
  ShoppingCart,
  Truck,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { NavSection } from '../types/mill';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  user: User;
  onSignOut: () => void;
  clientCount: number;
  orderCount: number;
  supplierCount: number;
  purchaseCount: number;
  ledgerCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  user,
  onSignOut,
  clientCount,
  orderCount,
  supplierCount,
  purchaseCount,
  ledgerCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navGroups: {
    heading: string;
    items: {
      id: NavSection;
      label: string;
      icon: typeof Users;
      count?: number;
    }[];
  }[] = [
    {
      heading: 'Overview',
      items: [
        {
          id: 'overview',
          label: 'Dashboard Overview',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      heading: 'Receivables & Orders',
      items: [
        {
          id: 'clients',
          label: 'Client Management',
          icon: Users,
          count: clientCount,
        },
        {
          id: 'orders',
          label: 'Orders & Delivery',
          icon: ClipboardList,
          count: orderCount,
        },
        {
          id: 'new-order',
          label: 'New Order',
          icon: PlusCircle,
        },
      ],
    },
    {
      heading: 'Payables & Inventory',
      items: [
        {
          id: 'suppliers',
          label: 'Suppliers',
          icon: Truck,
          count: supplierCount,
        },
        {
          id: 'purchases',
          label: 'Purchases',
          icon: Package,
          count: purchaseCount,
        },
        {
          id: 'new-purchase',
          label: 'New Purchase',
          icon: ShoppingCart,
        },
      ],
    },
    {
      heading: 'Reports & Ledgers',
      items: [
        {
          id: 'ledger',
          label: 'Client Ledger Book',
          icon: BookOpen,
          count: ledgerCount,
        },
      ],
    },
  ];

  const handleNavClick = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#0f172a] text-slate-200 border-r border-slate-800 select-none">
      {/* Brand header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/90 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-[#1e3a8a] border border-blue-400/20 flex items-center justify-center text-white shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-white truncate">
            IndigoMill Ledger
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
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
                  {typeof item.count === 'number' && (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isActive ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
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
            <p className="text-sm font-medium text-white truncate">
              {user.displayName || 'Mill Operator'}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
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
