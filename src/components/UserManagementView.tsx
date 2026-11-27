import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  USER_ROLES,
  type UserProfile,
  type UserRole,
} from '../types/mill';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateTime, timestampToDate } from '../utils/ledger';
import { getRoleBadgeClasses } from '../utils/rbac';

interface UserManagementViewProps {
  users: UserProfile[];
  currentUserUid: string;
  isLoading: boolean;
  onRoleUpdated: (message: string) => void;
}

export function UserManagementView({
  users,
  currentUserUid,
  isLoading,
  onRoleUpdated,
}: UserManagementViewProps) {
  const { t, translateRole } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    let admin = 0;
    let manager = 0;
    let accountant = 0;
    for (const u of users) {
      if (u.role === 'admin') admin += 1;
      else if (u.role === 'manager') manager += 1;
      else if (u.role === 'accountant') accountant += 1;
    }
    return {
      total: users.length,
      admin,
      manager,
      accountant,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...users]
      .filter((u) => {
        if (roleFilter !== 'all' && u.role !== roleFilter) return false;
        if (!q) return true;
        return (
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.uid === currentUserUid) return -1;
        if (b.uid === currentUserUid) return 1;
        const order: Record<UserRole, number> = {
          admin: 0,
          manager: 1,
          accountant: 2,
        };
        if (order[a.role] !== order[b.role]) {
          return order[a.role] - order[b.role];
        }
        return a.email.localeCompare(b.email);
      });
  }, [users, searchQuery, roleFilter, currentUserUid]);

  const handleRoleChange = async (target: UserProfile, nextRole: UserRole) => {
    if (target.role === nextRole) return;
    if (target.uid === currentUserUid) return;

    setError(null);
    setUpdatingUid(target.uid);
    try {
      try {
        await updateDoc(doc(db, 'users', target.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
      }
      onRoleUpdated(
        `Updated ${target.displayName || target.email} to ${translateRole(nextRole)}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update user role.'
      );
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>{t('users.kpi.total')}</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {counts.total.toLocaleString('en-US')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>{t('users.kpi.admins')}</span>
            <ShieldCheck className="w-4 h-4 text-[#1e3a8a]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#1e3a8a]">
            {counts.admin.toLocaleString('en-US')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>{t('users.kpi.managers')}</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-amber-700">
            {counts.manager.toLocaleString('en-US')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>{t('users.kpi.accountants')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700">
            {counts.accountant.toLocaleString('en-US')}
          </p>
        </div>
      </div>

      {/* Role Access Matrix Summary */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3.5">
          <Shield className="w-4 h-4 text-[#1e3a8a]" />
          <h2 className="font-display text-sm font-semibold text-slate-900">
            {t('users.permissionsTitle')}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {USER_ROLES.map((r) => (
            <div
              key={r}
              className="p-3.5 rounded-md bg-slate-50 border border-slate-200/80"
            >
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded ${getRoleBadgeClasses(
                  r
                )}`}
              >
                {translateRole(r)}
              </span>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                {t(`role.${r}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
        >
          {error}
        </div>
      )}

      {/* Search & Role Filter */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', ...USER_ROLES] as const).map((filterVal) => {
              const isActive = roleFilter === filterVal;
              return (
                <button
                  key={filterVal}
                  type="button"
                  onClick={() => setRoleFilter(filterVal)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {filterVal === 'all'
                    ? t('common.all')
                    : translateRole(filterVal)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">{t('users.table.user')}</th>
                <th className="px-5 py-3">{t('users.table.joined')}</th>
                <th className="px-5 py-3">{t('users.table.currentRole')}</th>
                <th className="px-5 py-3 text-right">
                  {t('users.table.assignRole')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-sm text-slate-500"
                  >
                    {t('app.loading')}
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-sm text-slate-500"
                  >
                    {t('users.empty')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.uid === currentUserUid;
                  const isBusy = updatingUid === u.uid;
                  const joinedDate = timestampToDate(u.createdAt);

                  return (
                    <tr
                      key={u.uid}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-md bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                            {(u.displayName || u.email || 'U')
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 truncate">
                                {u.displayName || u.email}
                              </span>
                              {isSelf && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white rounded">
                                  {t('users.youBadge')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {u.email}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 truncate">
                              UID: {u.uid}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap font-mono">
                        {joinedDate ? formatDateTime(joinedDate) : '—'}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded ${getRoleBadgeClasses(
                            u.role
                          )}`}
                        >
                          {translateRole(u.role)}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {isSelf ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-md">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#1e3a8a]" />
                            {t('users.selfProtected')}
                          </span>
                        ) : (
                          <select
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            disabled={isBusy}
                            onChange={(e) =>
                              void handleRoleChange(
                                u,
                                e.target.value as UserRole
                              )
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a] disabled:opacity-60 cursor-pointer"
                          >
                            {USER_ROLES.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {translateRole(roleOption)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
