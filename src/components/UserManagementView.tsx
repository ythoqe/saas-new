import React, { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Mail,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  USER_ROLES,
  USER_VALIDATION,
  type AllowedUserRecord,
  type UserProfile,
  type UserRole,
} from '../types/mill';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateTime, timestampToDate } from '../utils/ledger';
import { BOOTSTRAPPED_ADMIN_EMAIL, getRoleBadgeClasses } from '../utils/rbac';

interface UserManagementViewProps {
  users: UserProfile[];
  allowedUsers: AllowedUserRecord[];
  currentUserUid: string;
  currentUserEmail: string;
  isLoading: boolean;
  onRoleUpdated: (message: string) => void;
}

export function UserManagementView({
  users,
  allowedUsers,
  currentUserUid,
  currentUserEmail,
  isLoading,
  onRoleUpdated,
}: UserManagementViewProps) {
  const { lang, t, translateRole } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite User Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('manager');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const usersByEmail = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) {
      if (u.email) {
        map.set(u.email.trim().toLowerCase(), u);
      }
    }
    return map;
  }, [users]);

  const allowedByEmail = useMemo(() => {
    const map = new Map<string, AllowedUserRecord>();
    for (const a of allowedUsers) {
      if (a.email) {
        map.set(a.email.trim().toLowerCase(), a);
      }
    }
    return map;
  }, [allowedUsers]);

  const counts = useMemo(() => {
    let admin = 0;
    let manager = 0;
    let accountant = 0;

    // Count across allowedUsers + any active users not yet in allowedUsers
    const seenEmails = new Set<string>();
    for (const a of allowedUsers) {
      const key = a.email.trim().toLowerCase();
      seenEmails.add(key);
      if (a.role === 'admin') admin += 1;
      else if (a.role === 'manager') manager += 1;
      else if (a.role === 'accountant') accountant += 1;
    }
    for (const u of users) {
      const key = u.email.trim().toLowerCase();
      if (key && !seenEmails.has(key)) {
        seenEmails.add(key);
        if (u.role === 'admin') admin += 1;
        else if (u.role === 'manager') manager += 1;
        else if (u.role === 'accountant') accountant += 1;
      }
    }

    return {
      total: seenEmails.size,
      admin,
      manager,
      accountant,
    };
  }, [allowedUsers, users]);

  const filteredAllowedUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selfEmailLower = currentUserEmail.trim().toLowerCase();

    return [...allowedUsers]
      .filter((a) => {
        if (roleFilter !== 'all' && a.role !== roleFilter) return false;
        if (!q) return true;
        const linkedProfile = usersByEmail.get(a.email.toLowerCase());
        return (
          a.email.toLowerCase().includes(q) ||
          a.invitedByEmail.toLowerCase().includes(q) ||
          (linkedProfile?.displayName.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        const aIsSelf = a.email.toLowerCase() === selfEmailLower;
        const bIsSelf = b.email.toLowerCase() === selfEmailLower;
        if (aIsSelf && !bIsSelf) return -1;
        if (!aIsSelf && bIsSelf) return 1;
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
  }, [allowedUsers, usersByEmail, searchQuery, roleFilter, currentUserEmail]);

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

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (
      normalizedEmail.length < USER_VALIDATION.emailMin ||
      normalizedEmail.length > USER_VALIDATION.emailMax ||
      !USER_VALIDATION.emailPattern.test(normalizedEmail)
    ) {
      setInviteError(
        lang === 'bn'
          ? 'অনুগ্রহ করে একটি সঠিক ইমেইল ঠিকানা লিখুন।'
          : 'Please enter a valid email address.'
      );
      return;
    }

    const existingInvite = allowedByEmail.get(normalizedEmail);
    const existingProfile = usersByEmail.get(normalizedEmail);
    const adminEmail = currentUserEmail.trim() || BOOTSTRAPPED_ADMIN_EMAIL;

    setIsInviting(true);
    try {
      const batch = writeBatch(db);
      const allowedRef = doc(db, 'allowed_users', normalizedEmail);

      if (existingInvite) {
        batch.update(allowedRef, {
          role: inviteRole,
          invitedByUid: currentUserUid,
          invitedByEmail: adminEmail,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(allowedRef, {
          email: normalizedEmail,
          role: inviteRole,
          invitedByUid: currentUserUid,
          invitedByEmail: adminEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (existingProfile && existingProfile.uid !== currentUserUid) {
        batch.update(doc(db, 'users', existingProfile.uid), {
          role: inviteRole,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          existingInvite ? OperationType.UPDATE : OperationType.CREATE,
          `allowed_users/${normalizedEmail}`
        );
      }

      setInviteEmail('');
      setInviteRole('manager');
      setInviteModalOpen(false);
      onRoleUpdated(
        existingInvite
          ? `Updated invitation for ${normalizedEmail} to ${translateRole(inviteRole)}.`
          : `Invited ${normalizedEmail} as ${translateRole(inviteRole)}.`
      );
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : 'Unable to invite user.'
      );
    } finally {
      setIsInviting(false);
    }
  };

  const handleAllowedRoleChange = async (
    record: AllowedUserRecord,
    nextRole: UserRole
  ) => {
    const emailKey = record.email.trim().toLowerCase();
    const selfEmailLower = currentUserEmail.trim().toLowerCase();
    if (record.role === nextRole) return;
    if (
      emailKey === selfEmailLower ||
      emailKey === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    ) {
      return;
    }

    setError(null);
    setUpdatingKey(emailKey);
    try {
      const batch = writeBatch(db);
      const adminEmail = currentUserEmail.trim() || BOOTSTRAPPED_ADMIN_EMAIL;
      batch.update(doc(db, 'allowed_users', emailKey), {
        role: nextRole,
        invitedByUid: currentUserUid,
        invitedByEmail: adminEmail,
        updatedAt: serverTimestamp(),
      });

      const linkedProfile = usersByEmail.get(emailKey);
      if (linkedProfile && linkedProfile.uid !== currentUserUid) {
        batch.update(doc(db, 'users', linkedProfile.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `allowed_users/${emailKey}`
        );
      }

      onRoleUpdated(
        `Updated ${record.email} to ${translateRole(nextRole)}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update user role.'
      );
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleRevokeInvite = async (record: AllowedUserRecord) => {
    const emailKey = record.email.trim().toLowerCase();
    const selfEmailLower = currentUserEmail.trim().toLowerCase();
    if (
      emailKey === selfEmailLower ||
      emailKey === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    ) {
      return;
    }

    setError(null);
    setUpdatingKey(emailKey);
    try {
      try {
        await deleteDoc(doc(db, 'allowed_users', emailKey));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `allowed_users/${emailKey}`
        );
      }
      onRoleUpdated(
        `Revoked access for ${record.email}. They will be signed out immediately.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to revoke user access.'
      );
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleRoleChange = async (target: UserProfile, nextRole: UserRole) => {
    if (target.role === nextRole) return;
    if (target.uid === currentUserUid) return;

    setError(null);
    setUpdatingKey(target.uid);
    try {
      const emailKey = target.email.trim().toLowerCase();
      const adminEmail = currentUserEmail.trim() || BOOTSTRAPPED_ADMIN_EMAIL;
      const existingAllowed = allowedByEmail.get(emailKey);

      try {
        await updateDoc(doc(db, 'users', target.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
        if (emailKey && USER_VALIDATION.emailPattern.test(emailKey)) {
          if (existingAllowed) {
            await updateDoc(doc(db, 'allowed_users', emailKey), {
              role: nextRole,
              invitedByUid: currentUserUid,
              invitedByEmail: adminEmail,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'allowed_users', emailKey), {
              email: emailKey,
              role: nextRole,
              invitedByUid: currentUserUid,
              invitedByEmail: adminEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
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
      setUpdatingKey(null);
    }
  };

  const selfEmailLower = currentUserEmail.trim().toLowerCase();

  return (
    <div className="space-y-6">
      {/* Top Action Banner: Invite-Only Security Gate + Invite User Button */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-50 border border-blue-200 text-[#1e3a8a] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {lang === 'bn'
                ? 'ইনভাইট-অনলি অ্যাক্সেস কন্ট্রোল (allowed_users)'
                : 'Invite-Only Access Control (allowed_users)'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed max-w-2xl">
              {lang === 'bn'
                ? 'শুধুমাত্র অনুমোদিত ইমেইল তালিকাভুক্ত ব্যবহারকারীরা অ্যাপে প্রবেশ এবং ডাটাবেস ব্যবহার করতে পারবেন। অননুমোদিত কেউ Google দিয়ে লগইন করলে সাথে সাথে সাইন-আউট হয়ে যাবেন।'
                : 'Only users whose email is listed in allowed_users can sign in or read/write database records. Uninvited Google accounts are automatically signed out with an Access Denied message.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setInviteError(null);
            setInviteEmail('');
            setInviteRole('manager');
            setInviteModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4 shrink-0" />
          {lang === 'bn' ? 'ইউজার ইনভাইট করুন' : 'Invite User'}
        </button>
      </div>

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

      {/* Invited / Allowed Users Table (allowed_users collection) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              {lang === 'bn'
                ? 'অনুমোদিত ও ইনভাইটেড ইউজার তালিকা (allowed_users)'
                : 'Invited & Allowed Users (allowed_users)'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'bn'
                ? 'এই তালিকায় থাকা ইমেইলগুলোই কেবল অ্যাপে লগইন করতে পারবে।'
                : 'Emails authorized to sign in and access mill data.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('users.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">
                  {lang === 'bn' ? 'ইমেইল ও ইউজার' : 'Invited Email & User'}
                </th>
                <th className="px-5 py-3">
                  {lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}
                </th>
                <th className="px-5 py-3">
                  {lang === 'bn' ? 'ইনভাইটের তারিখ' : 'Invited On'}
                </th>
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
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-slate-500"
                  >
                    {t('app.loading')}
                  </td>
                </tr>
              ) : filteredAllowedUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-slate-500"
                  >
                    {t('users.empty')}
                  </td>
                </tr>
              ) : (
                filteredAllowedUsers.map((invite) => {
                  const emailKey = invite.email.trim().toLowerCase();
                  const linkedProfile = usersByEmail.get(emailKey);
                  const isSelf =
                    emailKey === selfEmailLower ||
                    (linkedProfile && linkedProfile.uid === currentUserUid);
                  const isPrimaryAdmin =
                    emailKey === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
                  const isProtected = Boolean(isSelf || isPrimaryAdmin);
                  const isBusy = updatingKey === emailKey;
                  const invitedDate = timestampToDate(invite.createdAt);

                  return (
                    <tr
                      key={emailKey}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-md bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                            {(linkedProfile?.displayName || invite.email || 'U')
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 truncate">
                                {linkedProfile?.displayName || invite.email}
                              </span>
                              {isSelf && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-900 text-white rounded">
                                  {t('users.youBadge')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-slate-600 truncate">
                              {invite.email}
                            </p>
                            {invite.invitedByEmail && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {lang === 'bn' ? 'ইনভাইট করেছেন:' : 'Invited by:'}{' '}
                                {invite.invitedByEmail}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {linkedProfile ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {lang === 'bn' ? 'সক্রিয় (লগইন করেছেন)' : 'Active (Joined)'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
                            <Mail className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            {lang === 'bn'
                              ? 'ইনভাইটেড (প্রথম লগইনের অপেক্ষায়)'
                              : 'Invited (Pending Login)'}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap font-mono">
                        {invitedDate ? formatDateTime(invitedDate) : '—'}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded ${getRoleBadgeClasses(
                            invite.role
                          )}`}
                        >
                          {translateRole(invite.role)}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {isProtected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-md">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#1e3a8a]" />
                            {t('users.selfProtected')}
                          </span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-2">
                            <select
                              aria-label={`Role for ${invite.email}`}
                              value={invite.role}
                              disabled={isBusy}
                              onChange={(e) =>
                                void handleAllowedRoleChange(
                                  invite,
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
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleRevokeInvite(invite)}
                              title={
                                lang === 'bn'
                                  ? 'অ্যাক্সেস বাতিল করুন'
                                  : 'Revoke Access'
                              }
                              aria-label={`Revoke access for ${invite.email}`}
                              className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

      {/* Active Signed-In User Profiles Table (/users) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {lang === 'bn'
              ? 'নিবন্ধিত ইউজার প্রোফাইল (users)'
              : 'Registered User Profiles (users)'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === 'bn'
              ? 'যেসব অনুমোদিত ব্যবহারকারী ইতিমধ্যে Google দিয়ে লগইন করেছেন।'
              : 'Invited users who have signed in with Google at least once.'}
          </p>
        </div>

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
                  const isBusy = updatingKey === u.uid;
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

      {/* Invite User Modal */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-user-modal-title"
        >
          <div
            className="fixed inset-0"
            onClick={() => !isInviting && setInviteModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-200 text-[#1e3a8a] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3
                  id="invite-user-modal-title"
                  className="font-display text-base font-semibold text-slate-900"
                >
                  {lang === 'bn' ? 'নতুন ইউজার ইনভাইট করুন' : 'Invite User'}
                </h3>
              </div>
              <button
                type="button"
                disabled={isInviting}
                onClick={() => setInviteModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4">
              {inviteError && (
                <div
                  role="alert"
                  className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md"
                >
                  {inviteError}
                </div>
              )}

              <div>
                <label
                  htmlFor="invite-user-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {lang === 'bn'
                    ? 'Google ইমেইল ঠিকানা'
                    : 'Google Email Address'}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="invite-user-email"
                  type="email"
                  required
                  autoFocus
                  maxLength={USER_VALIDATION.emailMax}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@gmail.com"
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {lang === 'bn'
                    ? 'এই ইমেইলটি allowed_users কালেকশনে যুক্ত হবে যাতে তিনি Google দিয়ে লগইন করতে পারেন।'
                    : 'This email will be added to allowed_users so they can sign in with Google.'}
                </p>
              </div>

              <div>
                <label
                  htmlFor="invite-user-role"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {lang === 'bn' ? 'রোল নির্বাচন করুন' : 'Assign Role'}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <select
                  id="invite-user-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a] cursor-pointer"
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {translateRole(r)}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  {t(`role.${inviteRole}.desc`)}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isInviting}
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {isInviting
                    ? lang === 'bn'
                      ? 'যুক্ত হচ্ছে...'
                      : 'Inviting...'
                    : lang === 'bn'
                      ? 'ইনভাইট নিশ্চিত করুন'
                      : 'Add to Allowed Users'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
