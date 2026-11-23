import type { Timestamp } from 'firebase/firestore';
import type {
  ClientLedgerEntry,
  ClientRecord,
  ClientWithLedgerSummary,
  LedgerTxnType,
} from '../types/mill';

export function timestampToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') {
    return ts.toDate();
  }
  return null;
}

/**
 * Round financial values cleanly to 2 decimal places to prevent floating-point drift.
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * CRITICAL LEDGER FORMULA:
 * Current Due = (Sum of Debit) - (Sum of Credit)
 */
export function calculateLedgerTotals(entries: ClientLedgerEntry[]): {
  totalDebit: number;
  totalCredit: number;
  currentDue: number;
} {
  let debitSum = 0;
  let creditSum = 0;

  for (const entry of entries) {
    debitSum += Number(entry.debit) || 0;
    creditSum += Number(entry.credit) || 0;
  }

  const totalDebit = roundCurrency(debitSum);
  const totalCredit = roundCurrency(creditSum);
  const currentDue = roundCurrency(totalDebit - totalCredit);

  return { totalDebit, totalCredit, currentDue };
}

export function buildClientSummaries(
  clients: ClientRecord[],
  ledgerEntries: ClientLedgerEntry[]
): ClientWithLedgerSummary[] {
  const entriesByClient = new Map<string, ClientLedgerEntry[]>();

  for (const entry of ledgerEntries) {
    const existing = entriesByClient.get(entry.clientId);
    if (existing) {
      existing.push(entry);
    } else {
      entriesByClient.set(entry.clientId, [entry]);
    }
  }

  return clients
    .map((client) => {
      const clientEntries = entriesByClient.get(client.id) ?? [];
      const { totalDebit, totalCredit, currentDue } = calculateLedgerTotals(clientEntries);

      let lastActivityAt: Date | null = timestampToDate(client.createdAt);
      for (const entry of clientEntries) {
        const entryDate = timestampToDate(entry.createdAt);
        if (entryDate && (!lastActivityAt || entryDate.getTime() > lastActivityAt.getTime())) {
          lastActivityAt = entryDate;
        }
      }

      return {
        client,
        totalDebit,
        totalCredit,
        currentDue,
        entryCount: clientEntries.length,
        lastActivityAt,
      };
    })
    .sort((a, b) => {
      const timeA = timestampToDate(a.client.createdAt)?.getTime() ?? 0;
      const timeB = timestampToDate(b.client.createdAt)?.getTime() ?? 0;
      return timeB - timeA;
    });
}

export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  const sign = amount < 0 ? '-' : '';
  return `${sign}৳${formatted}`;
}

export function formatDateTime(date: Date | null): string {
  if (!date) return 'Just now';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDate(date: Date | null): string {
  if (!date) return 'Just now';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function getTxnTypeLabel(txnType: LedgerTxnType): string {
  switch (txnType) {
    case 'opening':
      return 'Opening Due';
    case 'invoice':
      return 'Dyeing / Washing Bill';
    case 'payment':
      return 'Payment Received';
    case 'adjustment':
      return 'Ledger Adjustment';
  }
}

export function getDueStatusLabel(currentDue: number): {
  label: string;
  tone: 'due' | 'settled' | 'advance';
} {
  if (currentDue > 0) {
    return { label: 'Due', tone: 'due' };
  }
  if (currentDue < 0) {
    return { label: 'Advance', tone: 'advance' };
  }
  return { label: 'Settled', tone: 'settled' };
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates a clean, human-readable Order ID valid under ^[a-zA-Z0-9_\-]+$.
 * Example: ORD-20261123-4821
 */
export function generateOrderId(orderDate: string): string {
  const compactDate = orderDate.replaceAll('-', '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${compactDate}-${randomSuffix}`;
}

export function formatNumber(value: number, maxDecimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

export function formatIsoDate(isoDate: string): string {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * INVERTED SUPPLIER PAYABLE FORMULA:
 * Total Payable = (Sum of Credit) - (Sum of Debit)
 * Credit = Purchase / Opening Payable (increases debt)
 * Debit  = Payment to Supplier (decreases debt)
 */
export function calculateSupplierLedgerTotals(
  entries: { debit: number; credit: number }[]
): {
  totalCredit: number;
  totalDebit: number;
  totalPayable: number;
} {
  let creditSum = 0;
  let debitSum = 0;

  for (const entry of entries) {
    creditSum += Number(entry.credit) || 0;
    debitSum += Number(entry.debit) || 0;
  }

  const totalCredit = roundCurrency(creditSum);
  const totalDebit = roundCurrency(debitSum);
  const totalPayable = roundCurrency(totalCredit - totalDebit);

  return { totalCredit, totalDebit, totalPayable };
}

export function buildSupplierSummaries(
  suppliers: import('../types/mill').SupplierRecord[],
  ledgerEntries: import('../types/mill').SupplierLedgerEntry[]
): import('../types/mill').SupplierWithLedgerSummary[] {
  const entriesBySupplier = new Map<
    string,
    import('../types/mill').SupplierLedgerEntry[]
  >();

  for (const entry of ledgerEntries) {
    const existing = entriesBySupplier.get(entry.supplierId);
    if (existing) {
      existing.push(entry);
    } else {
      entriesBySupplier.set(entry.supplierId, [entry]);
    }
  }

  return suppliers
    .map((supplier) => {
      const supplierEntries = entriesBySupplier.get(supplier.id) ?? [];
      const { totalCredit, totalDebit, totalPayable } =
        calculateSupplierLedgerTotals(supplierEntries);

      let lastActivityAt: Date | null = timestampToDate(supplier.createdAt);
      for (const entry of supplierEntries) {
        const entryDate = timestampToDate(entry.createdAt);
        if (
          entryDate &&
          (!lastActivityAt || entryDate.getTime() > lastActivityAt.getTime())
        ) {
          lastActivityAt = entryDate;
        }
      }

      return {
        supplier,
        totalCredit,
        totalDebit,
        totalPayable,
        entryCount: supplierEntries.length,
        lastActivityAt,
      };
    })
    .sort((a, b) => {
      const timeA = timestampToDate(a.supplier.createdAt)?.getTime() ?? 0;
      const timeB = timestampToDate(b.supplier.createdAt)?.getTime() ?? 0;
      return timeB - timeA;
    });
}

export function getSupplierTxnTypeLabel(
  txnType: import('../types/mill').SupplierLedgerTxnType
): string {
  switch (txnType) {
    case 'opening':
      return 'Opening Payable';
    case 'purchase':
      return 'Purchase Bill';
    case 'payment':
      return 'Supplier Payment';
    case 'adjustment':
      return 'Payable Adjustment';
  }
}

export function getPayableStatusLabel(totalPayable: number): {
  label: string;
  tone: 'payable' | 'settled' | 'advance';
} {
  if (totalPayable > 0) {
    return { label: 'Payable', tone: 'payable' };
  }
  if (totalPayable < 0) {
    return { label: 'Advance Paid', tone: 'advance' };
  }
  return { label: 'Settled', tone: 'settled' };
}


