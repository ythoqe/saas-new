# Security Specification — Dyeing & Washing Mill Ledger

## 1. Data Invariants
1. **No Stored Balance**: `/clients/{clientId}` strictly forbids a `balance` or `currentDue` field. Only `ownerId`, `clientName`, `companyName`, `mobile`, `address`, `createdAt`, and `updatedAt` are allowed.
2. **Strict Ownership & PII Isolation**: Client profiles contain PII (`mobile`, `address`). Both `get` and `list` operations on `/clients`, `/client_ledger`, and `/orders` strictly require an authenticated, email-verified user (`request.auth.token.email_verified == true`) whose `request.auth.uid == resource.data.ownerId`.
3. **Referential & Atomic Integrity**: Every `/client_ledger/{entryId}` created MUST reference an existing (or atomically batch-created) `/clients/{clientId}` owned by `request.auth.uid`. Every `/orders/{orderId}` created MUST reference an existing `/clients/{clientId}` owned by `request.auth.uid`.
4. **Immutable Append-Only Ledger**: Entries in `/client_ledger/{entryId}` are append-only (`allow update, delete: if false`).
5. **Order Terminal State Locking & Atomic Auto-Billing**:
   - Orders cannot be created directly in `"Delivered"` status (`finalGaj`, `finalBillAmount`, and `deliveredAt` must be `null` on create).
   - Once `existing().status == "Delivered"`, the order is locked permanently against any subsequent updates (`existing().status != "Delivered"`).
   - Transitioning an order to `"Delivered"` MUST occur in an atomic batch alongside `/client_ledger/INV_{orderId}` where `txn_type == "invoice"`, `debit == finalBillAmount`, `credit == 0`, `reference == orderId`, and `abs(finalBillAmount - (finalGaj * rate)) <= 0.02`.
6. **Temporal & ID Integrity**: `createdAt`, `updatedAt`, and `deliveredAt` must equal `request.time`. All document IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars).
7. **Atomic Client Payment & Cash Flow Integrity**: Every `/money_in/{paymentId}` document is append-only (`allow update, delete: if false`), enforces `reference == paymentId` matching `^PAY-[a-zA-Z0-9_\-]+$`, restricts `paymentMethod` to `Cash` | `Bank` | `Mobile Banking`, and verifies via `existsAfter` / `getAfter` that `/client_ledger/{paymentId}` exists in the same atomic batch with `txn_type == "payment"`, `debit == 0`, `credit == amount`, and matching `clientId`.
8. **Inverted Append-Only Supplier Payable Ledger**: `/suppliers/{supplierId}` forbids stored payable/balance fields. `/supplier_ledger/{entryId}` is append-only (`allow update, delete: if false`) with inverted payable signs: `opening` and `purchase` require `credit > 0 && debit == 0`, while `payment` requires `debit > 0 && credit == 0`. Total Payable is dynamically computed as `(Sum of Credit) - (Sum of Debit)`.
9. **Atomic Purchase & Supplier Payment Outflow**: `/purchases/{purchaseId}` verifies `abs(totalAmount - quantity * rate) <= 0.02` and enforces atomic creation of `/supplier_ledger/{purchaseId}` (`txn_type == "purchase"`, `credit == totalAmount`, `debit == 0`). `/money_out/{paymentId}` is append-only, restricts `paymentMethod` to `Cash` | `Bank`, and enforces atomic creation of `/supplier_ledger/{paymentId}` (`txn_type == "payment"`, `debit == amount`, `credit == 0`).

## 2. Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write** on `/clients`, `/client_ledger`, or `/orders`.
2. **Unverified Email Spoofing** (`email_verified == false`).
3. **Cross-Tenant PII Read (GET)** on `/clients/{userA_client}` or `/orders/{userA_order}`.
4. **Unfiltered Collection Scrape (LIST)** without `where('ownerId', '==', uid)`.
5. **Identity Spoofing** (`ownerId != request.auth.uid`).
6. **Shadow Field Injection** (`balance` on `/clients` or extra fields on `/orders`).
7. **ID Poisoning** (`bad$id with spaces` or > 128 chars).
8. **Backdated Timestamps** (`createdAt != request.time`).
9. **Orphaned Order / Ledger Entry** referencing a missing or cross-owner `clientId`.
10. **Creating Order Directly as Delivered** (bypassing Complete & Deliver).
11. **Delivering Order Without Atomic Invoice Ledger Entry or Forged Bill Amount** (`finalBillAmount != finalGaj * rate`, or missing `client_ledger/INV_{orderId}`).
12. **Double-Delivery / Post-Delivery Mutation / Ledger History Tampering** (updating a `Delivered` order or mutating/deleting `client_ledger`).
