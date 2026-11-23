/**
 * Payload-First Security Test Specification for firestore.rules
 * Verifies adversarial payloads across clients, client_ledger, and orders
 * return PERMISSION_DENIED against Firestore Security Rules.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collection: 'clients' | 'client_ledger' | 'orders';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
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
    auth: { uid: 'userA', email_verified: false },
    docId: 'ORD-20261123-0001',
    payload: {
      ownerId: 'userA',
      clientId: 'userA_client_1',
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
    name: 'Cross-tenant PII read (GET)',
    collection: 'clients',
    operation: 'get',
    auth: { uid: 'userB', email_verified: true },
    docId: 'userA_client_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unfiltered collection scrape (LIST) on orders',
    collection: 'orders',
    operation: 'list',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection (balance field on clients)',
    collection: 'clients',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    docId: 'client_shadow',
    payload: {
      ownerId: 'userA',
      clientName: 'Kamal Hasan',
      companyName: 'Delta Apparels',
      mobile: '01811223344',
      address: 'Narayanganj',
      balance: 25000,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned order referencing another owner client',
    collection: 'orders',
    operation: 'create',
    auth: { uid: 'userB', email_verified: true },
    docId: 'ORD-20261123-0002',
    payload: {
      ownerId: 'userB',
      clientId: 'userA_client_1',
      orderDate: '2026-11-23',
      fabricType: 'পপলিন',
      greyFabricThan: 5,
      greyFabricGaj: 250,
      rate: 30,
      status: 'Processing',
      finalGaj: null,
      finalBillAmount: null,
      deliveredAt: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Creating order directly in Delivered status (bypassing auto-billing)',
    collection: 'orders',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    docId: 'ORD-20261123-0003',
    payload: {
      ownerId: 'userA',
      clientId: 'userA_client_1',
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
    id: 8,
    name: 'Forged Final Bill Amount on Complete & Deliver',
    collection: 'orders',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    docId: 'ORD-20261123-0004',
    payload: {
      status: 'Delivered',
      finalGaj: 400,
      finalBillAmount: 100, // Forged instead of 400 * rate
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Delivering order without atomic client_ledger/INV_{orderId} write',
    collection: 'orders',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    docId: 'ORD-20261123-0004',
    payload: {
      status: 'Delivered',
      finalGaj: 400,
      finalBillAmount: 10000,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal state violation: mutating an already Delivered order',
    collection: 'orders',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    docId: 'ORD-DELIVERED-001',
    payload: {
      status: 'Processing',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Invalid fabric type outside allowed enum',
    collection: 'orders',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    docId: 'ORD-20261123-0005',
    payload: {
      ownerId: 'userA',
      clientId: 'userA_client_1',
      orderDate: '2026-11-23',
      fabricType: 'UnknownFabric',
      greyFabricThan: 4,
      greyFabricGaj: 200,
      rate: 20,
      status: 'Processing',
      finalGaj: null,
      finalBillAmount: null,
      deliveredAt: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Ledger mutation attempt (tampering with append-only client_ledger)',
    collection: 'client_ledger',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    docId: 'INV_ORD-DELIVERED-001',
    payload: {
      debit: 0,
    },
    expected: 'PERMISSION_DENIED',
  },
];
