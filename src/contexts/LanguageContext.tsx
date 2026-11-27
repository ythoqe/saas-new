import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  ExpenseCategory,
  LedgerTxnType,
  OrderStatus,
  PaymentMethod,
  PurchaseStatus,
  StockMovementType,
  SupplierLedgerTxnType,
  UserRole,
} from '../types/mill';

export type Language = 'en' | 'bn';

const STORAGE_KEY = 'indigomill_language';

const en = {
  // Common & Global
  'app.loading': 'Loading IndigoMill Ledger...',
  'app.language': 'Language',
  'common.all': 'All',
  'common.actions': 'Actions',
  'common.action': 'Action',
  'common.cancel': 'Cancel',
  'common.saveChanges': 'Save Changes',
  'common.saving': 'Saving...',
  'common.clearFilters': 'Clear Filters',
  'common.status': 'Status',
  'common.date': 'Date',
  'common.mobile': 'Mobile',
  'common.note': 'Note',
  'common.amount': 'Amount',
  'common.method': 'Method',
  'common.refAndDate': 'Ref & Date',
  'common.ledger': 'Ledger',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.correctAdjust': 'Correct / Adjust',
  'common.correct': 'Correct',
  'common.printInvoice': 'Print Invoice',
  'common.challan': 'Challan',
  'common.pending': 'Pending',
  'common.paid': 'Paid',
  'common.settled': 'Settled',
  'common.due': 'Due',
  'common.advance': 'Advance',
  'common.payable': 'Payable',
  'common.advancePaid': 'Advance Paid',
  'common.cash': 'Cash',
  'common.bank': 'Bank',
  'common.bkash': 'bKash',
  'common.nagad': 'Nagad',
  'common.gaj': 'Gaj',
  'common.than': 'Than',
  'common.low': 'low',
  'common.txns': 'txns',
  'common.txn': 'txn',
  'common.entries': 'entries',
  'common.entry': 'entry',
  'common.records': 'records',
  'common.record': 'record',
  'common.client': 'Client',
  'common.supplier': 'Supplier',
  'common.notSelected': 'Not selected',
  'common.notLinked': 'Not linked',
  'common.noneYet': 'None yet',

  // Sidebar Navigation Groups
  'nav.group.overview': 'Overview',
  'nav.group.receivables': 'Receivables & Orders',
  'nav.group.payables': 'Payables & Inventory',
  'nav.group.staffCosts': 'Staff & Factory Costs',
  'nav.group.reports': 'Reports & Ledgers',
  'nav.group.admin': 'Administration',

  // Sidebar Navigation Items
  'nav.overview': 'Dashboard Overview',
  'nav.clients': 'Client Management',
  'nav.clientPayments': 'Client Payments',
  'nav.orders': 'Orders & Delivery',
  'nav.newOrder': 'New Order',
  'nav.suppliers': 'Suppliers',
  'nav.supplierPayments': 'Supplier Payments',
  'nav.purchases': 'Purchases',
  'nav.newPurchase': 'New Purchase',
  'nav.inventory': 'Inventory',
  'nav.employees': 'Employees',
  'nav.expenses': 'Expenses',
  'nav.ledger': 'Client Ledger Book',
  'nav.users': 'User Management',
  'nav.signOut': 'Sign Out',
  'nav.millOperator': 'Mill Operator',

  // Top Bar CTAs
  'cta.newOrder': 'New Order',
  'cta.addNewClient': 'Add New Client',
  'cta.addNewSupplier': 'Add New Supplier',
  'cta.newPurchase': 'New Purchase',
  'cta.addItem': 'Add Item',
  'cta.addExpense': 'Add Expense',
  'cta.addEmployee': 'Add Employee',

  // Page Titles & Subtitles
  'page.overview.title': 'Dashboard Overview',
  'page.overview.subtitle':
    'Live financial position, production order status, and recent cash and mill activity.',
  'page.clients.title': 'Client Management',
  'page.clients.subtitle':
    'Manage mill buyers, receive payments, and monitor live Current Due calculated dynamically from client_ledger.',
  'page.orders.title': 'Orders & Delivery',
  'page.orders.subtitle':
    'Track dyeing and washing batches and trigger automatic invoice billing upon Complete & Deliver.',
  'page.newOrder.title': 'Create New Order',
  'page.newOrder.subtitle':
    'Register a new grey fabric intake batch with fabric type, Than, Gaj, and agreed rate.',
  'page.suppliers.title': 'Suppliers',
  'page.suppliers.subtitle':
    'Manage dye, chemical, jute, and spare parts vendors with live Total Payable calculated dynamically as Sum(Credit) − Sum(Debit).',
  'page.purchases.title': 'Purchases',
  'page.purchases.subtitle':
    'Inventory purchase log automatically crediting supplier_ledger for every vendor invoice.',
  'page.newPurchase.title': 'New Purchase',
  'page.newPurchase.subtitle':
    'Record raw material or spare parts procurement, update supplier payables, and auto-restock linked inventory.',
  'page.inventory.title': 'Inventory & Chemical Management',
  'page.inventory.subtitle':
    'Track dyes, bleaching chemicals, jute, and spare parts with low-stock alerts, Stock In/Out logs, and automatic purchase restocking.',
  'page.expenses.title': 'Expense Management',
  'page.expenses.subtitle':
    'Track daily factory operating costs (salaries, electricity, rent, maintenance) with automatic cash outflow updates.',
  'page.employees.title': 'Employee Management',
  'page.employees.subtitle':
    'Track mill staff, basic monthly salaries, and weekly advances synced atomically with live cash outflows.',
  'page.ledger.title': 'Client Ledger Book',
  'page.ledger.subtitle':
    'Complete append-only register of opening dues, order bills, and payment receipts.',
  'page.users.title': 'User Management',
  'page.users.subtitle':
    'Assign Admin, Manager, or Accountant roles to control module access and master-data permissions.',

  // Dashboard Overview KPIs & Activity
  'dashboard.kpi.totalReceivable': 'Total Receivable (Client Due)',
  'dashboard.kpi.registeredClients': 'registered clients',
  'dashboard.kpi.clientsLink': 'Clients',
  'dashboard.kpi.totalPayable': 'Total Payable (Supplier Due)',
  'dashboard.kpi.activeSuppliers': 'active suppliers',
  'dashboard.kpi.suppliersLink': 'Suppliers',
  'dashboard.kpi.netCashBalance': 'Net Cash Balance',
  'dashboard.kpi.netCashSub': 'Receipts minus payouts, expenses & advances',
  'dashboard.kpi.expensesLink': 'Expenses',
  'dashboard.kpi.ordersToday': 'Total Orders Today',
  'dashboard.kpi.dated': 'Dated',
  'dashboard.kpi.runningProcessing': 'Running Processing',
  'dashboard.kpi.runningSub': 'Processing · Dyeing · Washing',
  'dashboard.kpi.pendingDelivery': 'Pending Delivery',
  'dashboard.kpi.greyGajInMill': 'grey Gaj in mill',
  'dashboard.kpi.totalDeliveredGaj': 'Total Delivered Gaj',
  'dashboard.kpi.deliveredOrdersPrefix': 'Across',
  'dashboard.kpi.deliveredOrderSingular': 'delivered order',
  'dashboard.kpi.deliveredOrderPlural': 'delivered orders',
  'dashboard.recentOrders.title': 'Recent Orders',
  'dashboard.recentOrders.subtitle': 'Last 5 dyeing and washing batches',
  'dashboard.recentOrders.allOrders': 'All Orders',
  'dashboard.recentOrders.emptyTitle': 'No orders logged yet',
  'dashboard.recentOrders.emptyDesc':
    'Register a grey fabric batch to track dyeing, washing, and automatic billing.',
  'dashboard.recentOrders.createFirst': 'Create First Order',
  'dashboard.recentOrders.deliver': 'Deliver',
  'dashboard.recentOrders.finalGaj': 'final Gaj',
  'dashboard.recentOrders.greyGaj': 'grey Gaj',
  'dashboard.recentTxns.title': 'Recent Transactions',
  'dashboard.recentTxns.subtitle':
    'Last 5 cash & bank movements across receipts, payouts, and expenses',
  'dashboard.recentTxns.ledgerBook': 'Ledger Book',
  'dashboard.recentTxns.emptyTitle': 'No cash or bank transactions yet',
  'dashboard.recentTxns.emptyDesc':
    'Client receipts, supplier payouts, and factory expenses will appear here in real time.',
  'dashboard.recentTxns.receivePayment': 'Receive Payment',
  'dashboard.recentTxns.paySupplier': 'Pay Supplier',
  'dashboard.recentTxns.logExpense': 'Log Expense',
  'dashboard.txn.moneyIn': 'Money In',
  'dashboard.txn.moneyOut': 'Money Out',
  'dashboard.txn.expenseOut': 'Expense Out',
  'dashboard.txn.advanceOut': 'Advance Out',
  'dashboard.txn.reversalIn': 'Reversal In',
  'dashboard.txn.reversalOut': 'Reversal Out',
  'dashboard.inLabel': 'In',
  'dashboard.outLabel': 'Out',

  // Clients Module
  'clients.kpi.totalClients': 'Total Clients',
  'clients.kpi.loadingRegistry': 'Loading registry...',
  'clients.kpi.withActiveDue': 'with active due',
  'clients.kpi.netCurrentDue': 'Net Current Due',
  'clients.kpi.dueFormula': 'Sum(Debit) − Sum(Credit) across ledger',
  'clients.kpi.totalDebit': 'Total Ledger Debit',
  'clients.kpi.debitSub': 'Opening dues & mill bills',
  'clients.kpi.totalCredit': 'Total Ledger Credit',
  'clients.kpi.creditSub': 'Payments & credit adjustments',
  'clients.searchPlaceholder': 'Search by client name, company, or mobile...',
  'clients.filter.withDue': 'With Due',
  'clients.sort.newest': 'Newest First',
  'clients.sort.highestDue': 'Highest Due',
  'clients.sort.nameAsc': 'Name (A–Z)',
  'clients.empty.title': 'No clients registered yet',
  'clients.empty.desc':
    'Add your first dyeing or washing mill client along with any previous opening due. Opening balances are posted automatically to client_ledger.',
  'clients.empty.cta': 'Add First Client',
  'clients.empty.noMatch': 'No matching clients found',
  'clients.empty.noMatchDesc': 'Try adjusting your search query or status filter.',
  'clients.table.nameCompany': 'Client Name & Company',
  'clients.table.totalDebit': 'Total Debit',
  'clients.table.totalCredit': 'Total Credit',
  'clients.table.currentDue': 'Current Due',
  'clients.action.receivePayment': 'Receive Payment',
  'clients.form.addTitle': 'Add New Client',
  'clients.form.editTitle': 'Edit Client Profile',
  'clients.form.addSubtitle':
    'Register a dyeing or washing mill buyer and optional previous due.',
  'clients.form.editSubtitle':
    'Update contact details without altering ledger history.',
  'clients.form.clientName': 'Client Name',
  'clients.form.companyName': 'Company Name',
  'clients.form.mobile': 'Mobile',
  'clients.form.address': 'Address',
  'clients.form.openingDue': 'Opening Due (Previous Due)',
  'clients.form.saveClient': 'Save Client',
  'clients.form.deleteClient': 'Delete Client',

  // Orders Module
  'orders.kpi.totalOrders': 'Total Orders',
  'orders.kpi.totalOrdersSub': 'All mill production records',
  'orders.kpi.inProgress': 'In Progress',
  'orders.kpi.greyGajOnFloor': 'Grey Gaj on floor',
  'orders.kpi.deliveredOrders': 'Delivered Orders',
  'orders.kpi.deliveredSub': 'Auto-billed to client_ledger',
  'orders.kpi.totalBilling': 'Total Delivered Billing',
  'orders.kpi.billingSub': 'Sum of Final_Gaj × Rate',
  'orders.searchPlaceholder': 'Search order ID, client, company, or fabric...',
  'orders.filter.inProgress': 'In Progress',
  'orders.filter.delivered': 'Delivered',
  'orders.filter.allFabrics': 'All Fabrics',
  'orders.empty.title': 'No dyeing or washing orders yet',
  'orders.empty.desc':
    'Create your first production order with grey fabric Than, Gaj, and rate. When finished, click Complete & Deliver to calculate Final Gaj billing and post automatically to client_ledger.',
  'orders.empty.cta': 'Create First Order',
  'orders.empty.noMatch': 'No orders match your current filters',
  'orders.table.orderIdDate': 'Order ID & Date',
  'orders.table.client': 'Client',
  'orders.table.fabricType': 'Fabric Type',
  'orders.table.greyIntake': 'Grey Intake',
  'orders.table.finalGaj': 'Final Gaj',
  'orders.table.rateBill': 'Rate & Bill',
  'orders.billed': 'Billed',
  'orders.est': 'Est.',
  'orders.invoicePosted': 'Invoice posted',
  'orders.completeDeliver': 'Complete & Deliver',
  'orders.status.Processing': 'Processing',
  'orders.status.Dyeing': 'Dyeing',
  'orders.status.Washing': 'Washing',
  'orders.status.Finishing': 'Finishing',
  'orders.status.Delivered': 'Delivered',
  'orders.form.backToOrders': 'Back to Orders & Delivery',
  'orders.form.heading': 'Order Intake Details',
  'orders.form.subheading':
    'Record grey fabric received for dyeing or washing. Final billing posts to client_ledger upon Complete & Deliver.',
  'orders.form.client': 'Client',
  'orders.form.selectClient': 'Select a registered client...',
  'orders.form.noClients':
    'No clients exist yet. Add a client before creating an order.',
  'orders.form.createFirstClient': 'Create First Client',
  'orders.form.orderDate': 'Order Date',
  'orders.form.fabricType': 'Fabric Type',
  'orders.form.greyThan': 'Grey Fabric Than',
  'orders.form.greyGaj': 'Grey Fabric Gaj',
  'orders.form.ratePerGaj': 'Rate (per Gaj)',
  'orders.form.initialStatus': 'Initial Status',
  'orders.form.statusHelp':
    'Defaults to Processing. Mark as Delivered via Complete & Deliver to capture Final Gaj and post the invoice automatically.',
  'orders.form.creating': 'Creating Order...',
  'orders.form.createOrder': 'Create Order',
  'orders.form.summaryTitle': 'Live Intake Summary',
  'orders.form.summarySub': 'Estimate based on grey fabric intake measurements',
  'orders.form.selectedClient': 'Selected Client',
  'orders.form.greyFabric': 'Grey Fabric',
  'orders.form.avgGajThan': 'Avg. Gaj / Than',
  'orders.form.rateLabel': 'Rate per Gaj',
  'orders.form.estimatedBill': 'Estimated Bill',

  // Suppliers & Purchases Module
  'suppliers.kpi.totalSuppliers': 'Total Suppliers',
  'suppliers.kpi.loadingVendors': 'Loading vendors...',
  'suppliers.kpi.withActivePayable': 'with active payable',
  'suppliers.kpi.netPayable': 'Net Total Payable',
  'suppliers.kpi.payableFormula': 'Sum(Credit) − Sum(Debit) in supplier_ledger',
  'suppliers.kpi.totalPurchasesOpening': 'Total Purchases & Opening',
  'suppliers.kpi.creditsSub': 'Cumulative supplier_ledger credits',
  'suppliers.kpi.totalPaid': 'Total Paid to Vendors',
  'suppliers.kpi.debitsSub': 'Cumulative supplier_ledger debits',
  'suppliers.searchPlaceholder': 'Search supplier name, company, or mobile...',
  'suppliers.filter.payableDue': 'Payable Due',
  'suppliers.sort.highestPayable': 'Highest Payable',
  'suppliers.empty.title': 'No suppliers registered yet',
  'suppliers.empty.desc':
    'Add chemical, dye, jute, or spare parts vendors along with any opening payable balance to track purchases and supplier payments.',
  'suppliers.empty.cta': 'Add First Supplier',
  'suppliers.empty.noMatch': 'No matching suppliers found',
  'suppliers.table.supplierCompany': 'Supplier & Company',
  'suppliers.table.totalCredit': 'Total Credit (Billed)',
  'suppliers.table.totalDebit': 'Total Debit (Paid)',
  'suppliers.table.totalPayable': 'Total Payable',
  'suppliers.action.paySupplier': 'Pay Supplier',
  'suppliers.form.addTitle': 'Add New Supplier',
  'suppliers.form.editTitle': 'Edit Supplier Profile',
  'suppliers.form.addSubtitle':
    'Register a dye, chemical, jute, or spare parts vendor.',
  'suppliers.form.editSubtitle':
    'Update vendor details without altering payable ledger history.',
  'suppliers.form.supplierName': 'Supplier Name',
  'suppliers.form.companyName': 'Company Name',
  'suppliers.form.openingPayable': 'Opening Payable (Previous Debt)',
  'suppliers.form.saveSupplier': 'Save Supplier',
  'suppliers.form.deleteSupplier': 'Delete Supplier',

  // Purchases
  'purchases.kpi.totalPurchases': 'Total Purchases',
  'purchases.kpi.totalPurchasesSub': 'Posted atomically to supplier_ledger',
  'purchases.kpi.totalValue': 'Total Purchase Value',
  'purchases.kpi.totalValueSub': 'Chemicals, jute, dyes & spare parts',
  'purchases.kpi.distinctItems': 'Distinct Items',
  'purchases.kpi.distinctItemsSub': 'Tracked inventory SKUs',
  'purchases.kpi.billedVendors': 'Billed Vendors',
  'purchases.kpi.billedVendorsSub': 'Suppliers with purchase history',
  'purchases.searchPlaceholder': 'Search reference, item name, or supplier...',
  'purchases.filter.allStatus': 'All Status',
  'purchases.filter.allUnits': 'All Units',
  'purchases.empty.title': 'No purchases logged yet',
  'purchases.empty.desc':
    'Record jute, bleaching chemicals, dyes, or spare parts purchases to update inventory records and automatically credit supplier_ledger.',
  'purchases.empty.cta': 'Log First Purchase',
  'purchases.empty.noMatch': 'No purchases match your filters',
  'purchases.table.supplier': 'Supplier',
  'purchases.table.itemName': 'Item Name',
  'purchases.table.quantity': 'Quantity',
  'purchases.table.rate': 'Rate',
  'purchases.table.totalAmount': 'Total Amount',
  'purchases.action.markPaid': 'Mark Paid',
  'purchases.form.backToPurchases': 'Back to Purchases',
  'purchases.form.heading': 'Purchase Entry Details',
  'purchases.form.subheading':
    'Saving a purchase credits supplier_ledger and automatically increases stock in inventory when linked to a tracked item.',
  'purchases.form.supplier': 'Supplier',
  'purchases.form.selectSupplier': 'Select a registered supplier...',
  'purchases.form.noSuppliers':
    'No suppliers exist yet. Register a supplier before logging a purchase.',
  'purchases.form.createFirstSupplier': 'Create First Supplier',
  'purchases.form.inventoryLink': 'Inventory Item (Auto-Restock)',
  'purchases.form.manageInventory': 'Manage Inventory',
  'purchases.form.selectInventory':
    'Select tracked inventory item to auto-increase stock...',
  'purchases.form.noInventory':
    'No inventory items yet — enter custom item below',
  'purchases.form.customItem': 'Custom / Non-Inventory Item (manual entry)',
  'purchases.form.itemName': 'Item Name',
  'purchases.form.quantity': 'Quantity',
  'purchases.form.unit': 'Unit',
  'purchases.form.ratePerUnit': 'Rate',
  'purchases.form.totalFormula': 'Total Amount (Quantity × Rate)',
  'purchases.form.recording': 'Recording Purchase...',
  'purchases.form.savePurchase': 'Save Purchase',
  'purchases.form.previewTitle': 'Atomic Posting Preview',
  'purchases.form.item': 'Item',
  'purchases.form.supplierCredit': 'Supplier Credit (+Debt)',
  'purchases.form.inventorySync': 'Inventory Stock Sync',

  // Inventory Module
  'inventory.kpi.trackedMaterials': 'Tracked Materials',
  'inventory.kpi.healthySub': 'healthy · chemicals, jute & spares',
  'inventory.kpi.lowStockAlerts': 'Low Stock Alerts',
  'inventory.kpi.clickToFilter': 'Click to filter items below minimum',
  'inventory.kpi.allHealthy': 'All stock levels above minimum',
  'inventory.kpi.stockMovements': 'Stock Movements',
  'inventory.kpi.loggedIn': 'Logged in stock_movements',
  'inventory.kpi.purchaseRestocks': 'Purchase Restocks',
  'inventory.kpi.autoSynced': 'Auto-synced',
  'inventory.form.addTitle': 'Add Item',
  'inventory.form.editTitle': 'Edit Item',
  'inventory.form.addSubtitle':
    'Register chemicals, dyes, jute, or spare parts with reorder alerts',
  'inventory.form.editSubtitle':
    'Update item name, unit, or minimum stock alert threshold',
  'inventory.form.itemName': 'Item Name',
  'inventory.form.customItemName': 'Custom Item Name',
  'inventory.form.unit': 'Unit',
  'inventory.form.minStock': 'Minimum Stock Alert Level',
  'inventory.form.initialStock': 'Initial Current Stock',
  'inventory.form.currentStockNote':
    'use Stock In / Stock Out buttons to adjust stock quantity',
  'inventory.form.addBtn': 'Add Inventory Item',
  'inventory.form.adding': 'Adding Item...',
  'inventory.form.saving': 'Saving Changes...',
  'inventory.form.cancelEdit': 'Cancel Edit',
  'inventory.form.deleteItem': 'Delete Item',
  'inventory.tab.items': 'Inventory List',
  'inventory.tab.history': 'Movement History',
  'inventory.lowStockBadge': 'Low Stock',
  'inventory.inStockBadge': 'In Stock',
  'inventory.lowStockItemSingular': 'Low Stock Item',
  'inventory.lowStockItemPlural': 'Low Stock Items',
  'inventory.searchItemsPlaceholder':
    'Search chemical, dye, jute, or spare part...',
  'inventory.searchHistoryPlaceholder':
    'Search item, reference, date, or note...',
  'inventory.filter.lowOnly': 'Low Stock Only',
  'inventory.filter.healthyStock': 'Healthy Stock',
  'inventory.filter.allItems': 'All Items',
  'inventory.filter.allTypes': 'All Types',
  'inventory.empty.title': 'No inventory items registered yet',
  'inventory.empty.desc':
    'Use the Add Item form to register Jute, Bleaching, Soda, Acid, Blue, BMB, or Spare Parts. Once added, New Purchases can automatically restock them.',
  'inventory.empty.noMatch': 'No inventory items match your filters',
  'inventory.empty.noHistory': 'No stock movements recorded yet',
  'inventory.empty.noHistoryDesc':
    'Stock In, Stock Out, opening stock, and linked Purchase restocks appear here in real time.',
  'inventory.clearHistoryFilters': 'Clear History Filters',
  'inventory.table.itemName': 'Item Name',
  'inventory.table.currentStock': 'Current Stock',
  'inventory.table.minAlert': 'Min Alert Level',
  'inventory.table.item': 'Item',
  'inventory.table.type': 'Type',
  'inventory.table.qtyChange': 'Qty Change',
  'inventory.table.resulting': 'Resulting',
  'inventory.action.stockIn': 'Stock In',
  'inventory.action.stockOut': 'Stock Out',
  'inventory.movement.in': 'Stock In',
  'inventory.movement.out': 'Stock Out',
  'inventory.movement.purchase': 'Purchase In',
  'inventory.movement.opening': 'Opening Stock',
  'inventory.updated': 'Updated',

  // Expenses Module
  'expenses.kpi.thisMonth': 'Total Expense This Month',
  'expenses.kpi.paymentSplit': 'Monthly Payment Split',
  'expenses.kpi.topCategory': 'Top Category This Month',
  'expenses.kpi.noExpensesMonth': 'No expenses this month',
  'expenses.kpi.allTime': 'All-Time Expenses',
  'expenses.kpi.syncedSub': 'synced money_out',
  'expenses.form.title': 'Add Expense',
  'expenses.form.subtitle':
    'Log daily factory costs and deduct from live cash balance',
  'expenses.form.date': 'Date',
  'expenses.form.category': 'Category',
  'expenses.form.amount': 'Amount',
  'expenses.form.paymentMethod': 'Payment Method',
  'expenses.form.description': 'Description / Note',
  'expenses.form.descriptionPlaceholder':
    'e.g. Monthly boiler operator wages, DESCO electricity bill, or generator repair...',
  'expenses.form.recordBtn': 'Record Expense',
  'expenses.form.saving': 'Saving Expense...',
  'expenses.spendByCategory': 'Spend by Category',
  'expenses.showAllCategories': 'Show All Categories',
  'expenses.list.title': 'Recent Expenses',
  'expenses.list.subtitle':
    'Real-time log of mill operating expenses synced with cash outflows',
  'expenses.list.filtered': 'Filtered',
  'expenses.searchPlaceholder': 'Search reference, category, or note...',
  'expenses.filter.allCategories': 'All Categories',
  'expenses.empty.title': 'No factory expenses recorded yet',
  'expenses.empty.desc':
    'Use the Add Expense form to log salaries, electricity bills, rent, or daily mill costs. Each entry automatically posts to money_out and updates your Net Cash Balance.',
  'expenses.empty.noMatch': 'No expenses match your filters',
  'expenses.table.category': 'Category',
  'expenses.table.description': 'Description / Note',
  'expenses.category.Salary': 'Salary',
  'expenses.category.Electricity': 'Electricity',
  'expenses.category.Rent': 'Rent',
  'expenses.category.Transport': 'Transport',
  'expenses.category.Maintenance': 'Maintenance',
  'expenses.category.Food': 'Food',
  'expenses.category.Office': 'Office',
  'expenses.category.Other': 'Other',

  // Ledger Book Module
  'ledger.kpi.filteredDebit': 'Filtered Debit Sum',
  'ledger.kpi.filteredCredit': 'Filtered Credit Sum',
  'ledger.kpi.netBalance': 'Net Ledger Balance (Dr − Cr)',
  'ledger.searchPlaceholder': 'Search client, reference number, or note...',
  'ledger.filter.allTypes': 'All Types',
  'ledger.filter.opening': 'Opening',
  'ledger.filter.bills': 'Bills',
  'ledger.filter.payments': 'Payments',
  'ledger.filter.adjustments': 'Adjustments',
  'ledger.empty.title': 'No ledger entries match your view',
  'ledger.empty.desc':
    'Open any client from Client Management to record dyeing bills or payment receipts.',
  'ledger.table.typeReference': 'Type & Reference',
  'ledger.table.debit': 'Debit',
  'ledger.table.credit': 'Credit',
  'ledger.txn.opening': 'Opening Due',
  'ledger.txn.invoice': 'Dyeing / Washing Bill',
  'ledger.txn.payment': 'Payment Received',
  'ledger.txn.adjustment': 'Ledger Adjustment',
  'ledger.supplierTxn.opening': 'Opening Payable',
  'ledger.supplierTxn.purchase': 'Purchase Bill',
  'ledger.supplierTxn.payment': 'Supplier Payment',
  'ledger.supplierTxn.adjustment': 'Payable Adjustment',

  // Roles & User Management (RBAC)
  'role.admin': 'Admin',
  'role.manager': 'Manager',
  'role.accountant': 'Accountant',
  'role.admin.desc': 'Full access across all mill modules, Edit/Delete, Employees & User Management',
  'role.manager.desc': 'Orders, Clients, Inventory, Suppliers & Purchases (no financial ledgers or Edit/Delete)',
  'role.accountant.desc': 'Dashboard, Client Payments, Supplier Payments, Expenses & Ledgers (no Edit/Delete)',
  'users.kpi.total': 'Total Registered Users',
  'users.kpi.admins': 'Admins',
  'users.kpi.managers': 'Managers',
  'users.kpi.accountants': 'Accountants',
  'users.searchPlaceholder': 'Search by name, email, or UID...',
  'users.table.user': 'User & Email',
  'users.table.joined': 'Joined',
  'users.table.currentRole': 'Current Role',
  'users.table.assignRole': 'Assign Role',
  'users.youBadge': 'You',
  'users.selfProtected': 'Current Admin (Protected)',
  'users.permissionsTitle': 'Role Access Matrix',
  'users.empty': 'No registered users match your filter.',
} as const;

export type TranslationKey = keyof typeof en;

const bn: Record<TranslationKey, string> = {
  // Common & Global
  'app.loading': 'IndigoMill Ledger লোড হচ্ছে...',
  'app.language': 'ভাষা',
  'common.all': 'সবগুলো',
  'common.actions': 'অ্যাকশন',
  'common.action': 'অ্যাকশন',
  'common.cancel': 'বাতিল',
  'common.saveChanges': 'পরিবর্তন সংরক্ষণ',
  'common.saving': 'সংরক্ষণ হচ্ছে...',
  'common.clearFilters': 'ফিল্টার মুছুন',
  'common.status': 'অবস্থা',
  'common.date': 'তারিখ',
  'common.mobile': 'মোবাইল',
  'common.note': 'নোট',
  'common.amount': 'টাকার পরিমাণ',
  'common.method': 'মাধ্যম',
  'common.refAndDate': 'রেফারেন্স ও তারিখ',
  'common.ledger': 'খতিয়ান',
  'common.edit': 'সম্পাদনা',
  'common.delete': 'মুছে ফেলুন',
  'common.correctAdjust': 'সংশোধন / সমন্বয়',
  'common.correct': 'সংশোধন',
  'common.printInvoice': 'বিল প্রিন্ট',
  'common.challan': 'চালান',
  'common.pending': 'বাকি (পেন্ডিং)',
  'common.paid': 'পরিশোধিত',
  'common.settled': 'পরিশোধিত',
  'common.due': 'বকেয়া',
  'common.advance': 'অগ্রিম',
  'common.payable': 'পরিশোধযোগ্য',
  'common.advancePaid': 'অগ্রিম প্রদান',
  'common.cash': 'নগদ (ক্যাশ)',
  'common.bank': 'ব্যাংক',
  'common.bkash': 'বিকাশ',
  'common.nagad': 'নগদ',
  'common.gaj': 'গজ',
  'common.than': 'থান',
  'common.low': 'কম',
  'common.txns': 'টি লেনদেন',
  'common.txn': 'টি লেনদেন',
  'common.entries': 'টি এন্ট্রি',
  'common.entry': 'টি এন্ট্রি',
  'common.records': 'টি রেকর্ড',
  'common.record': 'টি রেকর্ড',
  'common.client': 'ক্লায়েন্ট',
  'common.supplier': 'সাপ্লায়ার',
  'common.notSelected': 'নির্বাচিত নয়',
  'common.notLinked': 'যুক্ত নয়',
  'common.noneYet': 'এখনো নেই',

  // Sidebar Navigation Groups
  'nav.group.overview': 'সারসংক্ষেপ',
  'nav.group.receivables': 'পাওনা ও অর্ডার',
  'nav.group.payables': 'দেনা ও ইনভেন্টরি',
  'nav.group.staffCosts': 'কর্মচারী ও কারখানা খরচ',
  'nav.group.reports': 'রিপোর্ট ও খতিয়ান',
  'nav.group.admin': 'অ্যাডমিনিস্ট্রেশন',

  // Sidebar Navigation Items
  'nav.overview': 'ড্যাশবোর্ড',
  'nav.clients': 'ক্লায়েন্ট ব্যবস্থাপনা',
  'nav.clientPayments': 'ক্লায়েন্ট পেমেন্ট',
  'nav.orders': 'অর্ডার ও ডেলিভারি',
  'nav.newOrder': 'নতুন অর্ডার',
  'nav.suppliers': 'সাপ্লায়ার',
  'nav.supplierPayments': 'সাপ্লায়ার পেমেন্ট',
  'nav.purchases': 'ক্রয় তালিকা',
  'nav.newPurchase': 'নতুন ক্রয়',
  'nav.inventory': 'ইনভেন্টরি ও কেমিক্যাল',
  'nav.employees': 'কর্মচারী',
  'nav.expenses': 'খরচ ব্যবস্থাপনা',
  'nav.ledger': 'ক্লায়েন্ট খতিয়ান বই',
  'nav.users': 'ব্যবহারকারী ব্যবস্থাপনা',
  'nav.signOut': 'সাইন আউট',
  'nav.millOperator': 'মিল অপারেটর',

  // Top Bar CTAs
  'cta.newOrder': 'নতুন অর্ডার',
  'cta.addNewClient': 'নতুন ক্লায়েন্ট যোগ',
  'cta.addNewSupplier': 'নতুন সাপ্লায়ার যোগ',
  'cta.newPurchase': 'নতুন ক্রয়',
  'cta.addItem': 'আইটেম যোগ করুন',
  'cta.addExpense': 'খরচ যোগ করুন',
  'cta.addEmployee': 'কর্মচারী যোগ করুন',

  // Page Titles & Subtitles
  'page.overview.title': 'ড্যাশবোর্ড সারসংক্ষেপ',
  'page.overview.subtitle':
    'লাইভ আর্থিক অবস্থা, উৎপাদন অর্ডারের অগ্রগতি এবং সাম্প্রতিক নগদ ও মিল কার্যক্রম।',
  'page.clients.title': 'ক্লায়েন্ট ব্যবস্থাপনা',
  'page.clients.subtitle':
    'ক্লায়েন্ট পরিচালনা করুন, পেমেন্ট গ্রহণ করুন এবং খতিয়ান থেকে লাইভ বকেয়া দেখুন।',
  'page.orders.title': 'অর্ডার ও ডেলিভারি',
  'page.orders.subtitle':
    'ডাইং ও ওয়াশিং ব্যাচ ট্র্যাক করুন এবং ডেলিভারি সম্পন্ন হলে স্বয়ংক্রিয় বিল তৈরি করুন।',
  'page.newOrder.title': 'নতুন অর্ডার তৈরি',
  'page.newOrder.subtitle':
    'কাপড়ের ধরন, থান, গজ এবং রেট সহ নতুন গ্রে কাপড়ের অর্ডার যুক্ত করুন।',
  'page.suppliers.title': 'সাপ্লায়ার ব্যবস্থাপনা',
  'page.suppliers.subtitle':
    'রং, কেমিক্যাল, পাট ও খুচরা যন্ত্রাংশ সাপ্লায়ারদের লাইভ পরিশোধযোগ্য হিসাব রাখুন।',
  'page.purchases.title': 'ক্রয় তালিকা',
  'page.purchases.subtitle':
    'সকল ক্রয়ের হিসাব যা স্বয়ংক্রিয়ভাবে সাপ্লায়ার খতিয়ানে যুক্ত হয়।',
  'page.newPurchase.title': 'নতুন ক্রয় এন্ট্রি',
  'page.newPurchase.subtitle':
    'কাঁচামাল বা যন্ত্রাংশ ক্রয় নথিভুক্ত করুন এবং ইনভেন্টরি স্টক স্বয়ংক্রিয়ভাবে বাড়ান।',
  'page.inventory.title': 'ইনভেন্টরি ও কেমিক্যাল ব্যবস্থাপনা',
  'page.inventory.subtitle':
    'কেমিক্যাল, রং, পাট ও যন্ত্রাংশের স্টক, কম স্টক সতর্কতা এবং স্টক ইন/আউট ইতিহাস।',
  'page.expenses.title': 'খরচ ব্যবস্থাপনা',
  'page.expenses.subtitle':
    'দৈনন্দিন কারখানা খরচ (বেতন, বিদ্যুৎ, ভাড়া, রক্ষণাবেক্ষণ) এবং লাইভ ক্যাশ সমন্বয়।',
  'page.employees.title': 'কর্মচারী ব্যবস্থাপনা',
  'page.employees.subtitle':
    'কর্মচারীদের মাসিক বেতন এবং সাপ্তাহিক অগ্রিম (অ্যাডভান্স) হিসাব পরিচালনা করুন।',
  'page.ledger.title': 'ক্লায়েন্ট খতিয়ান বই',
  'page.ledger.subtitle':
    'পূর্বের বকেয়া, অর্ডার বিল এবং জমার সম্পূর্ণ অপরিবর্তনীয় হিসাব তালিকা।',
  'page.users.title': 'ব্যবহারকারী ব্যবস্থাপনা',
  'page.users.subtitle':
    'অ্যাডমিন, ম্যানেজার বা অ্যাকাউন্ট্যান্ট রোল নির্ধারণ করে মডিউল ও তথ্য সম্পাদনার অনুমতি নিয়ন্ত্রণ করুন।',

  // Dashboard Overview KPIs & Activity
  'dashboard.kpi.totalReceivable': 'মোট পাওনা (ক্লায়েন্ট বকেয়া)',
  'dashboard.kpi.registeredClients': 'জন নিবন্ধিত ক্লায়েন্ট',
  'dashboard.kpi.clientsLink': 'ক্লায়েন্ট',
  'dashboard.kpi.totalPayable': 'মোট দেনা (সাপ্লায়ার বকেয়া)',
  'dashboard.kpi.activeSuppliers': 'জন সক্রিয় সাপ্লায়ার',
  'dashboard.kpi.suppliersLink': 'সাপ্লায়ার',
  'dashboard.kpi.netCashBalance': 'নিট নগদ ব্যালেন্স',
  'dashboard.kpi.netCashSub': 'মোট জমা বাদে পরিশোধ, খরচ ও কর্মচারী অগ্রিম',
  'dashboard.kpi.expensesLink': 'খরচসমূহ',
  'dashboard.kpi.ordersToday': 'আজকের মোট অর্ডার',
  'dashboard.kpi.dated': 'তারিখ',
  'dashboard.kpi.runningProcessing': 'চলমান প্রসেসিং',
  'dashboard.kpi.runningSub': 'প্রসেসিং · ডাইং · ওয়াশিং',
  'dashboard.kpi.pendingDelivery': 'ডেলিভারি বাকি',
  'dashboard.kpi.greyGajInMill': 'গ্রে গজ মিলে রয়েছে',
  'dashboard.kpi.totalDeliveredGaj': 'মোট ডেলিভারি গজ',
  'dashboard.kpi.deliveredOrdersPrefix': 'মোট',
  'dashboard.kpi.deliveredOrderSingular': 'টি ডেলিভারি অর্ডার',
  'dashboard.kpi.deliveredOrderPlural': 'টি ডেলিভারি অর্ডার',
  'dashboard.recentOrders.title': 'সাম্প্রতিক অর্ডার',
  'dashboard.recentOrders.subtitle': 'সর্বশেষ ৫টি ডাইং ও ওয়াশিং ব্যাচ',
  'dashboard.recentOrders.allOrders': 'সব অর্ডার',
  'dashboard.recentOrders.emptyTitle': 'এখনো কোনো অর্ডার নেই',
  'dashboard.recentOrders.emptyDesc':
    'ডাইং, ওয়াশিং এবং স্বয়ংক্রিয় বিলিং ট্র্যাক করতে প্রথম অর্ডার যুক্ত করুন।',
  'dashboard.recentOrders.createFirst': 'প্রথম অর্ডার তৈরি করুন',
  'dashboard.recentOrders.deliver': 'ডেলিভারি',
  'dashboard.recentOrders.finalGaj': 'ফাইনাল গজ',
  'dashboard.recentOrders.greyGaj': 'গ্রে গজ',
  'dashboard.recentTxns.title': 'সাম্প্রতিক লেনদেন',
  'dashboard.recentTxns.subtitle':
    'জমা, সাপ্লায়ার পেমেন্ট ও খরচের সর্বশেষ ৫টি নগদ/ব্যাংক লেনদেন',
  'dashboard.recentTxns.ledgerBook': 'খতিয়ান বই',
  'dashboard.recentTxns.emptyTitle': 'এখনো কোনো নগদ বা ব্যাংক লেনদেন নেই',
  'dashboard.recentTxns.emptyDesc':
    'ক্লায়েন্ট জমা, সাপ্লায়ার পেমেন্ট এবং কারখানা খরচ এখানে সাথে সাথে দেখা যাবে।',
  'dashboard.recentTxns.receivePayment': 'জমা নিন',
  'dashboard.recentTxns.paySupplier': 'সাপ্লায়ার পেমেন্ট',
  'dashboard.recentTxns.logExpense': 'খরচ লিখুন',
  'dashboard.txn.moneyIn': 'জমা (ক্যাশ ইন)',
  'dashboard.txn.moneyOut': 'পরিশোধ (ক্যাশ আউট)',
  'dashboard.txn.expenseOut': 'কারখানা খরচ',
  'dashboard.txn.advanceOut': 'কর্মচারী অগ্রিম',
  'dashboard.txn.reversalIn': 'সমন্বয় জমা',
  'dashboard.txn.reversalOut': 'সমন্বয় পরিশোধ',
  'dashboard.inLabel': 'জমা',
  'dashboard.outLabel': 'খরচ/প্রদান',

  // Clients Module
  'clients.kpi.totalClients': 'মোট ক্লায়েন্ট',
  'clients.kpi.loadingRegistry': 'তালিকা লোড হচ্ছে...',
  'clients.kpi.withActiveDue': 'জনের বকেয়া রয়েছে',
  'clients.kpi.netCurrentDue': 'মোট বর্তমান বকেয়া',
  'clients.kpi.dueFormula': 'মোট ডেবিট (বিল) − মোট ক্রেডিট (জমা)',
  'clients.kpi.totalDebit': 'মোট ডেবিট (বিল)',
  'clients.kpi.debitSub': 'পূর্বের বকেয়া ও মিল বিল',
  'clients.kpi.totalCredit': 'মোট ক্রেডিট (জমা)',
  'clients.kpi.creditSub': 'পেমেন্ট ও সমন্বয় জমা',
  'clients.searchPlaceholder': 'ক্লায়েন্টের নাম, কোম্পানি বা মোবাইল খুঁজুন...',
  'clients.filter.withDue': 'বকেয়া আছে',
  'clients.sort.newest': 'নতুন আগে',
  'clients.sort.highestDue': 'সর্বোচ্চ বকেয়া',
  'clients.sort.nameAsc': 'নাম (A–Z)',
  'clients.empty.title': 'এখনো কোনো ক্লায়েন্ট যুক্ত করা হয়নি',
  'clients.empty.desc':
    'আপনার প্রথম ডাইং বা ওয়াশিং ক্লায়েন্ট এবং পূর্বের বকেয়া যুক্ত করুন। পূর্বের বকেয়া স্বয়ংক্রিয়ভাবে খতিয়ানে জমা হবে।',
  'clients.empty.cta': 'প্রথম ক্লায়েন্ট যোগ করুন',
  'clients.empty.noMatch': 'কোনো মিল পাওয়া যায়নি',
  'clients.empty.noMatchDesc': 'সার্চ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।',
  'clients.table.nameCompany': 'ক্লায়েন্ট ও কোম্পানি',
  'clients.table.totalDebit': 'মোট বিল (ডেবিট)',
  'clients.table.totalCredit': 'মোট জমা (ক্রেডিট)',
  'clients.table.currentDue': 'বর্তমান বকেয়া',
  'clients.action.receivePayment': 'জমা নিন',
  'clients.form.addTitle': 'নতুন ক্লায়েন্ট যোগ করুন',
  'clients.form.editTitle': 'ক্লায়েন্ট তথ্য সম্পাদনা',
  'clients.form.addSubtitle':
    'নতুন ক্লায়েন্ট নিবন্ধন করুন এবং প্রয়োজনে পূর্বের বকেয়া যুক্ত করুন।',
  'clients.form.editSubtitle':
    'খতিয়ানের ইতিহাস পরিবর্তন না করে ক্লায়েন্টের তথ্য হালনাগাদ করুন।',
  'clients.form.clientName': 'ক্লায়েন্টের নাম',
  'clients.form.companyName': 'কোম্পানির নাম',
  'clients.form.mobile': 'মোবাইল নম্বর',
  'clients.form.address': 'ঠিকানা',
  'clients.form.openingDue': 'পূর্বের বকেয়া (ওপেনিং ডিউ)',
  'clients.form.saveClient': 'ক্লায়েন্ট সংরক্ষণ',
  'clients.form.deleteClient': 'ক্লায়েন্ট মুছুন',

  // Orders Module
  'orders.kpi.totalOrders': 'মোট অর্ডার',
  'orders.kpi.totalOrdersSub': 'সকল উৎপাদন অর্ডার রেকর্ড',
  'orders.kpi.inProgress': 'চলমান অর্ডার',
  'orders.kpi.greyGajOnFloor': 'গ্রে গজ ফ্লোরে আছে',
  'orders.kpi.deliveredOrders': 'ডেলিভারি সম্পন্ন',
  'orders.kpi.deliveredSub': 'খতিয়ানে স্বয়ংক্রিয় বিল যুক্ত',
  'orders.kpi.totalBilling': 'মোট ডেলিভারি বিল',
  'orders.kpi.billingSub': 'ফাইনাল গজ × রেট এর যোগফল',
  'orders.searchPlaceholder': 'অর্ডার আইডি, ক্লায়েন্ট, কোম্পানি বা কাপড় খুঁজুন...',
  'orders.filter.inProgress': 'চলমান',
  'orders.filter.delivered': 'ডেলিভারি সম্পন্ন',
  'orders.filter.allFabrics': 'সব কাপড়',
  'orders.empty.title': 'এখনো কোনো ডাইং বা ওয়াশিং অর্ডার নেই',
  'orders.empty.desc':
    'গ্রে কাপড়ের থান, গজ ও রেট দিয়ে প্রথম অর্ডার তৈরি করুন। কাজ শেষ হলে ডেলিভারি সম্পন্ন করে স্বয়ংক্রিয় বিল তৈরি করুন।',
  'orders.empty.cta': 'প্রথম অর্ডার তৈরি করুন',
  'orders.empty.noMatch': 'ফিল্টারের সাথে কোনো অর্ডার মেলেনি',
  'orders.table.orderIdDate': 'অর্ডার আইডি ও তারিখ',
  'orders.table.client': 'ক্লায়েন্ট',
  'orders.table.fabricType': 'কাপড়ের ধরন',
  'orders.table.greyIntake': 'গ্রে কাপড় (ইনটেক)',
  'orders.table.finalGaj': 'ফাইনাল গজ',
  'orders.table.rateBill': 'রেট ও বিল',
  'orders.billed': 'বিলকৃত',
  'orders.est': 'আনুমানিক',
  'orders.invoicePosted': 'বিল পোস্ট হয়েছে',
  'orders.completeDeliver': 'সম্পন্ন ও ডেলিভারি',
  'orders.status.Processing': 'প্রসেসিং',
  'orders.status.Dyeing': 'ডাইং',
  'orders.status.Washing': 'ওয়াশিং',
  'orders.status.Finishing': 'ফিনিশিং',
  'orders.status.Delivered': 'ডেলিভারি সম্পন্ন',
  'orders.form.backToOrders': 'অর্ডার তালিকায় ফিরুন',
  'orders.form.heading': 'অর্ডার গ্রহণের বিবরণ',
  'orders.form.subheading':
    'ডাইং বা ওয়াশিং এর জন্য গৃহীত গ্রে কাপড়ের হিসাব লিখুন। ডেলিভারির সময় চূড়ান্ত বিল খতিয়ানে যুক্ত হবে।',
  'orders.form.client': 'ক্লায়েন্ট',
  'orders.form.selectClient': 'নিবন্ধিত ক্লায়েন্ট নির্বাচন করুন...',
  'orders.form.noClients':
    'কোনো ক্লায়েন্ট নেই। অর্ডার তৈরির আগে একটি ক্লায়েন্ট যোগ করুন।',
  'orders.form.createFirstClient': 'প্রথম ক্লায়েন্ট তৈরি করুন',
  'orders.form.orderDate': 'অর্ডারের তারিখ',
  'orders.form.fabricType': 'কাপড়ের ধরন',
  'orders.form.greyThan': 'গ্রে কাপড় (থান)',
  'orders.form.greyGaj': 'গ্রে কাপড় (গজ)',
  'orders.form.ratePerGaj': 'প্রতি গজ রেট (৳)',
  'orders.form.initialStatus': 'প্রাথমিক অবস্থা',
  'orders.form.statusHelp':
    'ডিফল্ট অবস্থা প্রসেসিং। কাজ শেষে সম্পন্ন ও ডেলিভারি বাটনে ক্লিক করে চূড়ান্ত গজ ও বিল পোস্ট করুন।',
  'orders.form.creating': 'অর্ডার তৈরি হচ্ছে...',
  'orders.form.createOrder': 'অর্ডার তৈরি করুন',
  'orders.form.summaryTitle': 'লাইভ অর্ডার সারসংক্ষেপ',
  'orders.form.summarySub': 'গ্রে কাপড়ের মাপ অনুযায়ী আনুমানিক হিসাব',
  'orders.form.selectedClient': 'নির্বাচিত ক্লায়েন্ট',
  'orders.form.greyFabric': 'গ্রে কাপড়',
  'orders.form.avgGajThan': 'গড় গজ / থান',
  'orders.form.rateLabel': 'প্রতি গজ রেট',
  'orders.form.estimatedBill': 'আনুমানিক বিল',

  // Suppliers & Purchases Module
  'suppliers.kpi.totalSuppliers': 'মোট সাপ্লায়ার',
  'suppliers.kpi.loadingVendors': 'তালিকা লোড হচ্ছে...',
  'suppliers.kpi.withActivePayable': 'জনের বকেয়া পাওনা আছে',
  'suppliers.kpi.netPayable': 'মোট পরিশোধযোগ্য (দেনা)',
  'suppliers.kpi.payableFormula': 'মোট ক্রেডিট (ক্রয়) − মোট ডেবিট (পরিশোধ)',
  'suppliers.kpi.totalPurchasesOpening': 'মোট ক্রয় ও পূর্বের দেনা',
  'suppliers.kpi.creditsSub': 'সাপ্লায়ার খতিয়ানের মোট ক্রেডিট',
  'suppliers.kpi.totalPaid': 'সাপ্লায়ারকে মোট পরিশোধ',
  'suppliers.kpi.debitsSub': 'সাপ্লায়ার খতিয়ানের মোট ডেবিট',
  'suppliers.searchPlaceholder': 'সাপ্লায়ারের নাম, কোম্পানি বা মোবাইল খুঁজুন...',
  'suppliers.filter.payableDue': 'দেনা বাকি',
  'suppliers.sort.highestPayable': 'সর্বোচ্চ দেনা',
  'suppliers.empty.title': 'এখনো কোনো সাপ্লায়ার যুক্ত করা হয়নি',
  'suppliers.empty.desc':
    'কেমিক্যাল, রং, পাট বা যন্ত্রাংশের সাপ্লায়ার ও পূর্বের দেনা যুক্ত করে ক্রয় এবং পেমেন্ট হিসাব রাখুন।',
  'suppliers.empty.cta': 'প্রথম সাপ্লায়ার যোগ করুন',
  'suppliers.empty.noMatch': 'কোনো মিল পাওয়া যায়নি',
  'suppliers.table.supplierCompany': 'সাপ্লায়ার ও কোম্পানি',
  'suppliers.table.totalCredit': 'মোট বিল (ক্রেডিট)',
  'suppliers.table.totalDebit': 'মোট পরিশোধ (ডেবিট)',
  'suppliers.table.totalPayable': 'মোট দেনা (বাকি)',
  'suppliers.action.paySupplier': 'পেমেন্ট করুন',
  'suppliers.form.addTitle': 'নতুন সাপ্লায়ার যোগ করুন',
  'suppliers.form.editTitle': 'সাপ্লায়ার তথ্য সম্পাদনা',
  'suppliers.form.addSubtitle':
    'রং, কেমিক্যাল, পাট বা যন্ত্রাংশ সরবরাহকারী নিবন্ধন করুন।',
  'suppliers.form.editSubtitle':
    'খতিয়ানের ইতিহাস পরিবর্তন না করে সাপ্লায়ারের তথ্য হালনাগাদ করুন।',
  'suppliers.form.supplierName': 'সাপ্লায়ারের নাম',
  'suppliers.form.companyName': 'কোম্পানির নাম',
  'suppliers.form.openingPayable': 'পূর্বের দেনা (ওপেনিং পেয়াবল)',
  'suppliers.form.saveSupplier': 'সাপ্লায়ার সংরক্ষণ',
  'suppliers.form.deleteSupplier': 'সাপ্লায়ার মুছুন',

  // Purchases
  'purchases.kpi.totalPurchases': 'মোট ক্রয় সংখ্যা',
  'purchases.kpi.totalPurchasesSub': 'সাপ্লায়ার খতিয়ানে স্বয়ংক্রিয় যুক্ত',
  'purchases.kpi.totalValue': 'মোট ক্রয় মূল্য',
  'purchases.kpi.totalValueSub': 'কেমিক্যাল, পাট, রং ও যন্ত্রাংশ',
  'purchases.kpi.distinctItems': 'মোট ধরনের আইটেম',
  'purchases.kpi.distinctItemsSub': 'ক্রয়কৃত ইনভেন্টরি আইটেম',
  'purchases.kpi.billedVendors': 'সক্রিয় সাপ্লায়ার',
  'purchases.kpi.billedVendorsSub': 'ক্রয় ইতিহাসসহ সাপ্লায়ার',
  'purchases.searchPlaceholder': 'রেফারেন্স, আইটেম বা সাপ্লায়ার খুঁজুন...',
  'purchases.filter.allStatus': 'সব অবস্থা',
  'purchases.filter.allUnits': 'সব একক',
  'purchases.empty.title': 'এখনো কোনো ক্রয় নথিভুক্ত হয়নি',
  'purchases.empty.desc':
    'পাট, ব্লিচিং, কেমিক্যাল, রং বা যন্ত্রাংশ ক্রয় নথিভুক্ত করুন যাতে স্টক ও সাপ্লায়ার খতিয়ান স্বয়ংক্রিয়ভাবে হালনাগাদ হয়।',
  'purchases.empty.cta': 'প্রথম ক্রয় লিখুন',
  'purchases.empty.noMatch': 'ফিল্টারের সাথে কোনো ক্রয় মেলেনি',
  'purchases.table.supplier': 'সাপ্লায়ার',
  'purchases.table.itemName': 'আইটেমের নাম',
  'purchases.table.quantity': 'পরিমাণ',
  'purchases.table.rate': 'দর (রেট)',
  'purchases.table.totalAmount': 'মোট মূল্য',
  'purchases.action.markPaid': 'পরিশোধিত করুন',
  'purchases.form.backToPurchases': 'ক্রয় তালিকায় ফিরুন',
  'purchases.form.heading': 'ক্রয় এন্ট্রি বিবরণ',
  'purchases.form.subheading':
    'ক্রয় সংরক্ষণ করলে সাপ্লায়ার খতিয়ানে দেনা যুক্ত হবে এবং যুক্ত ইনভেন্টরির স্টক স্বয়ংক্রিয়ভাবে বাড়বে।',
  'purchases.form.supplier': 'সাপ্লায়ার',
  'purchases.form.selectSupplier': 'নিবন্ধিত সাপ্লায়ার নির্বাচন করুন...',
  'purchases.form.noSuppliers':
    'কোনো সাপ্লায়ার নেই। ক্রয় লিখার আগে একটি সাপ্লায়ার যোগ করুন।',
  'purchases.form.createFirstSupplier': 'প্রথম সাপ্লায়ার তৈরি করুন',
  'purchases.form.inventoryLink': 'ইনভেন্টরি আইটেম (স্বয়ংক্রিয় স্টক বৃদ্ধি)',
  'purchases.form.manageInventory': 'ইনভেন্টরি পরিচালনা',
  'purchases.form.selectInventory':
    'স্টক বাড়াতে ইনভেন্টরি আইটেম নির্বাচন করুন...',
  'purchases.form.noInventory':
    'কোনো ইনভেন্টরি আইটেম নেই — নিচে আইটেমের নাম লিখুন',
  'purchases.form.customItem': 'কাস্টম / সাধারণ আইটেম (ম্যানুয়াল এন্ট্রি)',
  'purchases.form.itemName': 'আইটেমের নাম',
  'purchases.form.quantity': 'পরিমাণ',
  'purchases.form.unit': 'একক (ইউনিট)',
  'purchases.form.ratePerUnit': 'দর (রেট)',
  'purchases.form.totalFormula': 'মোট মূল্য (পরিমাণ × দর)',
  'purchases.form.recording': 'ক্রয় সংরক্ষণ হচ্ছে...',
  'purchases.form.savePurchase': 'ক্রয় সংরক্ষণ করুন',
  'purchases.form.previewTitle': 'স্বয়ংক্রিয় পোস্টিং প্রিভিউ',
  'purchases.form.item': 'আইটেম',
  'purchases.form.supplierCredit': 'সাপ্লায়ার ক্রেডিট (+দেনা)',
  'purchases.form.inventorySync': 'ইনভেন্টরি স্টক সমন্বয়',

  // Inventory Module
  'inventory.kpi.trackedMaterials': 'মোট স্টক আইটেম',
  'inventory.kpi.healthySub': 'টি পর্যাপ্ত · কেমিক্যাল, পাট ও যন্ত্রাংশ',
  'inventory.kpi.lowStockAlerts': 'কম স্টক সতর্কতা',
  'inventory.kpi.clickToFilter': 'কম স্টকের আইটেম দেখতে ক্লিক করুন',
  'inventory.kpi.allHealthy': 'সব আইটেমের স্টক পর্যাপ্ত আছে',
  'inventory.kpi.stockMovements': 'স্টক লেনদেন',
  'inventory.kpi.loggedIn': 'স্টক মুভমেন্ট লগে সংরক্ষিত',
  'inventory.kpi.purchaseRestocks': 'ক্রয় থেকে স্টক বৃদ্ধি',
  'inventory.kpi.autoSynced': 'স্বয়ংক্রিয় সমন্বিত',
  'inventory.form.addTitle': 'নতুন আইটেম যোগ করুন',
  'inventory.form.editTitle': 'আইটেম সম্পাদনা',
  'inventory.form.addSubtitle':
    'কেমিক্যাল, রং, পাট বা যন্ত্রাংশ ও সর্বনিম্ন স্টক সতর্কতা নির্ধারণ করুন',
  'inventory.form.editSubtitle':
    'আইটেমের নাম, একক বা সর্বনিম্ন স্টক সতর্কতা পরিবর্তন করুন',
  'inventory.form.itemName': 'আইটেমের নাম',
  'inventory.form.customItemName': 'কাস্টম আইটেমের নাম',
  'inventory.form.unit': 'একক (ইউনিট)',
  'inventory.form.minStock': 'সর্বনিম্ন স্টক সতর্কতা মাত্রা',
  'inventory.form.initialStock': 'প্রাথমিক বর্তমান স্টক',
  'inventory.form.currentStockNote':
    'স্টক বাড়াতে বা কমাতে স্টক ইন / স্টক আউট বাটন ব্যবহার করুন',
  'inventory.form.addBtn': 'ইনভেন্টরি আইটেম যোগ করুন',
  'inventory.form.adding': 'আইটেম যোগ হচ্ছে...',
  'inventory.form.saving': 'পরিবর্তন সংরক্ষণ হচ্ছে...',
  'inventory.form.cancelEdit': 'সম্পাদনা বাতিল',
  'inventory.form.deleteItem': 'আইটেম মুছুন',
  'inventory.tab.items': 'ইনভেন্টরি তালিকা',
  'inventory.tab.history': 'স্টক ইতিহাস',
  'inventory.lowStockBadge': 'কম স্টক',
  'inventory.inStockBadge': 'পর্যাপ্ত স্টক',
  'inventory.lowStockItemSingular': 'টি কম স্টক আইটেম',
  'inventory.lowStockItemPlural': 'টি কম স্টক আইটেম',
  'inventory.searchItemsPlaceholder': 'কেমিক্যাল, রং, পাট বা যন্ত্রাংশ খুঁজুন...',
  'inventory.searchHistoryPlaceholder': 'আইটেম, রেফারেন্স, তারিখ বা নোট খুঁজুন...',
  'inventory.filter.lowOnly': 'শুধু কম স্টক',
  'inventory.filter.healthyStock': 'পর্যাপ্ত স্টক',
  'inventory.filter.allItems': 'সব আইটেম',
  'inventory.filter.allTypes': 'সব ধরন',
  'inventory.empty.title': 'এখনো কোনো ইনভেন্টরি আইটেম যোগ করা হয়নি',
  'inventory.empty.desc':
    'পাট, ব্লিচিং, সোডা, এসিড, ব্লু, বিএমবি বা খুচরা যন্ত্রাংশ যোগ করুন। যোগ করার পর নতুন ক্রয় থেকে স্বয়ংক্রিয়ভাবে স্টক বাড়বে।',
  'inventory.empty.noMatch': 'ফিল্টারের সাথে কোনো আইটেম মেলেনি',
  'inventory.empty.noHistory': 'এখনো কোনো স্টক মুভমেন্ট রেকর্ড নেই',
  'inventory.empty.noHistoryDesc':
    'স্টক ইন, স্টক আউট এবং ক্রয়ের মাধ্যমে স্টক বৃদ্ধির ইতিহাস এখানে দেখা যাবে।',
  'inventory.clearHistoryFilters': 'ইতিহাস ফিল্টার মুছুন',
  'inventory.table.itemName': 'আইটেমের নাম',
  'inventory.table.currentStock': 'বর্তমান স্টক',
  'inventory.table.minAlert': 'সর্বনিম্ন সতর্কতা',
  'inventory.table.item': 'আইটেম',
  'inventory.table.type': 'ধরন',
  'inventory.table.qtyChange': 'পরিমাণ পরিবর্তন',
  'inventory.table.resulting': 'নতুন স্টক',
  'inventory.action.stockIn': 'স্টক ইন',
  'inventory.action.stockOut': 'স্টক আউট',
  'inventory.movement.in': 'স্টক ইন',
  'inventory.movement.out': 'স্টক আউট',
  'inventory.movement.purchase': 'ক্রয় ইন',
  'inventory.movement.opening': 'প্রাথমিক স্টক',
  'inventory.updated': 'হালনাগাদ',

  // Expenses Module
  'expenses.kpi.thisMonth': 'এই মাসের মোট খরচ',
  'expenses.kpi.paymentSplit': 'মাসিক পেমেন্ট বিভাজন',
  'expenses.kpi.topCategory': 'এই মাসের সর্বোচ্চ খরচের খাত',
  'expenses.kpi.noExpensesMonth': 'এই মাসে কোনো খরচ নেই',
  'expenses.kpi.allTime': 'সর্বমোট কারখানা খরচ',
  'expenses.kpi.syncedSub': 'সমন্বিত ক্যাশ আউট',
  'expenses.form.title': 'নতুন খরচ যোগ করুন',
  'expenses.form.subtitle':
    'দৈনন্দিন কারখানা খরচ লিখুন এবং লাইভ নগদ ব্যালেন্স থেকে সমন্বয় করুন',
  'expenses.form.date': 'তারিখ',
  'expenses.form.category': 'খরচের খাত',
  'expenses.form.amount': 'টাকার পরিমাণ',
  'expenses.form.paymentMethod': 'পেমেন্ট মাধ্যম',
  'expenses.form.description': 'বিবরণ / নোট',
  'expenses.form.descriptionPlaceholder':
    'যেমন: বয়লার অপারেটর বেতন, বিদ্যুৎ বিল বা জেনারেটর মেরামত...',
  'expenses.form.recordBtn': 'খরচ সংরক্ষণ করুন',
  'expenses.form.saving': 'খরচ সংরক্ষণ হচ্ছে...',
  'expenses.spendByCategory': 'খাত অনুযায়ী খরচ',
  'expenses.showAllCategories': 'সব খাত দেখুন',
  'expenses.list.title': 'সাম্প্রতিক খরচসমূহ',
  'expenses.list.subtitle':
    'কারখানা পরিচালনার সকল খরচের লাইভ তালিকা (ক্যাশ আউটের সাথে সমন্বিত)',
  'expenses.list.filtered': 'ফিল্টারকৃত',
  'expenses.searchPlaceholder': 'রেফারেন্স, খাত বা বিবরণ খুঁজুন...',
  'expenses.filter.allCategories': 'সব খাত',
  'expenses.empty.title': 'এখনো কোনো কারখানা খরচ লিপিবদ্ধ হয়নি',
  'expenses.empty.desc':
    'বেতন, বিদ্যুৎ বিল, ভাড়া বা দৈনন্দিন খরচ যোগ করুন। প্রতিটি খরচ স্বয়ংক্রিয়ভাবে নিট নগদ ব্যালেন্স থেকে বিয়োগ হবে।',
  'expenses.empty.noMatch': 'ফিল্টারের সাথে কোনো খরচ মেলেনি',
  'expenses.table.category': 'খাত',
  'expenses.table.description': 'বিবরণ / নোট',
  'expenses.category.Salary': 'বেতন',
  'expenses.category.Electricity': 'বিদ্যুৎ বিল',
  'expenses.category.Rent': 'ভাড়া',
  'expenses.category.Transport': 'পরিবহন',
  'expenses.category.Maintenance': 'রক্ষণাবেক্ষণ',
  'expenses.category.Food': 'খাবার',
  'expenses.category.Office': 'অফিস খরচ',
  'expenses.category.Other': 'অন্যান্য',

  // Ledger Book Module
  'ledger.kpi.filteredDebit': 'ফিল্টারকৃত মোট ডেবিট (বিল)',
  'ledger.kpi.filteredCredit': 'ফিল্টারকৃত মোট ক্রেডিট (জমা)',
  'ledger.kpi.netBalance': 'নিট খতিয়ান ব্যালেন্স (ডেবিট − ক্রেডিট)',
  'ledger.searchPlaceholder': 'ক্লায়েন্ট, রেফারেন্স নম্বর বা নোট খুঁজুন...',
  'ledger.filter.allTypes': 'সব ধরন',
  'ledger.filter.opening': 'পূর্বের বকেয়া',
  'ledger.filter.bills': 'বিলসমূহ',
  'ledger.filter.payments': 'জমাসমূহ',
  'ledger.filter.adjustments': 'সমন্বয়',
  'ledger.empty.title': 'কোনো খতিয়ান এন্ট্রি পাওয়া যায়নি',
  'ledger.empty.desc':
    'বিল বা জমা যুক্ত করতে ক্লায়েন্ট ব্যবস্থাপনা থেকে যেকোনো ক্লায়েন্ট খুলুন।',
  'ledger.table.typeReference': 'ধরন ও রেফারেন্স',
  'ledger.table.debit': 'ডেবিট (বিল)',
  'ledger.table.credit': 'ক্রেডিট (জমা)',
  'ledger.txn.opening': 'পূর্বের বকেয়া',
  'ledger.txn.invoice': 'ডাইং / ওয়াশিং বিল',
  'ledger.txn.payment': 'পেমেন্ট গ্রহণ',
  'ledger.txn.adjustment': 'খতিয়ান সমন্বয়',
  'ledger.supplierTxn.opening': 'পূর্বের দেনা',
  'ledger.supplierTxn.purchase': 'ক্রয় বিল',
  'ledger.supplierTxn.payment': 'সাপ্লায়ার পেমেন্ট',
  'ledger.supplierTxn.adjustment': 'দেনা সমন্বয়',

  // Roles & User Management (RBAC)
  'role.admin': 'অ্যাডমিন',
  'role.manager': 'ম্যানেজার',
  'role.accountant': 'অ্যাকাউন্ট্যান্ট',
  'role.admin.desc': 'সকল মডিউল, সম্পাদনা/মুছে ফেলা, কর্মচারী ও ব্যবহারকারী ব্যবস্থাপনার পূর্ণ অনুমতি',
  'role.manager.desc': 'অর্ডার, ক্লায়েন্ট, ইনভেন্টরি, সাপ্লায়ার ও ক্রয় (আর্থিক খতিয়ান বা সম্পাদনা/মুছা ব্যতীত)',
  'role.accountant.desc': 'ড্যাশবোর্ড, ক্লায়েন্ট ও সাপ্লায়ার পেমেন্ট, খরচ ও খতিয়ান (সম্পাদনা/মুছা ব্যতীত)',
  'users.kpi.total': 'মোট নিবন্ধিত ব্যবহারকারী',
  'users.kpi.admins': 'অ্যাডমিন',
  'users.kpi.managers': 'ম্যানেজার',
  'users.kpi.accountants': 'অ্যাকাউন্ট্যান্ট',
  'users.searchPlaceholder': 'নাম, ইমেইল বা UID দিয়ে খুঁজুন...',
  'users.table.user': 'ব্যবহারকারী ও ইমেইল',
  'users.table.joined': 'যোগদানের তারিখ',
  'users.table.currentRole': 'বর্তমান রোল',
  'users.table.assignRole': 'রোল পরিবর্তন',
  'users.youBadge': 'আপনি',
  'users.selfProtected': 'বর্তমান অ্যাডমিন (সুরক্ষিত)',
  'users.permissionsTitle': 'রোল অনুযায়ী অনুমতির তালিকা',
  'users.empty': 'আপনার ফিল্টারের সাথে কোনো ব্যবহারকারী মেলেনি।',
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  en,
  bn,
};

interface LanguageContextValue {
  lang: Language;
  setLang: (next: Language) => void;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
  translateOrderStatus: (status: OrderStatus) => string;
  translatePurchaseStatus: (status: PurchaseStatus) => string;
  translateExpenseCategory: (category: ExpenseCategory) => string;
  translatePaymentMethod: (method: PaymentMethod | string) => string;
  translateTxnType: (txnType: LedgerTxnType) => string;
  translateSupplierTxnType: (txnType: SupplierLedgerTxnType) => string;
  translateStockMovementType: (type: StockMovementType) => string;
  translateDueTone: (tone: 'due' | 'settled' | 'advance') => string;
  translatePayableTone: (tone: 'payable' | 'settled' | 'advance') => string;
  translateRole: (role: UserRole) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'bn') {
      return saved;
    }
  } catch {
    // Ignore storage access errors in restricted iframe environments
  }
  return 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => readStoredLanguage());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage write errors
    }
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = dictionaries[lang];
    const t = (key: TranslationKey): string => dict[key] ?? en[key];

    return {
      lang,
      setLang: (next: Language) => setLangState(next),
      toggleLang: () => setLangState((prev) => (prev === 'en' ? 'bn' : 'en')),
      t,
      translateOrderStatus: (status) => t(`orders.status.${status}`),
      translatePurchaseStatus: (status) =>
        status === 'Paid' ? t('common.paid') : t('common.pending'),
      translateExpenseCategory: (category) =>
        t(`expenses.category.${category}`),
      translatePaymentMethod: (method) => {
        if (method === 'Cash') return t('common.cash');
        if (method === 'Bank') return t('common.bank');
        if (method === 'bKash') return t('common.bkash');
        if (method === 'Nagad') return t('common.nagad');
        return method;
      },
      translateTxnType: (txnType) => t(`ledger.txn.${txnType}`),
      translateSupplierTxnType: (txnType) => t(`ledger.supplierTxn.${txnType}`),
      translateStockMovementType: (type) => t(`inventory.movement.${type}`),
      translateDueTone: (tone) => {
        if (tone === 'due') return t('common.due');
        if (tone === 'advance') return t('common.advance');
        return t('common.settled');
      },
      translatePayableTone: (tone) => {
        if (tone === 'payable') return t('common.payable');
        if (tone === 'advance') return t('common.advancePaid');
        return t('common.settled');
      },
      translateRole: (role) => t(`role.${role}`),
    };
  }, [lang]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside a LanguageProvider');
  }
  return ctx;
}
