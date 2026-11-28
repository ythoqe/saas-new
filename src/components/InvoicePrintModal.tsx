import { useEffect, useState } from 'react';
import {
  FileText,
  MessageCircle,
  Printer,
  Settings2,
  Truck,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type {
  ClientLedgerEntry,
  ClientRecord,
  OrderRecord,
} from '../types/mill';
import {
  formatCurrency,
  formatDateTime,
  formatIsoDate,
  formatNumber,
  roundCurrency,
  timestampToDate,
} from '../utils/ledger';
import { buildOrderWhatsAppUrl } from '../utils/whatsapp';

export type PrintDocumentType = 'invoice' | 'challan';
export type PrintPaperSize = 'thermal' | 'a4';

export interface PrintDocumentPayload {
  initialDocType: PrintDocumentType;
  client: ClientRecord | null;
  order: OrderRecord | null;
  ledgerEntry: ClientLedgerEntry | null;
  /** Balance strictly prior to this invoice entry */
  previousDue: number;
  /** Bill amount of this invoice */
  billAmount: number;
  /** previousDue + billAmount */
  totalDue: number;
  /** Live current due of client across all ledger entries (shown as info if later entries exist) */
  liveCurrentDue: number;
}

interface InvoicePrintModalProps {
  payload: PrintDocumentPayload | null;
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

export function InvoicePrintModal({
  payload,
  onClose,
}: InvoicePrintModalProps) {
  const { lang } = useLanguage();
  const [docType, setDocType] = useState<PrintDocumentType>('invoice');
  const [paperSize, setPaperSize] = useState<PrintPaperSize>('thermal');
  const [showHeaderSettings, setShowHeaderSettings] = useState(false);
  const [millHeader, setMillHeader] = useState<MillHeaderConfig>(() =>
    loadMillHeaderConfig()
  );

  useEffect(() => {
    if (payload) {
      setDocType(payload.initialDocType);
      setShowHeaderSettings(false);
    }
  }, [payload]);

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

  if (!payload) return null;

  const { client, order, ledgerEntry, previousDue, billAmount, totalDue, liveCurrentDue } =
    payload;

  const updateHeaderField = (field: keyof MillHeaderConfig, value: string) => {
    setMillHeader((prev) => {
      const next = { ...prev, [field]: value };
      try {
        window.localStorage.setItem(
          MILL_HEADER_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // Ignore storage quota issues
      }
      return next;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const documentRef =
    order?.id || ledgerEntry?.reference || ledgerEntry?.id || 'INV-0001';

  const displayDate = (() => {
    if (order?.deliveredAt) {
      return formatDateTime(timestampToDate(order.deliveredAt));
    }
    if (ledgerEntry?.createdAt) {
      return formatDateTime(timestampToDate(ledgerEntry.createdAt));
    }
    if (order?.orderDate) {
      return formatIsoDate(order.orderDate);
    }
    return formatDateTime(new Date());
  })();

  const finalGaj =
    order?.finalGaj !== null && order?.finalGaj !== undefined
      ? order.finalGaj
      : order?.greyFabricGaj ?? null;

  const greyThan = order?.greyFabricThan ?? null;
  const greyGaj = order?.greyFabricGaj ?? null;
  const fabricType = order?.fabricType ?? null;
  const rate = order?.rate ?? null;
  const challanRef = documentRef.startsWith('ORD-')
    ? documentRef.replace(/^ORD-/, 'CH-')
    : `CH-${documentRef}`;

  const isThermal = paperSize === 'thermal';
  const isChallan = docType === 'challan';
  const hasLaterActivity =
    Math.abs(roundCurrency(liveCurrentDue - totalDue)) >= 0.01;
  const orderWhatsAppUrl =
    client && order
      ? buildOrderWhatsAppUrl({
          mobile: client.mobile,
          clientName: client.clientName,
          orderId: order.id,
          than: order.greyFabricThan,
          greyGaj: order.greyFabricGaj,
          finalGaj: finalGaj ?? order.greyFabricGaj,
          totalBill: billAmount,
          lang,
        })
      : null;

  return (
    <div
      className="print-portal-overlay fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-modal-title"
    >
      {/* Backdrop click target (hidden during print) */}
      <div
        className="no-print fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="print-portal-frame relative z-10 w-full max-w-3xl max-h-[94vh] bg-slate-100 border border-slate-200 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Non-printable Control Toolbar */}
        <div className="no-print px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-100 text-[#1e3a8a] flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="print-modal-title"
                className="font-display text-sm sm:text-base font-semibold text-slate-900 truncate"
              >
                {isChallan ? 'Delivery Challan Preview' : 'Invoice Preview'}
              </h2>
              <p className="text-xs text-slate-500 font-mono truncate">
                {isChallan ? challanRef : documentRef} ·{' '}
                {isThermal ? '80mm / 3×4" Thermal' : 'A4 Standard'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Document Type Toggle: Invoice vs Delivery Challan */}
            <div
              role="group"
              aria-label="Choose document type"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              <button
                type="button"
                onClick={() => setDocType('invoice')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  !isChallan
                    ? 'bg-white text-[#1e3a8a] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Invoice (Bill)
              </button>
              <button
                type="button"
                onClick={() => setDocType('challan')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  isChallan
                    ? 'bg-white text-[#1e3a8a] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Delivery Challan
              </button>
            </div>

            {/* Paper Size Toggle: 80mm Thermal vs A4 */}
            <div
              role="group"
              aria-label="Choose print paper size"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            >
              <button
                type="button"
                onClick={() => setPaperSize('thermal')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  isThermal
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm Thermal
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('a4')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  !isThermal
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                A4
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowHeaderSettings((v) => !v)}
              title="Edit Mill Address & Mobile"
              className={`p-2 rounded-md border text-xs transition-colors cursor-pointer ${
                showHeaderSettings
                  ? 'bg-blue-50 border-blue-200 text-[#1e3a8a]'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              aria-label="Edit mill address and mobile header"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {orderWhatsAppUrl && (
              <a
                href={orderWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  lang === 'bn'
                    ? 'WhatsApp-এ বিল মেসেজ পাঠান'
                    : 'Send Order Update on WhatsApp'
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close print preview"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optional Mill Address/Mobile Customizer (hidden when printing) */}
        {showHeaderSettings && (
          <div className="no-print px-5 py-3.5 bg-blue-50/60 border-b border-blue-100 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            <div>
              <label
                htmlFor="millHeaderAddress"
                className="block text-[11px] font-medium text-slate-700 mb-1"
              >
                Mill Address (printed in header)
              </label>
              <input
                id="millHeaderAddress"
                type="text"
                value={millHeader.address}
                onChange={(e) => updateHeaderField('address', e.target.value)}
                placeholder="Enter mill factory address..."
                className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
              />
            </div>
            <div>
              <label
                htmlFor="millHeaderMobile"
                className="block text-[11px] font-medium text-slate-700 mb-1"
              >
                Mill Mobile Number (printed in header)
              </label>
              <input
                id="millHeaderMobile"
                type="text"
                value={millHeader.mobile}
                onChange={(e) => updateHeaderField('mobile', e.target.value)}
                placeholder="+880 17XX-XXXXXX"
                className="w-full px-3 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1e3a8a]"
              />
            </div>
          </div>
        )}

        {/* Printable Canvas Area */}
        <div className="print-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
          <article
            className={
              isThermal
                ? 'thermal-print-sheet w-full max-w-[308px] bg-white text-black border border-slate-300 rounded-md shadow-sm p-4'
                : 'a4-print-sheet w-full max-w-[660px] bg-white text-black border border-slate-300 rounded-md shadow-sm p-8'
            }
          >
            {/* MILL HEADER */}
            <header
              className={`text-center pb-2.5 border-b border-dashed border-slate-800 print-avoid-break ${
                isThermal ? 'space-y-0.5' : 'space-y-1 pb-4'
              }`}
            >
              <h1
                className={`font-bold text-black leading-snug ${
                  isThermal ? 'text-[15px]' : 'text-2xl'
                }`}
              >
                মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্
              </h1>
              <p
                className={`font-semibold tracking-tight text-slate-900 ${
                  isThermal ? 'text-[11px]' : 'text-sm'
                }`}
              >
                Mayer Doa Washing and Processing Mills
              </p>
              <p
                className={`text-slate-700 ${
                  isThermal ? 'text-[10px]' : 'text-xs'
                }`}
              >
                {millHeader.address}
              </p>
              <p
                className={`font-mono text-slate-800 ${
                  isThermal ? 'text-[10px]' : 'text-xs'
                }`}
              >
                Mobile: {millHeader.mobile}
              </p>

              {/* Document Title Badge */}
              <div className="pt-1.5">
                <span
                  className={`inline-block font-bold uppercase tracking-wider border border-black px-2.5 py-0.5 ${
                    isThermal ? 'text-[10px]' : 'text-xs'
                  }`}
                >
                  {isChallan
                    ? 'DELIVERY CHALLAN / ডেলিভারি চালান'
                    : 'CASH / CREDIT INVOICE (বিল)'}
                </span>
              </div>
            </header>

            {/* CLIENT & ORDER METADATA */}
            <section
              aria-label="Client and order details"
              className={`py-2.5 border-b border-dashed border-slate-800 print-avoid-break ${
                isThermal
                  ? 'space-y-1 text-[11px]'
                  : 'grid grid-cols-2 gap-4 py-4 text-sm'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex justify-between gap-2 sm:block">
                  <span className="text-slate-600">Client: </span>
                  <span className="font-semibold text-black">
                    {client?.clientName ?? 'Client Account'}
                  </span>
                </div>
                {client?.companyName && (
                  <div className="flex justify-between gap-2 sm:block">
                    <span className="text-slate-600">Company: </span>
                    <span className="font-medium text-black">
                      {client.companyName}
                    </span>
                  </div>
                )}
                {client?.mobile && (
                  <div className="flex justify-between gap-2 sm:block">
                    <span className="text-slate-600">Mobile: </span>
                    <span className="font-mono text-black">
                      {client.mobile}
                    </span>
                  </div>
                )}
                {isChallan && client?.address && (
                  <div className="flex justify-between gap-2 sm:block">
                    <span className="text-slate-600">Address: </span>
                    <span className="text-black">{client.address}</span>
                  </div>
                )}
              </div>

              <div
                className={
                  isThermal
                    ? 'space-y-0.5 pt-1 border-t border-dotted border-slate-400'
                    : 'space-y-0.5 text-right'
                }
              >
                <div
                  className={
                    isThermal
                      ? 'flex justify-between gap-2'
                      : 'flex justify-end gap-2'
                  }
                >
                  <span className="text-slate-600">
                    {isChallan ? 'Challan No:' : 'Order ID:'}
                  </span>
                  <span className="font-mono font-semibold text-black">
                    {isChallan ? challanRef : documentRef}
                  </span>
                </div>
                {isChallan && (
                  <div
                    className={
                      isThermal
                        ? 'flex justify-between gap-2'
                        : 'flex justify-end gap-2'
                    }
                  >
                    <span className="text-slate-600">Order Ref:</span>
                    <span className="font-mono text-black">{documentRef}</span>
                  </div>
                )}
                <div
                  className={
                    isThermal
                      ? 'flex justify-between gap-2'
                      : 'flex justify-end gap-2'
                  }
                >
                  <span className="text-slate-600">Date:</span>
                  <span className="font-mono text-black">{displayDate}</span>
                </div>
              </div>
            </section>

            {/* BODY: INVOICE ORDER DETAILS VS DELIVERY CHALLAN QUANTITY DETAILS */}
            {isChallan ? (
              /* DELIVERY CHALLAN BODY — NO FINANCIAL AMOUNTS */
              <section
                aria-label="Delivery challan fabric quantities"
                className={`py-2.5 border-b border-dashed border-slate-800 print-avoid-break ${
                  isThermal ? 'text-[11px]' : 'py-4 text-sm'
                }`}
              >
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-left">
                      <th className="py-1 font-semibold">Fabric Type</th>
                      <th className="py-1 text-right font-semibold">Than</th>
                      <th className="py-1 text-right font-semibold">
                        Grey Gaj
                      </th>
                      <th className="py-1 text-right font-semibold">
                        Final Gaj
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order ? (
                      <tr>
                        <td className="py-2 font-semibold text-black">
                          {fabricType}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {greyThan !== null ? formatNumber(greyThan) : '—'}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {greyGaj !== null ? formatNumber(greyGaj) : '—'}
                        </td>
                        <td className="py-2 text-right font-mono font-bold tabular-nums">
                          {finalGaj !== null ? formatNumber(finalGaj) : '—'}
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-2 text-black">
                          {ledgerEntry?.note || 'Delivered processed fabric lot'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {order && (
                  <div
                    className={`mt-2 pt-2 border-t border-dotted border-slate-400 space-y-1 ${
                      isThermal ? 'text-[11px]' : 'text-xs'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-700">
                        Total Fabric Pieces (Than):
                      </span>
                      <span className="font-mono font-bold tabular-nums">
                        {greyThan !== null
                          ? `${formatNumber(greyThan)} Than`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-700">
                        Total Delivered Quantity:
                      </span>
                      <span className="font-mono font-bold tabular-nums">
                        {finalGaj !== null
                          ? `${formatNumber(finalGaj)} Gaj`
                          : '—'}
                      </span>
                    </div>
                  </div>
                )}

                <p
                  className={`mt-2.5 text-center italic text-slate-600 ${
                    isThermal ? 'text-[10px]' : 'text-xs'
                  }`}
                >
                  Goods received in good condition (No monetary values shown on
                  Delivery Challan).
                </p>
              </section>
            ) : (
              /* INVOICE BODY — ORDER DETAILS + BILLING SUMMARY */
              <>
                <section
                  aria-label="Order billing details"
                  className={`py-2.5 border-b border-dashed border-slate-800 print-avoid-break ${
                    isThermal ? 'text-[11px]' : 'py-4 text-sm'
                  }`}
                >
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-left">
                        <th className="py-1 font-semibold">
                          {order ? 'Fabric' : 'Description'}
                        </th>
                        <th className="py-1 text-right font-semibold">
                          Final Gaj
                        </th>
                        <th className="py-1 text-right font-semibold">Rate</th>
                        <th className="py-1 text-right font-semibold">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {order ? (
                        <tr>
                          <td className="py-2 pr-1">
                            <p className="font-semibold text-black">
                              {fabricType}
                            </p>
                            {greyThan !== null && (
                              <p
                                className={`font-mono text-slate-600 ${
                                  isThermal ? 'text-[9px]' : 'text-xs'
                                }`}
                              >
                                {formatNumber(greyThan)} Than
                              </p>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {finalGaj !== null ? formatNumber(finalGaj) : '—'}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {rate !== null ? formatCurrency(rate) : '—'}
                          </td>
                          <td className="py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatCurrency(billAmount)}
                          </td>
                        </tr>
                      ) : (
                        <tr>
                          <td className="py-2 pr-2 text-black" colSpan={3}>
                            {ledgerEntry?.note || 'Dyeing / Washing Bill'}
                          </td>
                          <td className="py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatCurrency(billAmount)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>

                {/* BILLING SUMMARY */}
                <section
                  aria-label="Billing summary"
                  className={`py-2.5 border-b border-dashed border-slate-800 space-y-1 print-avoid-break ${
                    isThermal ? 'text-[11px]' : 'py-4 text-sm space-y-1.5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-700">Total Bill Amount</span>
                    <span className="font-mono font-semibold tabular-nums text-black">
                      {formatCurrency(billAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-700">Previous Due</span>
                    <span className="font-mono font-medium tabular-nums text-black">
                      {formatCurrency(previousDue)}
                    </span>
                  </div>
                  <div
                    className={`pt-1.5 mt-1 border-t border-slate-800 flex items-center justify-between gap-2 font-bold text-black ${
                      isThermal ? 'text-[13px]' : 'text-base'
                    }`}
                  >
                    <span>Total Due</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(totalDue)}
                    </span>
                  </div>

                  {hasLaterActivity && (
                    <div
                      className={`pt-1 flex items-center justify-between gap-2 text-slate-600 ${
                        isThermal ? 'text-[10px]' : 'text-xs'
                      }`}
                    >
                      <span>Current Account Balance (Latest)</span>
                      <span className="font-mono tabular-nums font-medium">
                        {formatCurrency(liveCurrentDue)}
                      </span>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* SIGNATURES & FOOTER */}
            <footer
              className={`pt-5 print-avoid-break ${
                isThermal ? 'space-y-3 text-[10px]' : 'pt-10 space-y-5 text-xs'
              }`}
            >
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center">
                  <div className="border-t border-slate-800 pt-1 text-slate-700">
                    Receiver Signature
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-800 pt-1 text-slate-700">
                    Authorized Signature
                  </div>
                </div>
              </div>
              <p className="text-center text-slate-600">
                Thank you for doing business with us!
              </p>
            </footer>
          </article>

          {/* Screen-only Thermal Printer Hint */}
          <p className="no-print mt-4 text-xs text-slate-500 text-center max-w-md">
            When clicking Print, the sidebar, navigation, and buttons are hidden
            automatically. Select your 80mm / 3×4&quot; thermal printer or Save as
            PDF.
          </p>
        </div>

        {/* Non-printable Bottom Bar */}
        <div className="no-print px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setDocType(isChallan ? 'invoice' : 'challan')}
            className="text-xs font-medium text-[#1e3a8a] hover:text-[#1e40af] cursor-pointer"
          >
            Switch to {isChallan ? 'Invoice (Bill)' : 'Delivery Challan'}
          </button>

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
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print {isChallan ? 'Delivery Challan' : 'Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
