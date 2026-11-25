import { useEffect, useMemo, useState } from 'react';
import { Calendar, FileText, Printer, RotateCcw, Settings2, X } from 'lucide-react';
import type {
  ClientLedgerEntry,
  ClientRecord,
  MoneyInRecord,
  MoneyOutRecord,
  SupplierLedgerEntry,
  SupplierRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatIsoDate,
  formatShortDate,
  getDueStatusLabel,
  getPayableStatusLabel,
  getSupplierTxnTypeLabel,
  getTodayIsoDate,
  getTxnTypeLabel,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';

export type StatementPrintPayload =
  | {
      kind: 'client';
      client: ClientRecord;
      entries: ClientLedgerEntry[];
      moneyInRecords: MoneyInRecord[];
    }
  | {
      kind: 'supplier';
      supplier: SupplierRecord;
      entries: SupplierLedgerEntry[];
      moneyOutRecords: MoneyOutRecord[];
    };

interface StatementPrintModalProps {
  payload: StatementPrintPayload | null;
  onClose: () => void;
}

const MILL_HEADER_STORAGE_KEY = 'indigomill_print_header_v1';

interface MillHeaderConfig {
  address: string;
  mobile: string;
}

const DEFAULT_MILL_HEADER: MillHeaderConfig = {
  address: 'Industrial Area, Madhabdi / Narayanganj, Dhaka',
  mobile: '+880 17XX-XXXXXX',
};

function loadMillHeaderConfig(): MillHeaderConfig {
  try {
    const raw = window.localStorage.getItem(MILL_HEADER_STORAGE_KEY);
    if (!raw) return DEFAULT_MILL_HEADER;
    const parsed = JSON.parse(raw) as Partial<MillHeaderConfig>;
    return {
      address:
        typeof parsed.address === 'string' && parsed.address.trim()
          ? parsed.address
          : DEFAULT_MILL_HEADER.address,
      mobile:
        typeof parsed.mobile === 'string' && parsed.mobile.trim()
          ? parsed.mobile
          : DEFAULT_MILL_HEADER.mobile,
    };
  } catch {
    return DEFAULT_MILL_HEADER;
  }
}

interface NormalizedStatementRow {
  id: string;
  dateObj: Date | null;
  isoDate: string;
  displayDate: string;
  reference: string;
  typeLabel: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

function toLocalIsoDate(date: Date | null): string {
  if (!date) return getTodayIsoDate();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function StatementPrintModal({
  payload,
  onClose,
}: StatementPrintModalProps) {
  const [headerConfig, setHeaderConfig] = useState<MillHeaderConfig>(() =>
    loadMillHeaderConfig()
  );
  const [showHeaderEditor, setShowHeaderEditor] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Reset date range filters when switching party/payload
  const payloadKey = payload
    ? payload.kind === 'client'
      ? `client-${payload.client.id}`
      : `supplier-${payload.supplier.id}`
    : '';

  useEffect(() => {
    setFromDate('');
    setToDate('');
    setShowHeaderEditor(false);
    setHeaderConfig(loadMillHeaderConfig());
  }, [payloadKey]);

  // Close on Escape key
  useEffect(() => {
    if (!payload) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payload, onClose]);

  // Persist Mill Header updates (shared with InvoicePrintModal)
  const handleUpdateHeader = (field: keyof MillHeaderConfig, value: string) => {
    setHeaderConfig((prev) => {
      const next = { ...prev, [field]: value };
      try {
        window.localStorage.setItem(
          MILL_HEADER_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  // Compute full chronological rows with exact row-by-row running balance
  const statementData = useMemo(() => {
    if (!payload) {
      return {
        broughtForwardBalance: 0,
        hasBroughtForward: false,
        rows: [] as NormalizedStatementRow[],
        totalDebit: 0,
        totalCredit: 0,
        finalBalance: 0,
        allEntriesCount: 0,
      };
    }

    const isClient = payload.kind === 'client';

    if (isClient) {
      const moneyInByLedgerId = new Map<string, MoneyInRecord>();
      for (const rec of payload.moneyInRecords) {
        if (rec.ledgerEntryId) {
          moneyInByLedgerId.set(rec.ledgerEntryId, rec);
        }
        moneyInByLedgerId.set(rec.id, rec);
      }

      const sorted = payload.entries
        .filter((e) => e.clientId === payload.client.id)
        .sort((a, b) => {
          const timeA =
            timestampToDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const timeB =
            timestampToDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });

      let running = 0;
      const allNormalized: NormalizedStatementRow[] = sorted.map((entry) => {
        const debit = roundCurrency(Number(entry.debit) || 0);
        const credit = roundCurrency(Number(entry.credit) || 0);
        // Client Running Balance: Previous Balance + Debit - Credit = New Balance
        running = roundCurrency(running + debit - credit);

        const createdDate = timestampToDate(entry.createdAt);
        const moneyIn = moneyInByLedgerId.get(entry.id) ?? null;
        const isoDate = moneyIn?.paymentDate || toLocalIsoDate(createdDate);
        const displayDate = moneyIn?.paymentDate
          ? formatIsoDate(moneyIn.paymentDate)
          : formatShortDate(createdDate);

        const typeLabel = getTxnTypeLabel(entry.txn_type);
        const methodSuffix =
          moneyIn?.paymentMethod ? ` (${moneyIn.paymentMethod})` : '';
        const noteText = (moneyIn?.note || entry.note || '').trim();
        const description = noteText
          ? `${typeLabel}${methodSuffix} — ${noteText}`
          : `${typeLabel}${methodSuffix}`;

        return {
          id: entry.id,
          dateObj: createdDate,
          isoDate,
          displayDate,
          reference: entry.reference || (entry.txn_type === 'opening' ? 'OPENING' : '—'),
          typeLabel,
          description,
          debit,
          credit,
          runningBalance: running,
        };
      });

      let broughtForwardBalance = 0;
      let hasBroughtForward = false;
      const filteredRows: NormalizedStatementRow[] = [];

      for (const row of allNormalized) {
        if (fromDate && row.isoDate < fromDate) {
          broughtForwardBalance = row.runningBalance;
          hasBroughtForward = true;
          continue;
        }
        if (toDate && row.isoDate > toDate) {
          continue;
        }
        filteredRows.push(row);
      }

      let debitSum = 0;
      let creditSum = 0;
      for (const row of filteredRows) {
        debitSum += row.debit;
        creditSum += row.credit;
      }

      const totalDebit = roundCurrency(debitSum);
      const totalCredit = roundCurrency(creditSum);
      const finalBalance =
        filteredRows.length > 0
          ? filteredRows[filteredRows.length - 1].runningBalance
          : hasBroughtForward
            ? broughtForwardBalance
            : 0;

      return {
        broughtForwardBalance,
        hasBroughtForward,
        rows: filteredRows,
        totalDebit,
        totalCredit,
        finalBalance,
        allEntriesCount: allNormalized.length,
      };
    }

    // Supplier Statement (Inverted Balance Logic: Credit is Bill, Debit is Payment)
    const moneyOutByLedgerId = new Map<string, MoneyOutRecord>();
    for (const rec of payload.moneyOutRecords) {
      if (rec.ledgerEntryId) {
        moneyOutByLedgerId.set(rec.ledgerEntryId, rec);
      }
      moneyOutByLedgerId.set(rec.id, rec);
    }

    const sorted = payload.entries
      .filter((e) => e.supplierId === payload.supplier.id)
      .sort((a, b) => {
        const timeA =
          timestampToDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB =
          timestampToDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

    let running = 0;
    const allNormalized: NormalizedStatementRow[] = sorted.map((entry) => {
      const credit = roundCurrency(Number(entry.credit) || 0);
      const debit = roundCurrency(Number(entry.debit) || 0);
      // Supplier Running Balance (Inverted): Previous Balance + Credit (Bill) - Debit (Payment) = New Balance
      running = roundCurrency(running + credit - debit);

      const createdDate = timestampToDate(entry.createdAt);
      const moneyOut = moneyOutByLedgerId.get(entry.id) ?? null;
      const isoDate = moneyOut?.paymentDate || toLocalIsoDate(createdDate);
      const displayDate = moneyOut?.paymentDate
        ? formatIsoDate(moneyOut.paymentDate)
        : formatShortDate(createdDate);

      const typeLabel = getSupplierTxnTypeLabel(entry.txn_type);
      const methodSuffix =
        moneyOut?.paymentMethod ? ` (${moneyOut.paymentMethod})` : '';
      const noteText = (moneyOut?.note || entry.note || '').trim();
      const description = noteText
        ? `${typeLabel}${methodSuffix} — ${noteText}`
        : `${typeLabel}${methodSuffix}`;

      return {
        id: entry.id,
        dateObj: createdDate,
        isoDate,
        displayDate,
        reference: entry.reference || (entry.txn_type === 'opening' ? 'OPENING' : '—'),
        typeLabel,
        description,
        debit,
        credit,
        runningBalance: running,
      };
    });

    let broughtForwardBalance = 0;
    let hasBroughtForward = false;
    const filteredRows: NormalizedStatementRow[] = [];

    for (const row of allNormalized) {
      if (fromDate && row.isoDate < fromDate) {
        broughtForwardBalance = row.runningBalance;
        hasBroughtForward = true;
        continue;
      }
      if (toDate && row.isoDate > toDate) {
        continue;
      }
      filteredRows.push(row);
    }

    let debitSum = 0;
    let creditSum = 0;
    for (const row of filteredRows) {
      debitSum += row.debit;
      creditSum += row.credit;
    }

    const totalDebit = roundCurrency(debitSum);
    const totalCredit = roundCurrency(creditSum);
    const finalBalance =
      filteredRows.length > 0
        ? filteredRows[filteredRows.length - 1].runningBalance
        : hasBroughtForward
          ? broughtForwardBalance
          : 0;

    return {
      broughtForwardBalance,
      hasBroughtForward,
      rows: filteredRows,
      totalDebit,
      totalCredit,
      finalBalance,
      allEntriesCount: allNormalized.length,
    };
  }, [payload, fromDate, toDate]);

  if (!payload) return null;

  const isClient = payload.kind === 'client';
  const todayIso = getTodayIsoDate();
  const formattedToday = formatIsoDate(todayIso);

  const partyName = isClient
    ? payload.client.clientName
    : payload.supplier.supplierName;
  const partyCompany = isClient
    ? payload.client.companyName
    : payload.supplier.companyName;
  const partyMobile = isClient
    ? payload.client.mobile
    : payload.supplier.mobile;
  const partyAddress = isClient ? payload.client.address : '';

  const statementTitleEn = isClient ? 'Client Statement' : 'Supplier Statement';
  const statementTitleBn = isClient
    ? 'ক্লায়েন্ট স্টেটমেন্ট'
    : 'সাপ্লায়ার স্টেটমেন্ট';
  const statementRef = `${isClient ? 'STMT-CL' : 'STMT-SP'}-${todayIso.replaceAll('-', '')}`;

  const statusBadge = isClient
    ? getDueStatusLabel(statementData.finalBalance)
    : getPayableStatusLabel(statementData.finalBalance);

  const periodLabel =
    fromDate || toDate
      ? `${fromDate ? formatIsoDate(fromDate) : 'Beginning'} — ${toDate ? formatIsoDate(toDate) : formattedToday}`
      : 'All Transactions (Up to Date)';

  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div
      className="print-portal-overlay fixed inset-0 z-[70] bg-slate-950/65 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statement-print-modal-title"
    >
      {/* Force A4 portrait page box whenever Statement Print Modal is active */}
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      {/* Backdrop click target (hidden when printing) */}
      <div
        className="no-print fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="print-portal-frame relative z-10 w-full max-w-5xl max-h-[94vh] bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Non-Printable Action Toolbar */}
        <div className="no-print px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-blue-300 shrink-0" />
            <div className="min-w-0">
              <h2
                id="statement-print-modal-title"
                className="text-sm font-semibold truncate"
              >
                {statementTitleEn} — A4 Print Preview
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                {partyName} · {partyCompany}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mill Header Config Toggle */}
            <button
              type="button"
              onClick={() => setShowHeaderEditor((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                showHeaderEditor
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Mill Header
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handleTriggerPrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print A4 Statement
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close statement preview"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Non-Printable Date Range Filter Strip */}
        <div className="no-print px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Period Filter:
            </span>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded focus:outline-none focus:border-[#1e3a8a]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded focus:outline-none focus:border-[#1e3a8a]"
              />
            </label>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Showing {statementData.rows.length} of {statementData.allEntriesCount}{' '}
            ledger entries · Chronological Running Balance
          </p>
        </div>

        {/* Collapsible Mill Address/Mobile Customizer (Non-printable) */}
        {showHeaderEditor && (
          <div className="no-print px-4 sm:px-6 py-3 bg-blue-50/60 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            <div>
              <label
                htmlFor="stmtMillAddress"
                className="block text-[11px] font-medium text-slate-700 mb-1"
              >
                Mill Address (Printed in Header)
              </label>
              <input
                id="stmtMillAddress"
                type="text"
                value={headerConfig.address}
                onChange={(e) => handleUpdateHeader('address', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
              />
            </div>
            <div>
              <label
                htmlFor="stmtMillMobile"
                className="block text-[11px] font-medium text-slate-700 mb-1"
              >
                Mill Mobile / Hotline (Printed in Header)
              </label>
              <input
                id="stmtMillMobile"
                type="text"
                value={headerConfig.mobile}
                onChange={(e) => handleUpdateHeader('mobile', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
              />
            </div>
          </div>
        )}

        {/* Scrollable A4 Preview Canvas */}
        <div className="print-scroll-area flex-1 overflow-y-auto bg-slate-200/75 p-4 sm:p-8">
          <article className="a4-print-sheet max-w-[210mm] min-h-[272mm] mx-auto bg-white border border-slate-300 shadow-sm rounded-sm p-6 sm:p-10 text-slate-950 flex flex-col justify-between">
            <div>
              {/* 1. Formal Statement Header */}
              <header className="pb-5 border-b-2 border-slate-900 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 leading-snug">
                    মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্
                  </h1>
                  <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Mayer Doa Washing and Processing Mills
                  </p>
                  <p className="text-xs text-slate-600">
                    {headerConfig.address}
                  </p>
                  <p className="text-xs font-mono text-slate-700">
                    Mobile: {headerConfig.mobile}
                  </p>
                </div>

                <div className="sm:text-right shrink-0">
                  <div className="inline-block px-3.5 py-1.5 border-2 border-slate-900 bg-slate-50">
                    <p className="text-sm font-bold uppercase tracking-wider text-slate-950">
                      {statementTitleEn}
                    </p>
                    <p className="text-xs font-semibold text-slate-700">
                      {statementTitleBn}
                    </p>
                  </div>
                  <div className="mt-2.5 text-xs text-slate-700 space-y-0.5">
                    <p>
                      <span className="text-slate-500">Statement Date:</span>{' '}
                      <span className="font-mono font-semibold text-slate-950">
                        {formattedToday}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">Ref:</span>{' '}
                      <span className="font-mono text-slate-900">
                        {statementRef}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">Period:</span>{' '}
                      <span className="font-medium text-slate-900">
                        {periodLabel}
                      </span>
                    </p>
                  </div>
                </div>
              </header>

              {/* 2. Party Details & Quick Account Summary */}
              <section className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-7 p-4 border border-slate-300 bg-slate-50/50 rounded-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {isClient ? 'Client Information / ক্লায়েন্ট তথ্য' : 'Supplier Information / সাপ্লায়ার তথ্য'}
                  </p>
                  <div className="grid grid-cols-[90px_1fr] gap-y-1 text-xs">
                    <span className="text-slate-500">Name:</span>
                    <span className="font-bold text-slate-950 text-sm">
                      {partyName}
                    </span>

                    <span className="text-slate-500">Company:</span>
                    <span className="font-semibold text-slate-900">
                      {partyCompany}
                    </span>

                    <span className="text-slate-500">Mobile:</span>
                    <span className="font-mono text-slate-900">
                      {partyMobile}
                    </span>

                    {partyAddress && (
                      <>
                        <span className="text-slate-500">Address:</span>
                        <span className="text-slate-800">{partyAddress}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-5 p-4 border border-slate-300 rounded-xs flex flex-col justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Account Position
                    </p>
                    <div className="space-y-1.5 text-xs">
                      {isClient ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                              Total Debit (বিল):
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-950">
                              {formatCurrency(statementData.totalDebit)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                              Total Credit (জমা):
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-emerald-800">
                              {formatCurrency(statementData.totalCredit)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                              Total Credit (বিল):
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-950">
                              {formatCurrency(statementData.totalCredit)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                              Total Debit (পরিশোধ):
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-emerald-800">
                              {formatCurrency(statementData.totalDebit)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-300 flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-900">
                        {isClient ? 'Current Due' : 'Total Payable'}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Status: {statusBadge.label}
                      </p>
                    </div>
                    <p
                      className={`font-mono text-base font-bold tabular-nums ${
                        statementData.finalBalance > 0
                          ? 'text-red-700'
                          : statementData.finalBalance < 0
                            ? 'text-emerald-700'
                            : 'text-slate-950'
                      }`}
                    >
                      {formatCurrency(statementData.finalBalance)}
                    </p>
                  </div>
                </div>
              </section>

              {/* 3. Chronological Statement Ledger Table */}
              <section className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Transaction History ({statementData.rows.length}{' '}
                    {statementData.rows.length === 1 ? 'Entry' : 'Entries'})
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">
                    {isClient
                      ? 'Balance = Prev + Debit (বিল) − Credit (জমা)'
                      : 'Balance = Prev + Credit (বিল) − Debit (পরিশোধ)'}
                  </p>
                </div>

                <div className="border border-slate-400">
                  <table className="statement-print-table w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400 text-[11px] font-bold text-slate-900">
                        <th className="py-2.5 px-2.5 border-r border-slate-300 whitespace-nowrap">
                          Date
                        </th>
                        <th className="py-2.5 px-2.5 border-r border-slate-300 whitespace-nowrap">
                          Reference
                        </th>
                        <th className="py-2.5 px-2.5 border-r border-slate-300">
                          Description
                        </th>
                        {isClient ? (
                          <>
                            <th className="py-2.5 px-2.5 border-r border-slate-300 text-right whitespace-nowrap">
                              Debit (বিল)
                            </th>
                            <th className="py-2.5 px-2.5 border-r border-slate-300 text-right whitespace-nowrap">
                              Credit (জমা)
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="py-2.5 px-2.5 border-r border-slate-300 text-right whitespace-nowrap">
                              Credit (বিল)
                            </th>
                            <th className="py-2.5 px-2.5 border-r border-slate-300 text-right whitespace-nowrap">
                              Debit (পরিশোধ)
                            </th>
                          </>
                        )}
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          Running Balance
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 text-xs">
                      {/* Carried-Forward Opening Row when Date Range excludes earlier entries */}
                      {statementData.hasBroughtForward && (
                        <tr className="bg-slate-50/90 font-medium">
                          <td className="py-2 px-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {fromDate ? formatIsoDate(fromDate) : '—'}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            B/F
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-200 text-slate-800 italic">
                            Balance Brought Forward (Prior Period)
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-200 text-right font-mono tabular-nums text-slate-400">
                            —
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-200 text-right font-mono tabular-nums text-slate-400">
                            —
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold tabular-nums text-slate-950 whitespace-nowrap">
                            {formatCurrency(statementData.broughtForwardBalance)}
                          </td>
                        </tr>
                      )}

                      {statementData.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-8 px-4 text-center text-xs text-slate-500"
                          >
                            No transactions recorded in the selected period.
                          </td>
                        </tr>
                      ) : (
                        statementData.rows.map((row) => (
                          <tr key={row.id} className="align-top">
                            <td className="py-2 px-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                              {row.displayDate}
                            </td>
                            <td className="py-2 px-2.5 border-r border-slate-200 font-mono text-[11px] font-medium text-slate-900 whitespace-nowrap">
                              {row.reference}
                            </td>
                            <td className="py-2 px-2.5 border-r border-slate-200 text-[11px] text-slate-800 break-words">
                              {row.description}
                            </td>
                            {isClient ? (
                              <>
                                <td className="py-2 px-2.5 border-r border-slate-200 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                                  {row.debit > 0 ? (
                                    <span className="text-slate-950 font-medium">
                                      {formatCurrency(row.debit)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-200 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                                  {row.credit > 0 ? (
                                    <span className="text-emerald-800 font-medium">
                                      {formatCurrency(row.credit)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-2 px-2.5 border-r border-slate-200 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                                  {row.credit > 0 ? (
                                    <span className="text-slate-950 font-medium">
                                      {formatCurrency(row.credit)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-200 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                                  {row.debit > 0 ? (
                                    <span className="text-emerald-800 font-medium">
                                      {formatCurrency(row.debit)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="py-2 px-2.5 text-right font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  row.runningBalance > 0
                                    ? 'text-red-700'
                                    : row.runningBalance < 0
                                      ? 'text-emerald-800'
                                      : 'text-slate-900'
                                }
                              >
                                {formatCurrency(row.runningBalance)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>

                    {/* Table Totals Row */}
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-900 text-xs font-bold text-slate-950">
                        <td
                          colSpan={3}
                          className="py-2.5 px-2.5 border-r border-slate-300 text-right uppercase tracking-wide text-[11px]"
                        >
                          {statementData.hasBroughtForward
                            ? 'Period Totals & Closing Balance'
                            : 'Statement Totals'}
                        </td>
                        {isClient ? (
                          <>
                            <td className="py-2.5 px-2.5 border-r border-slate-300 text-right font-mono tabular-nums whitespace-nowrap">
                              {formatCurrency(statementData.totalDebit)}
                            </td>
                            <td className="py-2.5 px-2.5 border-r border-slate-300 text-right font-mono tabular-nums text-emerald-800 whitespace-nowrap">
                              {formatCurrency(statementData.totalCredit)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-2.5 border-r border-slate-300 text-right font-mono tabular-nums whitespace-nowrap">
                              {formatCurrency(statementData.totalCredit)}
                            </td>
                            <td className="py-2.5 px-2.5 border-r border-slate-300 text-right font-mono tabular-nums text-emerald-800 whitespace-nowrap">
                              {formatCurrency(statementData.totalDebit)}
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={
                              statementData.finalBalance > 0
                                ? 'text-red-700'
                                : statementData.finalBalance < 0
                                  ? 'text-emerald-800'
                                  : 'text-slate-950'
                            }
                          >
                            {formatCurrency(statementData.finalBalance)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </div>

            {/* 4. Prominent Financial Footer & Signature Lines */}
            <footer className="print-avoid-break mt-8 pt-4">
              {/* Highlighted Final Totals Summary Box */}
              <div className="grid grid-cols-3 border-2 border-slate-900 rounded-xs overflow-hidden">
                <div className="px-4 py-3 border-r border-slate-300 bg-white">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {isClient ? 'Total Debit (মোট বিল)' : 'Total Credit (মোট বিল)'}
                  </p>
                  <p className="mt-1 font-mono text-base font-bold tabular-nums text-slate-950">
                    {formatCurrency(
                      isClient
                        ? statementData.totalDebit
                        : statementData.totalCredit
                    )}
                  </p>
                </div>

                <div className="px-4 py-3 border-r border-slate-300 bg-white">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {isClient
                      ? 'Total Credit (মোট জমা)'
                      : 'Total Debit (মোট পরিশোধ)'}
                  </p>
                  <p className="mt-1 font-mono text-base font-bold tabular-nums text-emerald-800">
                    {formatCurrency(
                      isClient
                        ? statementData.totalCredit
                        : statementData.totalDebit
                    )}
                  </p>
                </div>

                <div className="px-4 py-3 bg-slate-900 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    {isClient
                      ? 'Final Current Due (মোট বকেয়া)'
                      : 'Final Total Payable (মোট পাওনা)'}
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums text-white">
                    {formatCurrency(statementData.finalBalance)}
                  </p>
                </div>
              </div>

              {/* Signature Lines */}
              <div className="mt-12 grid grid-cols-3 gap-8 text-center text-xs text-slate-700">
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-medium">
                    {isClient ? 'Client Signature' : 'Supplier Signature'}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {isClient ? 'গ্রাহকের স্বাক্ষর' : 'সাপ্লায়ারের স্বাক্ষর'}
                  </p>
                </div>
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-medium">
                    Prepared By
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    প্রস্তুতকারক
                  </p>
                </div>
                <div>
                  <div className="border-t border-slate-700 pt-1.5 font-medium">
                    Authorized Signature
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    অনুমোদিত স্বাক্ষর
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্ — Account Statement
                </span>
                <span className="font-mono">Printed: {formattedToday}</span>
              </div>
            </footer>
          </article>
        </div>

        {/* Bottom Non-Printable Footer Bar */}
        <div className="no-print px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-500">
            Formatted for clean A4 portrait printing. Sidebar, drawers, and
            controls are automatically hidden.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleTriggerPrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Statement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
