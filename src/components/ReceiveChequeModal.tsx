import { useEffect, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FileCheck2, Info, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CHEQUE_VALIDATION,
  type ClientWithLedgerSummary,
} from '../types/mill';
import {
  formatCurrency,
  getTodayIsoDate,
  roundCurrency,
} from '../utils/ledger';

interface ReceiveChequeModalProps {
  open: boolean;
  ownerId: string;
  clientSummaries: ClientWithLedgerSummary[];
  onClose: () => void;
  onSuccess: (
    clientName: string,
    amount: number,
    chequeNo: string,
    chequeId: string
  ) => void;
}

const COMMON_BANKS = [
  'Sonali Bank',
  'Islami Bank Bangladesh',
  'Dutch-Bangla Bank (DBBL)',
  'BRAC Bank',
  'The City Bank',
  'Pubali Bank',
  'Eastern Bank (EBL)',
  'Prime Bank',
  'United Commercial Bank (UCB)',
  'Southeast Bank',
  'Mercantile Bank',
  'Janata Bank',
  'Agrani Bank',
];

function generateChequeId(dateIso: string): string {
  const compact = dateIso.replaceAll('-', '');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `CHQ-${compact}-${suffix}`;
}

export function ReceiveChequeModal({
  open,
  ownerId,
  clientSummaries,
  onClose,
  onSuccess,
}: ReceiveChequeModalProps) {
  const [clientId, setClientId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setClientId(clientSummaries[0]?.client.id ?? '');
    setAmountInput('');
    setBankName('');
    setChequeNo('');
    setChequeDate(getTodayIsoDate());
    setNote('');
    setErrorMessage(null);
    setSubmitting(false);
  }, [open, clientSummaries]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const selectedClientSummary = clientSummaries.find(
    (item) => item.client.id === clientId
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedClientSummary) {
      setErrorMessage('Please select a client.');
      return;
    }

    const parsedAmount = Number(amountInput);
    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > CHEQUE_VALIDATION.maxAmount
    ) {
      setErrorMessage(
        `Please enter a valid cheque amount greater than 0 and up to ${formatCurrency(CHEQUE_VALIDATION.maxAmount)}.`
      );
      return;
    }

    const cleanBank = bankName.trim().slice(0, CHEQUE_VALIDATION.bankNameMax);
    if (cleanBank.length < CHEQUE_VALIDATION.bankNameMin) {
      setErrorMessage('Please enter the issuing bank name.');
      return;
    }

    const cleanChequeNo = chequeNo
      .trim()
      .slice(0, CHEQUE_VALIDATION.chequeNoMax);
    if (cleanChequeNo.length < CHEQUE_VALIDATION.chequeNoMin) {
      setErrorMessage('Please enter the cheque number.');
      return;
    }

    if (!CHEQUE_VALIDATION.datePattern.test(chequeDate)) {
      setErrorMessage('Please select a valid cheque date.');
      return;
    }

    const cleanAmount = roundCurrency(parsedAmount);
    const cleanNote = note.trim().slice(0, CHEQUE_VALIDATION.noteMax);
    const chequeId = generateChequeId(chequeDate);
    const clientName = selectedClientSummary.client.clientName
      .trim()
      .slice(0, 120);

    setSubmitting(true);
    try {
      await setDoc(doc(db, 'cheques', chequeId), {
        ownerId,
        clientId: selectedClientSummary.client.id,
        clientName,
        amount: cleanAmount,
        bankName: cleanBank,
        chequeNo: cleanChequeNo,
        chequeDate,
        status: 'Pending',
        endorsedSupplierId: null,
        endorsedSupplierName: null,
        endorsedDate: null,
        clearedDate: null,
        bouncedDate: null,
        bounceReason: '',
        moneyInId: null,
        clientLedgerEntryId: null,
        supplierLedgerEntryId: null,
        note: cleanNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      onSuccess(clientName, cleanAmount, cleanChequeNo, chequeId);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `cheques/${chequeId}`);
      } catch (wrapped) {
        setErrorMessage(
          wrapped instanceof Error
            ? wrapped.message
            : 'Failed to save received cheque.'
        );
      }
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receive-cheque-modal-title"
    >
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!submitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4 text-amber-200" />
            </div>
            <div>
              <h2
                id="receive-cheque-modal-title"
                className="text-sm font-semibold"
              >
                Receive Client Cheque
              </h2>
              <p className="text-[11px] text-slate-300">
                Record a cheque in hand (Pending until cleared or endorsed)
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close receive cheque modal"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800"
            >
              {errorMessage}
            </div>
          )}

          {clientSummaries.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
              No registered clients found. Add a client first before recording a
              cheque.
            </div>
          ) : (
            <>
              {/* Client */}
              <div>
                <label
                  htmlFor="cheque-client-select"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Client
                </label>
                <select
                  id="cheque-client-select"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={submitting}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                >
                  {clientSummaries.map((item) => (
                    <option key={item.client.id} value={item.client.id}>
                      {item.client.clientName} ({item.client.companyName}) — Due:{' '}
                      {formatCurrency(item.currentDue)}
                    </option>
                  ))}
                </select>
                {selectedClientSummary && (
                  <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    Current Client Due:{' '}
                    <strong className="text-slate-800">
                      {formatCurrency(selectedClientSummary.currentDue)}
                    </strong>
                  </p>
                )}
              </div>

              {/* Amount & Cheque Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="cheque-amount"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Cheque Amount (৳)
                  </label>
                  <input
                    id="cheque-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    max={CHEQUE_VALIDATION.maxAmount}
                    required
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 text-sm font-semibold tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cheque-date"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Cheque / Maturity Date
                  </label>
                  <input
                    id="cheque-date"
                    type="date"
                    required
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                  />
                </div>
              </div>

              {/* Bank Name & Cheque Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="cheque-bank-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Bank Name
                  </label>
                  <input
                    id="cheque-bank-name"
                    type="text"
                    list="bd-bank-suggestions"
                    maxLength={CHEQUE_VALIDATION.bankNameMax}
                    required
                    placeholder="e.g., Islami Bank, DBBL"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                  />
                  <datalist id="bd-bank-suggestions">
                    {COMMON_BANKS.map((bank) => (
                      <option key={bank} value={bank} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label
                    htmlFor="cheque-no"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Cheque Number
                  </label>
                  <input
                    id="cheque-no"
                    type="text"
                    maxLength={CHEQUE_VALIDATION.chequeNoMax}
                    required
                    placeholder="e.g., SB-4582910"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                  />
                </div>
              </div>

              {/* Optional Note */}
              <div>
                <label
                  htmlFor="cheque-note"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Note / Branch Details (Optional)
                </label>
                <input
                  id="cheque-note"
                  type="text"
                  maxLength={CHEQUE_VALIDATION.noteMax}
                  placeholder="e.g., Post-dated cheque for November dyeing bills"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={submitting}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]"
                />
              </div>

              {/* Accounting Notice */}
              <div className="flex items-start gap-2.5 p-3 bg-blue-50/80 border border-blue-200 rounded-md text-xs text-blue-900">
                <Info className="w-4 h-4 text-[#1e3a8a] shrink-0 mt-0.5" />
                <span>
                  This cheque will be saved as <strong>Pending</strong>. It will{' '}
                  <strong>not</strong> increase your Bank Balance or reduce the
                  client&apos;s due until it is cleared.
                </span>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || clientSummaries.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileCheck2 className="w-4 h-4" />
              {submitting ? 'Saving Cheque...' : 'Record Pending Cheque'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
