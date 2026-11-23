import type { Timestamp } from 'firebase/firestore';

export type LedgerTxnType = 'opening' | 'invoice' | 'payment' | 'adjustment';

export type SupplierLedgerTxnType =
  | 'opening'
  | 'purchase'
  | 'payment'
  | 'adjustment';

export type NavSection =
  | 'clients'
  | 'orders'
  | 'new-order'
  | 'suppliers'
  | 'purchases'
  | 'new-purchase'
  | 'ledger'
  | 'overview';

export const FABRIC_TYPES = [
  'মার্কিন',
  'লংক্লথ',
  'ভয়েল',
  'পপলিন',
  'ইউনিটিকা',
  'আস্তর',
] as const;

export type FabricType = (typeof FABRIC_TYPES)[number];

export const IN_PROGRESS_ORDER_STATUSES = [
  'Processing',
  'Dyeing',
  'Washing',
  'Finishing',
] as const;

export type InProgressOrderStatus = (typeof IN_PROGRESS_ORDER_STATUSES)[number];
export type OrderStatus = InProgressOrderStatus | 'Delivered';

export const PAYMENT_METHODS = ['Cash', 'Bank', 'Mobile Banking'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SUPPLIER_PAYMENT_METHODS = ['Cash', 'Bank'] as const;
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

export const PURCHASE_UNITS = ['KG', 'Liter', 'Pcs'] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];

export interface ClientRecord {
  id: string;
  ownerId: string;
  clientName: string;
  companyName: string;
  mobile: string;
  address: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ClientLedgerEntry {
  id: string;
  ownerId: string;
  clientId: string;
  txn_type: LedgerTxnType;
  debit: number;
  credit: number;
  note: string;
  reference: string;
  createdAt: Timestamp | null;
}

export interface OrderRecord {
  id: string;
  ownerId: string;
  clientId: string;
  orderDate: string;
  fabricType: FabricType;
  greyFabricThan: number;
  greyFabricGaj: number;
  rate: number;
  status: OrderStatus;
  finalGaj: number | null;
  finalBillAmount: number | null;
  deliveredAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MoneyInRecord {
  id: string;
  ownerId: string;
  clientId: string;
  ledgerEntryId: string;
  reference: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  createdAt: Timestamp | null;
}

export interface SupplierRecord {
  id: string;
  ownerId: string;
  supplierName: string;
  companyName: string;
  mobile: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface SupplierLedgerEntry {
  id: string;
  ownerId: string;
  supplierId: string;
  txn_type: SupplierLedgerTxnType;
  debit: number;
  credit: number;
  reference: string;
  note: string;
  createdAt: Timestamp | null;
}

export interface PurchaseRecord {
  id: string;
  ownerId: string;
  supplierId: string;
  ledgerEntryId: string;
  reference: string;
  purchaseDate: string;
  itemName: string;
  quantity: number;
  unit: PurchaseUnit;
  rate: number;
  totalAmount: number;
  createdAt: Timestamp | null;
}

export interface MoneyOutRecord {
  id: string;
  ownerId: string;
  supplierId: string;
  ledgerEntryId: string;
  reference: string;
  amount: number;
  paymentDate: string;
  paymentMethod: SupplierPaymentMethod;
  note: string;
  createdAt: Timestamp | null;
}

export interface ClientWithLedgerSummary {
  client: ClientRecord;
  totalDebit: number;
  totalCredit: number;
  /** Dynamically calculated: (Sum of Debit) - (Sum of Credit) */
  currentDue: number;
  entryCount: number;
  lastActivityAt: Date | null;
}

export interface SupplierWithLedgerSummary {
  supplier: SupplierRecord;
  totalCredit: number;
  totalDebit: number;
  /** Dynamically calculated (inverted payable logic): (Sum of Credit) - (Sum of Debit) */
  totalPayable: number;
  entryCount: number;
  lastActivityAt: Date | null;
}

/**
 * Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
 */
export const CLIENT_VALIDATION = {
  clientNameMin: 1,
  clientNameMax: 120,
  companyNameMin: 1,
  companyNameMax: 160,
  mobileMin: 5,
  mobileMax: 25,
  mobilePattern: /^[+0-9 ()-]+$/,
  addressMin: 1,
  addressMax: 300,
} as const;

export const LEDGER_VALIDATION = {
  maxAmount: 1000000000,
  noteMax: 300,
  referenceMax: 80,
} as const;

export const ORDER_VALIDATION = {
  maxThan: 1000000,
  maxGaj: 10000000,
  maxRate: 1000000,
  orderDatePattern: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
} as const;

export const PAYMENT_VALIDATION = {
  maxAmount: 1000000000,
  noteMax: 300,
  datePattern: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
} as const;

export const SUPPLIER_VALIDATION = {
  supplierNameMin: 1,
  supplierNameMax: 120,
  companyNameMin: 1,
  companyNameMax: 160,
  mobileMin: 5,
  mobileMax: 25,
  mobilePattern: /^[+0-9 ()-]+$/,
} as const;

export const PURCHASE_VALIDATION = {
  itemNameMin: 1,
  itemNameMax: 160,
  maxQuantity: 10000000,
  maxRate: 10000000,
  maxTotalAmount: 1000000000,
  datePattern: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
} as const;
