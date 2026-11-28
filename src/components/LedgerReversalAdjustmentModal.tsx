import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { ArrowLeftRight, CheckCircle2, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LEDGER_VALIDATION,
  PAYMENT_METHODS,
  type ClientLedgerEntry,
  type ClientRecord,
  type MoneyInRecord,
  type MoneyOutRecord,
  type PaymentMethod,
  type SupplierLedgerEntry,
  type SupplierRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatDateTime,
  formatIsoDate,
  getSupplierTxnTypeLabel,
  getTodayIsoDate,
  getTxnTypeLabel,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

export type LedgerAdjustmentTarget =
  | {
      kind: 'client_ledger';
      entry: ClientLedgerEntry;
      client: ClientRecord | null;
      linkedMoneyIn: MoneyInRecord | null;
    }
  | {
      kind: 'supplier_ledger';
      entry: SupplierLedgerEntry;
      supplier: SupplierRecord | null;
      linkedMoneyOut: MoneyOutRecord | null;
    }
  | {
      kind: 'money_in';
      record: MoneyInRecord;
      client: ClientRecord | null;
      linkedLedgerEntry: ClientLedgerEntry | null;
    }
  | {
      kind: 'money_out';
      record: MoneyOutRecord;
      supplier: SupplierRecord | null;
      counterpartyLabel: string;
      linkedLedgerEntry: SupplierLedgerEntry | null;
    };

interface LedgerReversalAdjustmentModalProps {
  target: LedgerAdjustmentTarget | null;
  ownerId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function LedgerReversalAdjustmentModal({
  target,
  ownerId,
  onClose,
  onSuccess,
}: LedgerReversalAdjustmentModalProps) {
  const [reasonNote, setReasonNote] = useState('');
  const [reverseLinkedCashflow, setReverseLinkedCashflow] = useState(true);
  const [includeReplacement, setIncludeReplacement] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newDirection, setNewDirection] = useState<'debit' | 'credit'>('debit');
  const [newReference, setNewReference] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] =
    useState<PaymentMethod>('Cash');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form whenever target changes
  useEffect(() => {
    if (!target) return;
    setError(null);
    setIsSubmitting(false);
    setReverseLinkedCashflow(true);
    setIncludeReplacement(false);

    if (target.kind === 'client_ledger') {
      const origAmt =
        target.entry.debit > 0 ? target.entry.debit : target.entry.credit;
      const origDir = target.entry.debit > 0 ? 'debit' : 'credit';
      const refLabel = target.entry.reference || target.entry.id;
      setReasonNote(
        `Reversal of ${getTxnTypeLabel(target.entry.txn_type)} (${refLabel})`
      );
      setNewAmount(String(origAmt));
      setNewDirection(origDir);
      setNewReference(
        target.entry.reference ? `${target.entry.reference}-CORR` : ''
      );
      setNewNote(
        target.entry.note
          ? `Corrected: ${target.entry.note}`
          : `Corrected entry for ${refLabel}`
      );
      setNewPaymentMethod(target.linkedMoneyIn?.paymentMethod ?? 'Cash');
    } else if (target.kind === 'supplier_ledger') {
      const origAmt =
        target.entry.credit > 0 ? target.entry.credit : target.entry.debit;
      const origDir = target.entry.credit > 0 ? 'credit' : 'debit';
      const refLabel = target.entry.reference || target.entry.id;
      setReasonNote(
        `Reversal of ${getSupplierTxnTypeLabel(target.entry.txn_type)} (${refLabel})`
      );
      setNewAmount(String(origAmt));
      setNewDirection(origDir);
      setNewReference(
        target.entry.reference ? `${target.entry.reference}-CORR` : ''
      );
      setNewNote(
        target.entry.note
          ? `Corrected: ${target.entry.note}`
          : `Corrected entry for ${refLabel}`
      );
      setNewPaymentMethod(target.linkedMoneyOut?.paymentMethod ?? 'Cash');
    } else if (target.kind === 'money_in') {
      const refLabel = target.record.reference || target.record.id;
      setReasonNote(`Reversal of Money In receipt (${refLabel})`);
      setNewAmount(String(target.record.amount));
      setNewDirection('credit');
      setNewReference(`${refLabel}-CORR`);
      setNewNote(
        target.record.note
          ? `Corrected receipt: ${target.record.note}`
          : `Corrected receipt for ${refLabel}`
      );
      setNewPaymentMethod(target.record.paymentMethod);
    } else {
      const refLabel = target.record.reference || target.record.id;
      setReasonNote(`Reversal of Money Out payout (${refLabel})`);
      setNewAmount(String(target.record.amount));
      setNewDirection('debit');
      setNewReference(`${refLabel}-CORR`);
      setNewNote(
        target.record.note
          ? `Corrected payout: ${target.record.note}`
          : `Corrected payout for ${refLabel}`
      );
      setNewPaymentMethod(target.record.paymentMethod);
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, isSubmitting, onClose]);

  if (!target) return null;

  const todayIso = getTodayIsoDate();

  // Derive display summary of original entry & exact opposite reversal entry
  const getSummaryInfo = () => {
    if (target.kind === 'client_ledger') {
      const entry = target.entry;
      const isOrigDebit = entry.debit > 0;
      const origAmt = isOrigDebit ? entry.debit : entry.credit;
      return {
        badge: 'Client Ledger (Immutable)',
        partyLabel: target.client
          ? `${target.client.clientName} (${target.client.companyName})`
          : `Client ID: ${entry.clientId}`,
        origTypeLabel: getTxnTypeLabel(entry.txn_type),
        origRef: entry.reference || entry.id,
        origDate: formatDateTime(timestampToDate(entry.createdAt)),
        origAmountLabel: isOrigDebit
          ? `Debit (বিল): ${formatCurrency(origAmt)}`
          : `Credit (জমা): ${formatCurrency(origAmt)}`,
        reversalAmountLabel: isOrigDebit
          ? `Credit (জমা): ${formatCurrency(origAmt)}`
          : `Debit (বিল): ${formatCurrency(origAmt)}`,
        reversalEffectDesc: isOrigDebit
          ? `Inserts an adjustment with Credit ${formatCurrency(origAmt)} (Debit 0) to cancel out the original ${formatCurrency(origAmt)} Debit.`
          : `Inserts an adjustment with Debit ${formatCurrency(origAmt)} (Credit 0) to cancel out the original ${formatCurrency(origAmt)} Credit.`,
        hasLinkedCash: Boolean(target.linkedMoneyIn),
        linkedCashDesc: target.linkedMoneyIn
          ? `Also post an offsetting Money Out (${formatCurrency(target.linkedMoneyIn.amount)}) to reverse receipt ${target.linkedMoneyIn.reference} from Net Cash Balance`
          : null,
      };
    }

    if (target.kind === 'supplier_ledger') {
      const entry = target.entry;
      const isOrigCredit = entry.credit > 0;
      const origAmt = isOrigCredit ? entry.credit : entry.debit;
      return {
        badge: 'Supplier Ledger (Immutable)',
        partyLabel: target.supplier
          ? `${target.supplier.supplierName} (${target.supplier.companyName})`
          : `Supplier ID: ${entry.supplierId}`,
        origTypeLabel: getSupplierTxnTypeLabel(entry.txn_type),
        origRef: entry.reference || entry.id,
        origDate: formatDateTime(timestampToDate(entry.createdAt)),
        origAmountLabel: isOrigCredit
          ? `Credit (+Payable Bill): ${formatCurrency(origAmt)}`
          : `Debit (−Paid): ${formatCurrency(origAmt)}`,
        reversalAmountLabel: isOrigCredit
          ? `Debit (−Payable): ${formatCurrency(origAmt)}`
          : `Credit (+Payable): ${formatCurrency(origAmt)}`,
        reversalEffectDesc: isOrigCredit
          ? `Inserts an adjustment with Debit ${formatCurrency(origAmt)} (Credit 0) to cancel out the original ${formatCurrency(origAmt)} Credit bill.`
          : `Inserts an adjustment with Credit ${formatCurrency(origAmt)} (Debit 0) to cancel out the original ${formatCurrency(origAmt)} Debit payment.`,
        hasLinkedCash: Boolean(target.linkedMoneyOut),
        linkedCashDesc: target.linkedMoneyOut
          ? `Also post an offsetting Money In (${formatCurrency(target.linkedMoneyOut.amount)}) to reverse payout ${target.linkedMoneyOut.reference} in Net Cash Balance`
          : null,
      };
    }

    if (target.kind === 'money_in') {
      const rec = target.record;
      return {
        badge: 'Money In / Cash Receipt (Immutable)',
        partyLabel: target.client
          ? `${target.client.clientName} (${target.client.companyName})`
          : 'Cash / Bank Inflow',
        origTypeLabel: `Money In (${rec.paymentMethod})`,
        origRef: rec.reference || rec.id,
        origDate: formatIsoDate(rec.paymentDate),
        origAmountLabel: `Money In (+Cash): ${formatCurrency(rec.amount)}`,
        reversalAmountLabel: `Money Out (−Cash): ${formatCurrency(rec.amount)}${
          target.linkedLedgerEntry
            ? ` + Client Ledger Debit: ${formatCurrency(rec.amount)}`
            : ''
        }`,
        reversalEffectDesc: target.linkedLedgerEntry
          ? `Inserts an offsetting Money Out of ${formatCurrency(rec.amount)} AND a Client Ledger Debit adjustment of ${formatCurrency(rec.amount)} to cancel out receipt ${rec.reference}.`
          : `Inserts an offsetting Money Out of ${formatCurrency(rec.amount)} to cancel out cash inflow ${rec.reference}.`,
        hasLinkedCash: false,
        linkedCashDesc: null,
      };
    }

    const rec = target.record;
    return {
      badge: 'Money Out / Cash Payout (Immutable)',
      partyLabel: target.counterpartyLabel,
      origTypeLabel: `Money Out (${rec.paymentMethod})`,
      origRef: rec.reference || rec.id,
      origDate: formatIsoDate(rec.paymentDate),
      origAmountLabel: `Money Out (−Cash): ${formatCurrency(rec.amount)}`,
      reversalAmountLabel: `Money In (+Cash): ${formatCurrency(rec.amount)}${
        target.linkedLedgerEntry
          ? ` + Supplier Ledger Credit: ${formatCurrency(rec.amount)}`
          : ''
      }`,
      reversalEffectDesc: target.linkedLedgerEntry
        ? `Inserts an offsetting Money In of ${formatCurrency(rec.amount)} AND a Supplier Ledger Credit adjustment of ${formatCurrency(rec.amount)} to cancel out supplier payout ${rec.reference}.`
        : `Inserts an offsetting Money In of ${formatCurrency(rec.amount)} to restore Net Cash Balance and cancel out ${rec.reference}.`,
      hasLinkedCash: false,
      linkedCashDesc: null,
    };
  };

  const summary = getSummaryInfo();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedReason = reasonNote.trim();
    if (!trimmedReason) {
      setError('Please provide a brief reversal reason / audit note.');
      return;
    }
    if (trimmedReason.length > LEDGER_VALIDATION.noteMax) {
      setError(
        `Reversal note must be at most ${LEDGER_VALIDATION.noteMax} characters.`
      );
      return;
    }

    let cleanNewAmount = 0;
    const trimmedNewRef = newReference.trim();
    const trimmedNewNote = newNote.trim();

    if (includeReplacement) {
      const parsedNew = Number(newAmount);
      if (
        !Number.isFinite(parsedNew) ||
        parsedNew <= 0 ||
        parsedNew > LEDGER_VALIDATION.maxAmount
      ) {
        setError(
          `Replacement amount must be greater than 0 and at most ${LEDGER_VALIDATION.maxAmount.toLocaleString()}.`
        );
        return;
      }
      if (trimmedNewRef.length > LEDGER_VALIDATION.referenceMax) {
        setError(
          `Replacement reference must be at most ${LEDGER_VALIDATION.referenceMax} characters.`
        );
        return;
      }
      if (trimmedNewNote.length > LEDGER_VALIDATION.noteMax) {
        setError(
          `Replacement note must be at most ${LEDGER_VALIDATION.noteMax} characters.`
        );
        return;
      }
      cleanNewAmount = roundCurrency(parsedNew);
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const shortToken = doc(collection(db, 'client_ledger'))
        .id.slice(0, 8)
        .toUpperCase();

      if (target.kind === 'client_ledger') {
        const orig = target.entry;
        const isOrigDebit = orig.debit > 0;
        const revDebit = isOrigDebit ? 0 : roundCurrency(orig.credit);
        const revCredit = isOrigDebit ? roundCurrency(orig.debit) : 0;
        const revId = `REV_${shortToken}`;
        const revRefLabel = `REV-${orig.reference || orig.id}`.slice(0, 80);

        batch.set(doc(db, 'client_ledger', revId), {
          ownerId,
          clientId: orig.clientId,
          txn_type: 'adjustment',
          debit: revDebit,
          credit: revCredit,
          reference: revRefLabel,
          note: trimmedReason,
          createdAt: serverTimestamp(),
        });

        // If this client_ledger entry was a payment with a linked money_in record, optionally reverse cash balance
        if (target.linkedMoneyIn && reverseLinkedCashflow) {
          const cashRevId = `REV-${shortToken}`;
          batch.set(doc(db, 'money_out', cashRevId), {
            ownerId,
            source: 'adjustment',
            reference: cashRevId,
            amount: roundCurrency(target.linkedMoneyIn.amount),
            paymentDate: todayIso,
            paymentMethod: target.linkedMoneyIn.paymentMethod,
            ...(target.linkedMoneyIn.accountId
              ? {
                  accountId: target.linkedMoneyIn.accountId,
                  accountName:
                    target.linkedMoneyIn.accountName ||
                    target.linkedMoneyIn.paymentMethod,
                }
              : {}),
            note: `${trimmedReason} (Cash reversal for ${target.linkedMoneyIn.reference})`
              .slice(0, 300),
            createdAt: serverTimestamp(),
          });
        }

        if (includeReplacement) {
          const corrId = `ADJ_${shortToken}_NEW`;
          const corrRefLabel = (
            trimmedNewRef || `CORR-${orig.reference || shortToken}`
          ).slice(0, 80);
          batch.set(doc(db, 'client_ledger', corrId), {
            ownerId,
            clientId: orig.clientId,
            txn_type: 'adjustment',
            debit: newDirection === 'debit' ? cleanNewAmount : 0,
            credit: newDirection === 'credit' ? cleanNewAmount : 0,
            reference: corrRefLabel,
            note:
              trimmedNewNote ||
              `Corrected entry replacing ${orig.reference || orig.id}`,
            createdAt: serverTimestamp(),
          });

          if (
            target.linkedMoneyIn &&
            reverseLinkedCashflow &&
            newDirection === 'credit'
          ) {
            const cashCorrId = `REV-${shortToken}-NEW`;
            batch.set(doc(db, 'money_in', cashCorrId), {
              ownerId,
              source: 'adjustment',
              reference: cashCorrId,
              amount: cleanNewAmount,
              paymentDate: todayIso,
              paymentMethod: newPaymentMethod,
              note: (
                trimmedNewNote ||
                `Corrected receipt replacing ${target.linkedMoneyIn.reference}`
              ).slice(0, 300),
              createdAt: serverTimestamp(),
            });
          }
        }
      } else if (target.kind === 'supplier_ledger') {
        const orig = target.entry;
        const isOrigCredit = orig.credit > 0;
        const revDebit = isOrigCredit ? roundCurrency(orig.credit) : 0;
        const revCredit = isOrigCredit ? 0 : roundCurrency(orig.debit);
        const revId = `REV_${shortToken}`;
        const revRefLabel = `REV-${orig.reference || orig.id}`.slice(0, 80);

        batch.set(doc(db, 'supplier_ledger', revId), {
          ownerId,
          supplierId: orig.supplierId,
          txn_type: 'adjustment',
          debit: revDebit,
          credit: revCredit,
          reference: revRefLabel,
          note: trimmedReason,
          createdAt: serverTimestamp(),
        });

        if (target.linkedMoneyOut && reverseLinkedCashflow) {
          const cashRevId = `REV-${shortToken}`;
          batch.set(doc(db, 'money_in', cashRevId), {
            ownerId,
            source: 'adjustment',
            reference: cashRevId,
            amount: roundCurrency(target.linkedMoneyOut.amount),
            paymentDate: todayIso,
            paymentMethod: target.linkedMoneyOut.paymentMethod,
            ...(target.linkedMoneyOut.accountId
              ? {
                  accountId: target.linkedMoneyOut.accountId,
                  accountName:
                    target.linkedMoneyOut.accountName ||
                    target.linkedMoneyOut.paymentMethod,
                }
              : {}),
            note: `${trimmedReason} (Cash reversal for ${target.linkedMoneyOut.reference})`
              .slice(0, 300),
            createdAt: serverTimestamp(),
          });
        }

        if (includeReplacement) {
          const corrId = `ADJ_${shortToken}_NEW`;
          const corrRefLabel = (
            trimmedNewRef || `CORR-${orig.reference || shortToken}`
          ).slice(0, 80);
          batch.set(doc(db, 'supplier_ledger', corrId), {
            ownerId,
            supplierId: orig.supplierId,
            txn_type: 'adjustment',
            debit: newDirection === 'debit' ? cleanNewAmount : 0,
            credit: newDirection === 'credit' ? cleanNewAmount : 0,
            reference: corrRefLabel,
            note:
              trimmedNewNote ||
              `Corrected entry replacing ${orig.reference || orig.id}`,
            createdAt: serverTimestamp(),
          });

          if (
            target.linkedMoneyOut &&
            reverseLinkedCashflow &&
            newDirection === 'debit'
          ) {
            const cashCorrId = `REV-${shortToken}-NEW`;
            batch.set(doc(db, 'money_out', cashCorrId), {
              ownerId,
              source: 'adjustment',
              reference: cashCorrId,
              amount: cleanNewAmount,
              paymentDate: todayIso,
              paymentMethod: newPaymentMethod,
              note: (
                trimmedNewNote ||
                `Corrected payout replacing ${target.linkedMoneyOut.reference}`
              ).slice(0, 300),
              createdAt: serverTimestamp(),
            });
          }
        }
      } else if (target.kind === 'money_in') {
        const rec = target.record;
        const cashRevId = `REV-${shortToken}`;

        // Reverse money_in by inserting an offsetting money_out adjustment
        batch.set(doc(db, 'money_out', cashRevId), {
          ownerId,
          source: 'adjustment',
          reference: cashRevId,
          amount: roundCurrency(rec.amount),
          paymentDate: todayIso,
          paymentMethod: rec.paymentMethod,
          ...(rec.accountId
            ? {
                accountId: rec.accountId,
                accountName: rec.accountName || rec.paymentMethod,
              }
            : {}),
          note: trimmedReason,
          createdAt: serverTimestamp(),
        });

        // Also reverse the paired client_ledger credit entry if present
        if (target.linkedLedgerEntry) {
          const ledgerRevId = `REV_${shortToken}`;
          batch.set(doc(db, 'client_ledger', ledgerRevId), {
            ownerId,
            clientId: target.linkedLedgerEntry.clientId,
            txn_type: 'adjustment',
            debit: roundCurrency(rec.amount),
            credit: 0,
            reference: cashRevId,
            note: trimmedReason,
            createdAt: serverTimestamp(),
          });
        }

        if (includeReplacement) {
          const cashCorrId = `REV-${shortToken}-NEW`;
          const corrNote = (
            trimmedNewNote || `Corrected receipt replacing ${rec.reference}`
          ).slice(0, 300);

          batch.set(doc(db, 'money_in', cashCorrId), {
            ownerId,
            source: 'adjustment',
            reference: cashCorrId,
            amount: cleanNewAmount,
            paymentDate: todayIso,
            paymentMethod: newPaymentMethod,
            note: corrNote,
            createdAt: serverTimestamp(),
          });

          if (target.linkedLedgerEntry) {
            batch.set(doc(db, 'client_ledger', `ADJ_${shortToken}_NEW`), {
              ownerId,
              clientId: target.linkedLedgerEntry.clientId,
              txn_type: 'adjustment',
              debit: 0,
              credit: cleanNewAmount,
              reference: cashCorrId,
              note: corrNote,
              createdAt: serverTimestamp(),
            });
          }
        }
      } else {
        // target.kind === 'money_out'
        const rec = target.record;
        const cashRevId = `REV-${shortToken}`;

        // Reverse money_out by inserting an offsetting money_in adjustment
        batch.set(doc(db, 'money_in', cashRevId), {
          ownerId,
          source: 'adjustment',
          reference: cashRevId,
          amount: roundCurrency(rec.amount),
          paymentDate: todayIso,
          paymentMethod: rec.paymentMethod,
          ...(rec.accountId
            ? {
                accountId: rec.accountId,
                accountName: rec.accountName || rec.paymentMethod,
              }
            : {}),
          note: trimmedReason,
          createdAt: serverTimestamp(),
        });

        // Also reverse paired supplier_ledger debit entry if present
        if (target.linkedLedgerEntry) {
          const ledgerRevId = `REV_${shortToken}`;
          batch.set(doc(db, 'supplier_ledger', ledgerRevId), {
            ownerId,
            supplierId: target.linkedLedgerEntry.supplierId,
            txn_type: 'adjustment',
            debit: 0,
            credit: roundCurrency(rec.amount),
            reference: cashRevId,
            note: trimmedReason,
            createdAt: serverTimestamp(),
          });
        }

        if (includeReplacement) {
          const cashCorrId = `REV-${shortToken}-NEW`;
          const corrNote = (
            trimmedNewNote || `Corrected payout replacing ${rec.reference}`
          ).slice(0, 300);

          batch.set(doc(db, 'money_out', cashCorrId), {
            ownerId,
            source: 'adjustment',
            reference: cashCorrId,
            amount: cleanNewAmount,
            paymentDate: todayIso,
            paymentMethod: newPaymentMethod,
            note: corrNote,
            createdAt: serverTimestamp(),
          });

          if (target.linkedLedgerEntry) {
            batch.set(doc(db, 'supplier_ledger', `ADJ_${shortToken}_NEW`), {
              ownerId,
              supplierId: target.linkedLedgerEntry.supplierId,
              txn_type: 'adjustment',
              debit: cleanNewAmount,
              credit: 0,
              reference: cashCorrId,
              note: corrNote,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `reversal_adjustment/${target.kind}`
        );
      }

      onSuccess(
        includeReplacement
          ? `Posted reversal entry for ${summary.origRef} and recorded the corrected entry (${formatCurrency(cleanNewAmount)}).`
          : `Posted reversal adjustment entry cancelling ${summary.origRef}.`
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to post reversal adjustment.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reversal-modal-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/55"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="reversal-modal-title"
                className="font-display text-base font-semibold truncate"
              >
                Correct / Adjust Ledger Entry (Reversal)
              </h2>
              <p className="text-xs text-slate-300 truncate">{summary.badge}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close reversal modal"
            className="p-1.5 text-slate-300 hover:text-white rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[84vh] overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {error}
            </div>
          )}

          {/* Immutable Accounting Explanation Banner */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-md flex items-start gap-2.5 text-xs text-amber-950">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                Append-Only Accounting Best Practice
              </p>
              <p className="text-amber-900 leading-relaxed">
                {summary.reversalEffectDesc}
              </p>
            </div>
          </div>

          {/* Side-by-Side Comparison: Original Entry vs Automatic Reversal Entry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                1. Original Entry
              </span>
              <p className="mt-1 text-xs font-semibold text-slate-900 truncate">
                {summary.partyLabel}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {summary.origTypeLabel} ·{' '}
                <span className="font-mono">{summary.origRef}</span>
              </p>
              <p className="mt-2 font-mono text-xs font-bold text-slate-900">
                {summary.origAmountLabel}
              </p>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-md">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                2. Auto-Reversal Entry
              </span>
              <p className="mt-1 text-xs font-semibold text-emerald-950 truncate">
                Cancels Out Original
              </p>
              <p className="mt-0.5 text-xs text-emerald-800 font-mono">
                Ref: REV-{summary.origRef}
              </p>
              <p className="mt-2 font-mono text-xs font-bold text-emerald-800">
                {summary.reversalAmountLabel}
              </p>
            </div>
          </div>

          {/* Reversal Audit Reason */}
          <div>
            <label
              htmlFor="reversalReasonNote"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Reversal Audit Note / Reason <span className="text-red-600">*</span>
            </label>
            <input
              id="reversalReasonNote"
              type="text"
              required
              maxLength={LEDGER_VALIDATION.noteMax}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="e.g. Wrong bill amount entered on invoice"
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
            />
          </div>

          {/* Linked Cashflow Option */}
          {summary.hasLinkedCash && summary.linkedCashDesc && (
            <label className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={reverseLinkedCashflow}
                onChange={(e) => setReverseLinkedCashflow(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#1e3a8a] focus:ring-[#1e3a8a]"
              />
              <span>{summary.linkedCashDesc}</span>
            </label>
          )}

          {/* Optional Step 2: Create the Correct New Entry in the same atomic batch */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <label className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={includeReplacement}
                  onChange={(e) => setIncludeReplacement(e.target.checked)}
                  className="rounded border-slate-300 text-[#1e3a8a] focus:ring-[#1e3a8a]"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    Also Create the Corrected New Entry Now
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Post the reversal entry and the new corrected amount together
                  </p>
                </div>
              </div>
              <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0" />
            </label>

            {includeReplacement && (
              <div className="p-4 bg-white border-t border-slate-200 space-y-4">
                {(target.kind === 'client_ledger' ||
                  target.kind === 'supplier_ledger') && (
                  <div>
                    <span className="block text-xs font-medium text-slate-700 mb-1.5">
                      Corrected Entry Direction
                    </span>
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                      {target.kind === 'client_ledger' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setNewDirection('debit')}
                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                              newDirection === 'debit'
                                ? 'bg-[#1e3a8a] text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Debit / Bill (বিল)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewDirection('credit')}
                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                              newDirection === 'credit'
                                ? 'bg-emerald-700 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Credit / Payment (জমা)
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setNewDirection('credit')}
                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                              newDirection === 'credit'
                                ? 'bg-[#1e3a8a] text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Credit / Bill (+Payable)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewDirection('debit')}
                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                              newDirection === 'debit'
                                ? 'bg-emerald-700 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Debit / Payment (−Paid)
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="correctedAmount"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Corrected Amount (BDT){' '}
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="correctedAmount"
                      type="number"
                      required={includeReplacement}
                      min="0.01"
                      max={LEDGER_VALIDATION.maxAmount}
                      step="0.01"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                    />
                  </div>

                  {target.kind === 'client_ledger' ||
                  target.kind === 'supplier_ledger' ? (
                    <div>
                      <label
                        htmlFor="correctedRef"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Corrected Reference
                      </label>
                      <input
                        id="correctedRef"
                        type="text"
                        maxLength={LEDGER_VALIDATION.referenceMax}
                        value={newReference}
                        onChange={(e) => setNewReference(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                      />
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="correctedMethod"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Payment Method
                      </label>
                      <select
                        id="correctedMethod"
                        value={newPaymentMethod}
                        onChange={(e) =>
                          setNewPaymentMethod(e.target.value as PaymentMethod)
                        }
                        className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="correctedNote"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Corrected Entry Note
                  </label>
                  <input
                    id="correctedNote"
                    type="text"
                    maxLength={LEDGER_VALIDATION.noteMax}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-60 rounded-md transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isSubmitting
                ? 'Posting Reversal...'
                : includeReplacement
                  ? 'Post Reversal & Corrected Entry'
                  : 'Post Reversal Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
