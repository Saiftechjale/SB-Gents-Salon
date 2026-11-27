import type {
  AttendanceRecord,
  Booking,
  BookingServiceItem,
  BookingStatus,
  Commission,
  Customer,
  CustomerDueEntry,
  CustomerServiceHistory,
  Expense,
  NotificationItem,
  OfferAccentTheme,
  OfferDiscountType,
  Payment,
  ReceptionAccount,
  SalonBootstrapData,
  SalonOffer,
  ServiceItem,
  StaffMember,
  TimeSlot,
} from '../types/salon';
import { cacheSalonStateLocally, getCachedSalonState } from './offlineDb';
import {
  calculateOfferDiscount,
  isValidPin as isPinFormatValid,
  isWeakPin,
  WEAK_PIN_MSG,
} from './pinSecurity';

const LOCAL_PINS_KEY = 'sb_local_security_pins';
const LOCAL_LOCK_KEY = 'sb_local_pin_attempts';

function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

function isValidPin(pin: string): boolean {
  return isPinFormatValid(pin);
}

function generateLocalRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (len: number) =>
    Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `SB-${pick(4)}-${pick(4)}`;
}

function generateLocalResetCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createDefaultLocalOffers(salonId: string, now: string): SalonOffer[] {
  return [
    {
      id: makeUuid(),
      salon_id: salonId,
      title: 'Online Slot Booking Special',
      subtitle: 'App se slot book karne par turant 15% discount payein',
      badge_text: '15% OFF',
      discount_type: 'PERCENT',
      discount_value: 15,
      min_bill: 150,
      promo_code: 'SALON15',
      accent_theme: 'PURPLE',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: makeUuid(),
      salon_id: salonId,
      title: 'Haircut + Beard Combo Offer',
      subtitle: '₹200+ ke bill par seedhe ₹40 ki bachat karein',
      badge_text: '₹40 OFF',
      discount_type: 'FLAT',
      discount_value: 40,
      min_bill: 200,
      promo_code: 'COMBO40',
      accent_theme: 'GOLD',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ];
}

function normalizePhone10(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

function getTodayDateString(): string {
  return new Date().toLocaleDateString('en-CA');
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = (hhmm || '09:00').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateTimeSlots(opening: string, closing: string, intervalMinutes: number, salonId: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const [openH, openM] = opening.split(':').map(Number);
  const [closeH, closeM] = closing.split(':').map(Number);
  let currentMins = (openH || 9) * 60 + (openM || 0);
  const endMins = (closeH || 21) * 60 + (closeM || 0);
  const step = Math.max(15, intervalMinutes || 30);

  while (currentMins < endMins) {
    const h = String(Math.floor(currentMins / 60)).padStart(2, '0');
    const m = String(currentMins % 60).padStart(2, '0');
    slots.push({
      id: makeUuid(),
      salon_id: salonId,
      slot_time: `${h}:${m}`,
      is_enabled: true,
      created_at: new Date().toISOString(),
    });
    currentMins += step;
  }
  return slots;
}

export function createDefaultLocalSalonState(): SalonBootstrapData {
  const now = new Date().toISOString();
  const today = getTodayDateString();
  const salonId = '11111111-1111-4111-8111-111111111111';

  const staff: StaffMember[] = [
    {
      id: '22222222-2222-4222-8222-222222222201',
      salon_id: salonId,
      name: 'Saif Bhai',
      phone: '9876543210',
      specialty: 'Master Stylist & Salon Owner',
      is_owner: true,
      commission_pct: 100,
      availability_status: 'Available',
      is_active: true,
      joined_date: today,
      created_at: now,
      updated_at: now,
    },
    {
      id: '22222222-2222-4222-8222-222222222202',
      salon_id: salonId,
      name: 'Imran Ansari',
      phone: '9876500001',
      specialty: 'Senior Hair & Beard Specialist',
      is_owner: false,
      commission_pct: 40,
      availability_status: 'Available',
      is_active: true,
      joined_date: today,
      created_at: now,
      updated_at: now,
    },
    {
      id: '22222222-2222-4222-8222-222222222203',
      salon_id: salonId,
      name: 'Raju Sen',
      phone: '9876500002',
      specialty: 'Haircut, Facial & Spa Expert',
      is_owner: false,
      commission_pct: 40,
      availability_status: 'Available',
      is_active: true,
      joined_date: today,
      created_at: now,
      updated_at: now,
    },
  ];

  const defaultServices = [
    { name: 'Haircut', name_hi: 'हेयरकट', category: 'Hair', price: 150, duration_minutes: 30, is_active: true },
    { name: 'Haircut + Beard', name_hi: 'हेयरकट + दाढ़ी', category: 'Combo', price: 220, duration_minutes: 45, is_active: true },
    { name: 'Beard Trimming', name_hi: 'दाढ़ी ट्रिमिंग', category: 'Beard', price: 80, duration_minutes: 15, is_active: true },
    { name: 'Hair Wash', name_hi: 'हेयर वॉश', category: 'Hair Care', price: 100, duration_minutes: 15, is_active: true },
    { name: 'Facial', name_hi: 'फेशियल', category: 'Skin Care', price: 450, duration_minutes: 45, is_active: true },
    { name: 'Hair Colour', name_hi: 'हेयर कलर', category: 'Colour', price: 350, duration_minutes: 45, is_active: true },
    { name: 'Hair Spa', name_hi: 'हेयर स्पा', category: 'Hair Care', price: 500, duration_minutes: 45, is_active: true },
  ];

  const services: ServiceItem[] = defaultServices.map((s) => ({
    ...s,
    id: makeUuid(),
    salon_id: salonId,
    created_at: now,
    updated_at: now,
  }));

  return {
    supabaseConnected: false,
    supabaseUrlConfigured: false,
    storageMode: 'LOCAL_POSTGRES_REPLICA',
    authRole: 'NONE',
    needsOwnerSetup: false,
    isDefaultOwnerPin: false,
    salon: {
      id: salonId,
      name: 'SB Gents Salon',
      phone: '9876543210',
      address: 'Shop No. 14, Main Market Road, Near City Center',
      owner_user_id: null,
      created_at: now,
      updated_at: now,
    },
    settings: {
      id: makeUuid(),
      salon_id: salonId,
      opening_time: '09:00',
      closing_time: '21:00',
      slot_duration_minutes: 30,
      weekly_holidays: [],
      owner_availability: 'Available',
      owner_commission_pct: 100,
      currency_symbol: '₹',
      upi_id: '',
      upi_merchant_name: 'SB Gents Salon',
      hide_staff_login: false,
      customer_apk_url: '',
      updated_at: now,
    },
    staff,
    receptionAccounts: [],
    offers: createDefaultLocalOffers(salonId, now),
    services,
    customers: [],
    timeSlots: generateTimeSlots('09:00', '21:00', 30, salonId),
    bookings: [],
    payments: [],
    customerDues: [],
    expenses: [],
    commissions: [],
    attendance: staff.map((st, idx) => ({
      id: makeUuid(),
      salon_id: salonId,
      staff_id: st.id,
      staff_name: st.name,
      attendance_date: today,
      status: 'PRESENT',
      check_in_time: `09:0${idx * 5}`,
      created_at: now,
    })),
    serviceHistory: [],
    notifications: [],
  };
}

interface LocalSecurityStore {
  ownerClaimed?: boolean;
  ownerPin: string;
  ownerRecoveryCode?: string;
  staffPins: Record<string, string>;
  receptionPins: Record<string, string>;
  customerPins: Record<string, string>;
  customerResetCodes?: Record<string, { code: string; expiresAt: number; attempts: number }>;
}

function getLocalPins(): LocalSecurityStore {
  try {
    const raw = localStorage.getItem(LOCAL_PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalSecurityStore>;
      return {
        ownerClaimed: parsed.ownerClaimed ?? true,
        ownerPin: parsed.ownerPin || '1234',
        ownerRecoveryCode: parsed.ownerRecoveryCode || '',
        staffPins: parsed.staffPins || {},
        receptionPins: parsed.receptionPins || {},
        customerPins: parsed.customerPins || {},
        customerResetCodes: parsed.customerResetCodes || {},
      };
    }
  } catch {
    // Ignore storage error
  }
  return {
    ownerClaimed: false,
    ownerPin: '',
    ownerRecoveryCode: '',
    staffPins: {},
    receptionPins: {},
    customerPins: {},
    customerResetCodes: {},
  };
}

function saveLocalPins(pins: LocalSecurityStore): void {
  localStorage.setItem(LOCAL_PINS_KEY, JSON.stringify(pins));
}

async function loadOrInitLocalState(): Promise<SalonBootstrapData> {
  const existing = await getCachedSalonState();
  if (existing && existing.salon && existing.services) {
    if (!Array.isArray(existing.receptionAccounts)) existing.receptionAccounts = [];
    if (!Array.isArray(existing.offers)) {
      existing.offers = createDefaultLocalOffers(existing.salon.id, new Date().toISOString());
    }
    return existing;
  }
  const initial = createDefaultLocalSalonState();
  await cacheSalonStateLocally(initial);
  return initial;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleLocalApiRequest(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const state = await loadOrInitLocalState();
  const now = new Date().toISOString();

  // 1. Bootstrap
  if (path === '/api/bootstrap' && method === 'GET') {
    const pins = getLocalPins();
    return jsonResponse({
      ...state,
      needsOwnerSetup: !pins.ownerClaimed,
      hasOwnerRecoveryCode: Boolean(pins.ownerRecoveryCode),
    });
  }

  // 2. PIN Auth (Phone + PIN + 5-attempt lockout for OWNER, RECEPTION, STAFF)
  if (path === '/api/auth/verify-pin' && method === 'POST') {
    const rawRole = String(body.role || 'OWNER').toUpperCase();
    const role: 'OWNER' | 'RECEPTION' | 'STAFF' =
      rawRole === 'STAFF' ? 'STAFF' : rawRole === 'RECEPTION' ? 'RECEPTION' : 'OWNER';
    const cleanPhone = normalizePhone10(body.phone);
    const pin = String(body.pin || '').trim();
    const nowMs = Date.now();

    let lockMap: Record<string, { count: number; lockedUntil: number }> = {};
    try {
      const rawLock = localStorage.getItem(LOCAL_LOCK_KEY);
      if (rawLock) lockMap = JSON.parse(rawLock);
    } catch {
      lockMap = {};
    }
    const lockEntry = lockMap[role];
    if (lockEntry && lockEntry.lockedUntil > nowMs) {
      const waitMins = Math.max(1, Math.ceil((lockEntry.lockedUntil - nowMs) / 60000));
      return jsonResponse(
        { verified: false, error: `Bahut baar galat koshish hui. ${waitMins} minute baad try karein.` },
        429
      );
    }

    if (!isValidIndianMobile(cleanPhone) || !isValidPin(pin)) {
      return jsonResponse(
        { verified: false, error: '10-digit registered Indian mobile number aur 4-6 digit PIN zaroori hai.' },
        400
      );
    }

    const pins = getLocalPins();
    const recordFailure = () => {
      const prevCount = lockEntry && lockEntry.lockedUntil <= nowMs ? lockEntry.count : 0;
      const nextCount = prevCount + 1;
      lockMap[role] = {
        count: nextCount >= 5 ? 0 : nextCount,
        lockedUntil: nextCount >= 5 ? nowMs + 5 * 60 * 1000 : 0,
      };
      localStorage.setItem(LOCAL_LOCK_KEY, JSON.stringify(lockMap));
    };

    if (role === 'OWNER') {
      const ownerPhones = new Set<string>();
      const sp = normalizePhone10(state.salon.phone);
      if (isValidIndianMobile(sp)) ownerPhones.add(sp);
      state.staff.forEach((s) => {
        if (s.is_active && s.is_owner) {
          const p = normalizePhone10(s.phone);
          if (isValidIndianMobile(p)) ownerPhones.add(p);
        }
      });

      if (!ownerPhones.has(cleanPhone) || pin !== pins.ownerPin) {
        recordFailure();
        return jsonResponse({ verified: false, error: 'Malik ka mobile number ya PIN galat hai.' }, 401);
      }
      delete lockMap[role];
      localStorage.setItem(LOCAL_LOCK_KEY, JSON.stringify(lockMap));
      return jsonResponse({ verified: true, role: 'OWNER', token: `local-owner-${nowMs}` });
    }

    if (role === 'RECEPTION') {
      const matchedRec = (state.receptionAccounts || []).find(
        (r) => r.is_active && normalizePhone10(r.phone) === cleanPhone
      );
      if (!matchedRec || pin !== pins.receptionPins[matchedRec.id]) {
        recordFailure();
        return jsonResponse({ verified: false, error: 'Receptionist ka mobile number ya PIN galat hai.' }, 401);
      }
      delete lockMap[role];
      localStorage.setItem(LOCAL_LOCK_KEY, JSON.stringify(lockMap));
      return jsonResponse({
        verified: true,
        role: 'RECEPTION',
        receptionId: matchedRec.id,
        receptionName: matchedRec.name,
        token: `local-reception-${matchedRec.id}-${nowMs}`,
      });
    }

    const matchedStaff = state.staff.find(
      (s) => s.is_active && !s.is_owner && normalizePhone10(s.phone) === cleanPhone
    );
    if (!matchedStaff || pin !== pins.staffPins[matchedStaff.id]) {
      recordFailure();
      return jsonResponse({ verified: false, error: 'Staff ka mobile number ya PIN galat hai.' }, 401);
    }

    delete lockMap[role];
    localStorage.setItem(LOCAL_LOCK_KEY, JSON.stringify(lockMap));
    return jsonResponse({
      verified: true,
      role: 'STAFF',
      staffId: matchedStaff.id,
      staffName: matchedStaff.name,
      token: `local-staff-${matchedStaff.id}-${nowMs}`,
    });
  }

  if (path === '/api/auth/setup-owner' && method === 'POST') {
    const cleanPhone = normalizePhone10(body.phone);
    const pin = String(body.pin || '').trim();
    if (!isValidIndianMobile(cleanPhone) || !isValidPin(pin)) {
      return jsonResponse({ error: 'Valid Indian mobile aur 4-6 digit PIN daalein.' }, 400);
    }
    if (isWeakPin(pin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    state.salon.name = String(body.salonName || state.salon.name).trim();
    state.salon.phone = cleanPhone;
    const ownerStaff = state.staff.find((s) => s.is_owner);
    if (ownerStaff) {
      ownerStaff.name = String(body.ownerName || ownerStaff.name).trim();
      ownerStaff.phone = cleanPhone;
    }
    const recoveryCode = generateLocalRecoveryCode();
    const pins = getLocalPins();
    pins.ownerPin = pin;
    pins.ownerClaimed = true;
    pins.ownerRecoveryCode = recoveryCode;
    saveLocalPins(pins);
    await cacheSalonStateLocally(state);
    return jsonResponse({ verified: true, role: 'OWNER', token: `local-owner-${Date.now()}`, recoveryCode }, 201);
  }

  if (path === '/api/auth/pins' && (method === 'PATCH' || method === 'PUT')) {
    const pins = getLocalPins();
    const rawOwner = body.ownerPin ?? body.new_owner_pin;
    const cleanOwner = String(rawOwner || '').trim();
    if (!isValidPin(cleanOwner)) {
      return jsonResponse({ error: 'Malik PIN 4 se 6 digits ka number hona chahiye.' }, 400);
    }
    if (isWeakPin(cleanOwner)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    pins.ownerPin = cleanOwner;
    saveLocalPins(pins);
    return jsonResponse({ updated: true });
  }

  if (path === '/api/auth/owner/recovery-code' && method === 'POST') {
    const recoveryCode = generateLocalRecoveryCode();
    const pins = getLocalPins();
    pins.ownerRecoveryCode = recoveryCode;
    saveLocalPins(pins);
    return jsonResponse({ recoveryCode });
  }

  if (path === '/api/auth/owner/recover' && method === 'POST') {
    const pins = getLocalPins();
    const code = String(body.recoveryCode || '').trim().toUpperCase();
    const cleanPhone = normalizePhone10(body.phone);
    const newPin = String(body.newPin || '').trim();
    if (!pins.ownerRecoveryCode) {
      return jsonResponse({ error: 'Master Recovery Code abhi set nahi hai. Settings me jakar banayein.' }, 400);
    }
    if (!code || code !== pins.ownerRecoveryCode) {
      return jsonResponse({ verified: false, error: 'Master Recovery Code galat hai.' }, 401);
    }
    if (!isValidIndianMobile(cleanPhone)) {
      return jsonResponse({ error: 'Apna 10-digit Indian mobile number daalein.' }, 400);
    }
    if (!isValidPin(newPin)) {
      return jsonResponse({ error: 'Naya PIN 4 se 6 digits ka hona chahiye.' }, 400);
    }
    if (isWeakPin(newPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    state.salon.phone = cleanPhone;
    state.salon.updated_at = now;
    const ownerStaff = state.staff.find((s) => s.is_owner);
    if (ownerStaff) {
      ownerStaff.phone = cleanPhone;
      ownerStaff.updated_at = now;
    }
    const nextRecoveryCode = generateLocalRecoveryCode();
    pins.ownerPin = newPin;
    pins.ownerRecoveryCode = nextRecoveryCode;
    pins.ownerClaimed = true;
    saveLocalPins(pins);
    await cacheSalonStateLocally(state);
    return jsonResponse({
      verified: true,
      role: 'OWNER',
      token: `local-owner-${Date.now()}`,
      newRecoveryCode: nextRecoveryCode,
    });
  }

  if (path === '/api/auth/customer/register' && method === 'POST') {
    const cleanName = String(body.name || '').trim();
    const cleanPhone = normalizePhone10(body.phone);
    const cleanPin = String(body.pin || '').trim();
    if (cleanName.length < 2 || !isValidIndianMobile(cleanPhone) || !isValidPin(cleanPin)) {
      return jsonResponse({ error: 'Naam, valid 10-digit mobile aur 4-6 digit PIN zaroori hai.' }, 400);
    }
    if (isWeakPin(cleanPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    const pins = getLocalPins();
    let customer = state.customers.find((c) => normalizePhone10(c.phone) === cleanPhone);
    if (customer && pins.customerPins[customer.id]) {
      return jsonResponse({ error: 'Account pehle se bana hai, Login karein.' }, 409);
    }
    if (!customer) {
      customer = {
        id: makeUuid(),
        salon_id: state.salon.id,
        name: cleanName,
        phone: cleanPhone,
        haircut_preference: '',
        special_notes: '',
        total_visits: 0,
        total_spent: 0,
        outstanding_due: 0,
        last_visit_date: null,
        is_registered: true,
        created_at: now,
        updated_at: now,
      };
      state.customers.push(customer);
    } else {
      customer.name = cleanName;
      customer.is_registered = true;
      customer.updated_at = now;
    }
    pins.customerPins[customer.id] = cleanPin;
    saveLocalPins(pins);
    await cacheSalonStateLocally(state);
    return jsonResponse({ verified: true, role: 'CUSTOMER', customer, token: `local-cust-${customer.id}-${Date.now()}` }, 201);
  }

  if (path === '/api/auth/customer/login' && method === 'POST') {
    const cleanPhone = normalizePhone10(body.phone);
    const cleanPin = String(body.pin || '').trim();
    const pins = getLocalPins();
    const customer = state.customers.find((c) => normalizePhone10(c.phone) === cleanPhone);
    if (!customer || pins.customerPins[customer.id] !== cleanPin) {
      return jsonResponse(
        {
          verified: false,
          needsRegister: !customer || !pins.customerPins[customer.id],
          error: 'Mobile number ya PIN galat hai.',
        },
        401
      );
    }
    return jsonResponse({ verified: true, role: 'CUSTOMER', customer, token: `local-cust-${customer.id}-${Date.now()}` });
  }

  if (path === '/api/auth/customer/pin' && method === 'PUT') {
    const newPin = String(body.new_pin || '').trim();
    if (!isValidPin(newPin)) {
      return jsonResponse({ error: 'Naya PIN 4 se 6 digits ka hona chahiye.' }, 400);
    }
    if (isWeakPin(newPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    return jsonResponse({ updated: true });
  }

  const custPinMatch = path.match(/^\/api\/customers\/([^/]+)\/pin$/);
  if (custPinMatch && method === 'PUT') {
    const cleanPin = String(body.pin || '').trim();
    if (!isValidPin(cleanPin)) {
      return jsonResponse({ error: 'Naya PIN 4 se 6 digits ka hona chahiye.' }, 400);
    }
    if (isWeakPin(cleanPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    const pins = getLocalPins();
    pins.customerPins[custPinMatch[1]] = cleanPin;
    saveLocalPins(pins);
    return jsonResponse({ updated: true });
  }

  const custResetCodeMatch = path.match(/^\/api\/customers\/([^/]+)\/reset-code$/);
  if (custResetCodeMatch && method === 'POST') {
    const customer = state.customers.find((c) => c.id === custResetCodeMatch[1]);
    if (!customer) return jsonResponse({ error: 'Customer not found.' }, 404);
    const resetCode = generateLocalResetCode();
    const pins = getLocalPins();
    if (!pins.customerResetCodes) pins.customerResetCodes = {};
    pins.customerResetCodes[customer.id] = {
      code: resetCode,
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0,
    };
    saveLocalPins(pins);
    return jsonResponse({
      resetCode,
      expiresInMinutes: 15,
      customerName: customer.name,
      customerPhone: customer.phone,
    });
  }

  if (path === '/api/auth/customer/forgot-pin' && method === 'POST') {
    const cleanPhone = normalizePhone10(body.phone);
    const resetCode = String(body.resetCode || '').trim();
    const newPin = String(body.newPin || '').trim();
    if (!isValidIndianMobile(cleanPhone)) {
      return jsonResponse({ error: 'Apna 10-digit Indian mobile number daalein.' }, 400);
    }
    if (!/^\d{6}$/.test(resetCode)) {
      return jsonResponse({ error: 'Salon Malik se mila 6-digit Reset Code daalein.' }, 400);
    }
    if (!isValidPin(newPin)) {
      return jsonResponse({ error: 'Naya PIN 4 se 6 digits ka number hona chahiye.' }, 400);
    }
    if (isWeakPin(newPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    const pins = getLocalPins();
    const customer = state.customers.find((c) => normalizePhone10(c.phone) === cleanPhone);
    const record = customer ? pins.customerResetCodes?.[customer.id] : undefined;
    if (!customer || !record) {
      return jsonResponse({ error: 'Reset Code nahi mila. Salon Malik se code banwayein.' }, 400);
    }
    if (Date.now() > record.expiresAt) {
      delete pins.customerResetCodes![customer.id];
      saveLocalPins(pins);
      return jsonResponse({ error: 'Yeh Reset Code expire ho gaya hai (15 min limit).' }, 400);
    }
    if (record.code !== resetCode) {
      record.attempts += 1;
      saveLocalPins(pins);
      return jsonResponse({ error: 'Reset Code galat hai.' }, 401);
    }
    pins.customerPins[customer.id] = newPin;
    delete pins.customerResetCodes![customer.id];
    saveLocalPins(pins);
    return jsonResponse({
      verified: true,
      role: 'CUSTOMER',
      customer: { ...customer, is_registered: true },
      token: `local-cust-${customer.id}-${Date.now()}`,
    });
  }

  // Offers & Discounts CRUD
  if (path === '/api/offers' && method === 'POST') {
    const title = String(body.title || '').trim();
    const subtitle = String(body.subtitle || '').trim();
    const discountType: OfferDiscountType = body.discount_type === 'FLAT' ? 'FLAT' : 'PERCENT';
    const discountValue = Math.max(1, Number(body.discount_value || 0));
    const minBill = Math.max(0, Number(body.min_bill || 0));
    const promoCode = String(body.promo_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawTheme = String(body.accent_theme || 'PURPLE').toUpperCase();
    const accentTheme: OfferAccentTheme =
      rawTheme === 'GOLD' || rawTheme === 'EMERALD' || rawTheme === 'ROSE' ? rawTheme : 'PURPLE';
    const badgeText =
      String(body.badge_text || '').trim() ||
      (discountType === 'PERCENT' ? `${Math.min(90, discountValue)}% OFF` : `₹${discountValue} OFF`);
    if (title.length < 2) {
      return jsonResponse({ error: 'Offer ka title daalein.' }, 400);
    }
    const offer: SalonOffer = {
      id: makeUuid(),
      salon_id: state.salon.id,
      title,
      subtitle,
      badge_text: badgeText,
      discount_type: discountType,
      discount_value: discountType === 'PERCENT' ? Math.min(90, discountValue) : discountValue,
      min_bill: minBill,
      promo_code: promoCode,
      accent_theme: accentTheme,
      is_active: body.is_active !== false,
      created_at: now,
      updated_at: now,
    };
    if (!state.offers) state.offers = [];
    state.offers.unshift(offer);
    await cacheSalonStateLocally(state);
    return jsonResponse({ offer }, 201);
  }

  const offerMatch = path.match(/^\/api\/offers\/([^/]+)$/);
  if (offerMatch && (method === 'PUT' || method === 'PATCH')) {
    const offer = (state.offers || []).find((o) => o.id === offerMatch[1]);
    if (!offer) return jsonResponse({ error: 'Offer not found.' }, 404);
    if (body.title !== undefined && String(body.title).trim()) offer.title = String(body.title).trim();
    if (body.subtitle !== undefined) offer.subtitle = String(body.subtitle).trim();
    if (body.discount_type !== undefined) offer.discount_type = body.discount_type === 'FLAT' ? 'FLAT' : 'PERCENT';
    if (body.discount_value !== undefined) {
      const v = Math.max(1, Number(body.discount_value || 0));
      offer.discount_value = offer.discount_type === 'PERCENT' ? Math.min(90, v) : v;
    }
    if (body.min_bill !== undefined) offer.min_bill = Math.max(0, Number(body.min_bill || 0));
    if (body.promo_code !== undefined) {
      offer.promo_code = String(body.promo_code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    if (body.accent_theme !== undefined) {
      const t = String(body.accent_theme).toUpperCase();
      if (t === 'PURPLE' || t === 'GOLD' || t === 'EMERALD' || t === 'ROSE') offer.accent_theme = t;
    }
    if (body.badge_text !== undefined) {
      offer.badge_text =
        String(body.badge_text).trim() ||
        (offer.discount_type === 'PERCENT' ? `${offer.discount_value}% OFF` : `₹${offer.discount_value} OFF`);
    }
    if (body.is_active !== undefined) offer.is_active = Boolean(body.is_active);
    offer.updated_at = now;
    await cacheSalonStateLocally(state);
    return jsonResponse({ offer });
  }

  if (offerMatch && method === 'DELETE') {
    state.offers = (state.offers || []).filter((o) => o.id !== offerMatch[1]);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  if (path === '/api/otp/request' && method === 'POST') {
    return jsonResponse(
      { sent: false, error: 'Offline mode me OTP SMS available nahi hai.' },
      503
    );
  }

  // 4. Create Booking
  if (path === '/api/bookings' && method === 'POST') {
    const cleanPhone = String(body.customer_phone || '').replace(/\D/g, '').slice(-10);
    const cleanName = String(body.customer_name || 'Customer').trim();
    const bookingDate = String(body.booking_date || getTodayDateString());
    const slotTime = String(body.slot_time || '10:00');
    const selectedServiceIds: string[] = Array.isArray(body.service_ids) ? body.service_ids : [];
    const chosenServices = state.services.filter((s) => selectedServiceIds.includes(s.id));

    if (!cleanName || cleanPhone.length < 10 || chosenServices.length === 0) {
      return jsonResponse({ error: 'Name, 10-digit phone, and at least one service are required.' }, 400);
    }

    let customer = state.customers.find((c) => c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);
    if (!customer) {
      customer = {
        id: makeUuid(),
        salon_id: state.salon.id,
        name: cleanName,
        phone: cleanPhone,
        haircut_preference: '',
        special_notes: '',
        total_visits: 0,
        total_spent: 0,
        outstanding_due: 0,
        last_visit_date: null,
        created_at: now,
        updated_at: now,
      };
      state.customers.push(customer);
    }

    // Choose barber
    const targetBarberId = body.preferred_barber_id || body.barber_id;
    const activeStaff = state.staff.filter((s) => s.is_active && s.availability_status !== 'Not Available');
    const barber =
      state.staff.find((s) => s.id === targetBarberId) ||
      activeStaff[0] ||
      state.staff[0];

    const sameDayBookings = state.bookings.filter((b) => b.booking_date === bookingDate);
    const maxToken = sameDayBookings.reduce((m, b) => Math.max(m, b.token_number), 0);
    const tokenNumber = maxToken + 1;
    const referenceCode = `SB-${bookingDate.slice(5).replace('-', '')}-${String(tokenNumber).padStart(3, '0')}`;
    const subtotalAmount = chosenServices.reduce((sum, s) => sum + Number(s.price), 0);
    let discountAmount = 0;
    let appliedOfferId: string | null = null;
    let appliedOfferTitle = '';
    const cleanPromo = String(body.promo_code || '').trim().toUpperCase();
    const activeOffers = (state.offers || []).filter((o) => o.is_active);
    const matchedOffer =
      (body.offer_id ? activeOffers.find((o) => o.id === body.offer_id) : undefined) ||
      (cleanPromo ? activeOffers.find((o) => o.promo_code.toUpperCase() === cleanPromo) : undefined);

    if (matchedOffer) {
      if (subtotalAmount < Math.max(0, Number(matchedOffer.min_bill || 0))) {
        return jsonResponse(
          { error: `Yeh offer lagane ke liye kam se kam ₹${matchedOffer.min_bill} ki service chunein.` },
          400
        );
      }
      discountAmount = calculateOfferDiscount(subtotalAmount, matchedOffer);
      appliedOfferId = matchedOffer.id;
      appliedOfferTitle = `${matchedOffer.title} (${matchedOffer.badge_text})`;
    } else if (cleanPromo) {
      return jsonResponse({ error: `Promo code "${cleanPromo}" valid ya active nahi hai.` }, 400);
    } else if (body.manual_discount !== undefined && Number(body.manual_discount) > 0) {
      discountAmount = Math.min(subtotalAmount, Math.round(Number(body.manual_discount)));
      appliedOfferTitle = 'Counter Discount';
    }

    const totalAmount = Math.max(0, subtotalAmount - discountAmount);
    const bookingId = makeUuid();

    const bookingServices: BookingServiceItem[] = chosenServices.map((s) => ({
      id: makeUuid(),
      booking_id: bookingId,
      service_id: s.id,
      service_name: s.name,
      price: Number(s.price),
      duration_minutes: s.duration_minutes,
    }));

    const newBooking: Booking = {
      id: bookingId,
      salon_id: state.salon.id,
      reference_code: referenceCode,
      verification_method: body.verification_token ? 'OTP_VERIFIED' : 'GUEST_EXPRESS',
      customer_id: customer.id,
      customer_name: cleanName,
      customer_phone: cleanPhone,
      barber_id: barber.id,
      barber_name: barber.name,
      booking_preference: body.booking_preference || 'ANY_AVAILABLE',
      booking_type: body.booking_type || 'ONLINE',
      booking_date: bookingDate,
      slot_time: slotTime,
      token_number: tokenNumber,
      status: body.status || 'WAITING',
      subtotal_amount: subtotalAmount,
      discount_amount: discountAmount,
      applied_offer_id: appliedOfferId,
      applied_offer_title: appliedOfferTitle,
      total_amount: totalAmount,
      notes: String(body.notes || ''),
      is_billed: false,
      services: bookingServices,
      created_at: now,
      updated_at: now,
    };

    state.bookings.push(newBooking);

    const slotLabel12h = formatTime12h(slotTime);
    const ownerNotif: NotificationItem = {
      id: makeUuid(),
      salon_id: state.salon.id,
      recipient_role: 'OWNER',
      title: `New Booking · Token #${tokenNumber}`,
      message: `${cleanName} (${cleanPhone}) booked ${chosenServices.map((s) => s.name).join(', ')} with ${barber.name} on ${bookingDate} at ${slotLabel12h}.`,
      is_read: false,
      created_at: now,
    };
    const customerNotif: NotificationItem = {
      id: makeUuid(),
      salon_id: state.salon.id,
      recipient_role: 'CUSTOMER',
      recipient_phone: cleanPhone,
      title: `बुकिंग पक्की · टोकन #${tokenNumber}`,
      message: `${barber.name} के साथ ${bookingDate} को ${slotLabel12h} पर आपकी सीट बुक हो गई है। लाइव नंबर यहीं दिखेगा।`,
      is_read: false,
      created_at: now,
    };
    state.notifications.unshift(ownerNotif, customerNotif);
    await cacheSalonStateLocally(state);

    return jsonResponse({ booking: newBooking }, 201);
  }

  // 5. Update Booking Status
  const statusMatch = path.match(/^\/api\/bookings\/([^/]+)\/status$/);
  if (statusMatch && method === 'PATCH') {
    const id = statusMatch[1];
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

    const newStatus = body.status as BookingStatus;
    booking.status = newStatus;
    booking.updated_at = now;

    if (newStatus === 'IN_PROGRESS') {
      state.notifications.unshift({
        id: makeUuid(),
        salon_id: state.salon.id,
        recipient_role: 'CUSTOMER',
        recipient_phone: booking.customer_phone,
        title: `आपकी बारी आ गई! (टोकन #${booking.token_number})`,
        message: `${booking.barber_name} अब आपकी सेवा के लिए तैयार हैं। कृपया सैलून में अपनी कुर्सी पर आएं।`,
        is_read: false,
        created_at: now,
      });

      const nextWaiting = state.bookings
        .filter((b) => b.booking_date === booking.booking_date && b.status === 'WAITING' && b.id !== booking.id)
        .sort((a, b) => a.token_number - b.token_number)[0];
      if (nextWaiting) {
        state.notifications.unshift({
          id: makeUuid(),
          salon_id: state.salon.id,
          recipient_role: 'CUSTOMER',
          recipient_phone: nextWaiting.customer_phone,
          title: `आपका नंबर अगला है! (टोकन #${nextWaiting.token_number})`,
          message: `अब टोकन #${booking.token_number} चल रहा है। कृपया तैयार रहें, अगली बारी आपकी है।`,
          is_read: false,
          created_at: now,
        });
      }
    } else if (newStatus === 'CANCELLED') {
      state.notifications.unshift({
        id: makeUuid(),
        salon_id: state.salon.id,
        recipient_role: 'CUSTOMER',
        recipient_phone: booking.customer_phone,
        title: `बुकिंग रद्द हुई (टोकन #${booking.token_number})`,
        message: `${booking.booking_date} को ${formatTime12h(booking.slot_time)} वाली आपकी बुकिंग रद्द कर दी गई है।`,
        is_read: false,
        created_at: now,
      });
    }

    await cacheSalonStateLocally(state);
    return jsonResponse({ booking });
  }

  // 6. Edit Booking Details
  const editBookingMatch = path.match(/^\/api\/bookings\/([^/]+)$/);
  if (editBookingMatch && (method === 'PATCH' || method === 'PUT')) {
    const id = editBookingMatch[1];
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

    if (body.slot_time) booking.slot_time = body.slot_time;
    if (body.booking_date) booking.booking_date = body.booking_date;
    if (body.barber_id) {
      const bStaff = state.staff.find((s) => s.id === body.barber_id);
      if (bStaff) {
        booking.barber_id = bStaff.id;
        booking.barber_name = bStaff.name;
      }
    }
    if (body.total_amount !== undefined) booking.total_amount = Number(body.total_amount);
    if (body.notes !== undefined) booking.notes = String(body.notes);
    booking.updated_at = now;

    state.notifications.unshift({
      id: makeUuid(),
      salon_id: state.salon.id,
      recipient_role: 'CUSTOMER',
      recipient_phone: booking.customer_phone,
      title: `समय बदला · टोकन #${booking.token_number}`,
      message: `आपकी बुकिंग का नया समय: ${booking.booking_date} को ${formatTime12h(booking.slot_time)} (${booking.barber_name}) · ₹${booking.total_amount}`,
      is_read: false,
      created_at: now,
    });

    await cacheSalonStateLocally(state);
    return jsonResponse({ booking });
  }

  // 7. Split Billing & Payments
  if (path === '/api/payments/bill' && method === 'POST') {
    const cleanPhone = String(body.customer_phone || '').replace(/\D/g, '').slice(-10);
    const cleanName = String(body.customer_name || 'Walk-in Customer').trim();
    let customer = state.customers.find((c) => c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);
    if (!customer) {
      customer = {
        id: makeUuid(),
        salon_id: state.salon.id,
        name: cleanName,
        phone: cleanPhone,
        haircut_preference: String(body.haircut_preference || ''),
        special_notes: '',
        total_visits: 0,
        total_spent: 0,
        outstanding_due: 0,
        last_visit_date: null,
        created_at: now,
        updated_at: now,
      };
      state.customers.push(customer);
    }

    const linkedBooking = body.booking_id ? state.bookings.find((bk) => bk.id === body.booking_id) : undefined;
    const rawGrossBill =
      body.gross_bill !== undefined
        ? Math.max(0, Number(body.gross_bill))
        : linkedBooking?.subtotal_amount !== undefined
        ? Math.max(0, Number(linkedBooking.subtotal_amount))
        : Math.max(0, Number(body.total_bill || 0) + Math.max(0, Number(body.discount_amount || 0)));
    const computedDiscount =
      body.discount_amount !== undefined
        ? Math.min(rawGrossBill, Math.max(0, Math.round(Number(body.discount_amount || 0))))
        : Math.min(rawGrossBill, Math.max(0, Number(linkedBooking?.discount_amount || 0)));
    const totalBill =
      body.gross_bill !== undefined
        ? Math.max(0, rawGrossBill - computedDiscount)
        : Number(body.total_bill || 0);
    const effectiveOfferTitle = String(
      body.applied_offer_title || linkedBooking?.applied_offer_title || (computedDiscount > 0 ? 'Salon Discount' : '')
    ).trim();
    const cashPaid = Number(body.cash_paid || 0);
    const upiPaid = Number(body.upi_paid || 0);
    const totalCollected = cashPaid + upiPaid;
    const udharAmount = Math.max(0, totalBill - totalCollected);
    const payDate = String(body.payment_date || getTodayDateString());

    const payment: Payment = {
      id: makeUuid(),
      salon_id: state.salon.id,
      booking_id: body.booking_id || null,
      customer_id: customer.id,
      customer_name: cleanName,
      barber_id: body.barber_id || null,
      barber_name: body.barber_name || null,
      payment_date: payDate,
      gross_bill: rawGrossBill,
      discount_amount: computedDiscount,
      applied_offer_title: effectiveOfferTitle,
      total_bill: totalBill,
      cash_paid: cashPaid,
      upi_paid: upiPaid,
      total_collected: totalCollected,
      udhar_amount: udharAmount,
      payment_type: 'BILL_PAYMENT',
      client_sync_id: body.client_sync_id || null,
      notes: String(body.notes || ''),
      created_at: now,
    };
    state.payments.push(payment);

    customer.total_visits += 1;
    customer.total_spent += totalBill;
    customer.outstanding_due += udharAmount;
    customer.last_visit_date = payDate;
    customer.updated_at = now;

    if (udharAmount > 0) {
      const due: CustomerDueEntry = {
        id: makeUuid(),
        salon_id: state.salon.id,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        payment_id: payment.id,
        booking_id: body.booking_id || null,
        entry_type: 'UDHAR_ADDED',
        amount: udharAmount,
        payment_mode: 'UDHAR',
        balance_after: customer.outstanding_due,
        notes: String(body.notes || 'Bill Udhar'),
        entry_date: payDate,
        created_at: now,
      };
      state.customerDues.push(due);
    }

    if (linkedBooking) {
      linkedBooking.is_billed = true;
      linkedBooking.status = 'COMPLETED';
      linkedBooking.subtotal_amount = rawGrossBill;
      linkedBooking.discount_amount = computedDiscount;
      linkedBooking.applied_offer_title = effectiveOfferTitle;
      linkedBooking.total_amount = totalBill;
      linkedBooking.updated_at = now;
    }

    const staff = state.staff.find((s) => s.id === body.barber_id);
    if (staff && body.booking_id) {
      const comm: Commission = {
        id: makeUuid(),
        salon_id: state.salon.id,
        staff_id: staff.id,
        staff_name: staff.name,
        booking_id: body.booking_id,
        payment_id: payment.id,
        service_amount: totalBill,
        commission_pct: staff.commission_pct,
        commission_amount: Math.round((totalBill * staff.commission_pct) / 100),
        earned_date: payDate,
        created_at: now,
      };
      state.commissions.push(comm);
    }

    const hist: CustomerServiceHistory = {
      id: makeUuid(),
      salon_id: state.salon.id,
      customer_id: customer.id,
      booking_id: body.booking_id || null,
      barber_id: body.barber_id || null,
      barber_name: body.barber_name || 'Salon',
      services_summary: String(body.services_summary || 'Salon Service'),
      visit_date: payDate,
      total_bill: totalBill,
      amount_paid: totalCollected,
      haircut_preference: String(body.haircut_preference || ''),
      special_notes: String(body.notes || ''),
      created_at: now,
    };
    state.serviceHistory.push(hist);

    await cacheSalonStateLocally(state);
    return jsonResponse({ payment }, 201);
  }

  // 8. Settle Udhar Due
  if (path === '/api/payments/settle-due' && method === 'POST') {
    const customer = state.customers.find((c) => c.id === body.customer_id);
    if (!customer) return jsonResponse({ error: 'Customer not found' }, 404);
    const amount = Number(body.amount || 0);
    customer.outstanding_due = Math.max(0, customer.outstanding_due - amount);
    customer.total_spent += amount;
    customer.updated_at = now;

    const dueEntry: CustomerDueEntry = {
      id: makeUuid(),
      salon_id: state.salon.id,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      entry_type: 'UDHAR_PAID',
      amount,
      payment_mode: body.payment_mode || 'CASH',
      balance_after: customer.outstanding_due,
      notes: String(body.notes || 'Due settled'),
      entry_date: getTodayDateString(),
      created_at: now,
    };
    state.customerDues.push(dueEntry);
    await cacheSalonStateLocally(state);
    return jsonResponse({ customer, dueEntry });
  }

  // 9. Customers
  const custMatch = path.match(/^\/api\/customers\/([^/]+)$/);
  if (custMatch && (method === 'PATCH' || method === 'PUT')) {
    const c = state.customers.find((item) => item.id === custMatch[1]);
    if (!c) return jsonResponse({ error: 'Customer not found' }, 404);
    if (body.name !== undefined) c.name = String(body.name).trim();
    if (body.phone !== undefined) c.phone = normalizePhone10(body.phone);
    if (body.haircut_preference !== undefined) c.haircut_preference = String(body.haircut_preference).trim();
    if (body.special_notes !== undefined) c.special_notes = String(body.special_notes).trim();
    c.updated_at = now;
    await cacheSalonStateLocally(state);
    return jsonResponse({ customer: c });
  }

  if (custMatch && method === 'DELETE') {
    const id = custMatch[1];
    const hasActive = state.bookings.some(
      (b) => b.customer_id === id && (b.status === 'WAITING' || b.status === 'IN_PROGRESS')
    );
    if (hasActive) {
      return jsonResponse(
        { error: 'Is customer ki active booking chal rahi hai, pehle complete ya cancel karein.' },
        400
      );
    }
    state.customers = state.customers.filter((item) => item.id !== id);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  // 10. Staff & Availability
  const availMatch = path.match(/^\/api\/staff\/([^/]+)\/availability$/);
  if (availMatch && (method === 'PATCH' || method === 'PUT')) {
    const st = state.staff.find((s) => s.id === availMatch[1]);
    if (!st) return jsonResponse({ error: 'Staff not found' }, 404);
    st.availability_status = body.availability_status;
    st.updated_at = now;
    if (st.is_owner) {
      state.settings.owner_availability = body.availability_status;
    }
    await cacheSalonStateLocally(state);
    return jsonResponse({ staff: st });
  }

  if (path === '/api/staff' && method === 'POST') {
    const cleanPhone = normalizePhone10(body.phone);
    const cleanPin = String(body.pin || '').trim();
    if (!body.name || !isValidIndianMobile(cleanPhone) || !isValidPin(cleanPin)) {
      return jsonResponse({ error: 'Staff name, valid mobile, and 4-6 digit PIN required.' }, 400);
    }
    if (isWeakPin(cleanPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    const newStaff: StaffMember = {
      id: makeUuid(),
      salon_id: state.salon.id,
      name: String(body.name || 'New Barber').trim(),
      phone: cleanPhone,
      specialty: String(body.specialty || 'Barber').trim(),
      is_owner: Boolean(body.is_owner),
      commission_pct: Math.min(100, Math.max(0, Number(body.commission_pct ?? 40))),
      availability_status: 'Available',
      is_active: true,
      has_pin: true,
      joined_date: getTodayDateString(),
      created_at: now,
      updated_at: now,
    };
    state.staff.push(newStaff);
    const pins = getLocalPins();
    pins.staffPins[newStaff.id] = cleanPin;
    saveLocalPins(pins);
    await cacheSalonStateLocally(state);
    return jsonResponse({ staff: newStaff }, 201);
  }

  const staffMatch = path.match(/^\/api\/staff\/([^/]+)$/);
  if (staffMatch && (method === 'PATCH' || method === 'PUT')) {
    const st = state.staff.find((s) => s.id === staffMatch[1]);
    if (!st) return jsonResponse({ error: 'Staff not found' }, 404);
    if (body.name !== undefined && String(body.name).trim()) st.name = String(body.name).trim();
    if (body.phone !== undefined) {
      const cleanPhone = normalizePhone10(body.phone);
      if (!isValidIndianMobile(cleanPhone)) {
        return jsonResponse({ error: 'Valid 10-digit mobile number is required.' }, 400);
      }
      st.phone = cleanPhone;
      if (st.is_owner) {
        state.salon.phone = cleanPhone;
        state.salon.updated_at = now;
      }
    }
    if (body.pin !== undefined && String(body.pin).trim()) {
      const cleanPin = String(body.pin).trim();
      if (!isValidPin(cleanPin)) {
        return jsonResponse({ error: 'Staff PIN 4 se 6 digits ka number hona chahiye.' }, 400);
      }
      if (isWeakPin(cleanPin)) {
        return jsonResponse({ error: WEAK_PIN_MSG }, 400);
      }
      const pins = getLocalPins();
      pins.staffPins[st.id] = cleanPin;
      saveLocalPins(pins);
      st.has_pin = true;
    }
    if (body.specialty !== undefined) st.specialty = String(body.specialty).trim();
    if (body.commission_pct !== undefined) {
      st.commission_pct = Math.min(100, Math.max(0, Number(body.commission_pct)));
    }
    if (body.is_active !== undefined && !(st.is_owner && !body.is_active)) {
      st.is_active = Boolean(body.is_active);
    }
    if (body.availability_status !== undefined) {
      st.availability_status = body.availability_status;
    }
    st.updated_at = now;
    await cacheSalonStateLocally(state);
    return jsonResponse({ staff: st });
  }

  if (staffMatch && method === 'DELETE') {
    const id = staffMatch[1];
    const st = state.staff.find((s) => s.id === id);
    if (!st) return jsonResponse({ error: 'Staff not found' }, 404);
    if (st.is_owner) return jsonResponse({ error: 'Salon Owner ko delete nahi kiya ja sakta.' }, 400);
    const pins = getLocalPins();
    delete pins.staffPins[id];
    saveLocalPins(pins);
    const hasHistory =
      state.bookings.some((b) => b.barber_id === id) ||
      state.commissions.some((c) => c.staff_id === id);
    if (hasHistory) {
      st.is_active = false;
      st.updated_at = now;
      await cacheSalonStateLocally(state);
      return jsonResponse({ deactivated: true });
    }
    state.staff = state.staff.filter((s) => s.id !== id);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  if (path === '/api/reception-accounts' && method === 'POST') {
    const cleanPhone = normalizePhone10(body.phone);
    const cleanPin = String(body.pin || '').trim();
    if (!body.name || !isValidIndianMobile(cleanPhone) || !isValidPin(cleanPin)) {
      return jsonResponse({ error: 'Name, valid mobile, and PIN required.' }, 400);
    }
    if (isWeakPin(cleanPin)) {
      return jsonResponse({ error: WEAK_PIN_MSG }, 400);
    }
    const acc: ReceptionAccount = {
      id: makeUuid(),
      salon_id: state.salon.id,
      name: String(body.name).trim(),
      phone: cleanPhone,
      is_active: true,
      has_pin: true,
      created_at: now,
      updated_at: now,
    };
    if (!state.receptionAccounts) state.receptionAccounts = [];
    state.receptionAccounts.push(acc);
    const pins = getLocalPins();
    pins.receptionPins[acc.id] = cleanPin;
    saveLocalPins(pins);
    await cacheSalonStateLocally(state);
    return jsonResponse({ receptionAccount: acc }, 201);
  }

  const recMatch = path.match(/^\/api\/reception-accounts\/([^/]+)$/);
  if (recMatch && method === 'PUT') {
    const acc = (state.receptionAccounts || []).find((r) => r.id === recMatch[1]);
    if (!acc) return jsonResponse({ error: 'Reception account not found' }, 404);
    if (body.name) acc.name = String(body.name).trim();
    if (body.phone) acc.phone = normalizePhone10(body.phone);
    if (body.is_active !== undefined) acc.is_active = Boolean(body.is_active);
    if (body.pin && String(body.pin).trim()) {
      const cleanPin = String(body.pin).trim();
      if (!isValidPin(cleanPin)) {
        return jsonResponse({ error: 'Reception PIN 4 se 6 digits ka hona chahiye.' }, 400);
      }
      if (isWeakPin(cleanPin)) {
        return jsonResponse({ error: WEAK_PIN_MSG }, 400);
      }
      const pins = getLocalPins();
      pins.receptionPins[acc.id] = cleanPin;
      saveLocalPins(pins);
      acc.has_pin = true;
    }
    acc.updated_at = now;
    await cacheSalonStateLocally(state);
    return jsonResponse({ receptionAccount: acc });
  }

  if (recMatch && method === 'DELETE') {
    state.receptionAccounts = (state.receptionAccounts || []).filter((r) => r.id !== recMatch[1]);
    const pins = getLocalPins();
    delete pins.receptionPins[recMatch[1]];
    saveLocalPins(pins);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  // 11. Services
  if (path === '/api/services' && method === 'POST') {
    const newService: ServiceItem = {
      id: makeUuid(),
      salon_id: state.salon.id,
      name: String(body.name || 'Service'),
      name_hi: String(body.name_hi || ''),
      category: String(body.category || 'Hair'),
      price: Number(body.price || 100),
      duration_minutes: Number(body.duration_minutes || 30),
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    state.services.push(newService);
    await cacheSalonStateLocally(state);
    return jsonResponse({ service: newService }, 201);
  }

  const serviceMatch = path.match(/^\/api\/services\/([^/]+)$/);
  if (serviceMatch && (method === 'PATCH' || method === 'PUT')) {
    const srv = state.services.find((s) => s.id === serviceMatch[1]);
    if (!srv) return jsonResponse({ error: 'Service not found' }, 404);
    Object.assign(srv, body, { updated_at: now });
    await cacheSalonStateLocally(state);
    return jsonResponse({ service: srv });
  }

  if (serviceMatch && method === 'DELETE') {
    state.services = state.services.filter((s) => s.id !== serviceMatch[1]);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  // 12. Expenses
  if (path === '/api/expenses' && method === 'POST') {
    const exp: Expense = {
      id: makeUuid(),
      salon_id: state.salon.id,
      title: String(body.title || 'Expense'),
      category: String(body.category || 'Shop Supplies'),
      amount: Number(body.amount || 0),
      payment_mode: body.payment_mode || 'CASH',
      expense_date: String(body.expense_date || getTodayDateString()),
      notes: String(body.notes || ''),
      created_at: now,
    };
    state.expenses.push(exp);
    await cacheSalonStateLocally(state);
    return jsonResponse({ expense: exp }, 201);
  }

  const expMatch = path.match(/^\/api\/expenses\/([^/]+)$/);
  if (expMatch && method === 'DELETE') {
    state.expenses = state.expenses.filter((e) => e.id !== expMatch[1]);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  // 13. Settings & Showcase & Time Slots
  if (path === '/api/settings' && (method === 'PATCH' || method === 'PUT')) {
    const oldSalonPhone10 = normalizePhone10(state.salon.phone);
    if (body.salon_name !== undefined && String(body.salon_name).trim()) {
      state.salon.name = String(body.salon_name).trim();
    }
    if (body.salon_phone !== undefined) {
      const cleanPhone = normalizePhone10(body.salon_phone);
      if (cleanPhone.length === 10) {
        state.salon.phone = cleanPhone;
        const ownerStaff = state.staff.find(
          (s) => s.is_owner && normalizePhone10(s.phone) === oldSalonPhone10
        );
        if (ownerStaff) {
          ownerStaff.phone = cleanPhone;
          ownerStaff.updated_at = now;
        }
      }
    }
    if (body.salon_address !== undefined) state.salon.address = String(body.salon_address).trim();
    const {
      salon_name: _sn,
      salon_phone: _sp,
      salon_address: _sa,
      regenerate_slots,
      ...rest
    } = body;
    Object.assign(state.settings, rest, { updated_at: now });
    if (regenerate_slots) {
      state.timeSlots = generateTimeSlots(
        state.settings.opening_time,
        state.settings.closing_time,
        state.settings.slot_duration_minutes || 30,
        state.salon.id
      );
    }
    state.salon.updated_at = now;
    await cacheSalonStateLocally(state);
    return jsonResponse({ salon: state.salon, settings: state.settings, timeSlots: state.timeSlots });
  }

  if (path === '/api/time-slots' && method === 'POST') {
    const newSlot: TimeSlot = {
      id: makeUuid(),
      salon_id: state.salon.id,
      slot_time: String(body.slot_time || '10:00'),
      is_enabled: true,
      created_at: now,
    };
    state.timeSlots.push(newSlot);
    state.timeSlots.sort((a, b) => a.slot_time.localeCompare(b.slot_time));
    await cacheSalonStateLocally(state);
    return jsonResponse({ slot: newSlot }, 201);
  }

  const slotMatch = path.match(/^\/api\/time-slots\/([^/]+)$/);
  if (slotMatch && (method === 'PATCH' || method === 'PUT')) {
    const sl = state.timeSlots.find((t) => t.id === slotMatch[1]);
    if (sl) sl.is_enabled = Boolean(body.is_enabled);
    await cacheSalonStateLocally(state);
    return jsonResponse({ slot: sl });
  }

  if (slotMatch && method === 'DELETE') {
    state.timeSlots = state.timeSlots.filter((t) => t.id !== slotMatch[1]);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  // 15. Attendance & Notifications
  if (path === '/api/attendance' && method === 'POST') {
    const today = String(body.attendance_date || getTodayDateString());
    const st = state.staff.find((s) => s.id === body.staff_id);
    const existing = state.attendance.find(
      (a) => a.staff_id === body.staff_id && a.attendance_date === today
    );
    if (existing) {
      existing.status = body.status;
    } else {
      const rec: AttendanceRecord = {
        id: makeUuid(),
        salon_id: state.salon.id,
        staff_id: body.staff_id,
        staff_name: st?.name || 'Staff',
        attendance_date: today,
        status: body.status || 'PRESENT',
        created_at: now,
      };
      state.attendance.push(rec);
    }
    await cacheSalonStateLocally(state);
    return jsonResponse({ updated: true });
  }

  if (path === '/api/notifications/mark-read' && method === 'PATCH') {
    const targetRole = body.role;
    const phone = body.phone ? String(body.phone).replace(/\D/g, '').slice(-10) : '';
    state.notifications.forEach((n) => {
      if (n.recipient_role === targetRole) {
        if (!phone || (n.recipient_phone || '').replace(/\D/g, '').slice(-10) === phone) {
          n.is_read = true;
        }
      }
    });
    await cacheSalonStateLocally(state);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: `Unsupported local endpoint: ${method} ${path}` }, 404);
}
