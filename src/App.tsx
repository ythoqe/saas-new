import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, Globe, Menu, Plus, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  LanguageProvider,
  useLanguage,
  type Language,
} from './contexts/LanguageContext';
import { AddClientDrawer } from './components/AddClientDrawer';
import { AddSupplierDrawer } from './components/AddSupplierDrawer';
import { AuthScreen } from './components/AuthScreen';
import {
  ClientLedgerDrawer,
  type ClientDrawerTab,
} from './components/ClientLedgerDrawer';
import { ClientManagementView } from './components/ClientManagementView';
import { CompleteDeliverModal } from './components/CompleteDeliverModal';
import {
  ConfirmDeleteModal,
  type DeleteTargetConfig,
} from './components/ConfirmDeleteModal';
import { DashboardOverview } from './components/DashboardOverview';
import { EditOrderModal } from './components/EditOrderModal';
import { EditPurchaseModal } from './components/EditPurchaseModal';
import { EmployeeProfileDrawer } from './components/EmployeeProfileDrawer';
import { EmployeesView } from './components/EmployeesView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExpensesView } from './components/ExpensesView';
import { GiveAdvanceModal } from './components/GiveAdvanceModal';
import { InventoryView } from './components/InventoryView';
import {
  InvoicePrintModal,
  type PrintDocumentPayload,
  type PrintDocumentType,
} from './components/InvoicePrintModal';
import { LedgerBookView } from './components/LedgerBookView';
import {
  LedgerReversalAdjustmentModal,
  type LedgerAdjustmentTarget,
} from './components/LedgerReversalAdjustmentModal';
import { NewOrderPage } from './components/NewOrderPage';
import { NewPurchasePage } from './components/NewPurchasePage';
import { OrdersListView } from './components/OrdersListView';
import { PaySalaryModal } from './components/PaySalaryModal';
import { PaySupplierModal } from './components/PaySupplierModal';
import { PurchasesListView } from './components/PurchasesListView';
import { ReceivePaymentModal } from './components/ReceivePaymentModal';
import { Sidebar } from './components/Sidebar';
import {
  StatementPrintModal,
  type StatementPrintPayload,
} from './components/StatementPrintModal';
import {
  SupplierLedgerDrawer,
  type SupplierDrawerTab,
} from './components/SupplierLedgerDrawer';
import { SupplierManagementView } from './components/SupplierManagementView';
import { UserManagementView } from './components/UserManagementView';
import type {
  AdvancePaymentMethod,
  ClientLedgerEntry,
  ClientRecord,
  ClientWithLedgerSummary,
  EmployeeAdvanceRecord,
  EmployeeRecord,
  ExpenseCategory,
  ExpenseRecord,
  InventoryItem,
  InventoryUnit,
  MoneyInRecord,
  MoneyOutRecord,
  NavSection,
  OrderRecord,
  PurchaseRecord,
  SalaryPaymentMethod,
  SalaryPaymentRecord,
  StockMovementRecord,
  StockMovementType,
  SupplierLedgerEntry,
  SupplierRecord,
  SupplierWithLedgerSummary,
  UserProfile,
  UserRole,
} from './types/mill';
import {
  buildClientSummaries,
  buildSupplierSummaries,
  formatCurrency,
  formatNumber,
  getTodayIsoDate,
  roundCurrency,
  timestampToDate,
} from './utils/ledger';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  canAccessSection,
  canAdjustLedgers,
  canCreateClientsOrSuppliers,
  canManagePayments,
  canViewCashflow,
  canViewEmployees,
  canViewInventory,
  canViewOrders,
  getDefaultSectionForRole,
  isAdminRole,
} from './utils/rbac';

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

function MillDashboardShell() {
  const { lang, setLang, t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userProfileLoaded, setUserProfileLoaded] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);

  // Receivables & Orders state
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<ClientLedgerEntry[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [moneyInRecords, setMoneyInRecords] = useState<MoneyInRecord[]>([]);

  // Payables & Inventory state
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierLedgerEntries, setSupplierLedgerEntries] = useState<
    SupplierLedgerEntry[]
  >([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [moneyOutRecords, setMoneyOutRecords] = useState<MoneyOutRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementRecord[]>(
    []
  );
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [employeeAdvances, setEmployeeAdvances] = useState<
    EmployeeAdvanceRecord[]
  >([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPaymentRecord[]>(
    []
  );

  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [moneyInLoaded, setMoneyInLoaded] = useState(false);
  const [suppliersLoaded, setSuppliersLoaded] = useState(false);
  const [supplierLedgerLoaded, setSupplierLedgerLoaded] = useState(false);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [moneyOutLoaded, setMoneyOutLoaded] = useState(false);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [stockMovementsLoaded, setStockMovementsLoaded] = useState(false);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [employeeAdvancesLoaded, setEmployeeAdvancesLoaded] = useState(false);
  const [salaryPaymentsLoaded, setSalaryPaymentsLoaded] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expenseFormFocusSignal, setExpenseFormFocusSignal] = useState(0);
  const [inventoryFormFocusSignal, setInventoryFormFocusSignal] = useState(0);
  const [employeeFormFocusSignal, setEmployeeFormFocusSignal] = useState(0);

  // Client drawers/modals
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [selectedLedgerClientId, setSelectedLedgerClientId] = useState<string | null>(
    null
  );
  const [ledgerDrawerTab, setLedgerDrawerTab] = useState<ClientDrawerTab>('ledger');
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);
  const [receivingPaymentClientId, setReceivingPaymentClientId] = useState<
    string | null
  >(null);

  // Supplier drawers/modals
  const [supplierDrawerOpen, setSupplierDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [supplierDrawerTab, setSupplierDrawerTab] =
    useState<SupplierDrawerTab>('ledger');
  const [payingSupplierId, setPayingSupplierId] = useState<string | null>(null);

  // Employee drawers/modals
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [givingAdvanceEmployeeId, setGivingAdvanceEmployeeId] = useState<
    string | null
  >(null);
  const [payingSalaryEmployeeId, setPayingSalaryEmployeeId] = useState<
    string | null
  >(null);

  // Invoice & Delivery Challan print preview modal
  const [printDocument, setPrintDocument] =
    useState<PrintDocumentPayload | null>(null);

  // Client & Supplier A4 Statement print modal target
  const [statementTarget, setStatementTarget] = useState<
    | { kind: 'client'; id: string }
    | { kind: 'supplier'; id: string }
    | null
  >(null);

  // Correction, Edit/Delete, and Append-Only Reversal/Adjustment modals
  const [deleteTarget, setDeleteTarget] = useState<DeleteTargetConfig | null>(
    null
  );
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRecord | null>(
    null
  );
  const [ledgerAdjustmentTarget, setLedgerAdjustmentTarget] =
    useState<LedgerAdjustmentTarget | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setUserProfile(null);
        setUserProfileLoaded(false);
        setRegisteredUsers([]);
        setUsersLoaded(false);
        setClients([]);
        setLedgerEntries([]);
        setOrders([]);
        setMoneyInRecords([]);
        setSuppliers([]);
        setSupplierLedgerEntries([]);
        setPurchases([]);
        setMoneyOutRecords([]);
        setExpenses([]);
        setInventoryItems([]);
        setStockMovements([]);
        setEmployees([]);
        setEmployeeAdvances([]);
        setSalaryPayments([]);
        setSalaryPaymentsLoaded(false);
        setPayingSalaryEmployeeId(null);
        setClientsLoaded(false);
        setLedgerLoaded(false);
        setOrdersLoaded(false);
        setMoneyInLoaded(false);
        setSuppliersLoaded(false);
        setSupplierLedgerLoaded(false);
        setPurchasesLoaded(false);
        setMoneyOutLoaded(false);
        setExpensesLoaded(false);
        setInventoryLoaded(false);
        setStockMovementsLoaded(false);
        setEmployeesLoaded(false);
        setEmployeeAdvancesLoaded(false);
        setSelectedLedgerClientId(null);
        setDeliveringOrderId(null);
        setReceivingPaymentClientId(null);
        setSelectedSupplierId(null);
        setPayingSupplierId(null);
        setSelectedEmployeeId(null);
        setGivingAdvanceEmployeeId(null);
        setPrintDocument(null);
        setStatementTarget(null);
        setDeleteTarget(null);
        setEditingOrder(null);
        setEditingPurchase(null);
        setLedgerAdjustmentTarget(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // User Profile Bootstrap (First User Rule) & Real-Time Role Sync
  useEffect(() => {
    if (!authReady || !user) return;

    let cancelled = false;
    let unsubUserDoc: (() => void) | null = null;
    setUserProfileLoaded(false);

    const bootstrapAndListen = async () => {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        const existingSnap = await getDoc(userDocRef);
        if (!existingSnap.exists()) {
          const cleanEmail = (user.email ?? '').trim();
          const cleanDisplayName = (user.displayName ?? '').trim().slice(0, 120);
          const isBootstrapped =
            cleanEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
          const bootstrapRef = doc(db, 'app_meta', 'bootstrap');
          const bootstrapSnap = await getDoc(bootstrapRef);

          if (isBootstrapped || !bootstrapSnap.exists()) {
            const batch = writeBatch(db);
            batch.set(userDocRef, {
              uid: user.uid,
              email: cleanEmail,
              displayName: cleanDisplayName,
              role: 'admin',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            if (!bootstrapSnap.exists()) {
              batch.set(bootstrapRef, {
                firstAdminUid: user.uid,
                initializedAt: serverTimestamp(),
              });
            }
            try {
              await batch.commit();
            } catch (batchErr) {
              if (isBootstrapped) {
                throw batchErr;
              }
              // Concurrent first-user race fallback: assign default manager role
              await setDoc(userDocRef, {
                uid: user.uid,
                email: cleanEmail,
                displayName: cleanDisplayName,
                role: 'manager',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            await setDoc(userDocRef, {
              uid: user.uid,
              email: cleanEmail,
              displayName: cleanDisplayName,
              role: 'manager',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          try {
            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
          } catch (wrappedError) {
            setFatalError(
              wrappedError instanceof Error
                ? wrappedError
                : new Error(String(wrappedError))
            );
          }
        }
        return;
      }

      if (cancelled) return;

      unsubUserDoc = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const rawRole = String(data.role ?? 'manager');
            const parsedRole: UserRole =
              rawRole === 'admin' ||
              rawRole === 'manager' ||
              rawRole === 'accountant'
                ? rawRole
                : 'manager';
            setUserProfile({
              uid: String(data.uid ?? docSnap.id),
              email: String(data.email ?? user.email ?? ''),
              displayName: String(data.displayName ?? user.displayName ?? ''),
              role: parsedRole,
              createdAt: data.createdAt ?? null,
              updatedAt: data.updatedAt ?? null,
            });
          } else {
            setUserProfile(null);
          }
          setUserProfileLoaded(true);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          } catch (wrappedError) {
            setFatalError(
              wrappedError instanceof Error
                ? wrappedError
                : new Error(String(wrappedError))
            );
          }
        }
      );
    };

    void bootstrapAndListen();

    return () => {
      cancelled = true;
      if (unsubUserDoc) {
        unsubUserDoc();
      }
    };
  }, [authReady, user]);

  // Derived RBAC Permissions
  const userRole: UserRole =
    userProfile?.role ??
    ((user?.email ?? '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
      ? 'admin'
      : 'manager');
  const isAdmin = isAdminRole(userRole);
  const canCreatePartners = canCreateClientsOrSuppliers(userRole);
  const canPay = canManagePayments(userRole);
  const canAdjust = canAdjustLedgers(userRole);
  const allowOrders = canViewOrders(userRole);
  const allowInventory = canViewInventory(userRole);
  const allowCashflow = canViewCashflow(userRole);
  const allowEmployees = canViewEmployees(userRole);

  // Auto-redirect whenever role changes or activeSection is not permitted
  useEffect(() => {
    if (userProfileLoaded && !canAccessSection(userRole, activeSection)) {
      setActiveSection(getDefaultSectionForRole(userRole));
    }
  }, [userProfileLoaded, userRole, activeSection]);

  // Role-Scoped Firestore Real-Time Listeners (Shared Mill Workspace)
  useEffect(() => {
    if (!authReady || !user || !userProfileLoaded) return;

    const unsubscribers: Array<() => void> = [];

    const handleListenerError = (error: unknown, path: string) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrappedError) {
        setFatalError(
          wrappedError instanceof Error
            ? wrappedError
            : new Error(String(wrappedError))
        );
      }
    };

    // 1. Always accessible to all mill staff (Admin, Manager, Accountant)
    setClientsLoaded(false);
    setLedgerLoaded(false);
    setSuppliersLoaded(false);
    setSupplierLedgerLoaded(false);

    unsubscribers.push(
      onSnapshot(
        collection(db, 'clients'),
        (snapshot) => {
          setClients(
            snapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                ownerId: String(data.ownerId ?? ''),
                clientName: String(data.clientName ?? ''),
                companyName: String(data.companyName ?? ''),
                mobile: String(data.mobile ?? ''),
                address: String(data.address ?? ''),
                createdAt: data.createdAt ?? null,
                updatedAt: data.updatedAt ?? null,
              };
            })
          );
          setClientsLoaded(true);
        },
        (error) => handleListenerError(error, 'clients')
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, 'client_ledger'),
        (snapshot) => {
          setLedgerEntries(
            snapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                ownerId: String(data.ownerId ?? ''),
                clientId: String(data.clientId ?? ''),
                txn_type: data.txn_type,
                debit: Number(data.debit ?? 0),
                credit: Number(data.credit ?? 0),
                note: String(data.note ?? ''),
                reference: String(data.reference ?? ''),
                createdAt: data.createdAt ?? null,
              };
            })
          );
          setLedgerLoaded(true);
        },
        (error) => handleListenerError(error, 'client_ledger')
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, 'suppliers'),
        (snapshot) => {
          setSuppliers(
            snapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                ownerId: String(data.ownerId ?? ''),
                supplierName: String(data.supplierName ?? ''),
                companyName: String(data.companyName ?? ''),
                mobile: String(data.mobile ?? ''),
                createdAt: data.createdAt ?? null,
                updatedAt: data.updatedAt ?? null,
              };
            })
          );
          setSuppliersLoaded(true);
        },
        (error) => handleListenerError(error, 'suppliers')
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, 'supplier_ledger'),
        (snapshot) => {
          setSupplierLedgerEntries(
            snapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                ownerId: String(data.ownerId ?? ''),
                supplierId: String(data.supplierId ?? ''),
                txn_type: data.txn_type,
                debit: Number(data.debit ?? 0),
                credit: Number(data.credit ?? 0),
                reference: String(data.reference ?? ''),
                note: String(data.note ?? ''),
                createdAt: data.createdAt ?? null,
              };
            })
          );
          setSupplierLedgerLoaded(true);
        },
        (error) => handleListenerError(error, 'supplier_ledger')
      )
    );

    // 2. Production & Purchasing (Admin & Manager ONLY)
    if (canViewOrders(userRole)) {
      setOrdersLoaded(false);
      setPurchasesLoaded(false);

      unsubscribers.push(
        onSnapshot(
          collection(db, 'orders'),
          (snapshot) => {
            setOrders(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  clientId: String(data.clientId ?? ''),
                  orderDate: String(data.orderDate ?? ''),
                  fabricType: data.fabricType,
                  greyFabricThan: Number(data.greyFabricThan ?? 0),
                  greyFabricGaj: Number(data.greyFabricGaj ?? 0),
                  rate: Number(data.rate ?? 0),
                  status: data.status,
                  finalGaj:
                    data.finalGaj === null || data.finalGaj === undefined
                      ? null
                      : Number(data.finalGaj),
                  finalBillAmount:
                    data.finalBillAmount === null ||
                    data.finalBillAmount === undefined
                      ? null
                      : Number(data.finalBillAmount),
                  deliveredAt: data.deliveredAt ?? null,
                  createdAt: data.createdAt ?? null,
                  updatedAt: data.updatedAt ?? null,
                };
              })
            );
            setOrdersLoaded(true);
          },
          (error) => handleListenerError(error, 'orders')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'purchases'),
          (snapshot) => {
            setPurchases(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  supplierId: String(data.supplierId ?? ''),
                  ledgerEntryId: String(data.ledgerEntryId ?? ''),
                  reference: String(data.reference ?? ''),
                  purchaseDate: String(data.purchaseDate ?? ''),
                  itemName: String(data.itemName ?? ''),
                  quantity: Number(data.quantity ?? 0),
                  unit: data.unit,
                  rate: Number(data.rate ?? 0),
                  totalAmount: Number(data.totalAmount ?? 0),
                  status: data.status === 'Paid' ? 'Paid' : 'Pending',
                  createdAt: data.createdAt ?? null,
                  updatedAt: data.updatedAt ?? null,
                };
              })
            );
            setPurchasesLoaded(true);
          },
          (error) => handleListenerError(error, 'purchases')
        )
      );
    } else {
      setOrders([]);
      setOrdersLoaded(true);
      setPurchases([]);
      setPurchasesLoaded(true);
    }

    // 3. Inventory & Stock Movements (Admin & Manager ONLY)
    if (canViewInventory(userRole)) {
      setInventoryLoaded(false);
      setStockMovementsLoaded(false);

      unsubscribers.push(
        onSnapshot(
          collection(db, 'inventory'),
          (snapshot) => {
            setInventoryItems(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  itemName: String(data.itemName ?? ''),
                  unit: data.unit as InventoryUnit,
                  minStockLevel: Number(data.minStockLevel ?? 0),
                  currentStock: Number(data.currentStock ?? 0),
                  createdAt: data.createdAt ?? null,
                  updatedAt: data.updatedAt ?? null,
                };
              })
            );
            setInventoryLoaded(true);
          },
          (error) => handleListenerError(error, 'inventory')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'stock_movements'),
          (snapshot) => {
            setStockMovements(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  inventoryItemId: String(data.inventoryItemId ?? ''),
                  itemName: String(data.itemName ?? ''),
                  unit: data.unit as InventoryUnit,
                  type: data.type as StockMovementType,
                  quantity: Number(data.quantity ?? 0),
                  previousStock: Number(data.previousStock ?? 0),
                  resultingStock: Number(data.resultingStock ?? 0),
                  movementDate: String(data.movementDate ?? ''),
                  reference: String(data.reference ?? ''),
                  note: String(data.note ?? ''),
                  createdAt: data.createdAt ?? null,
                };
              })
            );
            setStockMovementsLoaded(true);
          },
          (error) => handleListenerError(error, 'stock_movements')
        )
      );
    } else {
      setInventoryItems([]);
      setInventoryLoaded(true);
      setStockMovements([]);
      setStockMovementsLoaded(true);
    }

    // 4. Cashflow & Expenses (Admin & Accountant ONLY)
    if (canViewCashflow(userRole)) {
      setMoneyInLoaded(false);
      setMoneyOutLoaded(false);
      setExpensesLoaded(false);

      unsubscribers.push(
        onSnapshot(
          collection(db, 'money_in'),
          (snapshot) => {
            setMoneyInRecords(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                const refStr = String(data.reference ?? '');
                const isAdjustment =
                  data.source === 'adjustment' || refStr.startsWith('REV-');
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  source: isAdjustment ? 'adjustment' : 'client',
                  clientId: String(data.clientId ?? ''),
                  ledgerEntryId: String(data.ledgerEntryId ?? ''),
                  reference: refStr,
                  amount: Number(data.amount ?? 0),
                  paymentDate: String(data.paymentDate ?? ''),
                  paymentMethod: data.paymentMethod,
                  note: String(data.note ?? ''),
                  createdAt: data.createdAt ?? null,
                };
              })
            );
            setMoneyInLoaded(true);
          },
          (error) => handleListenerError(error, 'money_in')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'money_out'),
          (snapshot) => {
            setMoneyOutRecords(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                const refStr = String(data.reference ?? '');
                const isAdjustment =
                  data.source === 'adjustment' || refStr.startsWith('REV-');
                const isSalary =
                  !isAdjustment &&
                  (Boolean(data.salaryPaymentId) || refStr.startsWith('SAL-'));
                const isAdvance =
                  !isAdjustment &&
                  !isSalary &&
                  (Boolean(data.advanceId) ||
                    refStr.startsWith('ADV-') ||
                    String(data.category ?? '') === 'Employee Advance');
                const isExpense =
                  !isAdjustment &&
                  !isSalary &&
                  !isAdvance &&
                  (Boolean(data.expenseId) || refStr.startsWith('EXP-'));
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  source: isAdjustment
                    ? 'adjustment'
                    : isSalary
                      ? 'salary'
                      : isAdvance
                        ? 'advance'
                        : isExpense
                          ? 'expense'
                          : 'supplier',
                  supplierId: String(data.supplierId ?? ''),
                  ledgerEntryId: String(data.ledgerEntryId ?? ''),
                  expenseId: String(data.expenseId ?? ''),
                  employeeId: String(data.employeeId ?? ''),
                  advanceId: String(data.advanceId ?? ''),
                  salaryPaymentId: String(data.salaryPaymentId ?? ''),
                  category: data.category
                    ? (String(data.category) as
                        | ExpenseCategory
                        | 'Employee Advance')
                    : null,
                  reference: refStr,
                  amount: Number(data.amount ?? 0),
                  paymentDate: String(data.paymentDate ?? ''),
                  paymentMethod: data.paymentMethod,
                  note: String(data.note ?? ''),
                  createdAt: data.createdAt ?? null,
                };
              })
            );
            setMoneyOutLoaded(true);
          },
          (error) => handleListenerError(error, 'money_out')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'expenses'),
          (snapshot) => {
            setExpenses(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  moneyOutId: String(data.moneyOutId ?? ''),
                  reference: String(data.reference ?? ''),
                  expenseDate: String(data.expenseDate ?? ''),
                  category: data.category as ExpenseCategory,
                  amount: Number(data.amount ?? 0),
                  paymentMethod: data.paymentMethod,
                  description: String(data.description ?? ''),
                  createdAt: data.createdAt ?? null,
                };
              })
            );
            setExpensesLoaded(true);
          },
          (error) => handleListenerError(error, 'expenses')
        )
      );
    } else {
      setMoneyInRecords([]);
      setMoneyInLoaded(true);
      setMoneyOutRecords([]);
      setMoneyOutLoaded(true);
      setExpenses([]);
      setExpensesLoaded(true);
    }

    // 5. Employees, Advances, Salary Payments & User Management (Admin ONLY)
    if (canViewEmployees(userRole)) {
      setEmployeesLoaded(false);
      setEmployeeAdvancesLoaded(false);
      setSalaryPaymentsLoaded(false);
      setUsersLoaded(false);

      unsubscribers.push(
        onSnapshot(
          collection(db, 'employees'),
          (snapshot) => {
            setEmployees(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  name: String(data.name ?? ''),
                  mobile: String(data.mobile ?? ''),
                  department: String(data.department ?? ''),
                  joiningDate: String(data.joiningDate ?? ''),
                  basicSalary: Number(data.basicSalary ?? 0),
                  createdAt: data.createdAt ?? null,
                  updatedAt: data.updatedAt ?? null,
                };
              })
            );
            setEmployeesLoaded(true);
          },
          (error) => handleListenerError(error, 'employees')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'employee_advances'),
          (snapshot) => {
            setEmployeeAdvances(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  employeeId: String(data.employeeId ?? ''),
                  employeeName: String(data.employeeName ?? ''),
                  department: String(data.department ?? ''),
                  moneyOutId: String(data.moneyOutId ?? ''),
                  reference: String(data.reference ?? ''),
                  amount: Number(data.amount ?? 0),
                  advanceDate: String(data.advanceDate ?? ''),
                  paymentMethod: data.paymentMethod as AdvancePaymentMethod,
                  note: String(data.note ?? ''),
                  deducted: Boolean(data.deducted),
                  deductedBySalaryId: data.deductedBySalaryId
                    ? String(data.deductedBySalaryId)
                    : null,
                  deductedAt: data.deductedAt ?? null,
                  createdAt: data.createdAt ?? null,
                };
              })
            );
            setEmployeeAdvancesLoaded(true);
          },
          (error) => handleListenerError(error, 'employee_advances')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'salary_payments'),
          (snapshot) => {
            setSalaryPayments(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  ownerId: String(data.ownerId ?? ''),
                  employeeId: String(data.employeeId ?? ''),
                  employeeName: String(data.employeeName ?? ''),
                  department: String(data.department ?? ''),
                  moneyOutId: String(data.moneyOutId ?? ''),
                  reference: String(data.reference ?? docSnap.id),
                  salaryMonth: String(data.salaryMonth ?? ''),
                  paymentDate: String(data.paymentDate ?? ''),
                  basicSalary: Number(data.basicSalary ?? 0),
                  overtimeAmount: Number(data.overtimeAmount ?? 0),
                  bonusAmount: Number(data.bonusAmount ?? 0),
                  advanceDeduction: Number(data.advanceDeduction ?? 0),
                  netSalary: Number(data.netSalary ?? 0),
                  deductedAdvanceCount: Number(data.deductedAdvanceCount ?? 0),
                  paymentMethod: data.paymentMethod as SalaryPaymentMethod,
                  note: String(data.note ?? ''),
                  createdAt: data.createdAt ?? null,
                };
              })
            );
            setSalaryPaymentsLoaded(true);
          },
          (error) => handleListenerError(error, 'salary_payments')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'users'),
          (snapshot) => {
            setRegisteredUsers(
              snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                const rawRole = String(data.role ?? 'manager');
                const parsedRole: UserRole =
                  rawRole === 'admin' ||
                  rawRole === 'manager' ||
                  rawRole === 'accountant'
                    ? rawRole
                    : 'manager';
                return {
                  uid: String(data.uid ?? docSnap.id),
                  email: String(data.email ?? ''),
                  displayName: String(data.displayName ?? ''),
                  role: parsedRole,
                  createdAt: data.createdAt ?? null,
                  updatedAt: data.updatedAt ?? null,
                };
              })
            );
            setUsersLoaded(true);
          },
          (error) => handleListenerError(error, 'users')
        )
      );
    } else {
      setEmployees([]);
      setEmployeesLoaded(true);
      setEmployeeAdvances([]);
      setEmployeeAdvancesLoaded(true);
      setSalaryPayments([]);
      setSalaryPaymentsLoaded(true);
      setRegisteredUsers([]);
      setUsersLoaded(true);
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [authReady, user, userProfileLoaded, userRole]);

  // Auto-dismiss feedback toast
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Client derived summaries
  const summaries = useMemo(
    () => buildClientSummaries(clients, ledgerEntries),
    [clients, ledgerEntries]
  );

  const clientsById = useMemo(() => {
    const map = new Map<string, ClientRecord>();
    for (const c of clients) {
      map.set(c.id, c);
    }
    return map;
  }, [clients]);

  const summariesByClientId = useMemo(() => {
    const map = new Map<string, ClientWithLedgerSummary>();
    for (const summary of summaries) {
      map.set(summary.client.id, summary);
    }
    return map;
  }, [summaries]);

  const ordersById = useMemo(() => {
    const map = new Map<string, OrderRecord>();
    for (const order of orders) {
      map.set(order.id, order);
    }
    return map;
  }, [orders]);

  // Supplier derived summaries (Total Payable = Sum of Credit - Sum of Debit)
  const supplierSummaries = useMemo(
    () => buildSupplierSummaries(suppliers, supplierLedgerEntries),
    [suppliers, supplierLedgerEntries]
  );

  const suppliersById = useMemo(() => {
    const map = new Map<string, SupplierRecord>();
    for (const s of suppliers) {
      map.set(s.id, s);
    }
    return map;
  }, [suppliers]);

  const summariesBySupplierId = useMemo(() => {
    const map = new Map<string, SupplierWithLedgerSummary>();
    for (const summary of supplierSummaries) {
      map.set(summary.supplier.id, summary);
    }
    return map;
  }, [supplierSummaries]);

  const selectedLedgerClient = useMemo(
    () =>
      selectedLedgerClientId
        ? clientsById.get(selectedLedgerClientId) ?? null
        : null,
    [selectedLedgerClientId, clientsById]
  );

  const deliveringOrder = useMemo(
    () =>
      deliveringOrderId
        ? orders.find((o) => o.id === deliveringOrderId) ?? null
        : null,
    [deliveringOrderId, orders]
  );

  const deliveringOrderClient = useMemo(
    () =>
      deliveringOrder ? clientsById.get(deliveringOrder.clientId) ?? null : null,
    [deliveringOrder, clientsById]
  );

  const receivingPaymentClient = useMemo(
    () =>
      receivingPaymentClientId
        ? clientsById.get(receivingPaymentClientId) ?? null
        : null,
    [receivingPaymentClientId, clientsById]
  );

  const selectedSupplier = useMemo(
    () =>
      selectedSupplierId ? suppliersById.get(selectedSupplierId) ?? null : null,
    [selectedSupplierId, suppliersById]
  );

  const payingSupplier = useMemo(
    () => (payingSupplierId ? suppliersById.get(payingSupplierId) ?? null : null),
    [payingSupplierId, suppliersById]
  );

  const lowStockCount = useMemo(
    () =>
      inventoryItems.filter((item) => item.currentStock < item.minStockLevel)
        .length,
    [inventoryItems]
  );

  const employeesById = useMemo(() => {
    const map = new Map<string, EmployeeRecord>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const selectedEmployee = useMemo(
    () =>
      selectedEmployeeId ? employeesById.get(selectedEmployeeId) ?? null : null,
    [selectedEmployeeId, employeesById]
  );

  const givingAdvanceEmployee = useMemo(
    () =>
      givingAdvanceEmployeeId
        ? employeesById.get(givingAdvanceEmployeeId) ?? null
        : null,
    [givingAdvanceEmployeeId, employeesById]
  );

  const payingSalaryEmployee = useMemo(
    () =>
      payingSalaryEmployeeId
        ? employeesById.get(payingSalaryEmployeeId) ?? null
        : null,
    [payingSalaryEmployeeId, employeesById]
  );

  const currentYearMonth = getTodayIsoDate().slice(0, 7);
  const currentMonthLabel = useMemo(() => {
    const [year, month] = currentYearMonth.split('-').map(Number);
    if (!year || !month) return 'This Month';
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1));
  }, [currentYearMonth]);

  const givingAdvanceMonthTotal = useMemo(() => {
    if (!givingAdvanceEmployee) return 0;
    let sum = 0;
    for (const adv of employeeAdvances) {
      if (
        adv.employeeId === givingAdvanceEmployee.id &&
        adv.advanceDate.startsWith(currentYearMonth) &&
        !adv.deducted
      ) {
        sum += Number(adv.amount) || 0;
      }
    }
    return roundCurrency(sum);
  }, [givingAdvanceEmployee, employeeAdvances, currentYearMonth]);

  const statementPayload = useMemo<StatementPrintPayload | null>(() => {
    if (!statementTarget) return null;
    if (statementTarget.kind === 'client') {
      const client = clientsById.get(statementTarget.id);
      if (!client) return null;
      return {
        kind: 'client',
        client,
        entries: ledgerEntries,
        moneyInRecords,
      };
    }
    const supplier = suppliersById.get(statementTarget.id);
    if (!supplier) return null;
    return {
      kind: 'supplier',
      supplier,
      entries: supplierLedgerEntries,
      moneyOutRecords,
    };
  }, [
    statementTarget,
    clientsById,
    suppliersById,
    ledgerEntries,
    supplierLedgerEntries,
    moneyInRecords,
    moneyOutRecords,
  ]);

  // Propagate fatal Firestore errors to ErrorBoundary
  if (fatalError) {
    throw fatalError;
  }

  if (!authReady || (user && !userProfileLoaded)) {
    return (
      <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-[#1e3a8a] rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const isDataLoading =
    !clientsLoaded ||
    !ledgerLoaded ||
    !ordersLoaded ||
    !moneyInLoaded ||
    !suppliersLoaded ||
    !supplierLedgerLoaded ||
    !purchasesLoaded ||
    !moneyOutLoaded ||
    !expensesLoaded ||
    !inventoryLoaded ||
    !stockMovementsLoaded ||
    !employeesLoaded ||
    !employeeAdvancesLoaded ||
    !salaryPaymentsLoaded ||
    !usersLoaded;

  const isAccountantView = userRole === 'accountant';

  const sectionMeta: Record<
    NavSection,
    { breadcrumb: string; title: string; subtitle: string }
  > = {
    clients: {
      breadcrumb: `${t('nav.group.receivables')} / ${
        isAccountantView ? t('nav.clientPayments') : t('nav.clients')
      }`,
      title: isAccountantView
        ? t('nav.clientPayments')
        : t('page.clients.title'),
      subtitle: t('page.clients.subtitle'),
    },
    orders: {
      breadcrumb: `${t('nav.group.receivables')} / ${t('nav.orders')}`,
      title: t('page.orders.title'),
      subtitle: t('page.orders.subtitle'),
    },
    'new-order': {
      breadcrumb: `${t('nav.group.receivables')} / ${t('nav.orders')} / ${t('nav.newOrder')}`,
      title: t('page.newOrder.title'),
      subtitle: t('page.newOrder.subtitle'),
    },
    suppliers: {
      breadcrumb: `${t('nav.group.payables')} / ${
        isAccountantView ? t('nav.supplierPayments') : t('nav.suppliers')
      }`,
      title: isAccountantView
        ? t('nav.supplierPayments')
        : t('page.suppliers.title'),
      subtitle: t('page.suppliers.subtitle'),
    },
    purchases: {
      breadcrumb: `${t('nav.group.payables')} / ${t('nav.purchases')}`,
      title: t('page.purchases.title'),
      subtitle: t('page.purchases.subtitle'),
    },
    'new-purchase': {
      breadcrumb: `${t('nav.group.payables')} / ${t('nav.purchases')} / ${t('nav.newPurchase')}`,
      title: t('page.newPurchase.title'),
      subtitle: t('page.newPurchase.subtitle'),
    },
    inventory: {
      breadcrumb: `${t('nav.group.payables')} / ${t('nav.inventory')}`,
      title: t('page.inventory.title'),
      subtitle: t('page.inventory.subtitle'),
    },
    expenses: {
      breadcrumb: `${t('nav.group.staffCosts')} / ${t('nav.expenses')}`,
      title: t('page.expenses.title'),
      subtitle: t('page.expenses.subtitle'),
    },
    employees: {
      breadcrumb: `${t('nav.group.staffCosts')} / ${t('nav.employees')}`,
      title: t('page.employees.title'),
      subtitle: t('page.employees.subtitle'),
    },
    overview: {
      breadcrumb: `${t('nav.group.overview')} / ${t('nav.overview')}`,
      title: t('page.overview.title'),
      subtitle: t('page.overview.subtitle'),
    },
    ledger: {
      breadcrumb: `${t('nav.group.reports')} / ${t('nav.ledger')}`,
      title: t('page.ledger.title'),
      subtitle: t('page.ledger.subtitle'),
    },
    users: {
      breadcrumb: `${t('nav.group.admin')} / ${t('nav.users')}`,
      title: t('page.users.title'),
      subtitle: t('page.users.subtitle'),
    },
  };

  const currentMeta = sectionMeta[activeSection];

  const handleOpenAddClient = () => {
    if (!canCreatePartners) return;
    setEditingClient(null);
    setClientDrawerOpen(true);
  };

  const handleOpenEditClient = (client: ClientRecord) => {
    if (!isAdmin) return;
    setEditingClient(client);
    setClientDrawerOpen(true);
  };

  const handleOpenClientDrawer = (
    client: ClientRecord,
    tab: ClientDrawerTab = 'ledger'
  ) => {
    setLedgerDrawerTab(tab);
    setSelectedLedgerClientId(client.id);
  };

  const handleOpenAddSupplier = () => {
    if (!canCreatePartners) return;
    setEditingSupplier(null);
    setSupplierDrawerOpen(true);
  };

  const handleOpenEditSupplier = (supplier: SupplierRecord) => {
    if (!isAdmin) return;
    setEditingSupplier(supplier);
    setSupplierDrawerOpen(true);
  };

  const handleOpenSupplierDrawer = (
    supplier: SupplierRecord,
    tab: SupplierDrawerTab = 'ledger'
  ) => {
    setSupplierDrawerTab(tab);
    setSelectedSupplierId(supplier.id);
  };

  // Master Data & Pending/Processing Transaction Delete Helpers (Admin ONLY)
  const handleRequestDeleteClient = (client: ClientRecord) => {
    if (!isAdmin) return;
    setDeleteTarget({
      title: 'Delete Client Profile',
      entityLabel: `${client.clientName} (${client.companyName})`,
      description:
        'Deleting this client removes the master profile from active lists. Past append-only client_ledger and money_in records remain intact for accounting audit integrity.',
      confirmLabel: 'Delete Client',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'clients', client.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `clients/${client.id}`);
        }
        if (selectedLedgerClientId === client.id) {
          setSelectedLedgerClientId(null);
        }
        if (editingClient?.id === client.id) {
          setClientDrawerOpen(false);
          setEditingClient(null);
        }
        setToast({
          message: `Deleted client ${client.clientName} (${client.companyName}).`,
        });
      },
    });
  };

  const handleRequestDeleteSupplier = (supplier: SupplierRecord) => {
    if (!isAdmin) return;
    setDeleteTarget({
      title: 'Delete Supplier Profile',
      entityLabel: `${supplier.supplierName} (${supplier.companyName})`,
      description:
        'Deleting this supplier removes the master profile from active lists. Past append-only supplier_ledger and money_out records remain intact for accounting audit integrity.',
      confirmLabel: 'Delete Supplier',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'suppliers', supplier.id));
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `suppliers/${supplier.id}`
          );
        }
        if (selectedSupplierId === supplier.id) {
          setSelectedSupplierId(null);
        }
        if (editingSupplier?.id === supplier.id) {
          setSupplierDrawerOpen(false);
          setEditingSupplier(null);
        }
        setToast({
          message: `Deleted supplier ${supplier.supplierName} (${supplier.companyName}).`,
        });
      },
    });
  };

  const handleRequestDeleteEmployee = (employee: EmployeeRecord) => {
    if (!isAdmin) return;
    setDeleteTarget({
      title: 'Delete Employee Profile',
      entityLabel: `${employee.name} (${employee.department})`,
      description:
        'Deleting this employee removes the master profile. Past weekly advance and money_out records remain intact for cash balance accuracy.',
      confirmLabel: 'Delete Employee',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'employees', employee.id));
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `employees/${employee.id}`
          );
        }
        if (selectedEmployeeId === employee.id) {
          setSelectedEmployeeId(null);
        }
        setToast({
          message: `Deleted employee ${employee.name} (${employee.department}).`,
        });
      },
    });
  };

  const handleRequestDeleteInventoryItem = (item: InventoryItem) => {
    if (!isAdmin) return;
    setDeleteTarget({
      title: 'Delete Inventory Item',
      entityLabel: `${item.itemName} (${formatNumber(item.currentStock)} ${item.unit})`,
      description:
        'Deleting this inventory item removes it from the stock catalog. Historical stock_movements logs remain preserved.',
      confirmLabel: 'Delete Item',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'inventory', item.id));
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `inventory/${item.id}`
          );
        }
        setToast({
          message: `Deleted inventory item ${item.itemName}.`,
        });
      },
    });
  };

  const handleRequestDeleteOrder = (order: OrderRecord) => {
    if (!isAdmin) return;
    if (order.status !== 'Processing') {
      setToast({
        message: 'Only orders in "Processing" status can be deleted.',
      });
      return;
    }
    const client = clientsById.get(order.clientId);
    setDeleteTarget({
      title: 'Delete Processing Order',
      entityLabel: `${order.id} — ${order.fabricType} (${client?.clientName ?? 'Client'})`,
      description:
        'Only orders in "Processing" status can be deleted because they have not yet been delivered or billed to client_ledger.',
      confirmLabel: 'Delete Order',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'orders', order.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `orders/${order.id}`);
        }
        setToast({
          message: `Deleted processing order ${order.id}.`,
        });
      },
    });
  };

  const handleRequestDeletePurchase = (purchase: PurchaseRecord) => {
    if (!isAdmin) return;
    if (purchase.status === 'Paid') {
      setToast({
        message: 'Paid purchases are locked and cannot be deleted.',
      });
      return;
    }
    const supplier = suppliersById.get(purchase.supplierId);
    setDeleteTarget({
      title: 'Delete Pending Purchase',
      entityLabel: `${purchase.reference} — ${purchase.itemName} (${supplier?.supplierName ?? 'Supplier'})`,
      description:
        'Only Pending purchases can be deleted. Note: Because supplier_ledger is append-only, use "Correct / Adjust" inside the Supplier Ledger if you also need to reverse the corresponding payable credit.',
      confirmLabel: 'Delete Purchase',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'purchases', purchase.id));
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `purchases/${purchase.id}`
          );
        }
        setToast({
          message: `Deleted pending purchase ${purchase.reference}.`,
        });
      },
    });
  };

  // Append-Only Ledger Reversal / Adjustment Helpers
  const handleOpenCorrectClientLedger = (entry: ClientLedgerEntry) => {
    if (!canAdjust) return;
    const client = clientsById.get(entry.clientId) ?? null;
    const linkedMoneyIn =
      moneyInRecords.find(
        (m) =>
          m.ledgerEntryId === entry.id ||
          (Boolean(entry.reference) && m.reference === entry.reference)
      ) ?? null;
    setLedgerAdjustmentTarget({
      kind: 'client_ledger',
      entry,
      client,
      linkedMoneyIn,
    });
  };

  const handleOpenCorrectSupplierLedger = (entry: SupplierLedgerEntry) => {
    if (!canAdjust) return;
    const supplier = suppliersById.get(entry.supplierId) ?? null;
    const linkedMoneyOut =
      moneyOutRecords.find(
        (m) =>
          m.ledgerEntryId === entry.id ||
          (Boolean(entry.reference) && m.reference === entry.reference)
      ) ?? null;
    setLedgerAdjustmentTarget({
      kind: 'supplier_ledger',
      entry,
      supplier,
      linkedMoneyOut,
    });
  };

  const handleOpenCorrectMoneyIn = (record: MoneyInRecord) => {
    if (!canAdjust) return;
    const client = clientsById.get(record.clientId) ?? null;
    const linkedLedgerEntry =
      ledgerEntries.find(
        (e) =>
          e.id === record.ledgerEntryId ||
          (Boolean(record.reference) && e.reference === record.reference)
      ) ?? null;
    setLedgerAdjustmentTarget({
      kind: 'money_in',
      record,
      client,
      linkedLedgerEntry,
    });
  };

  const handleOpenCorrectMoneyOut = (record: MoneyOutRecord) => {
    if (!canAdjust) return;
    const supplier = record.supplierId
      ? suppliersById.get(record.supplierId) ?? null
      : null;
    const employee = record.employeeId
      ? employeesById.get(record.employeeId) ?? null
      : null;
    const linkedLedgerEntry = record.ledgerEntryId
      ? supplierLedgerEntries.find((e) => e.id === record.ledgerEntryId) ?? null
      : null;
    const counterpartyLabel = supplier
      ? `${supplier.supplierName} (${supplier.companyName})`
      : employee
        ? record.source === 'salary'
          ? `${employee.name} (${employee.department}) · Salary`
          : `${employee.name} (${employee.department})`
        : record.source === 'salary'
          ? 'Employee Salary'
          : record.category
            ? `Factory Expense · ${record.category}`
            : 'Cash Outflow';
    setLedgerAdjustmentTarget({
      kind: 'money_out',
      record,
      supplier,
      counterpartyLabel,
      linkedLedgerEntry,
    });
  };

  const buildPrintPayload = (
    clientId: string,
    order: OrderRecord | null,
    targetEntry: ClientLedgerEntry | null,
    initialDocType: PrintDocumentType
  ): PrintDocumentPayload => {
    const client = clientsById.get(clientId) ?? null;
    const sortedClientEntries = ledgerEntries
      .filter((entry) => entry.clientId === clientId)
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

    let runningBalance = 0;
    let foundEntry = false;
    let previousDue = 0;
    let billAmount = roundCurrency(
      targetEntry?.debit ?? order?.finalBillAmount ?? 0
    );

    for (const entry of sortedClientEntries) {
      if (targetEntry && entry.id === targetEntry.id) {
        previousDue = roundCurrency(runningBalance);
        billAmount = roundCurrency(Number(entry.debit) || 0);
        foundEntry = true;
      }
      runningBalance = roundCurrency(
        runningBalance + (Number(entry.debit) || 0) - (Number(entry.credit) || 0)
      );
    }

    const liveCurrentDue =
      summariesByClientId.get(clientId)?.currentDue ?? roundCurrency(runningBalance);

    if (!foundEntry) {
      previousDue = roundCurrency(liveCurrentDue);
    }

    const totalDue = roundCurrency(previousDue + billAmount);

    return {
      initialDocType,
      client,
      order,
      ledgerEntry: targetEntry,
      previousDue,
      billAmount,
      totalDue,
      liveCurrentDue,
    };
  };

  const handleOpenPrintForOrder = (
    order: OrderRecord,
    initialDocType: PrintDocumentType
  ) => {
    const expectedEntryId = `INV_${order.id}`;
    const matchingEntry =
      ledgerEntries.find(
        (entry) =>
          entry.id === expectedEntryId ||
          (entry.clientId === order.clientId &&
            entry.txn_type === 'invoice' &&
            entry.reference === order.id)
      ) ?? null;

    setPrintDocument(
      buildPrintPayload(order.clientId, order, matchingEntry, initialDocType)
    );
  };

  const handleOpenPrintForLedgerEntry = (
    entry: ClientLedgerEntry,
    initialDocType: PrintDocumentType = 'invoice'
  ) => {
    const linkedOrderIdFromId = entry.id.startsWith('INV_')
      ? entry.id.slice(4)
      : '';
    const linkedOrder =
      ordersById.get(entry.reference) ??
      (linkedOrderIdFromId ? ordersById.get(linkedOrderIdFromId) : undefined) ??
      null;

    setPrintDocument(
      buildPrintPayload(entry.clientId, linkedOrder, entry, initialDocType)
    );
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const renderTopBarCta = () => {
    if (activeSection === 'overview') {
      if (allowOrders) {
        return (
          <button
            type="button"
            onClick={() => setActiveSection('new-order')}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {t('cta.newOrder')}
          </button>
        );
      }
      if (allowCashflow) {
        return (
          <button
            type="button"
            onClick={() => {
              setActiveSection('expenses');
              setExpenseFormFocusSignal((n) => n + 1);
            }}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {t('cta.addExpense')}
          </button>
        );
      }
      return null;
    }
    if (activeSection === 'orders') {
      return (
        <button
          type="button"
          onClick={() => setActiveSection('new-order')}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.newOrder')}
        </button>
      );
    }
    if (activeSection === 'suppliers' || activeSection === 'new-purchase') {
      if (!canCreatePartners) return null;
      return (
        <button
          type="button"
          onClick={handleOpenAddSupplier}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.addNewSupplier')}
        </button>
      );
    }
    if (activeSection === 'purchases') {
      return (
        <button
          type="button"
          onClick={() => setActiveSection('new-purchase')}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.newPurchase')}
        </button>
      );
    }
    if (activeSection === 'inventory') {
      return (
        <button
          type="button"
          onClick={() => setInventoryFormFocusSignal((n) => n + 1)}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.addItem')}
        </button>
      );
    }
    if (activeSection === 'expenses') {
      return (
        <button
          type="button"
          onClick={() => setExpenseFormFocusSignal((n) => n + 1)}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.addExpense')}
        </button>
      );
    }
    if (activeSection === 'employees') {
      return (
        <button
          type="button"
          onClick={() => setEmployeeFormFocusSignal((n) => n + 1)}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.addEmployee')}
        </button>
      );
    }
    if (activeSection === 'clients' || activeSection === 'new-order') {
      if (!canCreatePartners) return null;
      return (
        <button
          type="button"
          onClick={handleOpenAddClient}
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('cta.addNewClient')}
        </button>
      );
    }
    return null;
  };

  return (
    <>
      <div className="no-print min-h-screen bg-[#f7f8fa] flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        user={user}
        userRole={userRole}
        onSignOut={handleSignOut}
        clientCount={clients.length}
        orderCount={orders.length}
        supplierCount={suppliers.length}
        purchaseCount={purchases.length}
        inventoryCount={inventoryItems.length}
        lowStockCount={lowStockCount}
        expenseCount={expenses.length}
        employeeCount={employees.length}
        ledgerCount={ledgerEntries.length}
        userCount={registeredUsers.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <p className="text-sm font-medium text-slate-600 truncate">
              {currentMeta.breadcrumb}
            </p>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Language Toggle Dropdown (English / বাংলা) */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-md transition-colors">
              <Globe className="w-3.5 h-3.5 text-[#1e3a8a] shrink-0" />
              <label htmlFor="app-language-select" className="sr-only">
                {t('app.language')}
              </label>
              <select
                id="app-language-select"
                aria-label={t('app.language')}
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer pr-1"
              >
                <option value="en">English</option>
                <option value="bn">বাংলা</option>
              </select>
            </div>

            {renderTopBarCta()}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              {currentMeta.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{currentMeta.subtitle}</p>
          </div>

          {/* Feedback Toast Banner */}
          {toast && (
            <div
              role="status"
              className="mb-6 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-md flex flex-wrap items-center justify-between gap-3 text-sm text-emerald-900"
            >
              <span className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{toast.message}</span>
              </span>
              <div className="flex items-center gap-2">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.onAction?.();
                      setToast(null);
                    }}
                    className="px-3 py-1 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Dismiss notification"
                  className="p-1 text-emerald-700 hover:text-emerald-950 rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeSection === 'clients' && (
            <ClientManagementView
              summaries={summaries}
              isLoading={isDataLoading}
              isAdmin={isAdmin}
              canCreateClient={canCreatePartners}
              canManagePayments={canPay}
              onAddClient={handleOpenAddClient}
              onEditClient={handleOpenEditClient}
              onDeleteClient={handleRequestDeleteClient}
              onOpenLedger={(client) => handleOpenClientDrawer(client, 'ledger')}
              onReceivePayment={(client) => setReceivingPaymentClientId(client.id)}
            />
          )}

          {activeSection === 'orders' && allowOrders && (
            <OrdersListView
              orders={orders}
              clientsById={clientsById}
              summariesByClientId={summariesByClientId}
              isLoading={isDataLoading}
              isAdmin={isAdmin}
              onCreateNewOrder={() => setActiveSection('new-order')}
              onStartCompleteDeliver={(order) => setDeliveringOrderId(order.id)}
              onEditOrder={(order) => {
                if (isAdmin) setEditingOrder(order);
              }}
              onDeleteOrder={handleRequestDeleteOrder}
              onOpenClientLedger={(client) =>
                handleOpenClientDrawer(client, 'ledger')
              }
              onPrintInvoice={(order) =>
                handleOpenPrintForOrder(order, 'invoice')
              }
              onPrintChallan={(order) =>
                handleOpenPrintForOrder(order, 'challan')
              }
              onStatusUpdated={(message) => setToast({ message })}
            />
          )}

          {activeSection === 'new-order' && allowOrders && (
            <NewOrderPage
              ownerId={user.uid}
              clients={clients}
              onCancel={() => setActiveSection('orders')}
              onAddClient={handleOpenAddClient}
              onOrderCreated={(orderId, clientName) => {
                setActiveSection('orders');
                setToast({
                  message: `Created order ${orderId} for ${clientName} (Status: Processing).`,
                });
              }}
            />
          )}

          {activeSection === 'suppliers' && (
            <SupplierManagementView
              summaries={supplierSummaries}
              isLoading={isDataLoading}
              isAdmin={isAdmin}
              canCreateSupplier={canCreatePartners}
              canManagePayments={canPay}
              onAddSupplier={handleOpenAddSupplier}
              onEditSupplier={handleOpenEditSupplier}
              onDeleteSupplier={handleRequestDeleteSupplier}
              onOpenLedger={(supplier) =>
                handleOpenSupplierDrawer(supplier, 'ledger')
              }
              onPaySupplier={(supplier) => setPayingSupplierId(supplier.id)}
            />
          )}

          {activeSection === 'purchases' && allowOrders && (
            <PurchasesListView
              purchases={purchases}
              suppliersById={suppliersById}
              summariesBySupplierId={summariesBySupplierId}
              isLoading={isDataLoading}
              isAdmin={isAdmin}
              onCreateNewPurchase={() => setActiveSection('new-purchase')}
              onOpenSupplierLedger={(supplier) =>
                handleOpenSupplierDrawer(supplier, 'ledger')
              }
              onEditPurchase={(purchase) => {
                if (isAdmin) setEditingPurchase(purchase);
              }}
              onDeletePurchase={handleRequestDeletePurchase}
              onStatusUpdated={(message) => setToast({ message })}
            />
          )}

          {activeSection === 'new-purchase' && allowOrders && (
            <NewPurchasePage
              ownerId={user.uid}
              suppliers={suppliers}
              inventoryItems={inventoryItems}
              onCancel={() => setActiveSection('purchases')}
              onAddSupplier={handleOpenAddSupplier}
              onOpenInventory={() => setActiveSection('inventory')}
              onPurchaseCreated={(
                purchaseRef,
                supplierName,
                totalAmount,
                stockSummary
              ) => {
                setActiveSection('purchases');
                setToast({
                  message: stockSummary
                    ? `Recorded ${purchaseRef} (${formatCurrency(totalAmount)}), credited ${supplierName}, and added +${formatNumber(stockSummary.addedQty)} ${stockSummary.unit} to ${stockSummary.itemName} (Stock: ${formatNumber(stockSummary.newStock)} ${stockSummary.unit}).`
                    : `Recorded ${purchaseRef} (${formatCurrency(totalAmount)}) and credited ${supplierName}'s payable ledger.`,
                  actionLabel: stockSummary ? 'View Inventory' : undefined,
                  onAction: stockSummary
                    ? () => setActiveSection('inventory')
                    : undefined,
                });
              }}
            />
          )}

          {activeSection === 'inventory' && allowInventory && (
            <InventoryView
              ownerId={user.uid}
              items={inventoryItems}
              movements={stockMovements}
              isLoading={isDataLoading}
              isAdmin={isAdmin}
              focusFormSignal={inventoryFormFocusSignal}
              onNavigateNewPurchase={() => setActiveSection('new-purchase')}
              onDeleteItem={handleRequestDeleteInventoryItem}
              onFeedback={(message) => setToast({ message })}
            />
          )}

          {activeSection === 'expenses' && allowCashflow && (
            <ExpensesView
              ownerId={user.uid}
              expenses={expenses}
              moneyOutRecords={moneyOutRecords}
              isLoading={isDataLoading}
              focusFormSignal={expenseFormFocusSignal}
              onExpenseCreated={(expenseRef, category, amount, paymentMethod) => {
                setToast({
                  message: `Recorded ${category} expense ${expenseRef} (${formatCurrency(amount)} via ${paymentMethod}) and updated Net Cash Balance.`,
                  actionLabel: 'View Dashboard',
                  onAction: () => setActiveSection('overview'),
                });
              }}
              onCorrectMoneyOut={handleOpenCorrectMoneyOut}
            />
          )}

          {activeSection === 'employees' && allowEmployees && (
            <EmployeesView
              ownerId={user.uid}
              employees={employees}
              advances={employeeAdvances}
              salaryPayments={salaryPayments}
              moneyOutRecords={moneyOutRecords}
              isLoading={isDataLoading}
              isAdmin={isAdmin}
              focusFormSignal={employeeFormFocusSignal}
              onEmployeeCreated={(employeeName, department) => {
                setToast({
                  message: `Added employee ${employeeName} (${department}).`,
                });
              }}
              onEmployeeUpdated={(message) => setToast({ message })}
              onDeleteEmployee={handleRequestDeleteEmployee}
              onGiveAdvance={(employee) =>
                setGivingAdvanceEmployeeId(employee.id)
              }
              onPaySalary={(employee) => setPayingSalaryEmployeeId(employee.id)}
              onOpenProfile={(employee) => setSelectedEmployeeId(employee.id)}
              onCorrectMoneyOut={handleOpenCorrectMoneyOut}
            />
          )}

          {activeSection === 'overview' && allowCashflow && (
            <DashboardOverview
              userRole={userRole}
              ledgerEntries={ledgerEntries}
              supplierLedgerEntries={supplierLedgerEntries}
              orders={orders}
              moneyInRecords={moneyInRecords}
              moneyOutRecords={moneyOutRecords}
              clientsById={clientsById}
              suppliersById={suppliersById}
              employeesById={employeesById}
              isLoading={isDataLoading}
              onNavigate={setActiveSection}
              onStartCompleteDeliver={(order) => setDeliveringOrderId(order.id)}
              onOpenClientLedger={(client) =>
                handleOpenClientDrawer(client, 'ledger')
              }
              onOpenClientPayments={(client) =>
                handleOpenClientDrawer(client, 'payments')
              }
              onOpenSupplierPayments={(supplier) =>
                handleOpenSupplierDrawer(supplier, 'payments')
              }
              onCorrectMoneyIn={handleOpenCorrectMoneyIn}
              onCorrectMoneyOut={handleOpenCorrectMoneyOut}
            />
          )}

          {activeSection === 'ledger' && allowCashflow && (
            <LedgerBookView
              entries={ledgerEntries}
              clientsById={clientsById}
              isLoading={isDataLoading}
              onOpenLedger={(client) => handleOpenClientDrawer(client, 'ledger')}
              onPrintInvoiceEntry={(entry) =>
                handleOpenPrintForLedgerEntry(entry, 'invoice')
              }
              onCorrectLedgerEntry={handleOpenCorrectClientLedger}
            />
          )}

          {activeSection === 'users' && isAdmin && (
            <UserManagementView
              users={registeredUsers}
              currentUserUid={user.uid}
              isLoading={isDataLoading}
              onRoleUpdated={(message) => setToast({ message })}
            />
          )}
        </main>
      </div>

      {/* Add / Edit Client Drawer */}
      <AddClientDrawer
        open={clientDrawerOpen}
        ownerId={user.uid}
        editingClient={editingClient}
        onClose={() => {
          setClientDrawerOpen(false);
          setEditingClient(null);
        }}
        onDeleteClient={isAdmin ? handleRequestDeleteClient : undefined}
        onSuccess={(message) => setToast({ message })}
      />

      {/* Client Profile, Ledger & Payment History Drawer */}
      <ClientLedgerDrawer
        client={selectedLedgerClient}
        ownerId={user.uid}
        entries={ledgerEntries}
        moneyInRecords={moneyInRecords}
        initialTab={ledgerDrawerTab}
        isAdmin={isAdmin}
        canManagePayments={canPay}
        canAdjustLedgers={canAdjust}
        onClose={() => setSelectedLedgerClientId(null)}
        onEditClient={(client) => {
          if (!isAdmin) return;
          setEditingClient(client);
          setClientDrawerOpen(true);
        }}
        onDeleteClient={handleRequestDeleteClient}
        onReceivePayment={(client) => {
          if (canPay) setReceivingPaymentClientId(client.id);
        }}
        onPrintInvoiceEntry={(entry) =>
          handleOpenPrintForLedgerEntry(entry, 'invoice')
        }
        onPrintStatement={(client) =>
          setStatementTarget({ kind: 'client', id: client.id })
        }
        onCorrectLedgerEntry={handleOpenCorrectClientLedger}
        onCorrectMoneyIn={handleOpenCorrectMoneyIn}
        onSuccess={(message) => setToast({ message })}
      />

      {/* Complete & Deliver Auto-Billing Modal */}
      <CompleteDeliverModal
        order={deliveringOrder}
        client={deliveringOrderClient}
        currentClientDue={
          deliveringOrder
            ? summariesByClientId.get(deliveringOrder.clientId)?.currentDue ?? 0
            : 0
        }
        ownerId={user.uid}
        onClose={() => setDeliveringOrderId(null)}
        onDelivered={(order, finalGaj, finalBillAmount) => {
          const targetClientId = order.clientId;
          const targetClient = clientsById.get(targetClientId);
          const clientName = targetClient?.clientName ?? 'Client';
          const deliveredSnapshot: OrderRecord = {
            ...order,
            status: 'Delivered',
            finalGaj,
            finalBillAmount,
          };
          setDeliveringOrderId(null);
          setToast({
            message: `Order ${order.id} delivered (${finalGaj} Gaj). Billed ${formatCurrency(finalBillAmount)} to ${clientName}'s ledger.`,
            actionLabel: 'Print Invoice',
            onAction: () => handleOpenPrintForOrder(deliveredSnapshot, 'invoice'),
          });
        }}
      />

      {/* Receive Client Payment Modal */}
      <ReceivePaymentModal
        client={receivingPaymentClient}
        currentClientDue={
          receivingPaymentClient
            ? summariesByClientId.get(receivingPaymentClient.id)?.currentDue ?? 0
            : 0
        }
        ownerId={user.uid}
        onClose={() => setReceivingPaymentClientId(null)}
        onPaymentReceived={(client) => {
          setReceivingPaymentClientId(null);
          setToast({
            message: 'Payment received successfully',
            actionLabel: 'View Payment History',
            onAction: () => handleOpenClientDrawer(client, 'payments'),
          });
        }}
      />

      {/* Add / Edit Supplier Drawer */}
      <AddSupplierDrawer
        open={supplierDrawerOpen}
        ownerId={user.uid}
        editingSupplier={editingSupplier}
        onClose={() => {
          setSupplierDrawerOpen(false);
          setEditingSupplier(null);
        }}
        onDeleteSupplier={isAdmin ? handleRequestDeleteSupplier : undefined}
        onSuccess={(message) => setToast({ message })}
      />

      {/* Supplier Profile, Ledger, Purchases & Payment History Drawer */}
      <SupplierLedgerDrawer
        supplier={selectedSupplier}
        entries={supplierLedgerEntries}
        purchases={purchases}
        moneyOutRecords={moneyOutRecords}
        initialTab={supplierDrawerTab}
        isAdmin={isAdmin}
        canManagePayments={canPay}
        canAdjustLedgers={canAdjust}
        onClose={() => setSelectedSupplierId(null)}
        onEditSupplier={(supplier) => {
          if (!isAdmin) return;
          setEditingSupplier(supplier);
          setSupplierDrawerOpen(true);
        }}
        onDeleteSupplier={handleRequestDeleteSupplier}
        onPaySupplier={(supplier) => {
          if (canPay) setPayingSupplierId(supplier.id);
        }}
        onPrintStatement={(supplier) =>
          setStatementTarget({ kind: 'supplier', id: supplier.id })
        }
        onEditPurchase={(purchase) => {
          if (isAdmin) setEditingPurchase(purchase);
        }}
        onDeletePurchase={handleRequestDeletePurchase}
        onCorrectSupplierLedgerEntry={handleOpenCorrectSupplierLedger}
        onCorrectMoneyOut={handleOpenCorrectMoneyOut}
      />

      {/* Pay Supplier Modal (Atomic writeBatch to supplier_ledger + money_out) */}
      <PaySupplierModal
        supplier={payingSupplier}
        currentTotalPayable={
          payingSupplier
            ? summariesBySupplierId.get(payingSupplier.id)?.totalPayable ?? 0
            : 0
        }
        ownerId={user.uid}
        onClose={() => setPayingSupplierId(null)}
        onPaymentSent={(supplier, amount, paymentRef) => {
          setPayingSupplierId(null);
          setToast({
            message: `Paid ${formatCurrency(amount)} to ${supplier.supplierName} (${paymentRef}).`,
            actionLabel: 'View Payment History',
            onAction: () => handleOpenSupplierDrawer(supplier, 'payments'),
          });
        }}
      />

      {/* Employee Profile, Salary History & Weekly Advance Drawer */}
      <EmployeeProfileDrawer
        employee={selectedEmployee}
        advances={employeeAdvances}
        salaryPayments={salaryPayments}
        moneyOutRecords={moneyOutRecords}
        isAdmin={isAdmin}
        onClose={() => setSelectedEmployeeId(null)}
        onGiveAdvance={(employee) => setGivingAdvanceEmployeeId(employee.id)}
        onPaySalary={(employee) => setPayingSalaryEmployeeId(employee.id)}
        onDeleteEmployee={handleRequestDeleteEmployee}
        onCorrectMoneyOut={handleOpenCorrectMoneyOut}
        onProfileUpdated={(message) => setToast({ message })}
      />

      {/* Give Weekly Advance Modal (Atomic writeBatch to employee_advances + money_out) */}
      <GiveAdvanceModal
        employee={givingAdvanceEmployee}
        monthAdvanceSoFar={givingAdvanceMonthTotal}
        currentMonthLabel={currentMonthLabel}
        ownerId={user.uid}
        onClose={() => setGivingAdvanceEmployeeId(null)}
        onAdvanceGiven={(employee, amount, advanceRef, paymentMethod) => {
          setGivingAdvanceEmployeeId(null);
          setToast({
            message: `Issued ${formatCurrency(amount)} advance (${advanceRef} via ${paymentMethod}) to ${employee.name} and updated Net Cash Balance.`,
            actionLabel: 'View Dashboard',
            onAction: () => setActiveSection('overview'),
          });
        }}
      />

      {/* Pay Monthly Salary Modal (Atomic writeBatch to salary_payments + money_out + employee_advances deduction lock) */}
      <PaySalaryModal
        employee={payingSalaryEmployee}
        advances={employeeAdvances}
        salaryPayments={salaryPayments}
        ownerId={user.uid}
        onClose={() => setPayingSalaryEmployeeId(null)}
        onSalaryPaid={(
          employee,
          salaryMonth,
          netSalary,
          salaryRef,
          paymentMethod,
          deductedCount
        ) => {
          setPayingSalaryEmployeeId(null);
          const deductedSuffix =
            deductedCount > 0
              ? ` and marked ${deductedCount} advance${deductedCount === 1 ? '' : 's'} as deducted`
              : '';
          setToast({
            message: `Paid ${formatCurrency(netSalary)} salary (${salaryRef} for ${salaryMonth} via ${paymentMethod}) to ${employee.name}${deductedSuffix}.`,
            actionLabel: 'View Profile',
            onAction: () => setSelectedEmployeeId(employee.id),
          });
        }}
      />

      {/* Master Data & Pending/Processing Transaction Delete Modal */}
      <ConfirmDeleteModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Edit Order Modal (Only for Processing orders) */}
      <EditOrderModal
        order={editingOrder}
        client={editingOrder ? clientsById.get(editingOrder.clientId) ?? null : null}
        onClose={() => setEditingOrder(null)}
        onUpdated={(orderId) => {
          setEditingOrder(null);
          setToast({
            message: `Updated processing order ${orderId}.`,
          });
        }}
      />

      {/* Edit Purchase Modal (Only for Pending purchases) */}
      <EditPurchaseModal
        purchase={editingPurchase}
        supplier={
          editingPurchase
            ? suppliersById.get(editingPurchase.supplierId) ?? null
            : null
        }
        ownerId={user.uid}
        onClose={() => setEditingPurchase(null)}
        onUpdated={(message) => {
          setEditingPurchase(null);
          setToast({ message });
        }}
      />

      {/* Append-Only Ledger Reversal & Adjustment Modal */}
      <LedgerReversalAdjustmentModal
        target={ledgerAdjustmentTarget}
        ownerId={user.uid}
        onClose={() => setLedgerAdjustmentTarget(null)}
        onSuccess={(message) => {
          setLedgerAdjustmentTarget(null);
          setToast({ message });
        }}
      />
      </div>

      {/* Invoice & Delivery Challan Print Modal (Outside .no-print for clean 80mm thermal printing) */}
      <InvoicePrintModal
        payload={printDocument}
        onClose={() => setPrintDocument(null)}
      />

      {/* Client & Supplier A4 Statement Print Modal (Outside .no-print for clean A4 printing) */}
      <StatementPrintModal
        payload={statementPayload}
        onClose={() => setStatementTarget(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <MillDashboardShell />
      </LanguageProvider>
    </ErrorBoundary>
  );
}
