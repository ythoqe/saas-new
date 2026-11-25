import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Banknote, Edit2, Plus, Printer, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LEDGER_VALIDATION,
  type ClientLedgerEntry,
  type ClientRecord,
  type LedgerTxnType,
  type MoneyInRecord,
} from '../types/mill';
import {
  calculateLedgerTotals,
  formatCurrency,
  formatDateTime,
  formatIsoDate,
  getDueStatusLabel,
  getTxnTypeLabel,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

export type ClientDrawerTab = 'ledger' | 'payments';

interface ClientLedgerDrawerProps {
  client: ClientRecord | null;
  ownerId: string;
  entries: ClientLedgerEntry[];
  moneyInRecords: MoneyInRecord[];
  initialTab?: ClientDrawerTab;
  onClose: () => void;
  onEditClient: (client: ClientRecord) => void;
  onReceivePayment: (client: ClientRecord) => void;
  onPrintInvoiceEntry: (entry: ClientLedgerEntry) => void;
  onPrintStatement: (client: ClientRecord) => void;
  onSuccess: (message: string) => void;
}

export function ClientLedgerDrawer({
  client,
  ownerId,
  entries,
  moneyInRecords,
  initialTab = 'ledger',
  onClose,
  onEditClient,
  onReceivePayment,
  onPrintInvoiceEntry,
  onPrintStatement,
  onSuccess,
}: ClientLedgerDrawerProps) {
  const [activeTab, setActiveTab] = useState<ClientDrawerTab>(initialTab);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [txnType, setTxnType] = useState<Exclude<LedgerTxnType, 'opening'>>('invoice');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (client) {
      setActiveTab(initialTab);
      setShowEntryForm(false);
      setFormError(null);
    }
  }, [client?.id, initialTab]);

  const clientEntries = useMemo(() => {
    if (!client) return [];
    const filtered = entries.filter((entry) => entry.clientId === client.id);
    // Sort chronologically oldest -> newest to compute exact running balance
    return [...filtered].sort((a, b) => {
      const timeA = timestampToDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const timeB = timestampToDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });
  }, [client, entries]);

  const rowsWithRunningBalance = useMemo(() => {
    let running = 0;
    const chronological = clientEntries.map((entry) => {
      running = roundCurrency(
        running + (Number(entry.debit) || 0) - (Number(entry.credit) || 0)
      );
      return { entry, runningBalance: running };
    });
    return chronological.reverse();
  }, [clientEntries]);

  const moneyInByLedgerId = useMemo(() => {
    const map = new Map<string, MoneyInRecord>();
    for (const rec of moneyInRecords) {
      map.set(rec.ledgerEntryId, rec);
      map.set(rec.id, rec);
    }
    return map;
  }, [moneyInRecords]);

  const paymentHistoryRows = useMemo(() => {
    return clientEntries
      .filter((entry) => entry.txn_type === 'payment')
      .map((entry) => {
        const moneyIn = moneyInByLedgerId.get(entry.id) ?? null;
        return {
          id: entry.id,
          reference: entry.reference || entry.id,
          amount: entry.credit,
          paymentDate: moneyIn?.paymentDate ?? null,
          paymentMethod: moneyIn?.paymentMethod ?? null,
          note: moneyIn ? moneyIn.note : entry.note,
          createdAt: timestampToDate(entry.createdAt),
        };
      })
      .reverse();
  }, [clientEntries, moneyInByLedgerId]);

  const totalPaymentsReceived = useMemo(() => {
    let sum = 0;
    for (const row of paymentHistoryRows) {
      sum += row.amount;
    }
    return roundCurrency(sum);
  }, [paymentHistoryRows]);

  const totals = useMemo(() => calculateLedgerTotals(clientEntries), [clientEntries]);

  if (!client) return null;

  const dueStatus = getDueStatusLabel(totals.currentDue);

  const handleRecordEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }
    if (parsedAmount > LEDGER_VALIDATION.maxAmount) {
      setFormError(
        `Amount cannot exceed ${LEDGER_VALIDATION.maxAmount.toLocaleString()}.`
      );
      return;
    }

    const trimmedRef = reference.trim();
    const trimmedNote = note.trim();
    if (trimmedRef.length > LEDGER_VALIDATION.referenceMax) {
      setFormError(
        `Reference must be at most ${LEDGER_VALIDATION.referenceMax} characters.`
      );
      return;
    }
    if (trimmedNote.length > LEDGER_VALIDATION.noteMax) {
      setFormError(`Note must be at most ${LEDGER_VALIDATION.noteMax} characters.`);
      return;
    }

    const cleanAmount = roundCurrency(parsedAmount);
    const isDebitEntry =
      txnType === 'invoice' ||
      (txnType === 'adjustment' && adjustmentDirection === 'debit');

    const debit = isDebitEntry ? cleanAmount : 0;
    const credit = isDebitEntry ? 0 : cleanAmount;

    setIsSubmitting(true);
    try {
      try {
        await addDoc(collection(db, 'client_ledger'), {
          ownerId,
          clientId: client.id,
          txn_type: txnType,
          debit,
          credit,
          reference: trimmedRef,
          note: trimmedNote,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'client_ledger');
      }

      setAmount('');
      setReference('');
      setNote('');
      setShowEntryForm(false);
      onSuccess(
        `Posted ${getTxnTypeLabel(txnType)} (${formatCurrency(cleanAmount)}) for ${client.clientName}.`
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to save ledger entry.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ledger-drawer-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-3xl bg-white h-full border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="ledger-drawer-title"
              className="font-display text-lg font-semibold text-slate-900 truncate"
            >
              {client.clientName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{client.companyName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{client.mobile}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-md">{client.address}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onReceivePayment(client)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Banknote className="w-3.5 h-3.5 shrink-0" />
              Receive Payment
            </button>
            <button
              type="button"
              onClick={() => onEditClient(client)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close client profile"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Balance Summary Strip */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="px-6 py-4 border-r border-slate-200">
            <p className="text-xs text-slate-500">Sum of Debit</p>
            <p className="mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums text-slate-900">
              {formatCurrency(totals.totalDebit)}
            </p>
          </div>
          <div className="px-6 py-4 border-r border-slate-200">
            <p className="text-xs text-slate-500">Sum of Credit</p>
            <p className="mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums text-emerald-700">
              {formatCurrency(totals.totalCredit)}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500">
              Current Due ·{' '}
              <span
                className={
                  dueStatus.tone === 'due'
                    ? 'text-red-700 font-medium'
                    : dueStatus.tone === 'advance'
                      ? 'text-emerald-700 font-medium'
                      : 'text-slate-600 font-medium'
                }
              >
                {dueStatus.label}
              </span>
            </p>
            <p
              className={`mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums ${
                totals.currentDue > 0
                  ? 'text-red-700'
                  : totals.currentDue < 0
                    ? 'text-emerald-700'
                    : 'text-slate-900'
              }`}
            >
              {formatCurrency(totals.currentDue)}
            </p>
          </div>
        </div>

        {/* Tab Bar: Full Ledger vs Payment History + Print Statement */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Client financial views"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ledger'}
                onClick={() => setActiveTab('ledger')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'ledger'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Full Ledger ({clientEntries.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'payments'}
                onClick={() => setActiveTab('payments')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'payments'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Payment History ({paymentHistoryRows.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => onPrintStatement(client)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              Print Statement
            </button>
          </div>

          {activeTab === 'ledger' ? (
            <button
              type="button"
              onClick={() => {
                setShowEntryForm((prev) => !prev);
                setFormError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {showEntryForm ? 'Close Entry Form' : 'Manual Ledger Entry'}
            </button>
          ) : (
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              Total Paid:{' '}
              <span className="font-semibold text-emerald-700">
                {formatCurrency(totalPaymentsReceived)}
              </span>
            </p>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {activeTab === 'ledger' ? (
            <>
              {/* Inline Manual Ledger Entry Form */}
              {showEntryForm && (
                <form
                  onSubmit={handleRecordEntry}
                  className="p-5 bg-slate-50 border border-slate-200 rounded-md space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      Post Manual Transaction
                    </p>
                    <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-md">
                      {(
                        [
                          { id: 'invoice', label: 'Bill (Debit)' },
                          { id: 'payment', label: 'Payment (Credit)' },
                          { id: 'adjustment', label: 'Adjustment' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setTxnType(tab.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                            txnType === tab.id
                              ? 'bg-[#1e3a8a] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {formError && (
                    <div
                      role="alert"
                      className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
                    >
                      {formError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="ledgerAmount"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Amount (BDT) <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="ledgerAmount"
                        type="number"
                        required
                        min="0.01"
                        max={LEDGER_VALIDATION.maxAmount}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="ledgerReference"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Challan / Receipt Ref
                      </label>
                      <input
                        id="ledgerReference"
                        type="text"
                        maxLength={LEDGER_VALIDATION.referenceMax}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={
                          txnType === 'payment' ? 'e.g. REC-1024' : 'e.g. CH-408'
                        }
                        className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                      />
                    </div>
                  </div>

                  {txnType === 'adjustment' && (
                    <div>
                      <span className="block text-xs font-medium text-slate-700 mb-1.5">
                        Adjustment Direction
                      </span>
                      <div className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-md">
                        <button
                          type="button"
                          onClick={() => setAdjustmentDirection('debit')}
                          className={`px-3 py-1 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                            adjustmentDirection === 'debit'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Increase Due (Debit)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustmentDirection('credit')}
                          className={`px-3 py-1 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                            adjustmentDirection === 'credit'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Reduce Due (Credit)
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="ledgerNote"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Batch / Description Note
                    </label>
                    <input
                      id="ledgerNote"
                      type="text"
                      maxLength={LEDGER_VALIDATION.noteMax}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Reactive navy dyeing — 420 kg cotton jersey"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowEntryForm(false)}
                      disabled={isSubmitting}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-1.5 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {isSubmitting ? 'Posting...' : 'Post Entry'}
                    </button>
                  </div>
                </form>
              )}

              {/* Full Ledger Table */}
              {rowsWithRunningBalance.length === 0 ? (
                <div className="py-12 px-6 text-center border border-slate-200 rounded-md bg-slate-50/40">
                  <p className="text-sm font-medium text-slate-900">
                    No ledger entries recorded yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    This client currently has a ৳0.00 balance. Deliver an order or
                    receive a payment to populate their ledger.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                          <th className="py-2.5 px-4">Date &amp; Type</th>
                          <th className="py-2.5 px-4">Reference / Note</th>
                          <th className="py-2.5 px-4 text-right">Debit</th>
                          <th className="py-2.5 px-4 text-right">Credit</th>
                          <th className="py-2.5 px-4 text-right">Balance</th>
                          <th className="py-2.5 px-4 text-right">Print</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {rowsWithRunningBalance.map(({ entry, runningBalance }) => (
                          <tr
                            key={entry.id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="py-3 px-4 align-top whitespace-nowrap">
                              <p className="text-xs font-medium text-slate-900">
                                {getTxnTypeLabel(entry.txn_type)}
                              </p>
                              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                                {formatDateTime(timestampToDate(entry.createdAt))}
                              </p>
                            </td>
                            <td className="py-3 px-4 align-top">
                              {entry.reference ? (
                                <p className="text-xs font-mono font-medium text-slate-700">
                                  {entry.reference}
                                </p>
                              ) : null}
                              <p className="text-xs text-slate-600 mt-0.5 break-words max-w-xs">
                                {entry.note || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-4 align-top text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              {entry.debit > 0 ? (
                                <span className="text-slate-900 font-medium">
                                  {formatCurrency(entry.debit)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              {entry.credit > 0 ? (
                                <span className="text-emerald-700 font-medium">
                                  {formatCurrency(entry.credit)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top text-right font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  runningBalance > 0
                                    ? 'text-red-700'
                                    : runningBalance < 0
                                      ? 'text-emerald-700'
                                      : 'text-slate-700'
                                }
                              >
                                {formatCurrency(runningBalance)}
                              </span>
                            </td>
                            <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                              {entry.txn_type === 'invoice' ? (
                                <button
                                  type="button"
                                  onClick={() => onPrintInvoiceEntry(entry)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <Printer className="w-3.5 h-3.5 shrink-0" />
                                  Print Invoice
                                </button>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Payment History Tab */
            <div className="space-y-4">
              {paymentHistoryRows.length === 0 ? (
                <div className="py-12 px-6 text-center border border-slate-200 rounded-md bg-slate-50/40">
                  <p className="text-sm font-medium text-slate-900">
                    No payments received from {client.clientName} yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Record Cash, Bank, or Mobile Banking receipts to reduce this
                    client&apos;s Current Due automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => onReceivePayment(client)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Receive First Payment
                  </button>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                          <th className="py-2.5 px-4">Receipt Ref</th>
                          <th className="py-2.5 px-4">Payment Date</th>
                          <th className="py-2.5 px-4">Method</th>
                          <th className="py-2.5 px-4">Reference Note</th>
                          <th className="py-2.5 px-4 text-right">Amount Paid</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {paymentHistoryRows.map((payment) => (
                          <tr
                            key={payment.id}
                            className="hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                              {payment.reference}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                              {payment.paymentDate
                                ? formatIsoDate(payment.paymentDate)
                                : formatDateTime(payment.createdAt)}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                              {payment.paymentMethod ?? 'Payment'}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 break-words max-w-xs">
                              {payment.note || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                              {formatCurrency(payment.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
