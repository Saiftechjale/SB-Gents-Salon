import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Salon,
  SalonSettings,
  StaffMember,
  ServiceItem,
  Customer,
  TimeSlot,
  Booking,
  BookingServiceItem,
  Payment,
  CustomerDueEntry,
  Expense,
  Commission,
  AttendanceRecord,
  CustomerServiceHistory,
  NotificationItem,
  ReceptionAccount,
  AvailabilityStatus,
  BookingPreference,
  BookingType,
  BookingStatus,
  UserRole,
} from './src/types/salon';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'sb_salon_db.json');
const SCHEMA_FILE = path.resolve(process.cwd(), 'supabase/schema.sql');

function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes('MY_')) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

// Server-side Supabase Client (Never exposes service_role key to client)
const SUPABASE_URL = normalizeSupabaseUrl(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
);
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    SUPABASE_KEY &&
    SUPABASE_URL.startsWith('http') &&
    !SUPABASE_URL.includes('MY_')
);

const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

interface SecurityPinsStore {
  ownerClaimed: boolean;
  isDefaultOwnerPin?: boolean;
  ownerPinHash: string;
  staffPinHashes: Record<string, string>;
  receptionPinHashes: Record<string, string>;
  customerPinHashes: Record<string, string>;
  ownerPin?: string;
  staffPin?: string;
}

interface DatabaseStore {
  salon: Salon;
  settings: SalonSettings;
  staff: StaffMember[];
  receptionAccounts: ReceptionAccount[];
  services: ServiceItem[];
  customers: Customer[];
  timeSlots: TimeSlot[];
  bookings: Booking[];
  bookingServices: BookingServiceItem[];
  payments: Payment[];
  customerDues: CustomerDueEntry[];
  expenses: Expense[];
  commissions: Commission[];
  attendance: AttendanceRecord[];
  serviceHistory: CustomerServiceHistory[];
  notifications: NotificationItem[];
  securityPins: SecurityPinsStore;
}

function shiftTimeMinutes(hhmm: string, deltaMinutes: number): string {
  const [hStr, mStr] = (hhmm || '09:00').split(':');
  const baseMins = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  const clamped = Math.max(0, Math.min(23 * 60 + 59, baseMins + deltaMinutes));
  const nh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const nm = String(clamped % 60).padStart(2, '0');
  return `${nh}:${nm}`;
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

function getTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateTimeSlotsList(opening: string, closing: string, intervalMinutes: number, salonId: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const [openH, openM] = opening.split(':').map(Number);
  const [closeH, closeM] = closing.split(':').map(Number);
  let currentMins = openH * 60 + openM;
  const endMins = closeH * 60 + closeM;

  while (currentMins < endMins) {
    const h = String(Math.floor(currentMins / 60)).padStart(2, '0');
    const m = String(currentMins % 60).padStart(2, '0');
    slots.push({
      id: crypto.randomUUID(),
      salon_id: salonId,
      slot_time: `${h}:${m}`,
      is_enabled: true,
      created_at: new Date().toISOString(),
    });
    currentMins += intervalMinutes;
  }
  return slots;
}

function createInitialDatabase(): DatabaseStore {
  const now = new Date().toISOString();
  const today = getTodayDateString();
  const salonId = '11111111-1111-4111-8111-111111111111';

  const salon: Salon = {
    id: salonId,
    name: 'SB Gents Salon',
    phone: '9876543210',
    address: 'Shop No. 14, Main Market Road, Near City Center',
    owner_user_id: null,
    created_at: now,
    updated_at: now,
  };

  const settings: SalonSettings = {
    id: crypto.randomUUID(),
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
  };

  // Initial dynamic staff: Owner (who personally cuts hair) + 2 initial staff members
  const ownerBarber: StaffMember = {
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
  };

  const staff1: StaffMember = {
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
  };

  const staff2: StaffMember = {
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
  };

  // Editable default services as specified in prompt
  const defaultServices: Omit<ServiceItem, 'id' | 'salon_id' | 'created_at' | 'updated_at'>[] = [
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
    id: crypto.randomUUID(),
    salon_id: salonId,
    created_at: now,
    updated_at: now,
  }));

  const timeSlots = generateTimeSlotsList('09:00', '21:00', 30, salonId);

  return {
    salon,
    settings,
    staff: [ownerBarber, staff1, staff2],
    receptionAccounts: [],
    services,
    customers: [],
    timeSlots,
    bookings: [],
    bookingServices: [],
    payments: [],
    customerDues: [],
    expenses: [],
    commissions: [],
    attendance: [
      {
        id: crypto.randomUUID(),
        salon_id: salonId,
        staff_id: ownerBarber.id,
        staff_name: ownerBarber.name,
        attendance_date: today,
        status: 'PRESENT',
        check_in_time: '09:00',
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        salon_id: salonId,
        staff_id: staff1.id,
        staff_name: staff1.name,
        attendance_date: today,
        status: 'PRESENT',
        check_in_time: '09:05',
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        salon_id: salonId,
        staff_id: staff2.id,
        staff_name: staff2.name,
        attendance_date: today,
        status: 'PRESENT',
        check_in_time: '09:10',
        created_at: now,
      },
    ],
    serviceHistory: [],
    notifications: [],
    securityPins: {
      ownerClaimed: false,
      isDefaultOwnerPin: false,
      ownerPinHash: '',
      staffPinHashes: {},
      receptionPinHashes: {},
      customerPinHashes: {},
    },
  };
}

function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPinHash(pin: string, stored: string): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  try {
    const actual = crypto.scryptSync(pin, salt, 32);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dbExistedOnDisk = false;

function loadDatabase(): DatabaseStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    dbExistedOnDisk = false;
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  dbExistedOnDisk = true;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DatabaseStore;
  } catch {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

let db: DatabaseStore = loadDatabase();
if (db.settings.upi_id === undefined) db.settings.upi_id = '';
if (!db.settings.upi_merchant_name) db.settings.upi_merchant_name = db.salon.name || 'SB Gents Salon';
if (db.settings.hide_staff_login === undefined) db.settings.hide_staff_login = false;
if (db.settings.customer_apk_url === undefined) db.settings.customer_apk_url = '';
if (!Array.isArray(db.receptionAccounts)) db.receptionAccounts = [];
// Clean up deprecated showcase/reviews properties if present on older DB file
delete (db as unknown as Record<string, unknown>).showcase;
delete (db as unknown as Record<string, unknown>).reviews;

if (!db.securityPins) {
  db.securityPins = {
    ownerClaimed: dbExistedOnDisk,
    isDefaultOwnerPin: false,
    ownerPinHash: '',
    staffPinHashes: {},
    receptionPinHashes: {},
    customerPinHashes: {},
  };
}
if (!db.securityPins.staffPinHashes) db.securityPins.staffPinHashes = {};
if (!db.securityPins.receptionPinHashes) db.securityPins.receptionPinHashes = {};
if (!db.securityPins.customerPinHashes) db.securityPins.customerPinHashes = {};

// Migrate legacy plaintext PINs into salted scrypt hashes cleanly without breaking existing shop owner
if (db.securityPins.ownerPin) {
  const legacyOwnerPin = String(db.securityPins.ownerPin).trim();
  if (!db.securityPins.ownerPinHash && isValidPin(legacyOwnerPin)) {
    db.securityPins.ownerPinHash = hashPin(legacyOwnerPin);
    db.securityPins.isDefaultOwnerPin = legacyOwnerPin === '1234';
  }
  db.securityPins.ownerClaimed = true;
  delete db.securityPins.ownerPin;
}
if (db.securityPins.staffPin) {
  const legacyStaffPin = String(db.securityPins.staffPin).trim();
  if (isValidPin(legacyStaffPin)) {
    db.staff.forEach((s) => {
      if (!s.is_owner && !db.securityPins.staffPinHashes[s.id]) {
        db.securityPins.staffPinHashes[s.id] = hashPin(legacyStaffPin);
      }
    });
  }
  delete db.securityPins.staffPin;
}
if (dbExistedOnDisk && !db.securityPins.ownerClaimed && db.securityPins.ownerPinHash) {
  db.securityPins.ownerClaimed = true;
}

function saveDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}
saveDatabase();

// Helper to replicate write operations to Supabase PostgreSQL when credentials are configured
async function syncTableRowToSupabase(table: string, row: Record<string, unknown>, onConflict?: string) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from(table).upsert(row, onConflict ? { onConflict } : undefined);
  } catch {
    // Fallback to local relational store if Supabase table hasn't been migrated yet
  }
}

async function syncAuthStateToSupabase(): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('salon_auth_state').upsert(
      {
        salon_id: db.salon.id,
        reception_accounts: db.receptionAccounts,
        security_pins: db.securityPins,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'salon_id' }
    );
  } catch {
    // Table optional if user has not yet re-run updated schema.sql
  }
}

// Realtime Server-Sent Events clients for instant queue & dashboard updates
const sseClients = new Set<Response>();
function broadcastRealtimeUpdate(eventType: string) {
  const msg = `data: ${JSON.stringify({ type: eventType, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Atomic booking lock to prevent concurrent double booking
let bookingLock = false;

// Rate limiting & OTP verification stores (server-side anti-spam)
const rateLimitWindows = new Map<string, number[]>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateLimitWindows.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    rateLimitWindows.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitWindows.set(key, timestamps);
  return true;
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function normalizePhone10(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

function constantTimeMatch(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

interface PortalSession {
  role: UserRole;
  staffId: string | null;
  receptionId: string | null;
  customerId: string | null;
  phone: string | null;
  exp: number;
}

function signPortalToken(session: Omit<PortalSession, 'exp'>): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: session.role,
      staffId: session.staffId || null,
      receptionId: session.receptionId || null,
      customerId: session.customerId || null,
      phone: session.phone || null,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyPortalToken(req: Request): PortalSession | null {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!constantTimeMatch(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as Partial<PortalSession>;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (
      parsed.role !== 'OWNER' &&
      parsed.role !== 'RECEPTION' &&
      parsed.role !== 'STAFF' &&
      parsed.role !== 'CUSTOMER'
    ) {
      return null;
    }
    return {
      role: parsed.role,
      staffId: parsed.staffId || null,
      receptionId: parsed.receptionId || null,
      customerId: parsed.customerId || null,
      phone: parsed.phone || null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

function requireRoles(req: Request, res: Response, allowedRoles: UserRole[]): PortalSession | null {
  const session = verifyPortalToken(req);
  if (!session) {
    res.status(401).json({ error: 'Login zaroori hai. Kripya apna registered number aur PIN se login karein.' });
    return null;
  }
  if (!allowedRoles.includes(session.role)) {
    res.status(403).json({ error: 'Is action ki permission aapke account ko nahi hai.' });
    return null;
  }
  return session;
}

function recordFailedLoginAttempt(lockKey: string, now: number): void {
  const current = failedPinAttempts.get(lockKey);
  const prev = current && current.lockedUntil <= now ? current.count : 0;
  const nextCount = prev + 1;
  failedPinAttempts.set(lockKey, {
    count: nextCount >= 5 ? 0 : nextCount,
    lockedUntil: nextCount >= 5 ? now + 5 * 60 * 1000 : 0,
  });
}

function checkLoginLock(lockKey: string, res: Response): boolean {
  const now = Date.now();
  const attemptState = failedPinAttempts.get(lockKey);
  if (attemptState && attemptState.lockedUntil > now) {
    const waitMins = Math.max(1, Math.ceil((attemptState.lockedUntil - now) / 60000));
    res.status(429).json({
      verified: false,
      error: `Bahut baar galat koshish hui. ${waitMins} minute baad dobara try karein.`,
    });
    return false;
  }
  return true;
}

const failedPinAttempts = new Map<string, { count: number; lockedUntil: number }>();

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  smsSent: boolean;
}
const otpStore = new Map<string, OtpRecord>();
const verifiedTokens = new Map<string, { phone: string; expiresAt: number }>();

async function syncAllTablesToSupabase(): Promise<{
  syncedCounts: Record<string, number>;
  warnings: string[];
}> {
  if (!supabaseAdmin) {
    return { syncedCounts: {}, warnings: ['Supabase client not configured'] };
  }
  const syncSteps: Array<{ table: string; rows: Record<string, unknown>[]; onConflict?: string }> = [
    { table: 'salons', rows: [db.salon as unknown as Record<string, unknown>] },
    { table: 'salon_settings', rows: [db.settings as unknown as Record<string, unknown>], onConflict: 'salon_id' },
    { table: 'staff', rows: db.staff as unknown as Record<string, unknown>[] },
    { table: 'services', rows: db.services as unknown as Record<string, unknown>[] },
    { table: 'time_slots', rows: db.timeSlots as unknown as Record<string, unknown>[], onConflict: 'salon_id,slot_time' },
    { table: 'customers', rows: db.customers as unknown as Record<string, unknown>[], onConflict: 'salon_id,phone' },
    {
      table: 'bookings',
      rows: db.bookings.map((b) => {
        const clean = { ...b } as Record<string, unknown>;
        delete clean.services;
        return clean;
      }),
    },
    { table: 'booking_services', rows: db.bookingServices as unknown as Record<string, unknown>[] },
    { table: 'payments', rows: db.payments as unknown as Record<string, unknown>[] },
    { table: 'customer_dues', rows: db.customerDues as unknown as Record<string, unknown>[] },
    { table: 'expenses', rows: db.expenses as unknown as Record<string, unknown>[] },
    { table: 'commissions', rows: db.commissions as unknown as Record<string, unknown>[] },
    { table: 'attendance', rows: db.attendance as unknown as Record<string, unknown>[], onConflict: 'salon_id,staff_id,attendance_date' },
    { table: 'customer_service_history', rows: db.serviceHistory as unknown as Record<string, unknown>[] },
    { table: 'notifications', rows: db.notifications as unknown as Record<string, unknown>[] },
  ];

  const syncedCounts: Record<string, number> = {};
  const warnings: string[] = [];

  for (const step of syncSteps) {
    if (step.rows.length === 0) {
      syncedCounts[step.table] = 0;
      continue;
    }
    const { error } = await supabaseAdmin
      .from(step.table)
      .upsert(step.rows, step.onConflict ? { onConflict: step.onConflict } : undefined);
    if (error) {
      warnings.push(`${step.table}: ${error.message}`);
    } else {
      syncedCounts[step.table] = step.rows.length;
    }
  }
  return { syncedCounts, warnings };
}

async function hydrateOrSeedSupabaseOnStartup(): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data: salonsData, error } = await supabaseAdmin.from('salons').select('*').limit(1);
    if (error) {
      console.warn('[Supabase Startup] Schema check failed:', error.message);
      return;
    }
    if (!salonsData || salonsData.length === 0) {
      console.log('[Supabase Startup] Empty database detected — seeding initial salon data to Supabase...');
      const { warnings } = await syncAllTablesToSupabase();
      if (warnings.length > 0) {
        console.warn('[Supabase Startup] Seed warnings:', warnings);
      } else {
        console.log('[Supabase Startup] Initial seed synced to Supabase PostgreSQL!');
      }
      return;
    }

    // Hydrate from Supabase PostgreSQL as primary source of truth
    const salonRow = salonsData[0] as Salon;
    const [
      settingsRes,
      staffRes,
      servicesRes,
      slotsRes,
      customersRes,
      bookingsRes,
      bookingServicesRes,
      paymentsRes,
      duesRes,
      expensesRes,
      commissionsRes,
      attendanceRes,
      historyRes,
      notificationsRes,
    ] = await Promise.all([
      supabaseAdmin.from('salon_settings').select('*').eq('salon_id', salonRow.id).limit(1),
      supabaseAdmin.from('staff').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('services').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('time_slots').select('*').eq('salon_id', salonRow.id).order('slot_time'),
      supabaseAdmin.from('customers').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('bookings').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('booking_services').select('*'),
      supabaseAdmin.from('payments').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('customer_dues').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('expenses').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('commissions').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('attendance').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('customer_service_history').select('*').eq('salon_id', salonRow.id),
      supabaseAdmin.from('notifications').select('*').eq('salon_id', salonRow.id).order('created_at', { ascending: false }).limit(100),
    ]);

    db.salon = salonRow;
    if (settingsRes.data && settingsRes.data[0]) {
      db.settings = {
        ...db.settings,
        ...(settingsRes.data[0] as SalonSettings),
      };
    }
    if (staffRes.data && staffRes.data.length > 0) db.staff = staffRes.data as StaffMember[];
    if (servicesRes.data && servicesRes.data.length > 0) db.services = servicesRes.data as ServiceItem[];
    if (slotsRes.data && slotsRes.data.length > 0) db.timeSlots = slotsRes.data as TimeSlot[];
    if (customersRes.data) db.customers = customersRes.data as Customer[];
    if (bookingsRes.data) db.bookings = bookingsRes.data as Booking[];
    if (bookingServicesRes.data) db.bookingServices = bookingServicesRes.data as BookingServiceItem[];
    if (paymentsRes.data) db.payments = paymentsRes.data as Payment[];
    if (duesRes.data) db.customerDues = duesRes.data as CustomerDueEntry[];
    if (expensesRes.data) db.expenses = expensesRes.data as Expense[];
    if (commissionsRes.data) db.commissions = commissionsRes.data as Commission[];
    if (attendanceRes.data) db.attendance = attendanceRes.data as AttendanceRecord[];
    if (historyRes.data) db.serviceHistory = historyRes.data as CustomerServiceHistory[];
    if (notificationsRes.data) db.notifications = notificationsRes.data as NotificationItem[];

    // Try hydrating salon_auth_state if configured in Supabase
    let hydratedAuth = false;
    try {
      const authRes = await supabaseAdmin
        .from('salon_auth_state')
        .select('*')
        .eq('salon_id', salonRow.id)
        .limit(1);
      if (!authRes.error && authRes.data && authRes.data[0]) {
        const row = authRes.data[0] as {
          reception_accounts?: ReceptionAccount[];
          security_pins?: SecurityPinsStore;
        };
        if (Array.isArray(row.reception_accounts)) {
          db.receptionAccounts = row.reception_accounts;
        }
        if (row.security_pins && row.security_pins.ownerPinHash) {
          db.securityPins = {
            ...db.securityPins,
            ...row.security_pins,
          };
          hydratedAuth = true;
        }
      }
    } catch {
      // Optional table
    }

    // Preserve continuity for an already-seeded existing salon whose local file was cleared
    if (!hydratedAuth && !db.securityPins.ownerPinHash) {
      db.securityPins.ownerClaimed = true;
      db.securityPins.ownerPinHash = hashPin('1234');
      db.securityPins.isDefaultOwnerPin = true;
    } else if (db.securityPins.ownerPinHash) {
      db.securityPins.ownerClaimed = true;
    }

    saveDatabase();
    console.log(`[Supabase Startup] Hydrated live data from Supabase (${db.salon.name}).`);
  } catch (err) {
    console.warn('[Supabase Startup] Hydration fallback to local replica:', err);
  }
}

function isAllowedCorsOrigin(origin: string, reqHost?: string): boolean {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (origin === 'capacitor://localhost') return true;
  try {
    const parsed = new URL(origin);
    if (reqHost && parsed.host === reqHost) return true;
    if (parsed.hostname.endsWith('.run.app')) return true;
    const extraAllowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (extraAllowed.includes(origin)) return true;
  } catch {
    return false;
  }
  return false;
}

async function startServer() {
  void hydrateOrSeedSupabaseOnStartup().then(() => {
    broadcastRealtimeUpdate('HYDRATED');
  });
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const app = express();
  app.set('trust proxy', true);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedCorsOrigin(origin, req.headers.host)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '4mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Realtime SSE endpoint
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Get SQL Schema for Supabase SQL Editor (Owner only)
  app.get('/api/supabase-schema', (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    try {
      const sql = fs.existsSync(SCHEMA_FILE) ? fs.readFileSync(SCHEMA_FILE, 'utf-8') : '';
      res.json({ sql, supabaseConnected: isSupabaseConfigured });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Test Supabase SQL Connection & Sync Local Relational Store to Supabase PostgreSQL (Owner only)
  app.post('/api/supabase/test-and-sync', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    if (!isSupabaseConfigured || !supabaseAdmin) {
      res.status(400).json({
        connected: false,
        error:
          'Supabase environment variables (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY) are not configured yet.',
      });
      return;
    }

    try {
      const probe = await supabaseAdmin.from('salons').select('id').limit(1);
      if (probe.error) {
        res.status(400).json({
          connected: false,
          schemaMissing: true,
          error: `Supabase connected, but SQL tables are missing or inaccessible: ${probe.error.message}. Run /supabase/schema.sql in your Supabase SQL Editor first.`,
        });
        return;
      }

      const { syncedCounts, warnings } = await syncAllTablesToSupabase();
      await syncAuthStateToSupabase();

      res.json({
        connected: true,
        syncedCounts,
        warnings,
        message:
          warnings.length === 0
            ? 'Supabase PostgreSQL connection verified and all tables synced successfully!'
            : 'Supabase connected with some table warnings (check schema.sql columns).',
      });
    } catch (err) {
      res.status(500).json({
        connected: false,
        error: String(err),
      });
    }
  });

  // Role-Scoped Zero-Leak Bootstrap Endpoint
  app.get('/api/bootstrap', async (req: Request, res: Response) => {
    const session = verifyPortalToken(req);
    const authRole: UserRole | 'NONE' = session ? session.role : 'NONE';

    const bookingsWithServices: Booking[] = db.bookings.map((b) => ({
      ...b,
      reference_code:
        b.reference_code ||
        `SB-${b.booking_date.slice(5).replace('-', '')}-${String(b.token_number).padStart(3, '0')}`,
      services: db.bookingServices.filter((bs) => bs.booking_id === b.id),
    }));

    const basePayload = {
      supabaseConnected: isSupabaseConfigured,
      supabaseUrlConfigured: Boolean(SUPABASE_URL),
      storageMode: (isSupabaseConfigured ? 'SUPABASE_POSTGRES' : 'LOCAL_POSTGRES_REPLICA') as
        | 'SUPABASE_POSTGRES'
        | 'LOCAL_POSTGRES_REPLICA',
      authRole,
      needsOwnerSetup: !db.securityPins.ownerClaimed,
      isDefaultOwnerPin: session?.role === 'OWNER' ? Boolean(db.securityPins.isDefaultOwnerPin) : false,
      salon: db.salon,
      settings: db.settings,
      services: db.services,
      timeSlots: db.timeSlots,
    };

    if (session?.role === 'OWNER') {
      res.json({
        ...basePayload,
        staff: db.staff.map((s) => ({
          ...s,
          has_pin: Boolean(db.securityPins.staffPinHashes[s.id]),
        })),
        receptionAccounts: db.receptionAccounts.map((r) => ({
          ...r,
          has_pin: Boolean(db.securityPins.receptionPinHashes[r.id]),
        })),
        customers: db.customers.map((c) => ({
          ...c,
          is_registered: Boolean(db.securityPins.customerPinHashes[c.id]),
        })),
        bookings: bookingsWithServices,
        payments: db.payments,
        customerDues: db.customerDues,
        expenses: db.expenses,
        commissions: db.commissions,
        attendance: db.attendance,
        serviceHistory: db.serviceHistory,
        notifications: db.notifications,
      });
      return;
    }

    if (session?.role === 'RECEPTION') {
      res.json({
        ...basePayload,
        staff: db.staff.map((s) => ({ ...s, commission_pct: 0 })),
        receptionAccounts: [],
        customers: db.customers.map((c) => ({
          ...c,
          is_registered: Boolean(db.securityPins.customerPinHashes[c.id]),
        })),
        bookings: bookingsWithServices,
        payments: db.payments,
        customerDues: db.customerDues,
        expenses: [],
        commissions: [],
        attendance: db.attendance,
        serviceHistory: db.serviceHistory,
        notifications: db.notifications.filter(
          (n) => n.recipient_role === 'OWNER' || n.recipient_role === 'RECEPTION'
        ),
      });
      return;
    }

    if (session?.role === 'STAFF' && session.staffId) {
      const todayStr = getTodayDateString();
      res.json({
        ...basePayload,
        staff: db.staff
          .filter((s) => s.is_active)
          .map((s) => ({
            ...s,
            commission_pct: s.id === session.staffId ? s.commission_pct : 0,
          })),
        receptionAccounts: [],
        customers: db.customers.map((c) => ({
          ...c,
          total_spent: 0,
          outstanding_due: 0,
        })),
        bookings: bookingsWithServices.filter(
          (b) => b.barber_id === session.staffId || b.booking_date === todayStr
        ),
        payments: [],
        customerDues: [],
        expenses: [],
        commissions: db.commissions.filter((c) => c.staff_id === session.staffId),
        attendance: db.attendance.filter((a) => a.staff_id === session.staffId),
        serviceHistory: db.serviceHistory,
        notifications: db.notifications.filter(
          (n) => n.recipient_role === 'STAFF' && n.recipient_phone === session.phone
        ),
      });
      return;
    }

    if (session?.role === 'CUSTOMER' && session.phone) {
      const myPhone = normalizePhone10(session.phone);
      const myCustomer = db.customers.find((c) => normalizePhone10(c.phone) === myPhone);
      const scopedBookings: Booking[] = bookingsWithServices.map((b) => {
        const isMine = normalizePhone10(b.customer_phone) === myPhone;
        if (isMine) return b;
        return {
          ...b,
          customer_name: 'Booked',
          customer_phone: '',
          notes: '',
          total_amount: 0,
          services: [],
          reference_code: undefined,
        };
      });

      res.json({
        ...basePayload,
        staff: db.staff
          .filter((s) => s.is_active)
          .map((s) => ({ ...s, commission_pct: 0 })),
        receptionAccounts: [],
        customers: myCustomer ? [{ ...myCustomer, is_registered: true }] : [],
        bookings: scopedBookings,
        payments: [],
        customerDues: [],
        expenses: [],
        commissions: [],
        attendance: [],
        serviceHistory: myCustomer
          ? db.serviceHistory.filter((h) => h.customer_id === myCustomer.id)
          : [],
        notifications: db.notifications.filter(
          (n) => n.recipient_role === 'CUSTOMER' && normalizePhone10(n.recipient_phone) === myPhone
        ),
      });
      return;
    }

    // Unauthenticated public visitor: ZERO PII, ZERO financial metrics, anonymized queue slots only
    const anonymizedBookings: Booking[] = bookingsWithServices
      .filter((b) => b.status !== 'CANCELLED')
      .map((b) => ({
        ...b,
        customer_name: 'Booked',
        customer_phone: '',
        notes: '',
        total_amount: 0,
        services: [],
        reference_code: undefined,
      }));

    res.json({
      ...basePayload,
      staff: db.staff
        .filter((s) => s.is_active)
        .map((s) => ({ ...s, commission_pct: 0 })),
      receptionAccounts: [],
      customers: [],
      bookings: anonymizedBookings,
      payments: [],
      customerDues: [],
      expenses: [],
      commissions: [],
      attendance: [],
      serviceHistory: [],
      notifications: [],
    });
  });

  // 1. Update Owner / Staff Live Availability Status
  app.patch('/api/staff/:id/availability', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['OWNER', 'RECEPTION', 'STAFF']);
    if (!session) return;
    const { id } = req.params;
    if (session.role === 'STAFF' && session.staffId !== id) {
      res.status(403).json({ error: 'Aap sirf apni chair ka status badal sakte hain.' });
      return;
    }
    const { availability_status } = req.body as { availability_status: AvailabilityStatus };
    const validStatuses: AvailabilityStatus[] = ['Available', 'Busy', 'Break', 'Not Available'];
    if (!validStatuses.includes(availability_status)) {
      res.status(400).json({ error: 'Invalid availability status' });
      return;
    }

    const member = db.staff.find((s) => s.id === id);
    if (!member) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }

    member.availability_status = availability_status;
    member.updated_at = new Date().toISOString();

    if (member.is_owner) {
      db.settings.owner_availability = availability_status;
      db.settings.updated_at = member.updated_at;
      await syncTableRowToSupabase('salon_settings', db.settings as unknown as Record<string, unknown>, 'salon_id');
    }

    saveDatabase();
    await syncTableRowToSupabase('staff', member as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('AVAILABILITY_UPDATED');
    res.json({ staff: member, settings: db.settings });
  });

  // 2. Staff Management: Add, Edit, Delete/Deactivate Staff + Individual Staff PIN (Owner protected)
  app.post('/api/staff', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { name, phone, specialty, commission_pct, is_owner, pin } = req.body;
    const cleanPhone = normalizePhone10(phone);
    const cleanPin = String(pin || '').trim();
    if (!name || String(name).trim().length < 2) {
      res.status(400).json({ error: 'Staff ka sahi naam daalein.' });
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) daalein.' });
      return;
    }
    if (!isValidPin(cleanPin)) {
      res.status(400).json({ error: 'Staff login ke liye 4 se 6 digit ka Secret PIN set karein.' });
      return;
    }
    const duplicate = db.staff.find((s) => s.is_active && normalizePhone10(s.phone) === cleanPhone);
    if (duplicate) {
      res.status(409).json({ error: `Yeh mobile number pehle se ${duplicate.name} ke liye registered hai.` });
      return;
    }

    const now = new Date().toISOString();
    const newStaff: StaffMember = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      name: String(name).trim(),
      phone: cleanPhone,
      specialty: String(specialty || 'Senior Barber').trim(),
      is_owner: Boolean(is_owner),
      commission_pct: Math.min(100, Math.max(0, Number(commission_pct ?? 40))),
      availability_status: 'Available',
      is_active: true,
      joined_date: getTodayDateString(),
      created_at: now,
      updated_at: now,
    };

    db.staff.push(newStaff);
    db.securityPins.staffPinHashes[newStaff.id] = hashPin(cleanPin);
    saveDatabase();
    await syncTableRowToSupabase('staff', newStaff as unknown as Record<string, unknown>);
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('STAFF_UPDATED');
    res.status(201).json({ staff: { ...newStaff, has_pin: true } });
  });

  app.put('/api/staff/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const member = db.staff.find((s) => s.id === id);
    if (!member) {
      res.status(404).json({ error: 'Staff member not found.' });
      return;
    }

    const { name, phone, specialty, commission_pct, is_active, availability_status, pin } = req.body;
    if (name !== undefined && String(name).trim()) member.name = String(name).trim();
    if (phone !== undefined) {
      const cleanPhone = normalizePhone10(phone);
      if (!isValidIndianMobile(cleanPhone)) {
        res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) daalein.' });
        return;
      }
      const duplicate = db.staff.find(
        (s) => s.id !== id && s.is_active && normalizePhone10(s.phone) === cleanPhone
      );
      if (duplicate) {
        res.status(409).json({ error: `Yeh mobile number pehle se ${duplicate.name} ke paas hai.` });
        return;
      }
      member.phone = cleanPhone;
      if (member.is_owner) {
        db.salon.phone = cleanPhone;
        db.salon.updated_at = new Date().toISOString();
        await syncTableRowToSupabase('salons', db.salon as unknown as Record<string, unknown>);
      }
    }
    if (pin !== undefined && String(pin).trim() !== '') {
      const cleanPin = String(pin).trim();
      if (!isValidPin(cleanPin)) {
        res.status(400).json({ error: 'Staff PIN 4 se 6 digits ka number hona chahiye.' });
        return;
      }
      db.securityPins.staffPinHashes[member.id] = hashPin(cleanPin);
    }
    if (specialty !== undefined) member.specialty = String(specialty).trim();
    if (commission_pct !== undefined) {
      const pct = Number(commission_pct);
      if (pct < 0 || pct > 100) {
        res.status(400).json({ error: 'Commission percentage must be between 0 and 100.' });
        return;
      }
      member.commission_pct = pct;
    }
    if (is_active !== undefined) {
      if (member.is_owner && !is_active) {
        res.status(400).json({ error: 'Salon Owner account cannot be deactivated.' });
        return;
      }
      member.is_active = Boolean(is_active);
    }
    if (availability_status !== undefined) {
      member.availability_status = availability_status;
      if (member.is_owner) {
        db.settings.owner_availability = availability_status;
      }
    }
    member.updated_at = new Date().toISOString();

    saveDatabase();
    await syncTableRowToSupabase('staff', member as unknown as Record<string, unknown>);
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('STAFF_UPDATED');
    res.json({ staff: { ...member, has_pin: Boolean(db.securityPins.staffPinHashes[member.id]) } });
  });

  app.delete('/api/staff/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const idx = db.staff.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Staff member not found.' });
      return;
    }
    const member = db.staff[idx];
    if (member.is_owner) {
      res.status(400).json({ error: 'Salon Owner ko delete nahi kiya ja sakta.' });
      return;
    }
    const hasHistory =
      db.bookings.some((b) => b.barber_id === id) ||
      db.commissions.some((c) => c.staff_id === id);
    if (hasHistory) {
      member.is_active = false;
      member.updated_at = new Date().toISOString();
      delete db.securityPins.staffPinHashes[id];
      saveDatabase();
      await syncTableRowToSupabase('staff', member as unknown as Record<string, unknown>);
      await syncAuthStateToSupabase();
      broadcastRealtimeUpdate('STAFF_UPDATED');
      res.json({ deactivated: true, message: 'Staff history safe rakhne ke liye deactivate kar diya gaya.' });
      return;
    }
    db.staff.splice(idx, 1);
    delete db.securityPins.staffPinHashes[id];
    saveDatabase();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('staff').delete().eq('id', id);
      } catch {
        // Ignore if linked
      }
    }
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('STAFF_UPDATED');
    res.json({ deleted: true });
  });

  // 2B. Reception Counter Login Accounts (Created & Managed Exclusively by Malik/Owner)
  app.post('/api/reception-accounts', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const cleanName = String(req.body?.name || '').trim();
    const cleanPhone = normalizePhone10(req.body?.phone);
    const cleanPin = String(req.body?.pin || '').trim();

    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Receptionist ka naam daalein (kam se kam 2 akshar).' });
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) daalein.' });
      return;
    }
    if (!isValidPin(cleanPin)) {
      res.status(400).json({ error: 'Reception login ke liye 4 se 6 digit ka Secret PIN set karein.' });
      return;
    }
    const duplicate = db.receptionAccounts.find(
      (r) => normalizePhone10(r.phone) === cleanPhone
    );
    if (duplicate) {
      res.status(409).json({ error: `Yeh mobile number pehle se Reception account (${duplicate.name}) me hai.` });
      return;
    }

    const now = new Date().toISOString();
    const account: ReceptionAccount = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      name: cleanName,
      phone: cleanPhone,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    db.receptionAccounts.push(account);
    db.securityPins.receptionPinHashes[account.id] = hashPin(cleanPin);
    saveDatabase();
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('RECEPTION_UPDATED');
    res.status(201).json({ receptionAccount: { ...account, has_pin: true } });
  });

  app.put('/api/reception-accounts/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const acc = db.receptionAccounts.find((r) => r.id === req.params.id);
    if (!acc) {
      res.status(404).json({ error: 'Reception account not found.' });
      return;
    }
    const { name, phone, pin, is_active } = req.body;
    if (name !== undefined && String(name).trim().length >= 2) {
      acc.name = String(name).trim();
    }
    if (phone !== undefined) {
      const cleanPhone = normalizePhone10(phone);
      if (!isValidIndianMobile(cleanPhone)) {
        res.status(400).json({ error: 'Valid 10-digit Indian mobile number daalein.' });
        return;
      }
      const dup = db.receptionAccounts.find(
        (r) => r.id !== acc.id && normalizePhone10(r.phone) === cleanPhone
      );
      if (dup) {
        res.status(409).json({ error: `Yeh mobile number pehle se ${dup.name} ke paas hai.` });
        return;
      }
      acc.phone = cleanPhone;
    }
    if (pin !== undefined && String(pin).trim() !== '') {
      const cleanPin = String(pin).trim();
      if (!isValidPin(cleanPin)) {
        res.status(400).json({ error: 'Reception PIN 4 se 6 digits ka hona chahiye.' });
        return;
      }
      db.securityPins.receptionPinHashes[acc.id] = hashPin(cleanPin);
    }
    if (is_active !== undefined) {
      acc.is_active = Boolean(is_active);
    }
    acc.updated_at = new Date().toISOString();
    saveDatabase();
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('RECEPTION_UPDATED');
    res.json({
      receptionAccount: {
        ...acc,
        has_pin: Boolean(db.securityPins.receptionPinHashes[acc.id]),
      },
    });
  });

  app.delete('/api/reception-accounts/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const idx = db.receptionAccounts.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Reception account not found.' });
      return;
    }
    const [removed] = db.receptionAccounts.splice(idx, 1);
    delete db.securityPins.receptionPinHashes[removed.id];
    saveDatabase();
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('RECEPTION_UPDATED');
    res.json({ deleted: true });
  });

  // 3. Attendance Management
  app.post('/api/attendance', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['OWNER', 'RECEPTION', 'STAFF']);
    if (!session) return;
    const { staff_id, attendance_date, status, check_in_time, check_out_time } = req.body;
    if (session.role === 'STAFF' && session.staffId !== staff_id) {
      res.status(403).json({ error: 'Aap sirf apni attendance mark kar sakte hain.' });
      return;
    }
    const member = db.staff.find((s) => s.id === staff_id);
    if (!member) {
      res.status(404).json({ error: 'Staff member not found.' });
      return;
    }
    const dateStr = attendance_date || getTodayDateString();
    let record = db.attendance.find((a) => a.staff_id === staff_id && a.attendance_date === dateStr);
    if (record) {
      record.status = status || record.status;
      if (check_in_time !== undefined) record.check_in_time = check_in_time;
      if (check_out_time !== undefined) record.check_out_time = check_out_time;
    } else {
      record = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        staff_id: member.id,
        staff_name: member.name,
        attendance_date: dateStr,
        status: status || 'PRESENT',
        check_in_time: check_in_time || new Date().toTimeString().slice(0, 5),
        check_out_time: check_out_time || undefined,
        created_at: new Date().toISOString(),
      };
      db.attendance.push(record);
    }
    saveDatabase();
    await syncTableRowToSupabase('attendance', record as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('ATTENDANCE_UPDATED');
    res.json({ attendance: record });
  });

  // 4. Services Management: Add, Edit, Deactivate Services (Owner protected)
  app.post('/api/services', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { name, name_hi, category, price, duration_minutes } = req.body;
    if (!name || price === undefined || Number(price) < 0) {
      res.status(400).json({ error: 'Valid service name and price are required.' });
      return;
    }
    const now = new Date().toISOString();
    const service: ServiceItem = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      name: String(name).trim(),
      name_hi: String(name_hi || name).trim(),
      category: String(category || 'General').trim(),
      price: Number(price),
      duration_minutes: Number(duration_minutes || 30),
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    db.services.push(service);
    saveDatabase();
    await syncTableRowToSupabase('services', service as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('SERVICES_UPDATED');
    res.status(201).json({ service });
  });

  app.put('/api/services/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const service = db.services.find((s) => s.id === id);
    if (!service) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }
    const { name, name_hi, category, price, duration_minutes, is_active } = req.body;
    if (name !== undefined) service.name = String(name).trim();
    if (name_hi !== undefined) service.name_hi = String(name_hi).trim();
    if (category !== undefined) service.category = String(category).trim();
    if (price !== undefined) service.price = Math.max(0, Number(price));
    if (duration_minutes !== undefined) service.duration_minutes = Math.max(5, Number(duration_minutes));
    if (is_active !== undefined) service.is_active = Boolean(is_active);
    service.updated_at = new Date().toISOString();

    saveDatabase();
    await syncTableRowToSupabase('services', service as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('SERVICES_UPDATED');
    res.json({ service });
  });

  app.delete('/api/services/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const idx = db.services.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }
    const isUsedInHistory = db.bookingServices.some((bs) => bs.service_id === id);
    if (isUsedInHistory) {
      db.services[idx].is_active = false;
      db.services[idx].updated_at = new Date().toISOString();
      saveDatabase();
      await syncTableRowToSupabase('services', db.services[idx] as unknown as Record<string, unknown>);
      broadcastRealtimeUpdate('SERVICES_UPDATED');
      res.json({ deactivated: true, message: 'Service had past bookings, so it was safely deactivated.' });
      return;
    }
    db.services.splice(idx, 1);
    saveDatabase();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('services').delete().eq('id', id);
      } catch {
        // Ignore if linked
      }
    }
    broadcastRealtimeUpdate('SERVICES_UPDATED');
    res.json({ deleted: true });
  });

  // 4A. First-Time Commercial Owner Setup (only works before ownerClaimed = true)
  app.post('/api/auth/setup-owner', async (req: Request, res: Response) => {
    if (db.securityPins.ownerClaimed) {
      res.status(403).json({ error: 'Salon Malik pehle se setup ho chuka hai. Registered mobile aur PIN se login karein.' });
      return;
    }
    const salonName = String(req.body?.salonName || '').trim();
    const ownerName = String(req.body?.ownerName || '').trim();
    const cleanPhone = normalizePhone10(req.body?.phone);
    const pin = String(req.body?.pin || '').trim();

    if (salonName.length < 2 || ownerName.length < 2) {
      res.status(400).json({ error: 'Salon ka naam aur Malik ka naam daalein.' });
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) daalein.' });
      return;
    }
    if (!isValidPin(pin)) {
      res.status(400).json({ error: '4 se 6 digit ka Secret PIN daalein.' });
      return;
    }
    if (['1234', '0000', '1111', '2222', '9999'].includes(pin)) {
      res.status(400).json({ error: 'Safety ke liye aasan PIN (jaise 1234/0000) na rakhein, apna alag PIN chunein.' });
      return;
    }

    const now = new Date().toISOString();
    db.salon.name = salonName;
    db.salon.phone = cleanPhone;
    db.salon.updated_at = now;
    db.settings.upi_merchant_name = salonName;
    db.settings.updated_at = now;

    const ownerStaff = db.staff.find((s) => s.is_owner);
    if (ownerStaff) {
      ownerStaff.name = ownerName;
      ownerStaff.phone = cleanPhone;
      ownerStaff.updated_at = now;
      await syncTableRowToSupabase('staff', ownerStaff as unknown as Record<string, unknown>);
    }

    db.securityPins.ownerPinHash = hashPin(pin);
    db.securityPins.ownerClaimed = true;
    db.securityPins.isDefaultOwnerPin = false;

    saveDatabase();
    await syncTableRowToSupabase('salons', db.salon as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('salon_settings', db.settings as unknown as Record<string, unknown>, 'salon_id');
    await syncAuthStateToSupabase();

    const token = signPortalToken({
      role: 'OWNER',
      staffId: ownerStaff?.id || null,
      receptionId: null,
      customerId: null,
      phone: cleanPhone,
    });
    res.status(201).json({ verified: true, role: 'OWNER', token });
  });

  // 4B. Strict Role-Separated Phone + PIN Login (OWNER, RECEPTION, STAFF)
  app.post('/api/auth/verify-pin', (req: Request, res: Response) => {
    const rawRole = String(req.body?.role || 'OWNER').toUpperCase();
    const role: 'OWNER' | 'RECEPTION' | 'STAFF' =
      rawRole === 'STAFF' ? 'STAFF' : rawRole === 'RECEPTION' ? 'RECEPTION' : 'OWNER';
    const pin = String(req.body?.pin || '').trim();
    const cleanPhone = normalizePhone10(req.body?.phone);
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const lockKey = `${clientIp}:${role}`;
    const now = Date.now();

    if (!checkLoginLock(lockKey, res)) return;

    if (!isValidIndianMobile(cleanPhone) || !isValidPin(pin)) {
      res.status(400).json({
        verified: false,
        error: '10-digit registered Indian mobile number aur 4-6 digit PIN zaroori hai.',
      });
      return;
    }

    if (!db.securityPins.ownerClaimed) {
      res.status(403).json({
        verified: false,
        needsOwnerSetup: true,
        error: 'Pehle Malik ka naya account setup karein.',
      });
      return;
    }

    if (role === 'OWNER') {
      const ownerPhones = new Set<string>();
      const salonPhone10 = normalizePhone10(db.salon.phone);
      if (isValidIndianMobile(salonPhone10)) ownerPhones.add(salonPhone10);
      db.staff.forEach((s) => {
        if (s.is_active && s.is_owner) {
          const p = normalizePhone10(s.phone);
          if (isValidIndianMobile(p)) ownerPhones.add(p);
        }
      });

      const phoneOk = ownerPhones.has(cleanPhone);
      const pinOk = verifyPinHash(pin, db.securityPins.ownerPinHash);
      if (!phoneOk || !pinOk) {
        recordFailedLoginAttempt(lockKey, now);
        res.status(401).json({
          verified: false,
          error: 'Malik ka registered mobile number ya PIN galat hai.',
        });
        return;
      }

      failedPinAttempts.delete(lockKey);
      const ownerStaff = db.staff.find((s) => s.is_active && s.is_owner);
      const token = signPortalToken({
        role: 'OWNER',
        staffId: ownerStaff?.id || null,
        receptionId: null,
        customerId: null,
        phone: cleanPhone,
      });
      res.json({ verified: true, role: 'OWNER', token });
      return;
    }

    if (role === 'RECEPTION') {
      const matchedReception = db.receptionAccounts.find(
        (r) => r.is_active && normalizePhone10(r.phone) === cleanPhone
      );
      const storedHash = matchedReception
        ? db.securityPins.receptionPinHashes[matchedReception.id] || ''
        : '';
      if (!matchedReception || !verifyPinHash(pin, storedHash)) {
        recordFailedLoginAttempt(lockKey, now);
        res.status(401).json({
          verified: false,
          error: 'Receptionist ka mobile number ya PIN galat hai. Malik → Staff tab se account banwayein.',
        });
        return;
      }

      failedPinAttempts.delete(lockKey);
      const token = signPortalToken({
        role: 'RECEPTION',
        staffId: null,
        receptionId: matchedReception.id,
        customerId: null,
        phone: cleanPhone,
      });
      res.json({
        verified: true,
        role: 'RECEPTION',
        receptionId: matchedReception.id,
        receptionName: matchedReception.name,
        token,
      });
      return;
    }

    // Strict STAFF login: non-owner active staff only + individual hashed PIN
    const matchedStaff = db.staff.find(
      (s) => s.is_active && !s.is_owner && normalizePhone10(s.phone) === cleanPhone
    );
    const staffHash = matchedStaff ? db.securityPins.staffPinHashes[matchedStaff.id] || '' : '';
    if (!matchedStaff || !verifyPinHash(pin, staffHash)) {
      recordFailedLoginAttempt(lockKey, now);
      res.status(401).json({
        verified: false,
        error: 'Staff ka mobile number ya personal PIN galat hai.',
      });
      return;
    }

    failedPinAttempts.delete(lockKey);
    const token = signPortalToken({
      role: 'STAFF',
      staffId: matchedStaff.id,
      receptionId: null,
      customerId: null,
      phone: cleanPhone,
    });
    res.json({
      verified: true,
      role: 'STAFF',
      staffId: matchedStaff.id,
      staffName: matchedStaff.name,
      token,
    });
  });

  // Update Malik PIN (Owner only)
  app.put('/api/auth/pins', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const rawOwnerPin = req.body?.ownerPin ?? req.body?.new_owner_pin;
    const cleanOwner = String(rawOwnerPin || '').trim();
    if (!isValidPin(cleanOwner)) {
      res.status(400).json({ error: 'Malik PIN 4 se 6 digits ka number hona chahiye.' });
      return;
    }
    if (['1234', '0000', '1111', '2222', '9999'].includes(cleanOwner)) {
      res.status(400).json({ error: 'Safety ke liye aasan PIN (jaise 1234/0000) na rakhein.' });
      return;
    }

    db.securityPins.ownerPinHash = hashPin(cleanOwner);
    db.securityPins.isDefaultOwnerPin = false;
    db.securityPins.ownerClaimed = true;
    saveDatabase();
    await syncAuthStateToSupabase();
    res.json({ updated: true });
  });

  // 4C. Customer Self-Registration, Login & PIN Management
  app.post('/api/auth/customer/register', async (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(`cust_reg:${clientIp}`, 10, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Bahut zyada koshish hui. Kuch der baad try karein.' });
      return;
    }

    const cleanName = String(req.body?.name || '').trim();
    const cleanPhone = normalizePhone10(req.body?.phone);
    const cleanPin = String(req.body?.pin || '').trim();

    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Apna sahi naam daalein (kam se kam 2 akshar).' });
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) daalein.' });
      return;
    }
    if (!isValidPin(cleanPin)) {
      res.status(400).json({ error: '4 se 6 digit ka Secret PIN banayein.' });
      return;
    }

    const now = new Date().toISOString();
    let customer = db.customers.find((c) => normalizePhone10(c.phone) === cleanPhone);
    if (customer && db.securityPins.customerPinHashes[customer.id]) {
      res.status(409).json({
        error: 'Is mobile number par account pehle se bana hai. Kripya Login karein.',
      });
      return;
    }

    if (!customer) {
      customer = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
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
      db.customers.push(customer);
    } else {
      customer.name = cleanName;
      customer.updated_at = now;
    }

    db.securityPins.customerPinHashes[customer.id] = hashPin(cleanPin);

    const ownerNote: NotificationItem = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      recipient_role: 'OWNER',
      title: `Naya Customer Register · ${customer.name}`,
      message: `${customer.name} (+91 ${cleanPhone}) ne Customer App par apna account banaya hai.`,
      is_read: false,
      created_at: now,
    };
    db.notifications.unshift(ownerNote);

    saveDatabase();
    await syncTableRowToSupabase('customers', customer as unknown as Record<string, unknown>, 'salon_id,phone');
    await syncTableRowToSupabase('notifications', ownerNote as unknown as Record<string, unknown>);
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('CUSTOMER_UPDATED');

    const token = signPortalToken({
      role: 'CUSTOMER',
      staffId: null,
      receptionId: null,
      customerId: customer.id,
      phone: cleanPhone,
    });
    res.status(201).json({
      verified: true,
      role: 'CUSTOMER',
      customer: { ...customer, is_registered: true },
      token,
    });
  });

  app.post('/api/auth/customer/login', (req: Request, res: Response) => {
    const cleanPhone = normalizePhone10(req.body?.phone);
    const cleanPin = String(req.body?.pin || '').trim();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const lockKey = `${clientIp}:CUSTOMER:${cleanPhone}`;
    const now = Date.now();

    if (!checkLoginLock(lockKey, res)) return;

    if (!isValidIndianMobile(cleanPhone) || !isValidPin(cleanPin)) {
      res.status(400).json({
        verified: false,
        error: '10-digit Indian mobile number aur 4-6 digit PIN daalein.',
      });
      return;
    }

    const customer = db.customers.find((c) => normalizePhone10(c.phone) === cleanPhone);
    if (!customer || !db.securityPins.customerPinHashes[customer.id]) {
      recordFailedLoginAttempt(lockKey, now);
      res.status(401).json({
        verified: false,
        needsRegister: true,
        error: 'Is number ka account abhi nahi bana hai. "Naya Account Banayein" chunein.',
      });
      return;
    }

    if (!verifyPinHash(cleanPin, db.securityPins.customerPinHashes[customer.id])) {
      recordFailedLoginAttempt(lockKey, now);
      res.status(401).json({
        verified: false,
        error: 'Mobile number ya PIN galat hai.',
      });
      return;
    }

    failedPinAttempts.delete(lockKey);
    const token = signPortalToken({
      role: 'CUSTOMER',
      staffId: null,
      receptionId: null,
      customerId: customer.id,
      phone: cleanPhone,
    });
    res.json({
      verified: true,
      role: 'CUSTOMER',
      customer: { ...customer, is_registered: true },
      token,
    });
  });

  app.put('/api/auth/customer/pin', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['CUSTOMER']);
    if (!session || !session.customerId) return;
    const currentPin = String(req.body?.current_pin || '').trim();
    const newPin = String(req.body?.new_pin || '').trim();
    if (!isValidPin(currentPin) || !isValidPin(newPin)) {
      res.status(400).json({ error: 'Purana aur naya 4-6 digit PIN daalein.' });
      return;
    }
    const storedHash = db.securityPins.customerPinHashes[session.customerId] || '';
    if (!verifyPinHash(currentPin, storedHash)) {
      res.status(401).json({ error: 'Purana PIN galat hai.' });
      return;
    }
    db.securityPins.customerPinHashes[session.customerId] = hashPin(newPin);
    saveDatabase();
    await syncAuthStateToSupabase();
    res.json({ updated: true });
  });

  app.put('/api/customers/:id/pin', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const customer = db.customers.find((c) => c.id === req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const newPin = String(req.body?.pin || '').trim();
    if (!isValidPin(newPin)) {
      res.status(400).json({ error: 'Naya PIN 4 se 6 digits ka hona chahiye.' });
      return;
    }
    db.securityPins.customerPinHashes[customer.id] = hashPin(newPin);
    saveDatabase();
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('CUSTOMER_UPDATED');
    res.json({ updated: true });
  });

  // 4D. Mobile OTP Request & Verification (Only dispatches via real SMS gateway; never returns secret codes in HTTP response)
  app.post('/api/otp/request', async (req: Request, res: Response) => {
    const rawPhone = normalizePhone10(req.body?.phone);
    if (!isValidIndianMobile(rawPhone)) {
      res.status(400).json({ error: 'Valid 10-digit Indian mobile number daalein.' });
      return;
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(`otp_ip:${clientIp}`, 10, 10 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many OTP requests. 10 minute baad try karein.' });
      return;
    }
    if (!checkRateLimit(`otp_phone:${rawPhone}`, 5, 10 * 60 * 1000)) {
      res.status(429).json({ error: 'Is number par bahut zyada OTP bheje ja chuke hain.' });
      return;
    }

    let supabaseOtpSent = false;
    if (supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin.auth.signInWithOtp({ phone: `+91${rawPhone}` });
        if (!error) supabaseOtpSent = true;
      } catch {
        // SMS provider not active
      }
    }

    if (!supabaseOtpSent) {
      res.status(503).json({
        sent: false,
        error: 'SMS OTP service abhi active nahi hai. Agar aap apna PIN bhool gaye hain to Salon Malik se reset karwayein.',
      });
      return;
    }

    otpStore.set(rawPhone, {
      code: '',
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      smsSent: true,
    });

    res.json({
      sent: true,
      expires_in_seconds: 300,
      supabase_sms_dispatched: true,
    });
  });

  app.post('/api/otp/verify', async (req: Request, res: Response) => {
    const rawPhone = normalizePhone10(req.body?.phone);
    const code = String(req.body?.otp || '').trim();
    const record = otpStore.get(rawPhone);

    if (!record) {
      res.status(400).json({ error: 'Pehle OTP request karein.' });
      return;
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(rawPhone);
      res.status(400).json({ error: 'OTP expire ho gaya hai.' });
      return;
    }
    if (record.attempts >= 5) {
      otpStore.delete(rawPhone);
      res.status(429).json({ error: 'Galat OTP attempts zyada ho gaye.' });
      return;
    }

    if (!supabaseAdmin) {
      res.status(503).json({ error: 'SMS OTP gateway available nahi hai.' });
      return;
    }

    const { error } = await supabaseAdmin.auth.verifyOtp({
      phone: `+91${rawPhone}`,
      token: code,
      type: 'sms',
    });

    if (error) {
      record.attempts += 1;
      res.status(400).json({ error: `Galat OTP code. ${5 - record.attempts} koshish baaki hain.` });
      return;
    }

    const verificationToken = crypto.randomBytes(24).toString('hex');
    verifiedTokens.set(verificationToken, {
      phone: rawPhone,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    otpStore.delete(rawPhone);

    const existingCustomer = db.customers.find((c) => normalizePhone10(c.phone) === rawPhone);
    res.json({
      verified: true,
      verification_token: verificationToken,
      existing_customer: existingCustomer
        ? { name: existingCustomer.name, haircut_preference: existingCustomer.haircut_preference }
        : null,
    });
  });

  // 5. Atomic Booking Creation (Authenticated CUSTOMER or OWNER/RECEPTION)
  app.post('/api/bookings', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['CUSTOMER', 'OWNER', 'RECEPTION']);
    if (!session) return;
    if (bookingLock) {
      res.status(409).json({ error: 'Another booking transaction is in progress. Please retry in a moment.' });
      return;
    }
    bookingLock = true;
    try {
      const {
        customer_name,
        customer_phone,
        service_ids,
        booking_date,
        slot_time,
        booking_preference,
        preferred_barber_id,
        barber_id,
        booking_type,
        notes,
        haircut_preference,
        verification_method,
        verification_token,
        website_honeypot,
        start_immediately,
      } = req.body as {
        customer_name: string;
        customer_phone: string;
        service_ids: string[];
        booking_date: string;
        slot_time: string;
        booking_preference: BookingPreference;
        preferred_barber_id?: string;
        barber_id?: string;
        booking_type?: BookingType;
        notes?: string;
        haircut_preference?: string;
        verification_method?: 'OTP_VERIFIED' | 'GUEST_EXPRESS' | 'OWNER_CREATED';
        verification_token?: string;
        website_honeypot?: string;
        start_immediately?: boolean;
      };
      const resolvedPreferredBarberId = preferred_barber_id || barber_id;

      // Anti-spam honeypot check
      if (website_honeypot && String(website_honeypot).trim().length > 0) {
        res.status(400).json({ error: 'Automated spam submission rejected.' });
        return;
      }

      // Enforce authenticated customer identity when booked by CUSTOMER session
      const sessionPhone = session.role === 'CUSTOMER' ? normalizePhone10(session.phone) : '';
      const rawBodyPhone = normalizePhone10(customer_phone);
      const normalizedPhoneCheck = session.role === 'CUSTOMER' ? sessionPhone : rawBodyPhone;

      const sessionCustomer =
        session.role === 'CUSTOMER' && session.customerId
          ? db.customers.find((c) => c.id === session.customerId)
          : undefined;
      const effectiveCustomerName =
        session.role === 'CUSTOMER' && sessionCustomer?.name
          ? sessionCustomer.name
          : String(customer_name || '').trim();

      if (!effectiveCustomerName || effectiveCustomerName.length < 2) {
        res.status(400).json({ error: 'Please enter a valid customer name (at least 2 characters).' });
        return;
      }

      if (!isValidIndianMobile(normalizedPhoneCheck)) {
        res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) zaroori hai.' });
        return;
      }

      if (!Array.isArray(service_ids) || service_ids.length === 0) {
        res.status(400).json({ error: 'Please select at least one service.' });
        return;
      }
      if (!booking_date || !slot_time) {
        res.status(400).json({ error: 'Booking date and time slot are required.' });
        return;
      }

      const resolvedType: BookingType =
        session.role === 'CUSTOMER' ? 'ONLINE' : booking_type || 'ONLINE';
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      // Rate limit & spam protection for ONLINE customer bookings
      if (session.role === 'CUSTOMER') {
        if (!checkRateLimit(`book_ip:${clientIp}`, 8, 10 * 60 * 1000)) {
          res.status(429).json({
            error: 'Too many booking attempts from this device. Please wait a few minutes before booking again.',
          });
          return;
        }
        const activeBookingsSameDayForPhone = db.bookings.filter(
          (b) =>
            b.customer_phone === normalizedPhoneCheck &&
            b.booking_date === booking_date &&
            b.status !== 'CANCELLED'
        ).length;
        if (activeBookingsSameDayForPhone >= 3) {
          res.status(429).json({
            error: 'Maximum 3 active bookings per mobile number per day allowed to prevent spam bookings.',
          });
          return;
        }
        if (verification_method === 'OTP_VERIFIED') {
          const tokenData = verification_token ? verifiedTokens.get(verification_token) : undefined;
          if (!tokenData || tokenData.phone !== normalizedPhoneCheck || Date.now() > tokenData.expiresAt) {
            res.status(401).json({ error: 'Mobile OTP verification expired or invalid. Please verify OTP again.' });
            return;
          }
          verifiedTokens.delete(verification_token!);
        }
      }

      // Check weekly holiday
      const dayName = new Date(`${booking_date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
      if (db.settings.weekly_holidays.includes(dayName)) {
        res.status(400).json({ error: `Salon is closed on ${dayName} (Weekly Holiday). Please pick another date.` });
        return;
      }

      // Validate selected services
      const selectedServices = db.services.filter((s) => service_ids.includes(s.id) && s.is_active);
      if (selectedServices.length === 0) {
        res.status(400).json({ error: 'Selected services are invalid or inactive.' });
        return;
      }

      // Resolve barber according to VERY IMPORTANT OWNER BOOKING RULE
      let assignedBarber: StaffMember | undefined;
      const isToday = booking_date === getTodayDateString();

      if (booking_preference === 'OWNER_PREFERRED') {
        const ownerBarber = db.staff.find((s) => s.is_owner && s.is_active);
        if (!ownerBarber) {
          res.status(400).json({ error: 'Salon Owner is currently not configured.' });
          return;
        }
        // Check owner live availability for today's bookings
        if (isToday && ownerBarber.availability_status === 'Not Available') {
          res.status(400).json({
            error: 'Salon Owner is currently marked "Not Available". Owner Preferred bookings cannot be reassigned to other staff.',
          });
          return;
        }
        // Check if owner already has an active booking on this date & slot
        const ownerConflict = db.bookings.find(
          (b) =>
            b.barber_id === ownerBarber.id &&
            b.booking_date === booking_date &&
            b.slot_time === slot_time &&
            b.status !== 'CANCELLED'
        );
        if (ownerConflict) {
          res.status(409).json({
            error: `Salon Owner is already booked at ${formatTime12h(slot_time)} on ${booking_date}. Please choose another slot for Owner Preferred service.`,
          });
          return;
        }
        assignedBarber = ownerBarber;
      } else if (booking_preference === 'SPECIFIC_STAFF') {
        const targetBarber = db.staff.find((s) => s.id === resolvedPreferredBarberId && s.is_active);
        if (!targetBarber) {
          res.status(400).json({ error: 'Selected barber is not available or inactive.' });
          return;
        }
        if (isToday && targetBarber.availability_status === 'Not Available') {
          res.status(400).json({ error: `${targetBarber.name} is currently marked "Not Available".` });
          return;
        }
        const conflict = db.bookings.find(
          (b) =>
            b.barber_id === targetBarber.id &&
            b.booking_date === booking_date &&
            b.slot_time === slot_time &&
            b.status !== 'CANCELLED'
        );
        if (conflict) {
          res.status(409).json({
            error: `${targetBarber.name} is already booked at ${formatTime12h(slot_time)} on ${booking_date}. Please select another time slot.`,
          });
          return;
        }
        assignedBarber = targetBarber;
      } else {
        // ANY_AVAILABLE: Find an active barber who is not 'Not Available' and free at this slot
        const candidateBarbers = db.staff.filter(
          (s) => s.is_active && (!isToday || s.availability_status !== 'Not Available')
        );
        // Prefer barbers who are 'Available' and have fewer bookings today
        const freeBarbers = candidateBarbers.filter((barber) => {
          const hasConflict = db.bookings.some(
            (b) =>
              b.barber_id === barber.id &&
              b.booking_date === booking_date &&
              b.slot_time === slot_time &&
              b.status !== 'CANCELLED'
          );
          return !hasConflict;
        });

        if (freeBarbers.length === 0) {
          res.status(409).json({
            error: `All barbers are booked at ${formatTime12h(slot_time)} on ${booking_date}. Please choose another time slot.`,
          });
          return;
        }

        // Sort: non-owner available staff first or whoever has fewest bookings on that date
        freeBarbers.sort((a, b) => {
          const aScore = a.availability_status === 'Available' ? 0 : 1;
          const bScore = b.availability_status === 'Available' ? 0 : 1;
          if (aScore !== bScore) return aScore - bScore;
          const aCount = db.bookings.filter((bk) => bk.barber_id === a.id && bk.booking_date === booking_date).length;
          const bCount = db.bookings.filter((bk) => bk.barber_id === b.id && bk.booking_date === booking_date).length;
          return aCount - bCount;
        });
        assignedBarber = freeBarbers[0];
      }

      const cleanPhone = normalizedPhoneCheck;
      const cleanName = effectiveCustomerName;
      const now = new Date().toISOString();

      // Find or create customer
      let customer = db.customers.find((c) => normalizePhone10(c.phone) === cleanPhone);
      if (!customer) {
        customer = {
          id: crypto.randomUUID(),
          salon_id: db.salon.id,
          name: cleanName,
          phone: cleanPhone,
          haircut_preference: haircut_preference ? String(haircut_preference).trim() : '',
          special_notes: notes ? String(notes).trim() : '',
          total_visits: 0,
          total_spent: 0,
          outstanding_due: 0,
          last_visit_date: null,
          created_at: now,
          updated_at: now,
        };
        db.customers.push(customer);
        await syncTableRowToSupabase('customers', customer as unknown as Record<string, unknown>);
      } else {
        customer.name = cleanName;
        if (haircut_preference) customer.haircut_preference = String(haircut_preference).trim();
        customer.updated_at = now;
        await syncTableRowToSupabase('customers', customer as unknown as Record<string, unknown>);
      }

      // Compute sequential token number for the booking_date
      const existingOnDate = db.bookings.filter((b) => b.booking_date === booking_date);
      const maxToken = existingOnDate.reduce((max, b) => Math.max(max, b.token_number), 0);
      const tokenNumber = maxToken + 1;

      const totalAmount = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
      const bookingId = crypto.randomUUID();
      const referenceCode = `SB-${booking_date.slice(5).replace('-', '')}-${String(tokenNumber).padStart(3, '0')}`;

      const newBooking: Booking = {
        id: bookingId,
        salon_id: db.salon.id,
        reference_code: referenceCode,
        verification_method:
          session.role === 'CUSTOMER'
            ? 'OTP_VERIFIED'
            : verification_method || 'OWNER_CREATED',
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        barber_id: assignedBarber.id,
        barber_name: assignedBarber.name,
        booking_preference,
        booking_type: resolvedType,
        booking_date,
        slot_time,
        token_number: tokenNumber,
        status: session.role !== 'CUSTOMER' && start_immediately ? 'IN_PROGRESS' : 'WAITING',
        total_amount: totalAmount,
        notes: notes ? String(notes).trim() : '',
        is_billed: false,
        created_at: now,
        updated_at: now,
      };

      const bookingServiceRows: BookingServiceItem[] = selectedServices.map((s) => ({
        id: crypto.randomUUID(),
        booking_id: bookingId,
        service_id: s.id,
        service_name: s.name,
        price: Number(s.price),
        duration_minutes: Number(s.duration_minutes),
      }));

      db.bookings.push(newBooking);
      db.bookingServices.push(...bookingServiceRows);

      const slotLabel12h = formatTime12h(slot_time);
      const notification: NotificationItem = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        recipient_role: 'OWNER',
        title: `New Booking #${tokenNumber} — ${customer.name}`,
        message: `${selectedServices.map((s) => s.name).join(', ')} with ${assignedBarber.name} at ${slotLabel12h} (${booking_date})`,
        is_read: false,
        created_at: now,
      };
      db.notifications.unshift(notification);

      const customerConfirmNote: NotificationItem = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        recipient_role: 'CUSTOMER',
        recipient_phone: customer.phone,
        title: `बुकिंग पक्की · टोकन #${tokenNumber}`,
        message: `${assignedBarber.name} के साथ ${booking_date} को ${slotLabel12h} पर आपकी सीट बुक हो गई है।`,
        is_read: false,
        created_at: now,
      };
      db.notifications.unshift(customerConfirmNote);

      saveDatabase();
      await syncTableRowToSupabase('bookings', newBooking as unknown as Record<string, unknown>);
      await syncTableRowToSupabase('notifications', notification as unknown as Record<string, unknown>);
      await syncTableRowToSupabase('notifications', customerConfirmNote as unknown as Record<string, unknown>);
      for (const bs of bookingServiceRows) {
        await syncTableRowToSupabase('booking_services', bs as unknown as Record<string, unknown>);
      }

      const fullBooking = { ...newBooking, services: bookingServiceRows };
      broadcastRealtimeUpdate('BOOKING_CREATED');
      res.status(201).json({ booking: fullBooking, customer });
    } finally {
      bookingLock = false;
    }
  });

  // 6. Update Booking Status (WAITING -> IN_PROGRESS -> COMPLETED / CANCELLED) + Live Customer Alerts
  app.patch('/api/bookings/:id/status', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['OWNER', 'RECEPTION', 'STAFF', 'CUSTOMER']);
    if (!session) return;
    const { id } = req.params;
    const { status } = req.body as { status: BookingStatus };
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (session.role === 'STAFF' && booking.barber_id !== session.staffId) {
      res.status(403).json({ error: 'Aap sirf apni chair ki bookings update kar sakte hain.' });
      return;
    }
    if (session.role === 'CUSTOMER') {
      if (normalizePhone10(booking.customer_phone) !== normalizePhone10(session.phone) || status !== 'CANCELLED') {
        res.status(403).json({ error: 'Customer sirf apni booking cancel kar sakta hai.' });
        return;
      }
    }

    const now = new Date().toISOString();
    booking.status = status;
    booking.updated_at = now;

    // Crucial Rule: Do not calculate commission on cancelled bookings. Remove if any existed.
    if (status === 'CANCELLED') {
      db.commissions = db.commissions.filter((c) => c.booking_id !== booking.id);
    }

    const generatedNotifications: NotificationItem[] = [];
    if (status === 'IN_PROGRESS') {
      const chairReadyNotif: NotificationItem = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        recipient_role: 'CUSTOMER',
        recipient_phone: booking.customer_phone,
        title: `आपकी बारी आ गई! (टोकन #${booking.token_number})`,
        message: `${booking.barber_name} आपकी सर्विस के लिए तैयार हैं, कृपया कुर्सी पर आएं।`,
        is_read: false,
        created_at: now,
      };
      generatedNotifications.push(chairReadyNotif);

      const nextWaiting = db.bookings
        .filter((b) => b.booking_date === booking.booking_date && b.status === 'WAITING' && b.id !== booking.id)
        .sort((a, b) => a.token_number - b.token_number)[0];
      if (nextWaiting) {
        const nextUpNotif: NotificationItem = {
          id: crypto.randomUUID(),
          salon_id: db.salon.id,
          recipient_role: 'CUSTOMER',
          recipient_phone: nextWaiting.customer_phone,
          title: `आपका नंबर अगला है! (टोकन #${nextWaiting.token_number})`,
          message: `टोकन #${booking.token_number} का काम शुरू हो गया है। कृपया ${formatTime12h(nextWaiting.slot_time)} के लिए सैलून पहुंचें।`,
          is_read: false,
          created_at: now,
        };
        generatedNotifications.push(nextUpNotif);
      }
    } else if (status === 'CANCELLED') {
      generatedNotifications.push({
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        recipient_role: 'CUSTOMER',
        recipient_phone: booking.customer_phone,
        title: `बुकिंग रद्द हुई (टोकन #${booking.token_number})`,
        message: `${booking.booking_date} को ${formatTime12h(booking.slot_time)} वाली बुकिंग रद्द कर दी गई है।`,
        is_read: false,
        created_at: now,
      });
    }

    if (generatedNotifications.length > 0) {
      db.notifications.unshift(...generatedNotifications);
    }

    saveDatabase();
    await syncTableRowToSupabase('bookings', booking as unknown as Record<string, unknown>);
    for (const n of generatedNotifications) {
      await syncTableRowToSupabase('notifications', n as unknown as Record<string, unknown>);
    }
    broadcastRealtimeUpdate('BOOKING_STATUS_UPDATED');
    res.json({ booking });
  });

  // 6B. Live Edit Booking Time, Date, Quick Delay Shift, Barber, or Price
  app.patch('/api/bookings/:id', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['OWNER', 'RECEPTION', 'STAFF']);
    if (!session) return;
    const { id } = req.params;
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (session.role === 'STAFF' && booking.barber_id !== session.staffId) {
      res.status(403).json({ error: 'Aap sirf apni booking update kar sakte hain.' });
      return;
    }

    const {
      booking_date,
      slot_time,
      shift_minutes,
      barber_id,
      total_amount,
      notes,
      delay_reason,
    } = req.body;

    const now = new Date().toISOString();
    const oldDate = booking.booking_date;
    const oldTime = booking.slot_time;
    const oldPrice = booking.total_amount;

    if (booking_date !== undefined && String(booking_date).trim()) {
      booking.booking_date = String(booking_date).trim();
    }
    if (shift_minutes !== undefined && Number(shift_minutes) !== 0) {
      booking.slot_time = shiftTimeMinutes(booking.slot_time, Number(shift_minutes));
    } else if (slot_time !== undefined && String(slot_time).trim()) {
      booking.slot_time = String(slot_time).trim();
    }

    if (barber_id !== undefined && barber_id !== booking.barber_id) {
      const nextBarber = db.staff.find((s) => s.id === barber_id && s.is_active);
      if (nextBarber) {
        booking.barber_id = nextBarber.id;
        booking.barber_name = nextBarber.name;
      }
    }

    if (total_amount !== undefined && Number(total_amount) >= 0) {
      booking.total_amount = Number(total_amount);
    }
    if (notes !== undefined) {
      booking.notes = String(notes).trim();
    }
    booking.updated_at = now;

    const changes: string[] = [];
    if (booking.slot_time !== oldTime || booking.booking_date !== oldDate) {
      changes.push(`नया समय: ${formatTime12h(booking.slot_time)} (${booking.booking_date})`);
    }
    if (booking.total_amount !== oldPrice) {
      changes.push(`नया बिल: ₹${booking.total_amount}`);
    }
    const reasonText = delay_reason ? String(delay_reason).trim() : '';

    const customerAlert: NotificationItem = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      recipient_role: 'CUSTOMER',
      recipient_phone: booking.customer_phone,
      title:
        booking.slot_time !== oldTime || booking.booking_date !== oldDate
          ? `समय बदला · टोकन #${booking.token_number}`
          : `बुकिंग अपडेट · टोकन #${booking.token_number}`,
      message: `${changes.join(' · ') || `बुकिंग समय: ${formatTime12h(booking.slot_time)}`}${
        reasonText ? ` — ${reasonText}` : ' — सैलून ने आपका समय अपडेट किया है।'
      }`,
      is_read: false,
      created_at: now,
    };
    db.notifications.unshift(customerAlert);

    saveDatabase();
    const cleanRow = { ...booking } as Record<string, unknown>;
    delete cleanRow.services;
    await syncTableRowToSupabase('bookings', cleanRow);
    await syncTableRowToSupabase('notifications', customerAlert as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('BOOKING_RESCHEDULED');
    res.json({ booking, notification: customerAlert });
  });

  app.patch('/api/notifications/mark-read', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['OWNER', 'RECEPTION', 'STAFF', 'CUSTOMER']);
    if (!session) return;
    const phone =
      session.role === 'CUSTOMER'
        ? normalizePhone10(session.phone)
        : req.body?.phone
        ? normalizePhone10(req.body.phone)
        : undefined;
    const role = session.role === 'CUSTOMER' ? 'CUSTOMER' : req.body?.role;
    const updated: NotificationItem[] = [];
    for (const n of db.notifications) {
      if (phone && normalizePhone10(n.recipient_phone) === phone && !n.is_read) {
        n.is_read = true;
        updated.push(n);
      } else if (!phone && role && n.recipient_role === role && !n.is_read) {
        n.is_read = true;
        updated.push(n);
      }
    }
    saveDatabase();
    for (const n of updated) {
      await syncTableRowToSupabase('notifications', n as unknown as Record<string, unknown>);
    }
    res.json({ marked: updated.length });
  });

  // 7. Split Billing & Payment System (Owner & Reception only)
  app.post('/api/payments/bill', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER', 'RECEPTION'])) return;
    const {
      client_sync_id,
      booking_id,
      customer_id,
      customer_name,
      customer_phone,
      barber_id,
      service_ids,
      payment_date,
      total_bill,
      cash_paid,
      upi_paid,
      haircut_preference,
      notes,
    } = req.body;

    // 1. Idempotency check: Never duplicate a payment or booking during offline synchronization
    if (client_sync_id) {
      const existingPayment = db.payments.find((p) => p.client_sync_id === client_sync_id);
      if (existingPayment) {
        res.json({ payment: existingPayment, deduplicated: true });
        return;
      }
    }

    const billAmount = Math.max(0, Number(total_bill || 0));
    const cashAmount = Math.max(0, Number(cash_paid || 0));
    const upiAmount = Math.max(0, Number(upi_paid || 0));
    const totalCollected = cashAmount + upiAmount;

    if (totalCollected > billAmount) {
      res.status(400).json({
        error: `Collected amount (₹${totalCollected}) cannot exceed Total Bill (₹${billAmount}). For due repayment, use Due Settlement.`,
      });
      return;
    }

    const udharAmount = Math.max(0, billAmount - totalCollected);
    const now = new Date().toISOString();
    const dateStr = payment_date || getTodayDateString();

    // Resolve customer
    let customer = customer_id ? db.customers.find((c) => c.id === customer_id) : undefined;
    const cleanPhone = String(customer_phone || customer?.phone || '0000000000').replace(/\D/g, '').slice(-10);
    if (!customer) {
      customer = db.customers.find((c) => c.phone === cleanPhone);
    }
    if (!customer) {
      customer = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        name: String(customer_name || 'Walk-in Customer').trim(),
        phone: cleanPhone,
        haircut_preference: haircut_preference || '',
        special_notes: notes || '',
        total_visits: 0,
        total_spent: 0,
        outstanding_due: 0,
        last_visit_date: dateStr,
        created_at: now,
        updated_at: now,
      };
      db.customers.push(customer);
    }

    // Resolve barber
    const barber = db.staff.find((s) => s.id === barber_id) || db.staff.find((s) => s.is_owner) || db.staff[0];

    // Resolve or create booking if this is a direct walk-in bill or offline synced bill
    let booking = booking_id ? db.bookings.find((b) => b.id === booking_id) : undefined;
    let servicesSummary = '';

    if (booking) {
      booking.status = 'COMPLETED';
      booking.is_billed = true;
      booking.total_amount = billAmount;
      booking.updated_at = now;
      const bServices = db.bookingServices.filter((bs) => bs.booking_id === booking!.id);
      servicesSummary = bServices.map((s) => s.service_name).join(', ') || 'Salon Service';
    } else {
      const selectedServices = Array.isArray(service_ids)
        ? db.services.filter((s) => service_ids.includes(s.id))
        : [];
      servicesSummary = selectedServices.map((s) => s.name).join(', ') || 'Walk-in Service';
      const existingOnDate = db.bookings.filter((b) => b.booking_date === dateStr);
      const tokenNumber = existingOnDate.reduce((max, b) => Math.max(max, b.token_number), 0) + 1;

      booking = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        barber_id: barber.id,
        barber_name: barber.name,
        booking_preference: barber.is_owner ? 'OWNER_PREFERRED' : 'SPECIFIC_STAFF',
        booking_type: 'WALK_IN',
        booking_date: dateStr,
        slot_time: new Date().toTimeString().slice(0, 5),
        token_number: tokenNumber,
        status: 'COMPLETED',
        total_amount: billAmount,
        notes: notes || '',
        is_billed: true,
        created_at: now,
        updated_at: now,
      };
      db.bookings.push(booking);

      for (const s of selectedServices) {
        db.bookingServices.push({
          id: crypto.randomUUID(),
          booking_id: booking.id,
          service_id: s.id,
          service_name: s.name,
          price: s.price,
          duration_minutes: s.duration_minutes,
        });
      }
    }

    // Create Payment record
    const payment: Payment = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      booking_id: booking.id,
      customer_id: customer.id,
      customer_name: customer.name,
      barber_id: barber.id,
      barber_name: barber.name,
      payment_date: dateStr,
      total_bill: billAmount,
      cash_paid: cashAmount,
      upi_paid: upiAmount,
      total_collected: totalCollected,
      udhar_amount: udharAmount,
      payment_type: 'BILL_PAYMENT',
      client_sync_id: client_sync_id || null,
      notes: notes || '',
      created_at: now,
    };
    db.payments.push(payment);

    // Update customer aggregates
    customer.total_visits += 1;
    customer.total_spent += billAmount;
    customer.outstanding_due += udharAmount;
    customer.last_visit_date = dateStr;
    if (haircut_preference) customer.haircut_preference = haircut_preference;
    if (notes) customer.special_notes = notes;
    customer.updated_at = now;

    // If Udhar > 0, record in Customer Due Ledger
    if (udharAmount > 0) {
      const dueEntry: CustomerDueEntry = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        payment_id: payment.id,
        booking_id: booking.id,
        entry_type: 'UDHAR_ADDED',
        amount: udharAmount,
        payment_mode: 'UDHAR',
        balance_after: customer.outstanding_due,
        notes: `Bill #${booking.token_number} (${servicesSummary}) — Total ₹${billAmount}, Paid ₹${totalCollected}`,
        entry_date: dateStr,
        created_at: now,
      };
      db.customerDues.push(dueEntry);
      await syncTableRowToSupabase('customer_dues', dueEntry as unknown as Record<string, unknown>);
    }

    // Record Customer Haircut & Service History
    const historyEntry: CustomerServiceHistory = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      customer_id: customer.id,
      booking_id: booking.id,
      barber_id: barber.id,
      barber_name: barber.name,
      services_summary: servicesSummary,
      visit_date: dateStr,
      total_bill: billAmount,
      amount_paid: totalCollected,
      haircut_preference: customer.haircut_preference,
      special_notes: notes || customer.special_notes,
      created_at: now,
    };
    db.serviceHistory.unshift(historyEntry);

    // Calculate Staff Commission automatically for completed service
    const existingComm = db.commissions.find((c) => c.booking_id === booking!.id);
    if (!existingComm && booking.status === 'COMPLETED') {
      const commPct = Number(barber.commission_pct);
      const commAmount = Number(((billAmount * commPct) / 100).toFixed(2));
      const commission: Commission = {
        id: crypto.randomUUID(),
        salon_id: db.salon.id,
        staff_id: barber.id,
        staff_name: barber.name,
        booking_id: booking.id,
        payment_id: payment.id,
        service_amount: billAmount,
        commission_pct: commPct,
        commission_amount: commAmount,
        earned_date: dateStr,
        created_at: now,
      };
      db.commissions.push(commission);
      await syncTableRowToSupabase('commissions', commission as unknown as Record<string, unknown>);
    }

    saveDatabase();
    await syncTableRowToSupabase('customers', customer as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('bookings', booking as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('payments', payment as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('customer_service_history', historyEntry as unknown as Record<string, unknown>);

    broadcastRealtimeUpdate('PAYMENT_RECORDED');
    res.status(201).json({ payment, customer, booking });
  });

  // 8. Customer Udhar Due Settlement (Owner & Reception only)
  app.post('/api/payments/settle-due', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER', 'RECEPTION'])) return;
    const { customer_id, cash_paid, upi_paid, amount, payment_mode, notes, payment_date } = req.body;
    const customer = db.customers.find((c) => c.id === customer_id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    let cashAmount = Math.max(0, Number(cash_paid || 0));
    let upiAmount = Math.max(0, Number(upi_paid || 0));
    if (cashAmount === 0 && upiAmount === 0 && Number(amount) > 0) {
      if (String(payment_mode || '').toUpperCase() === 'UPI') {
        upiAmount = Number(amount);
      } else {
        cashAmount = Number(amount);
      }
    }
    const totalSettled = cashAmount + upiAmount;

    if (totalSettled <= 0) {
      res.status(400).json({ error: 'Settlement amount must be greater than ₹0.' });
      return;
    }
    if (totalSettled > customer.outstanding_due) {
      res.status(400).json({
        error: `Settlement amount (₹${totalSettled}) exceeds customer's pending Udhar (₹${customer.outstanding_due}).`,
      });
      return;
    }

    const now = new Date().toISOString();
    const dateStr = payment_date || getTodayDateString();

    const payment: Payment = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      booking_id: null,
      customer_id: customer.id,
      customer_name: customer.name,
      barber_id: null,
      barber_name: null,
      payment_date: dateStr,
      total_bill: 0, // Does not inflate service sales; counts purely in Collected Amount (Cash / UPI)
      cash_paid: cashAmount,
      upi_paid: upiAmount,
      total_collected: totalSettled,
      udhar_amount: 0,
      payment_type: 'DUE_SETTLEMENT',
      client_sync_id: null,
      notes: notes || 'Udhar Due Settlement',
      created_at: now,
    };
    db.payments.push(payment);

    customer.outstanding_due = Math.max(0, Number((customer.outstanding_due - totalSettled).toFixed(2)));
    customer.updated_at = now;

    const paymentMode: CustomerDueEntry['payment_mode'] =
      cashAmount > 0 && upiAmount > 0 ? 'SPLIT' : cashAmount > 0 ? 'CASH' : 'UPI';

    const dueEntry: CustomerDueEntry = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      payment_id: payment.id,
      booking_id: null,
      entry_type: 'UDHAR_PAID',
      amount: totalSettled,
      payment_mode: paymentMode,
      balance_after: customer.outstanding_due,
      notes: notes || `Paid via ${paymentMode} (Cash: ₹${cashAmount}, UPI: ₹${upiAmount})`,
      entry_date: dateStr,
      created_at: now,
    };
    db.customerDues.push(dueEntry);

    saveDatabase();
    await syncTableRowToSupabase('payments', payment as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('customers', customer as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('customer_dues', dueEntry as unknown as Record<string, unknown>);

    broadcastRealtimeUpdate('DUE_SETTLED');
    res.status(201).json({ payment, customer, dueEntry });
  });

  // 9. Customer Record Management (Owner, Reception, or Staff haircut note update)
  app.put('/api/customers/:id', async (req: Request, res: Response) => {
    const session = requireRoles(req, res, ['OWNER', 'RECEPTION', 'STAFF']);
    if (!session) return;
    const { id } = req.params;
    const customer = db.customers.find((c) => c.id === id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const { name, phone, haircut_preference, special_notes } = req.body;
    if (session.role !== 'STAFF') {
      if (name !== undefined && String(name).trim()) customer.name = String(name).trim();
      if (phone !== undefined) {
        const cleanPhone = normalizePhone10(phone);
        if (!isValidIndianMobile(cleanPhone)) {
          res.status(400).json({ error: 'Valid 10-digit Indian mobile number daalein.' });
          return;
        }
        customer.phone = cleanPhone;
      }
    }
    if (haircut_preference !== undefined) customer.haircut_preference = String(haircut_preference).trim();
    if (special_notes !== undefined) customer.special_notes = String(special_notes).trim();
    customer.updated_at = new Date().toISOString();

    saveDatabase();
    await syncTableRowToSupabase('customers', customer as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('CUSTOMER_UPDATED');
    res.json({ customer });
  });

  app.delete('/api/customers/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const idx = db.customers.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const hasActiveBooking = db.bookings.some(
      (b) => b.customer_id === id && (b.status === 'WAITING' || b.status === 'IN_PROGRESS')
    );
    if (hasActiveBooking) {
      res.status(400).json({ error: 'Is customer ki active booking chal rahi hai, pehle complete ya cancel karein.' });
      return;
    }
    db.customers.splice(idx, 1);
    delete db.securityPins.customerPinHashes[id];
    saveDatabase();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('customers').delete().eq('id', id);
      } catch {
        // Ignore if linked
      }
    }
    await syncAuthStateToSupabase();
    broadcastRealtimeUpdate('CUSTOMER_UPDATED');
    res.json({ deleted: true });
  });

  // 10. Expenses Management (Owner & Reception add, Owner delete)
  app.post('/api/expenses', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER', 'RECEPTION'])) return;
    const { title, category, amount, payment_mode, expense_date, notes } = req.body;
    if (!title || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: 'Expense title and a positive amount are required.' });
      return;
    }
    const expense: Expense = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      title: String(title).trim(),
      category: String(category || 'Shop Supplies').trim(),
      amount: Number(amount),
      payment_mode: payment_mode === 'UPI' ? 'UPI' : 'CASH',
      expense_date: expense_date || getTodayDateString(),
      notes: notes ? String(notes).trim() : '',
      created_at: new Date().toISOString(),
    };
    db.expenses.unshift(expense);
    saveDatabase();
    await syncTableRowToSupabase('expenses', expense as unknown as Record<string, unknown>);
    broadcastRealtimeUpdate('EXPENSE_UPDATED');
    res.status(201).json({ expense });
  });

  app.delete('/api/expenses/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const idx = db.expenses.findIndex((e) => e.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }
    db.expenses.splice(idx, 1);
    saveDatabase();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('expenses').delete().eq('id', id);
      } catch {
        // Ignore if table not migrated
      }
    }
    broadcastRealtimeUpdate('EXPENSE_UPDATED');
    res.json({ deleted: true });
  });

  // 11. Salon Settings & Time Slots Management (Owner protected)
  app.put('/api/settings', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const {
      salon_name,
      salon_phone,
      salon_address,
      opening_time,
      closing_time,
      slot_duration_minutes,
      weekly_holidays,
      upi_id,
      upi_merchant_name,
      hide_staff_login,
      customer_apk_url,
      regenerate_slots,
    } = req.body;

    const now = new Date().toISOString();
    const oldSalonPhone10 = normalizePhone10(db.salon.phone);

    if (salon_name !== undefined && String(salon_name).trim()) {
      db.salon.name = String(salon_name).trim();
    }
    if (salon_phone !== undefined) {
      const cleanPhone = normalizePhone10(salon_phone);
      if (!isValidIndianMobile(cleanPhone)) {
        res.status(400).json({ error: 'Valid 10-digit Indian mobile number (6-9 se shuru) daalein.' });
        return;
      }
      db.salon.phone = cleanPhone;
      const ownerStaff = db.staff.find(
        (s) => s.is_owner && normalizePhone10(s.phone) === oldSalonPhone10
      );
      if (ownerStaff) {
        ownerStaff.phone = cleanPhone;
        ownerStaff.updated_at = now;
        await syncTableRowToSupabase('staff', ownerStaff as unknown as Record<string, unknown>);
      }
    }
    if (salon_address !== undefined) db.salon.address = String(salon_address).trim();
    db.salon.updated_at = now;

    if (opening_time !== undefined) db.settings.opening_time = opening_time;
    if (closing_time !== undefined) db.settings.closing_time = closing_time;
    if (slot_duration_minutes !== undefined) db.settings.slot_duration_minutes = Number(slot_duration_minutes);
    if (Array.isArray(weekly_holidays)) db.settings.weekly_holidays = weekly_holidays;
    if (upi_id !== undefined) db.settings.upi_id = String(upi_id).trim();
    if (upi_merchant_name !== undefined) {
      db.settings.upi_merchant_name = String(upi_merchant_name).trim() || db.salon.name;
    }
    if (hide_staff_login !== undefined) {
      db.settings.hide_staff_login = Boolean(hide_staff_login);
    }
    if (customer_apk_url !== undefined) {
      const cleanApkUrl = String(customer_apk_url).trim();
      if (cleanApkUrl && !/^https?:\/\//i.test(cleanApkUrl)) {
        res.status(400).json({ error: 'APK/App URL http:// ya https:// se shuru hona chahiye.' });
        return;
      }
      db.settings.customer_apk_url = cleanApkUrl;
    }
    db.settings.updated_at = now;

    if (regenerate_slots) {
      db.timeSlots = generateTimeSlotsList(
        db.settings.opening_time,
        db.settings.closing_time,
        db.settings.slot_duration_minutes,
        db.salon.id
      );
    }

    saveDatabase();
    await syncTableRowToSupabase('salons', db.salon as unknown as Record<string, unknown>);
    await syncTableRowToSupabase('salon_settings', db.settings as unknown as Record<string, unknown>, 'salon_id');
    if (regenerate_slots && supabaseAdmin) {
      try {
        await supabaseAdmin.from('time_slots').delete().eq('salon_id', db.salon.id);
        await supabaseAdmin.from('time_slots').upsert(db.timeSlots, { onConflict: 'salon_id,slot_time' });
      } catch {
        // Ignore
      }
    }
    broadcastRealtimeUpdate('SETTINGS_UPDATED');
    res.json({ salon: db.salon, settings: db.settings, timeSlots: db.timeSlots });
  });

  app.post('/api/time-slots', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const rawTime = String(req.body?.slot_time || '').trim();
    if (!/^\d{2}:\d{2}$/.test(rawTime)) {
      res.status(400).json({ error: 'Enter a valid 24-hour time like 08:30 or 21:30.' });
      return;
    }
    const existing = db.timeSlots.find((s) => s.slot_time === rawTime);
    if (existing) {
      existing.is_enabled = true;
      saveDatabase();
      await syncTableRowToSupabase('time_slots', existing as unknown as Record<string, unknown>, 'salon_id,slot_time');
      broadcastRealtimeUpdate('SETTINGS_UPDATED');
      res.json({ timeSlot: existing });
      return;
    }
    const newSlot: TimeSlot = {
      id: crypto.randomUUID(),
      salon_id: db.salon.id,
      slot_time: rawTime,
      is_enabled: true,
      created_at: new Date().toISOString(),
    };
    db.timeSlots.push(newSlot);
    db.timeSlots.sort((a, b) => a.slot_time.localeCompare(b.slot_time));
    saveDatabase();
    await syncTableRowToSupabase('time_slots', newSlot as unknown as Record<string, unknown>, 'salon_id,slot_time');
    broadcastRealtimeUpdate('SETTINGS_UPDATED');
    res.status(201).json({ timeSlot: newSlot });
  });

  app.delete('/api/time-slots/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const idx = db.timeSlots.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Time slot not found.' });
      return;
    }
    db.timeSlots.splice(idx, 1);
    saveDatabase();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('time_slots').delete().eq('id', id);
      } catch {
        // Ignore
      }
    }
    broadcastRealtimeUpdate('SETTINGS_UPDATED');
    res.json({ deleted: true });
  });

  app.patch('/api/time-slots/:id', async (req: Request, res: Response) => {
    if (!requireRoles(req, res, ['OWNER'])) return;
    const { id } = req.params;
    const { is_enabled } = req.body;
    const slot = db.timeSlots.find((s) => s.id === id);
    if (!slot) {
      res.status(404).json({ error: 'Time slot not found.' });
      return;
    }
    slot.is_enabled = Boolean(is_enabled);
    saveDatabase();
    await syncTableRowToSupabase('time_slots', slot as unknown as Record<string, unknown>, 'salon_id,slot_time');
    broadcastRealtimeUpdate('SETTINGS_UPDATED');
    res.json({ timeSlot: slot });
  });

  // Vite middleware for development or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SB Salon Manager server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
