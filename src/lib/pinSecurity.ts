import type { SalonOffer } from '../types/salon';

export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
export const PIN_REGEX = /^\d{4,6}$/;

export const WEAK_PIN_MSG =
  'Yeh PIN bahut aasan hai (jaise 0000, 1234, 1111). Kripya alag aur strong 4-6 digit PIN chunein.';

const COMMON_WEAK_PINS = new Set([
  '1234',
  '4321',
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1122',
  '2211',
  '1212',
  '2121',
  '0011',
  '1100',
  '1010',
  '0101',
  '2580',
  '0852',
  '12345',
  '54321',
  '123456',
  '654321',
  '112233',
  '123123',
]);

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export function isWeakPin(pin: string): boolean {
  const clean = String(pin || '').trim();
  if (!PIN_REGEX.test(clean)) return true;
  if (/^(\d)\1{3,5}$/.test(clean)) return true;
  if ('0123456789'.includes(clean) || '9876543210'.includes(clean)) return true;
  if (COMMON_WEAK_PINS.has(clean)) return true;
  return false;
}

export function calculateOfferDiscount(
  subtotal: number,
  offer?: Pick<SalonOffer, 'discount_type' | 'discount_value' | 'min_bill' | 'is_active'> | null
): number {
  const cleanSubtotal = Math.max(0, Number(subtotal || 0));
  if (!offer || !offer.is_active || cleanSubtotal <= 0) return 0;
  if (cleanSubtotal < Math.max(0, Number(offer.min_bill || 0))) return 0;
  const val = Math.max(0, Number(offer.discount_value || 0));
  if (val <= 0) return 0;
  const raw =
    offer.discount_type === 'PERCENT'
      ? Math.round((cleanSubtotal * Math.min(90, val)) / 100)
      : Math.round(val);
  return Math.max(0, Math.min(cleanSubtotal, raw));
}
