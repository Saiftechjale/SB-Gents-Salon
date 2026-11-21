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
  Payment,
  SalonBootstrapData,
  SalonOffer,
  SalonReview,
  ServiceItem,
  StaffMember,
  TimeSlot,
} from '../types/salon';
import { cacheSalonStateLocally, getCachedSalonState } from './offlineDb';

const LOCAL_PINS_KEY = 'sb_local_security_pins';

function getTodayDateString(): string {
  return new Date().toLocaleDateString('en-CA');
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
  const heroImg = '/src/assets/images/salon_hero_interior_1795068719871.jpg';

  const staff: StaffMember[] = [
    {
      id: '22222222-2222-4222-8222-222222222201',
      salon_id: salonId,
      name: 'Saif Bhai (Owner)',
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
      updated_at: now,
    },
    showcase: {
      hero_image_url: heroImg,
      hero_images: [heroImg],
      hero_badge: 'Gents Salon & Grooming',
      hero_title: '',
      hero_subtitle: 'Precision Haircuts, Beard Styling & Luxury Grooming',
      hero_highlights: [
        { id: 'hl-1', text: 'AC Lounge & Hygienic Tools', is_active: true },
        { id: 'hl-2', text: 'Zero Wait Live Queue Tracking', is_active: true },
      ],
      ticker_enabled: true,
      ticker_items: [
        { id: 'tk-1', text: 'Welcome! Book your slot online or via WhatsApp', is_active: true },
        { id: 'tk-2', text: 'Haircut + Beard Combo available today', is_active: true },
      ],
      offers: [
        {
          id: 'offer-welcome',
          title: 'Haircut + Beard Combo Special',
          badge: 'COMBO OFFER',
          description: 'Book Haircut + Beard Trimming today for priority token service.',
          valid_until: '',
          show_popup: true,
          is_active: true,
          created_at: now,
        },
      ],
      footer_tagline: '',
      developer_credit: 'Mirza Saif',
    },
    reviews: [],
    staff,
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

function getLocalPins(): { ownerPin: string; staffPin: string } {
  try {
    const raw = localStorage.getItem(LOCAL_PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.ownerPin && parsed.staffPin) return parsed;
    }
  } catch {
    // Ignore storage error
  }
  return { ownerPin: '1234', staffPin: '0000' };
}

async function loadOrInitLocalState(): Promise<SalonBootstrapData> {
  const existing = await getCachedSalonState();
  if (existing && existing.salon && existing.services) {
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
    return jsonResponse(state);
  }

  // 2. PIN Auth
  if (path === '/api/auth/verify-pin' && method === 'POST') {
    const pins = getLocalPins();
    const valid =
      body.role === 'OWNER' ? body.pin === pins.ownerPin : body.pin === pins.staffPin;
    if (!valid) {
      return jsonResponse({ verified: false, error: 'Incorrect PIN' }, 401);
    }
    return jsonResponse({ verified: true, role: body.role });
  }

  if (path === '/api/auth/pins' && (method === 'PATCH' || method === 'PUT')) {
    const pins = getLocalPins();
    if (body.ownerPin && /^\d{4,6}$/.test(String(body.ownerPin))) {
      pins.ownerPin = String(body.ownerPin);
    }
    if (body.staffPin && /^\d{4,6}$/.test(String(body.staffPin))) {
      pins.staffPin = String(body.staffPin);
    }
    localStorage.setItem(LOCAL_PINS_KEY, JSON.stringify(pins));
    return jsonResponse({ updated: true });
  }

  // 3. OTP Express Helpers
  if (path === '/api/otp/request' && method === 'POST') {
    return jsonResponse({
      sent: true,
      demo_otp: '1234',
      message: 'Verification OTP: 1234 (Phone Mode)',
    });
  }

  if (path === '/api/otp/verify' && method === 'POST') {
    return jsonResponse({
      verified: true,
      verificationToken: `local-otp-${Date.now()}`,
    });
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
    const activeStaff = state.staff.filter((s) => s.is_active && s.availability_status !== 'Not Available');
    let barber =
      state.staff.find((s) => s.id === body.barber_id) ||
      activeStaff[0] ||
      state.staff[0];

    const sameDayBookings = state.bookings.filter((b) => b.booking_date === bookingDate);
    const maxToken = sameDayBookings.reduce((m, b) => Math.max(m, b.token_number), 0);
    const tokenNumber = maxToken + 1;
    const referenceCode = `SB-${bookingDate.slice(5).replace('-', '')}-${String(tokenNumber).padStart(3, '0')}`;
    const totalAmount = chosenServices.reduce((sum, s) => sum + Number(s.price), 0);
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
      total_amount: totalAmount,
      notes: String(body.notes || ''),
      is_billed: false,
      services: bookingServices,
      created_at: now,
      updated_at: now,
    };

    state.bookings.push(newBooking);

    const ownerNotif: NotificationItem = {
      id: makeUuid(),
      salon_id: state.salon.id,
      recipient_role: 'OWNER',
      title: `New Booking · Token #${tokenNumber}`,
      message: `${cleanName} (${cleanPhone}) booked ${chosenServices.map((s) => s.name).join(', ')} with ${barber.name} on ${bookingDate} at ${slotTime}.`,
      is_read: false,
      created_at: now,
    };
    const customerNotif: NotificationItem = {
      id: makeUuid(),
      salon_id: state.salon.id,
      recipient_role: 'CUSTOMER',
      recipient_phone: cleanPhone,
      title: `बुकिंग पक्की · टोकन #${tokenNumber}`,
      message: `${barber.name} के साथ ${bookingDate} को ${slotTime} बजे आपकी सीट बुक हो गई है। लाइव नंबर यहीं दिखेगा।`,
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
        message: `${booking.booking_date} को ${booking.slot_time} बजे वाली आपकी बुकिंग रद्द कर दी गई है।`,
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
      message: `आपकी बुकिंग का नया समय: ${booking.booking_date} को ${booking.slot_time} बजे (${booking.barber_name}) · ₹${booking.total_amount}`,
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

    const totalBill = Number(body.total_bill || 0);
    const cashPaid = Number(body.cash_paid || 0);
    const upiPaid = Number(body.upi_paid || 0);
    const udharAmount = Number(body.udhar_amount || 0);
    const totalCollected = cashPaid + upiPaid;
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
    customer.total_spent += totalCollected;
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

    if (body.booking_id) {
      const b = state.bookings.find((bk) => bk.id === body.booking_id);
      if (b) {
        b.is_billed = true;
        b.status = 'COMPLETED';
        b.updated_at = now;
      }
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
    Object.assign(c, body, { updated_at: now });
    await cacheSalonStateLocally(state);
    return jsonResponse({ customer: c });
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
    const newStaff: StaffMember = {
      id: makeUuid(),
      salon_id: state.salon.id,
      name: String(body.name || 'New Barber'),
      phone: String(body.phone || ''),
      specialty: String(body.specialty || 'Barber'),
      is_owner: Boolean(body.is_owner),
      commission_pct: Number(body.commission_pct ?? 40),
      availability_status: 'Available',
      is_active: true,
      joined_date: getTodayDateString(),
      created_at: now,
      updated_at: now,
    };
    state.staff.push(newStaff);
    await cacheSalonStateLocally(state);
    return jsonResponse({ staff: newStaff }, 201);
  }

  const staffMatch = path.match(/^\/api\/staff\/([^/]+)$/);
  if (staffMatch && (method === 'PATCH' || method === 'PUT')) {
    const st = state.staff.find((s) => s.id === staffMatch[1]);
    if (!st) return jsonResponse({ error: 'Staff not found' }, 404);
    Object.assign(st, body, { updated_at: now });
    await cacheSalonStateLocally(state);
    return jsonResponse({ staff: st });
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
    if (body.salon_name !== undefined) state.salon.name = String(body.salon_name);
    if (body.salon_phone !== undefined) state.salon.phone = String(body.salon_phone);
    if (body.salon_address !== undefined) state.salon.address = String(body.salon_address);
    const { salon_name: _sn, salon_phone: _sp, salon_address: _sa, ...rest } = body;
    Object.assign(state.settings, rest, { updated_at: now });
    state.salon.updated_at = now;
    await cacheSalonStateLocally(state);
    return jsonResponse({ salon: state.salon, settings: state.settings });
  }

  if (path === '/api/showcase' && (method === 'PATCH' || method === 'PUT')) {
    state.showcase = { ...state.showcase, ...body };
    await cacheSalonStateLocally(state);
    return jsonResponse({ showcase: state.showcase });
  }

  if (path === '/api/showcase/upload-image' && method === 'POST') {
    const dataUrl = String(body.dataUrl || '');
    return jsonResponse({ url: dataUrl });
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

  // 14. Offers & Reviews
  if (path === '/api/offers' && method === 'POST') {
    const offer: SalonOffer = {
      id: makeUuid(),
      title: String(body.title || 'Offer'),
      badge: String(body.badge || 'OFFER'),
      description: String(body.description || ''),
      valid_until: String(body.valid_until || ''),
      show_popup: Boolean(body.show_popup),
      is_active: true,
      created_at: now,
    };
    state.showcase.offers.unshift(offer);
    await cacheSalonStateLocally(state);
    return jsonResponse({ offer }, 201);
  }

  const offerMatch = path.match(/^\/api\/offers\/([^/]+)$/);
  if (offerMatch && (method === 'PATCH' || method === 'PUT')) {
    const o = state.showcase.offers.find((item) => item.id === offerMatch[1]);
    if (o) Object.assign(o, body);
    await cacheSalonStateLocally(state);
    return jsonResponse({ offer: o });
  }

  if (offerMatch && method === 'DELETE') {
    state.showcase.offers = state.showcase.offers.filter((o) => o.id !== offerMatch[1]);
    await cacheSalonStateLocally(state);
    return jsonResponse({ deleted: true });
  }

  if (path === '/api/reviews' && method === 'POST') {
    const review: SalonReview = {
      id: makeUuid(),
      customer_name: String(body.customer_name || 'Guest'),
      rating: Number(body.rating || 5),
      comment: String(body.comment || ''),
      service_name: String(body.service_name || ''),
      is_visible: true,
      created_at: now,
    };
    state.reviews.unshift(review);
    await cacheSalonStateLocally(state);
    return jsonResponse({ review }, 201);
  }

  const reviewMatch = path.match(/^\/api\/reviews\/([^/]+)$/);
  if (reviewMatch && (method === 'PATCH' || method === 'PUT')) {
    const r = state.reviews.find((item) => item.id === reviewMatch[1]);
    if (r) Object.assign(r, body);
    await cacheSalonStateLocally(state);
    return jsonResponse({ review: r });
  }

  if (reviewMatch && method === 'DELETE') {
    state.reviews = state.reviews.filter((r) => r.id !== reviewMatch[1]);
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
