/**
 * Payload-First Security Test Specification for firestore.rules
 * Verifies adversarial payloads across RBAC roles (admin, manager, accountant)
 * and all 15 mill collections return PERMISSION_DENIED against Firestore Security Rules.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collection:
    | 'app_meta'
    | 'users'
    | 'clients'
    | 'client_ledger'
    | 'orders'
    | 'money_in'
    | 'suppliers'
    | 'supplier_ledger'
    | 'purchases'
    | 'money_out'
    | 'expenses'
    | 'inventory'
    | 'stock_movements'
    | 'employees'
    | 'employee_advances';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean; role?: 'admin' | 'manager' | 'accountant' } | null;
  docId?: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const dirtyDozenTestCases: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated client creation',
    collection: 'clients',
    operation: 'create',
    auth: null,
    docId: 'client_unauth',
    payload: {
      ownerId: 'userA',
      clientName: 'Rahim Uddin',
      companyName: 'Apex Knitwear',
      mobile: '+8801711000000',
      address: 'Gazipur, Dhaka',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email user write',
    collection: 'orders',
    operation: 'create',
    auth: { uid: 'userA', email_verified: false, role: 'manager' },
    docId: 'ORD-20261123-0001',
    payload: {
      ownerId: 'userA',
      clientId: 'client_1',
      orderDate: '2026-11-23',
      fabricType: 'মার্কিন',
      greyFabricThan: 10,
      greyFabricGaj: 500,
      rate: 25,
      status: 'Processing',
      finalGaj: null,
      finalBillAmount: null,
      deliveredAt: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Non-admin self-role escalation on /users/{uid} update',
    collection: 'users',
    operation: 'update',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'managerUid',
    payload: {
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Non-admin listing all user profiles (/users PII isolation)',
    collection: 'users',
    operation: 'list',
    auth: { uid: 'accountantUid', email_verified: true, role: 'accountant' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Subsequent sign-up attempting to self-assign admin after bootstrap exists',
    collection: 'users',
    operation: 'create',
    auth: { uid: 'attackerUid', email_verified: true },
    docId: 'attackerUid',
    payload: {
      uid: 'attackerUid',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Manager attempting to read or write money_in (restricted to Admin & Accountant)',
    collection: 'money_in',
    operation: 'create',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'PAY-MANAGER01',
    payload: {
      ownerId: 'managerUid',
      clientId: 'client_1',
      ledgerEntryId: 'PAY-MANAGER01',
      reference: 'PAY-MANAGER01',
      amount: 12000,
      paymentDate: '2026-11-26',
      paymentMethod: 'Cash',
      note: 'Unauthorized manager receipt',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Manager attempting to record factory expense / money_out',
    collection: 'expenses',
    operation: 'create',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'EXP-MANAGER01',
    payload: {
      ownerId: 'managerUid',
      moneyOutId: 'EXP-MANAGER01',
      reference: 'EXP-MANAGER01',
      expenseDate: '2026-11-26',
      category: 'Electricity',
      amount: 15000,
      paymentMethod: 'Bank',
      description: 'Unauthorized manager expense',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Accountant attempting to list or mutate inventory (restricted to Admin & Manager)',
    collection: 'inventory',
    operation: 'list',
    auth: { uid: 'accountantUid', email_verified: true, role: 'accountant' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Accountant attempting to create an order (restricted to Admin & Manager)',
    collection: 'orders',
    operation: 'create',
    auth: { uid: 'accountantUid', email_verified: true, role: 'accountant' },
    docId: 'ORD-ACC001',
    payload: {
      ownerId: 'accountantUid',
      clientId: 'client_1',
      orderDate: '2026-11-26',
      fabricType: 'ভয়েল',
      greyFabricThan: 8,
      greyFabricGaj: 400,
      rate: 28,
      status: 'Processing',
      finalGaj: null,
      finalBillAmount: null,
      deliveredAt: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Manager attempting to delete or edit master Client record (Admin ONLY)',
    collection: 'clients',
    operation: 'delete',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'client_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Non-admin reading employees collection (Admin ONLY)',
    collection: 'employees',
    operation: 'list',
    auth: { uid: 'accountantUid', email_verified: true, role: 'accountant' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Shadow field injection (balance field on clients)',
    collection: 'clients',
    operation: 'create',
    auth: { uid: 'adminUid', email_verified: true, role: 'admin' },
    docId: 'client_shadow',
    payload: {
      ownerId: 'adminUid',
      clientName: 'Kamal Hasan',
      companyName: 'Delta Apparels',
      mobile: '01811223344',
      address: 'Narayanganj',
      balance: 25000,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Creating order directly in Delivered status (bypassing auto-billing)',
    collection: 'orders',
    operation: 'create',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'ORD-20261123-0003',
    payload: {
      ownerId: 'managerUid',
      clientId: 'client_1',
      orderDate: '2026-11-23',
      fabricType: 'ভয়েল',
      greyFabricThan: 8,
      greyFabricGaj: 400,
      rate: 28,
      status: 'Delivered',
      finalGaj: 390,
      finalBillAmount: 10920,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 14,
    name: 'Forged Final Bill Amount on Complete & Deliver',
    collection: 'orders',
    operation: 'update',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'ORD-20261123-0004',
    payload: {
      status: 'Delivered',
      finalGaj: 400,
      finalBillAmount: 100,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 15,
    name: 'Terminal state violation: mutating an already Delivered order',
    collection: 'orders',
    operation: 'update',
    auth: { uid: 'adminUid', email_verified: true, role: 'admin' },
    docId: 'ORD-DELIVERED-001',
    payload: {
      status: 'Processing',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 16,
    name: 'Ledger mutation attempt (tampering with append-only client_ledger)',
    collection: 'client_ledger',
    operation: 'update',
    auth: { uid: 'adminUid', email_verified: true, role: 'admin' },
    docId: 'INV_ORD-DELIVERED-001',
    payload: {
      debit: 0,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 17,
    name: 'Orphaned expense without atomic money_out document',
    collection: 'expenses',
    operation: 'create',
    auth: { uid: 'accountantUid', email_verified: true, role: 'accountant' },
    docId: 'EXP-ABCD1234',
    payload: {
      ownerId: 'accountantUid',
      moneyOutId: 'EXP-ABCD1234',
      reference: 'EXP-ABCD1234',
      expenseDate: '2026-11-25',
      category: 'Electricity',
      amount: 15000,
      paymentMethod: 'Bank',
      description: 'November electricity bill',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 18,
    name: 'Negative stock update on inventory item',
    collection: 'inventory',
    operation: 'update',
    auth: { uid: 'managerUid', email_verified: true, role: 'manager' },
    docId: 'INV-BLEACH01',
    payload: {
      currentStock: -15,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 19,
    name: 'Immutable stock_movements tamper attempt',
    collection: 'stock_movements',
    operation: 'delete',
    auth: { uid: 'adminUid', email_verified: true, role: 'admin' },
    docId: 'MOV-VALID001',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 20,
    name: 'Tampering with /app_meta/bootstrap singleton after initialization',
    collection: 'app_meta',
    operation: 'update',
    auth: { uid: 'adminUid', email_verified: true, role: 'admin' },
    docId: 'bootstrap',
    payload: {
      firstAdminUid: 'otherUid',
    },
    expected: 'PERMISSION_DENIED',
  },
];
