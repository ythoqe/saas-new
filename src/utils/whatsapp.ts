import type { Language } from '../contexts/LanguageContext';
import { formatNumber } from './ledger';

const COMPANY_NAME_BN = 'মায়ের দোয়া ওয়াশিং এন্ড প্রসেসিং মিলস্';
const COMPANY_NAME_EN = 'Mayer Doa Washing & Processing Mills';

function formatAmountValue(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return safe < 0 ? `-${formatted}` : formatted;
}

/**
 * Normalizes a Bangladesh or international phone number for WhatsApp `wa.me` links.
 * Strips spaces, hyphens, parentheses, and symbols.
 * Example: "01711-000000" -> "8801711000000"
 */
export function formatWhatsAppPhone(rawMobile: string | null | undefined): string | null {
  if (!rawMobile) return null;
  let digits = rawMobile.replace(/\D/g, '');
  if (!digits) return null;

  // Strip international dialing prefix "00" (e.g., 0088017...)
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Local Bangladesh format: 01XXXXXXXXX (11 digits) -> 8801XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `88${digits}`;
  } else if (digits.length === 10 && digits.startsWith('1')) {
    // 10-digit BD mobile without leading 0 -> 8801XXXXXXXXX
    digits = `880${digits}`;
  } else if (digits.startsWith('0') && digits.length > 7 && !digits.startsWith('880')) {
    digits = `88${digits}`;
  }

  if (digits.length < 7) return null;
  return digits;
}

export function buildWhatsAppUrl(
  rawMobile: string | null | undefined,
  message: string
): string | null {
  const phone = formatWhatsAppPhone(rawMobile);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildClientChatWhatsAppUrl(params: {
  mobile: string | null | undefined;
  clientName: string;
  currentDue: number;
  lang: Language;
}): string | null {
  const { mobile, clientName, currentDue, lang } = params;
  const dueStr = formatAmountValue(currentDue);

  const message =
    lang === 'bn'
      ? currentDue > 0
        ? `প্রিয় ${clientName}, আসসালামু আলাইকুম। ${COMPANY_NAME_BN} থেকে যোগাযোগ করছি। আপনার বর্তমান বাকি: ৳${dueStr}। ধন্যবাদ।`
        : `প্রিয় ${clientName}, আসসালামু আলাইকুম। ${COMPANY_NAME_BN} থেকে যোগাযোগ করছি।`
      : currentDue > 0
        ? `Dear ${clientName}, greetings from ${COMPANY_NAME_EN}. Your current due balance is: ৳${dueStr}. Thank you.`
        : `Dear ${clientName}, greetings from ${COMPANY_NAME_EN}.`;

  return buildWhatsAppUrl(mobile, message);
}

export function buildPaymentWhatsAppUrl(params: {
  mobile: string | null | undefined;
  clientName: string;
  paidAmount: number;
  currentDue: number;
  lang: Language;
}): string | null {
  const { mobile, clientName, paidAmount, currentDue, lang } = params;
  const amountStr = formatAmountValue(paidAmount);
  const dueStr = formatAmountValue(currentDue);

  const message =
    lang === 'bn'
      ? `প্রিয় ${clientName}, আমরা আপনার ৳${amountStr} টাকা পেমেন্ট পেয়েছি। আপনার বর্তমান বাকি: ৳${dueStr}। ধন্যবাদ - ${COMPANY_NAME_BN}।`
      : `Dear ${clientName}, we have received your payment of ৳${amountStr}. Your current due balance is: ৳${dueStr}. Thank you - ${COMPANY_NAME_EN}.`;

  return buildWhatsAppUrl(mobile, message);
}

export function buildOrderWhatsAppUrl(params: {
  mobile: string | null | undefined;
  clientName: string;
  orderId: string;
  than: number;
  greyGaj: number;
  finalGaj: number;
  totalBill: number;
  lang: Language;
}): string | null {
  const { mobile, clientName, orderId, than, greyGaj, finalGaj, totalBill, lang } = params;
  const thanStr = formatNumber(than);
  const greyGajStr = formatNumber(greyGaj);
  const finalGajStr = formatNumber(finalGaj);
  const billStr = formatAmountValue(totalBill);

  const message =
    lang === 'bn'
      ? `প্রিয় ${clientName}, আপনার অর্ডার ${orderId} মোট ${thanStr} থান, ${greyGajStr} গজ, ফিনিশিং ${finalGajStr} গজ, ডেলিভারির জন্য প্রস্তুত। মোট বিল: ৳${billStr}। ধন্যবাদ - ${COMPANY_NAME_BN}।`
      : `Dear ${clientName}, your order ${orderId} (Total: ${thanStr} Than, ${greyGajStr} Grey Gaj, Finishing: ${finalGajStr} Gaj) is ready for delivery. Total Bill: ৳${billStr}. Thank you - ${COMPANY_NAME_EN}.`;

  return buildWhatsAppUrl(mobile, message);
}
