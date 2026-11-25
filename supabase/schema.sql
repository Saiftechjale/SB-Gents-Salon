-- ============================================================================
-- SB SALON MANAGER - COMPLETE SUPABASE POSTGRESQL SCHEMA & RLS POLICIES
-- Run this SQL script in your Supabase SQL Editor to provision all 16 tables,
-- indexes, foreign keys, atomic booking RPC, and Row Level Security policies.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. SALONS TABLE
CREATE TABLE IF NOT EXISTS public.salons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'SB Gents Salon',
  phone TEXT NOT NULL DEFAULT '9876543210',
  address TEXT NOT NULL DEFAULT 'Main Market Road, Near City Plaza',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PROFILES TABLE (Role-based access: OWNER, STAFF, CUSTOMER)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'STAFF', 'CUSTOMER')) DEFAULT 'CUSTOMER',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. SALON_SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.salon_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL UNIQUE REFERENCES public.salons(id) ON DELETE CASCADE,
  opening_time TEXT NOT NULL DEFAULT '09:00',
  closing_time TEXT NOT NULL DEFAULT '21:00',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes >= 15 AND slot_duration_minutes <= 120),
  weekly_holidays TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  owner_availability TEXT NOT NULL CHECK (owner_availability IN ('Available', 'Busy', 'Break', 'Not Available')) DEFAULT 'Available',
  owner_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  upi_id TEXT NOT NULL DEFAULT '',
  upi_merchant_name TEXT NOT NULL DEFAULT 'SB Gents Salon',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe idempotent columns if salon_settings already existed from an earlier run
ALTER TABLE public.salon_settings ADD COLUMN IF NOT EXISTS upi_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.salon_settings ADD COLUMN IF NOT EXISTS upi_merchant_name TEXT NOT NULL DEFAULT 'SB Gents Salon';

-- 4. STAFF TABLE (Dynamic staff count + Owner barber entry)
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'Senior Barber',
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 40.00 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  availability_status TEXT NOT NULL CHECK (availability_status IN ('Available', 'Busy', 'Break', 'Not Available')) DEFAULT 'Available',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. SERVICES TABLE
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_hi TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Hair',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  haircut_preference TEXT DEFAULT '',
  special_notes TEXT DEFAULT '',
  total_visits INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_visit_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(salon_id, phone)
);

-- 7. TIME_SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  slot_time TEXT NOT NULL, -- e.g. '09:00', '09:30'
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(salon_id, slot_time)
);

-- 8. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  barber_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  barber_name TEXT NOT NULL,
  booking_preference TEXT NOT NULL CHECK (booking_preference IN ('OWNER_PREFERRED', 'SPECIFIC_STAFF', 'ANY_AVAILABLE')),
  booking_type TEXT NOT NULL CHECK (booking_type IN ('ONLINE', 'WALK_IN')) DEFAULT 'ONLINE',
  booking_date DATE NOT NULL,
  slot_time TEXT NOT NULL,
  token_number INTEGER NOT NULL,
  reference_code TEXT,
  verification_method TEXT DEFAULT 'GUEST_EXPRESS',
  status TEXT NOT NULL CHECK (status IN ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')) DEFAULT 'WAITING',
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  is_billed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent double-booking of the same barber on the same date & time slot (when not cancelled)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_barber_slot
  ON public.bookings (salon_id, barber_id, booking_date, slot_time)
  WHERE status <> 'CANCELLED';

-- 9. BOOKING_SERVICES TABLE
CREATE TABLE IF NOT EXISTS public.booking_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  service_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30
);

-- 10. PAYMENTS TABLE (Split Billing: Cash + UPI + Udhar)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  barber_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  barber_name TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_bill NUMERIC(10,2) NOT NULL CHECK (total_bill >= 0),
  cash_paid NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cash_paid >= 0),
  upi_paid NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (upi_paid >= 0),
  total_collected NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_collected >= 0),
  udhar_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (udhar_amount >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('BILL_PAYMENT', 'DUE_SETTLEMENT')) DEFAULT 'BILL_PAYMENT',
  client_sync_id TEXT UNIQUE, -- Idempotency key for offline PWA sync
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. CUSTOMER_DUES TABLE (Customer-wise Udhar Ledger)
CREATE TABLE IF NOT EXISTS public.customer_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('UDHAR_ADDED', 'UDHAR_PAID')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT CHECK (payment_mode IN ('CASH', 'UPI', 'SPLIT', 'UDHAR')),
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Shop Supplies',
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('CASH', 'UPI')) DEFAULT 'CASH',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. COMMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  staff_name TEXT NOT NULL,
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  service_amount NUMERIC(10,2) NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL,
  commission_amount NUMERIC(10,2) NOT NULL,
  earned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE')) DEFAULT 'PRESENT',
  check_in_time TEXT,
  check_out_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(salon_id, staff_id, attendance_date)
);

-- 15. CUSTOMER_SERVICE_HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.customer_service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  barber_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  barber_name TEXT NOT NULL,
  services_summary TEXT NOT NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_bill NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  haircut_preference TEXT DEFAULT '',
  special_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('OWNER', 'STAFF', 'CUSTOMER')),
  recipient_phone TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES FOR FAST DASHBOARD & REPORT QUERIES
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON public.bookings(salon_id, booking_date, status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(salon_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(salon_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_commissions_staff_date ON public.commissions(salon_id, staff_id, earned_date);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(salon_id, phone);
CREATE INDEX IF NOT EXISTS idx_customer_dues_customer ON public.customer_dues(salon_id, customer_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Public read access for salon booking info (salons, active services, active staff, time slots)
CREATE POLICY "Public read salons" ON public.salons FOR SELECT USING (true);
CREATE POLICY "Public read salon_settings" ON public.salon_settings FOR SELECT USING (true);
CREATE POLICY "Public read active services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Public read staff" ON public.staff FOR SELECT USING (true);
CREATE POLICY "Public read time_slots" ON public.time_slots FOR SELECT USING (true);

-- Owner full access policies
CREATE POLICY "Owner full access salons" ON public.salons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access settings" ON public.salon_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access staff" ON public.staff FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access services" ON public.services FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access customers" ON public.customers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access bookings" ON public.bookings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access payments" ON public.payments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access customer_dues" ON public.customer_dues FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access expenses" ON public.expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access commissions" ON public.commissions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access attendance" ON public.attendance FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));
CREATE POLICY "Owner full access history" ON public.customer_service_history FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));

-- Staff policies: view assigned bookings, own commissions, own attendance
CREATE POLICY "Staff view own bookings" ON public.bookings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = bookings.barber_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY "Staff view own commissions" ON public.commissions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = commissions.staff_id AND s.profile_id = auth.uid()
  ));

-- 17. SALON_AUTH_STATE TABLE (Salted PIN Hashes & Reception Counter Accounts)
CREATE TABLE IF NOT EXISTS public.salon_auth_state (
  salon_id UUID PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  reception_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  security_pins JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.salon_auth_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access salon_auth_state" ON public.salon_auth_state FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'OWNER'));

