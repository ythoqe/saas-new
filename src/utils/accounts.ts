import type {
  AccountRecord,
  MoneyInRecord,
  MoneyOutRecord,
  PaymentMethod,
} from '../types/mill';
import { roundCurrency } from './ledger';

export const DEFAULT_ACCOUNT_SEEDS: ReadonlyArray<{
  id: string;
  accountName: string;
  accountType: PaymentMethod;
  openingBalance: number;
}> = [
  {
    id: 'default_cash',
    accountName: 'Main Cash',
    accountType: 'Cash',
    openingBalance: 0,
  },
  {
    id: 'default_bank',
    accountName: 'Bank Account',
    accountType: 'Bank',
    openingBalance: 0,
  },
  {
    id: 'default_mobile',
    accountName: 'Mobile Banking',
    accountType: 'Mobile Banking',
    openingBalance: 0,
  },
];

export interface ComputedAccountStats {
  account: AccountRecord;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  /** Live Balance = openingBalance + totalIn - totalOut */
  balance: number;
  inCount: number;
  outCount: number;
  txnCount: number;
}

/**
 * Ensures we always have a non-empty list of accounts for dropdowns & calculations
 * even before the initial Firestore seed finishes.
 */
export function getEffectiveAccounts(
  accounts: AccountRecord[],
  ownerId = ''
): AccountRecord[] {
  if (accounts.length > 0) {
    return accounts;
  }
  return DEFAULT_ACCOUNT_SEEDS.map((seed) => ({
    id: seed.id,
    ownerId,
    accountName: seed.accountName,
    accountType: seed.accountType,
    openingBalance: seed.openingBalance,
    createdAt: null,
    updatedAt: null,
  }));
}

/**
 * Resolves which AccountRecord a money_in or money_out transaction belongs to.
 * - Matches directly by `accountId` when present.
 * - Falls back to matching by `accountName` (case-insensitive) if `accountId` is missing.
 * - For legacy records without `accountId`, matches the primary account of the same `paymentMethod` (Cash / Bank / Mobile Banking).
 */
export function resolveTransactionAccount(
  record: {
    accountId?: string | null;
    accountName?: string | null;
    paymentMethod: PaymentMethod;
  },
  accounts: AccountRecord[]
): AccountRecord | null {
  const effective = getEffectiveAccounts(accounts);
  if (effective.length === 0) return null;

  if (record.accountId) {
    const byId = effective.find((acc) => acc.id === record.accountId);
    if (byId) return byId;
  }

  if (record.accountName) {
    const targetName = record.accountName.trim().toLowerCase();
    const byName = effective.find(
      (acc) => acc.accountName.trim().toLowerCase() === targetName
    );
    if (byName) return byName;
  }

  // Fallback for legacy transactions recorded before accountId was introduced
  const defaultIdForType =
    record.paymentMethod === 'Cash'
      ? 'default_cash'
      : record.paymentMethod === 'Bank'
        ? 'default_bank'
        : 'default_mobile';

  const defaultMatch = effective.find((acc) => acc.id === defaultIdForType);
  if (defaultMatch) return defaultMatch;

  const firstOfType = effective.find(
    (acc) => acc.accountType === record.paymentMethod
  );
  return firstOfType ?? effective[0];
}

export function resolveTransactionAccountId(
  record: {
    accountId?: string | null;
    accountName?: string | null;
    paymentMethod: PaymentMethod;
  },
  accounts: AccountRecord[]
): string {
  return resolveTransactionAccount(record, accounts)?.id ?? '';
}

export function resolveCounterAccountDisplayName(
  record: {
    counterAccountId?: string | null;
    counterAccountName?: string | null;
    counterAccount?: PaymentMethod | null;
  },
  accounts: AccountRecord[]
): string {
  if (record.counterAccountName && record.counterAccountName.trim()) {
    return record.counterAccountName.trim();
  }
  const effective = getEffectiveAccounts(accounts);
  if (record.counterAccountId) {
    const match = effective.find((a) => a.id === record.counterAccountId);
    if (match) return match.accountName;
  }
  if (record.counterAccount) {
    const match = effective.find(
      (a) => a.accountType === record.counterAccount
    );
    if (match) return match.accountName;
    return record.counterAccount;
  }
  return 'Counter Account';
}

export function computeDynamicAccountStats(
  accounts: AccountRecord[],
  moneyInRecords: MoneyInRecord[],
  moneyOutRecords: MoneyOutRecord[]
): {
  list: ComputedAccountStats[];
  byId: Map<string, ComputedAccountStats>;
  balancesById: Record<string, number>;
  combinedOpening: number;
  combinedIn: number;
  combinedOut: number;
  combinedBalance: number;
  combinedTxns: number;
} {
  const effective = getEffectiveAccounts(accounts);
  const byId = new Map<string, ComputedAccountStats>();

  for (const acc of effective) {
    const opening = roundCurrency(Number(acc.openingBalance) || 0);
    byId.set(acc.id, {
      account: acc,
      openingBalance: opening,
      totalIn: 0,
      totalOut: 0,
      balance: opening,
      inCount: 0,
      outCount: 0,
      txnCount: 0,
    });
  }

  for (const rec of moneyInRecords) {
    const matched = resolveTransactionAccount(rec, effective);
    if (!matched) continue;
    const stats = byId.get(matched.id);
    if (!stats) continue;
    const amt = roundCurrency(Number(rec.amount) || 0);
    stats.totalIn = roundCurrency(stats.totalIn + amt);
    stats.inCount += 1;
    stats.txnCount += 1;
  }

  for (const rec of moneyOutRecords) {
    const matched = resolveTransactionAccount(rec, effective);
    if (!matched) continue;
    const stats = byId.get(matched.id);
    if (!stats) continue;
    const amt = roundCurrency(Number(rec.amount) || 0);
    stats.totalOut = roundCurrency(stats.totalOut + amt);
    stats.outCount += 1;
    stats.txnCount += 1;
  }

  let combinedOpening = 0;
  let combinedIn = 0;
  let combinedOut = 0;
  let combinedBalance = 0;
  let combinedTxns = 0;
  const balancesById: Record<string, number> = {};

  const list = effective.map((acc) => {
    const stats = byId.get(acc.id)!;
    stats.balance = roundCurrency(
      stats.openingBalance + stats.totalIn - stats.totalOut
    );
    balancesById[acc.id] = stats.balance;
    combinedOpening = roundCurrency(combinedOpening + stats.openingBalance);
    combinedIn = roundCurrency(combinedIn + stats.totalIn);
    combinedOut = roundCurrency(combinedOut + stats.totalOut);
    combinedBalance = roundCurrency(combinedBalance + stats.balance);
    combinedTxns += stats.txnCount;
    return stats;
  });

  return {
    list,
    byId,
    balancesById,
    combinedOpening,
    combinedIn,
    combinedOut,
    combinedBalance,
    combinedTxns,
  };
}
