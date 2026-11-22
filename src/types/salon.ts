export type UserRole = 'OWNER' | 'STAFF' | 'CUSTOMER';

export type AvailabilityStatus = 'Available' | 'Busy' | 'Break' | 'Not Available';

export type BookingPreference = 'OWNER_PREFERRED' | 'SPECIFIC_STAFF' | 'ANY_AVAILABLE';
export type BookingType = 'ONLINE' | 'WALK_IN';
export type BookingStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Salon {
  id: string;
  name: string;
  phone: string;
  address: string;
  owner_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  salon_id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface SalonSettings {
  id: string;
  salon_id: string;
  opening_time: string;
  closing_time: string;
  slot_duration_minutes: number;
  weekly_holidays: string[];
  owner_availability: AvailabilityStatus;
  owner_commission_pct: number;
  currency_symbol: string;
  upi_id?: string;
  upi_merchant_name?: string;
  hide_staff_login?: boolean;
  customer_apk_url?: string;
  updated_at: string;
}

export interface StaffMember {
  id: string;
  salon_id: string;
  profile_id?: string | null;
  name: string;
  phone: string;
  specialty: string;
  is_owner: boolean;
  commission_pct: number;
  availability_status: AvailabilityStatus;
  is_active: boolean;
  avatar_url?: string;
  joined_date: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceItem {
  id: string;
  salon_id: string;
  name: string;
  name_hi: string;
  category: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  salon_id: string;
  profile_id?: string | null;
  name: string;
  phone: string;
  haircut_preference: string;
  special_notes: string;
  total_visits: number;
  total_spent: number;
  outstanding_due: number;
  last_visit_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeSlot {
  id: string;
  salon_id: string;
  slot_time: string;
  is_enabled: boolean;
  created_at: string;
}

export interface BookingServiceItem {
  id: string;
  booking_id: string;
  service_id: string;
  service_name: string;
  price: number;
  duration_minutes: number;
}

export interface Booking {
  id: string;
  salon_id: string;
  reference_code?: string;
  verification_method?: 'OTP_VERIFIED' | 'GUEST_EXPRESS' | 'OWNER_CREATED';
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  barber_id: string;
  barber_name: string;
  booking_preference: BookingPreference;
  booking_type: BookingType;
  booking_date: string;
  slot_time: string;
  token_number: number;
  status: BookingStatus;
  total_amount: number;
  notes: string;
  is_billed: boolean;
  services?: BookingServiceItem[];
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  salon_id: string;
  booking_id?: string | null;
  customer_id: string;
  customer_name: string;
  barber_id?: string | null;
  barber_name?: string | null;
  payment_date: string;
  total_bill: number;
  cash_paid: number;
  upi_paid: number;
  total_collected: number;
  udhar_amount: number;
  payment_type: 'BILL_PAYMENT' | 'DUE_SETTLEMENT';
  client_sync_id?: string | null;
  notes: string;
  created_at: string;
}

export interface CustomerDueEntry {
  id: string;
  salon_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  payment_id?: string | null;
  booking_id?: string | null;
  entry_type: 'UDHAR_ADDED' | 'UDHAR_PAID';
  amount: number;
  payment_mode: 'CASH' | 'UPI' | 'SPLIT' | 'UDHAR';
  balance_after: number;
  notes: string;
  entry_date: string;
  created_at: string;
}

export interface Expense {
  id: string;
  salon_id: string;
  title: string;
  category: string;
  amount: number;
  payment_mode: 'CASH' | 'UPI';
  expense_date: string;
  notes: string;
  created_at: string;
}

export interface Commission {
  id: string;
  salon_id: string;
  staff_id: string;
  staff_name: string;
  booking_id: string;
  payment_id?: string | null;
  service_amount: number;
  commission_pct: number;
  commission_amount: number;
  earned_date: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  salon_id: string;
  staff_id: string;
  staff_name: string;
  attendance_date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
  check_in_time?: string;
  check_out_time?: string;
  created_at: string;
}

export interface CustomerServiceHistory {
  id: string;
  salon_id: string;
  customer_id: string;
  booking_id?: string | null;
  barber_id?: string | null;
  barber_name: string;
  services_summary: string;
  visit_date: string;
  total_bill: number;
  amount_paid: number;
  haircut_preference: string;
  special_notes: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  salon_id: string;
  recipient_role: UserRole;
  recipient_phone?: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface OfflineDraftBill {
  client_sync_id: string;
  booking_id?: string | null;
  customer_name: string;
  customer_phone: string;
  barber_id: string;
  barber_name: string;
  service_ids: string[];
  services_summary: string;
  payment_date: string;
  total_bill: number;
  cash_paid: number;
  upi_paid: number;
  udhar_amount: number;
  haircut_preference: string;
  notes: string;
  created_at: string;
  sync_status: 'PENDING' | 'SYNCING' | 'FAILED';
  error_message?: string;
}

export interface HeroTextBlock {
  id: string;
  text: string;
  is_active: boolean;
}

export interface TickerItem {
  id: string;
  text: string;
  is_active: boolean;
}

export interface SalonOffer {
  id: string;
  title: string;
  badge: string;
  description: string;
  valid_until?: string;
  show_popup: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SalonReview {
  id: string;
  customer_name: string;
  rating: number;
  comment: string;
  service_name?: string;
  is_visible: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SalonShowcaseConfig {
  hero_image_url: string;
  hero_images?: string[];
  hero_badge: string;
  hero_title: string;
  hero_subtitle: string;
  hero_highlights: HeroTextBlock[];
  ticker_enabled: boolean;
  ticker_items: TickerItem[];
  offers: SalonOffer[];
  footer_tagline?: string;
  developer_credit?: string;
}

export interface SalonBootstrapData {
  supabaseConnected: boolean;
  supabaseUrlConfigured: boolean;
  storageMode: 'SUPABASE_POSTGRES' | 'LOCAL_POSTGRES_REPLICA';
  salon: Salon;
  settings: SalonSettings;
  showcase: SalonShowcaseConfig;
  reviews: SalonReview[];
  staff: StaffMember[];
  services: ServiceItem[];
  customers: Customer[];
  timeSlots: TimeSlot[];
  bookings: Booking[];
  payments: Payment[];
  customerDues: CustomerDueEntry[];
  expenses: Expense[];
  commissions: Commission[];
  attendance: AttendanceRecord[];
  serviceHistory: CustomerServiceHistory[];
  notifications: NotificationItem[];
}
