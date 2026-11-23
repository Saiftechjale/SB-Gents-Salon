import { formatSlot12h } from './salonUiHelpers';

export function cleanPhone10(phone?: string | null): string {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

export function buildWhatsAppUrl(phone: string | undefined | null, message: string): string {
  const digits = cleanPhone10(phone);
  const encoded = encodeURIComponent(message);
  return digits.length === 10
    ? `https://wa.me/91${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function buildSmsUrl(phone: string | undefined | null, message: string): string {
  const digits = cleanPhone10(phone);
  const encoded = encodeURIComponent(message);
  return digits.length === 10 ? `sms:+91${digits}?body=${encoded}` : `sms:?body=${encoded}`;
}

export function buildCustomerBookingToSalonText(opts: {
  salonName: string;
  customerName: string;
  customerPhone: string;
  tokenNumber: number;
  servicesText: string;
  barberName: string;
  bookingDate: string;
  slotTime: string;
  totalAmount: number;
}): string {
  return (
    `Namaste ${opts.salonName},\n` +
    `Maine app se slot book kiya hai:\n` +
    `Token: #${opts.tokenNumber}\n` +
    `Naam: ${opts.customerName} (${opts.customerPhone})\n` +
    `Service: ${opts.servicesText}\n` +
    `Stylist: ${opts.barberName}\n` +
    `Time: ${opts.bookingDate} · ${formatSlot12h(opts.slotTime)}\n` +
    `Total: ₹${opts.totalAmount}`
  );
}

export function buildCustomerReceiptRequestText(opts: {
  salonName: string;
  totalAmount: number;
  servicesText: string;
  tokenNumber?: number;
  paymentMode: 'CASH' | 'UPI';
}): string {
  return (
    `Namaste ${opts.salonName}, mera bill ₹${opts.totalAmount} (${opts.servicesText})` +
    `${opts.tokenNumber ? ` · Token #${opts.tokenNumber}` : ''} (${opts.paymentMode}) ke liye receipt bhejein.`
  );
}

export function buildBookingConfirmText(opts: {
  salonName: string;
  customerName: string;
  tokenNumber: number;
  slotTime: string;
  barberName: string;
  totalAmount?: number;
}): string {
  return (
    `Namaste ${opts.customerName} ji, ${opts.salonName} me aapki booking confirm hai.\n` +
    `Token: #${opts.tokenNumber}\n` +
    `Time: ${formatSlot12h(opts.slotTime)}\n` +
    `Stylist: ${opts.barberName}` +
    `${opts.totalAmount ? `\nBill: ₹${opts.totalAmount}` : ''}`
  );
}

export function buildNextTurnAlertText(opts: {
  salonName: string;
  customerName: string;
  tokenNumber: number;
  barberName: string;
}): string {
  return (
    `Namaste ${opts.customerName} ji! ${opts.salonName} me ab sirf 1 customer baaki hai — ` +
    `aapka number agla hai (Token #${opts.tokenNumber}, ${opts.barberName.split(' ')[0]}). Kripya 5-10 min me aa jayein.`
  );
}

export function buildChairReadyAlertText(opts: {
  salonName: string;
  customerName: string;
  tokenNumber: number;
  barberName: string;
}): string {
  return (
    `Namaste ${opts.customerName} ji! ${opts.salonName} me aapki bari aa gayi hai (Token #${opts.tokenNumber}). ` +
    `${opts.barberName.split(' ')[0]} ki chair ready hai, kripya abhi aa jayein.`
  );
}

export function buildBillReceiptText(opts: {
  salonName: string;
  customerName: string;
  totalAmount: number;
  servicesText: string;
  tokenNumber?: number;
  udharAmount?: number;
}): string {
  return (
    `Namaste ${opts.customerName} ji! ${opts.salonName} se aapka bill ₹${opts.totalAmount} (${opts.servicesText})` +
    `${opts.tokenNumber ? ` · Token #${opts.tokenNumber}` : ''} receive ho gaya.` +
    `${opts.udharAmount && opts.udharAmount > 0 ? ` Baki Udhar: ₹${opts.udharAmount}.` : ''} Dhanyawad!`
  );
}

export function buildCustomerUdharOrGreetingText(opts: {
  salonName: string;
  customerName: string;
  outstandingDue: number;
}): string {
  if (opts.outstandingDue > 0) {
    return `Namaste ${opts.customerName} ji, ${opts.salonName} me aapka ₹${opts.outstandingDue} udhar baki hai. Kripya jaldi jama kar dein. Dhanyawad!`;
  }
  return `Namaste ${opts.customerName} ji! ${opts.salonName} me aapka swagat hai. Naya haircut ya beard slot book karne ke liye app kholein ya humein call karein.`;
}
