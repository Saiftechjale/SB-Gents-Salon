import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gift,
  KeyRound,
  MapPin,
  Megaphone,
  MessageCircle,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  User,
  UserCheck,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  BookingPreference,
  SalonBootstrapData,
} from '../types/salon';
import { Language, t } from '../lib/i18n';
import { UpiIntentLauncher } from './UpiIntentLauncher';

interface CustomerBookingPortalProps {
  data: SalonBootstrapData;
  lang: Language;
  isOnline: boolean;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}

type CustomerScreen = 'HOME' | 'WIZARD' | 'CONFIRMED' | 'QUEUE' | 'MY_BOOKINGS';
type AuthOption = 'OTP' | 'GUEST';

export const CustomerBookingPortal: React.FC<CustomerBookingPortalProps> = ({
  data,
  lang,
  isOnline,
  onRefresh,
  notify,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [screen, setScreen] = useState<CustomerScreen>('HOME');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [slideIdx, setSlideIdx] = useState(0);
  const [failedSlides, setFailedSlides] = useState<Record<number, boolean>>({});
  const [showOfferPopup, setShowOfferPopup] = useState(false);

  // Customer Reviews State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewService, setReviewService] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const showcase = data.showcase;
  const heroSlides = useMemo(() => {
    const raw = (showcase?.hero_images || []).filter((u) => Boolean(u && u.trim()));
    if (raw.length > 0) return raw.slice(0, 4);
    return [
      showcase?.hero_image_url || '/src/assets/images/salon_hero_interior_1795068719871.jpg',
    ];
  }, [showcase?.hero_images, showcase?.hero_image_url]);

  const activeTickerItems = useMemo(
    () => (showcase?.ticker_items || []).filter((item) => item.is_active && item.text.trim()),
    [showcase?.ticker_items]
  );
  const activeHeroHighlights = useMemo(
    () => (showcase?.hero_highlights || []).filter((item) => item.is_active && item.text.trim()),
    [showcase?.hero_highlights]
  );
  const activeOffers = useMemo(
    () => (showcase?.offers || []).filter((o) => o.is_active),
    [showcase?.offers]
  );
  const popupOffers = useMemo(
    () => activeOffers.filter((o) => o.show_popup),
    [activeOffers]
  );
  const visibleReviews = useMemo(
    () => (data.reviews || []).filter((r) => r.is_visible),
    [data.reviews]
  );
  const avgReviewRating = useMemo(() => {
    if (visibleReviews.length === 0) return null;
    const sum = visibleReviews.reduce((acc, r) => acc + Number(r.rating || 5), 0);
    return (sum / visibleReviews.length).toFixed(1);
  }, [visibleReviews]);

  useEffect(() => {
    setFailedSlides({});
    setSlideIdx((prev) => (prev >= heroSlides.length ? 0 : prev));
  }, [heroSlides]);

  useEffect(() => {
    if (screen !== 'HOME' || heroSlides.length <= 1) return;
    const interval = setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % heroSlides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [screen, heroSlides.length]);

  useEffect(() => {
    if (screen !== 'HOME' || popupOffers.length === 0) return;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sb_dismissed_offers') === '1') {
      return;
    }
    const timer = setTimeout(() => {
      setShowOfferPopup(true);
    }, 450);
    return () => clearTimeout(timer);
  }, [screen, popupOffers.length]);

  const handleCloseOfferPopup = () => {
    setShowOfferPopup(false);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('sb_dismissed_offers', '1');
    }
  };

  // 6-Step Booking Form State
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [bookingPreference, setBookingPreference] = useState<BookingPreference>('OWNER_PREFERRED');
  const [preferredBarberId, setPreferredBarberId] = useState<string>('');
  const [bookingDate, setBookingDate] = useState<string>(todayStr);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // Step 5: Two Login / Verification Options
  const [authOption, setAuthOption] = useState<AuthOption>('GUEST');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('sb_customer_phone') || '';
  });
  const [haircutPreference, setHaircutPreference] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');

  // OTP Verification State
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpPreviewCode, setOtpPreviewCode] = useState<string | null>(null);
  const [otpVerifiedToken, setOtpVerifiedToken] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Confirmed Booking Receipt
  const [confirmedBooking, setConfirmedBooking] = useState<{
    id?: string;
    reference_code: string;
    token_number: number;
    barber_name: string;
    booking_date: string;
    slot_time: string;
    total_amount: number;
    customer_name: string;
    customer_phone: string;
    services_names: string;
  } | null>(null);

  // My Bookings Lookup & Remembered Customer Phone
  const [lookupPhone, setLookupPhone] = useState(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('sb_customer_phone') || '';
  });
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initializedNotifRef = useRef(false);

  const ownerBarber = useMemo(
    () => data.staff.find((s) => s.is_owner && s.is_active),
    [data.staff]
  );

  const activeStaffList = useMemo(
    () => data.staff.filter((s) => s.is_active),
    [data.staff]
  );

  const activeServices = useMemo(
    () => data.services.filter((s) => s.is_active),
    [data.services]
  );

  const selectedServices = useMemo(
    () => activeServices.filter((s) => selectedServiceIds.includes(s.id)),
    [activeServices, selectedServiceIds]
  );

  const totalPrice = useMemo(
    () => selectedServices.reduce((sum, s) => sum + Number(s.price), 0),
    [selectedServices]
  );

  const totalDuration = useMemo(
    () => selectedServices.reduce((sum, s) => sum + Number(s.duration_minutes), 0),
    [selectedServices]
  );

  // Quick 7-day selector options
  const upcomingDates = useMemo(() => {
    const list: { dateStr: string; dayShort: string; dayNum: string; dayFull: string; isHoliday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayFull = d.toLocaleDateString('en-US', { weekday: 'long' });
      list.push({
        dateStr,
        dayShort: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        dayFull,
        isHoliday: data.settings.weekly_holidays.includes(dayFull),
      });
    }
    return list;
  }, [data.settings.weekly_holidays]);

  const selectedDayName = useMemo(() => {
    if (!bookingDate) return '';
    return new Date(`${bookingDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  }, [bookingDate]);

  const isHolidayDate = useMemo(
    () => data.settings.weekly_holidays.includes(selectedDayName),
    [data.settings.weekly_holidays, selectedDayName]
  );

  // Real-time bookable time slots respecting Owner Booking Rule & double-booking prevention
  const slotAvailabilityList = useMemo(() => {
    const isToday = bookingDate === todayStr;
    const enabledSlots = data.timeSlots.filter((ts) => ts.is_enabled);

    return enabledSlots.map((slot) => {
      if (isHolidayDate) {
        return { slot_time: slot.slot_time, bookable: false, reason: 'Weekly Holiday' };
      }
      if (bookingPreference === 'OWNER_PREFERRED') {
        if (!ownerBarber) {
          return { slot_time: slot.slot_time, bookable: false, reason: 'Owner not configured' };
        }
        if (isToday && ownerBarber.availability_status === 'Not Available') {
          return { slot_time: slot.slot_time, bookable: false, reason: 'Owner Not Available' };
        }
        const booked = data.bookings.some(
          (b) =>
            b.barber_id === ownerBarber.id &&
            b.booking_date === bookingDate &&
            b.slot_time === slot.slot_time &&
            b.status !== 'CANCELLED'
        );
        return {
          slot_time: slot.slot_time,
          bookable: !booked,
          reason: booked ? 'Booked' : 'Available',
        };
      }
      if (bookingPreference === 'SPECIFIC_STAFF') {
        const target = activeStaffList.find((s) => s.id === preferredBarberId);
        if (!target) {
          return { slot_time: slot.slot_time, bookable: false, reason: 'Choose barber' };
        }
        if (isToday && target.availability_status === 'Not Available') {
          return { slot_time: slot.slot_time, bookable: false, reason: 'Barber Not Available' };
        }
        const booked = data.bookings.some(
          (b) =>
            b.barber_id === target.id &&
            b.booking_date === bookingDate &&
            b.slot_time === slot.slot_time &&
            b.status !== 'CANCELLED'
        );
        return {
          slot_time: slot.slot_time,
          bookable: !booked,
          reason: booked ? 'Booked' : 'Available',
        };
      }

      // ANY_AVAILABLE
      const candidates = activeStaffList.filter(
        (s) => !isToday || s.availability_status !== 'Not Available'
      );
      const anyFree = candidates.some((barber) => {
        const hasBooking = data.bookings.some(
          (b) =>
            b.barber_id === barber.id &&
            b.booking_date === bookingDate &&
            b.slot_time === slot.slot_time &&
            b.status !== 'CANCELLED'
        );
        return !hasBooking;
      });
      return {
        slot_time: slot.slot_time,
        bookable: anyFree,
        reason: anyFree ? 'Available' : 'Full',
      };
    });
  }, [
    bookingDate,
    todayStr,
    data.timeSlots,
    data.bookings,
    isHolidayDate,
    bookingPreference,
    ownerBarber,
    activeStaffList,
    preferredBarberId,
  ]);

  // Live Queue metrics for today
  const todayQueue = useMemo(() => {
    const todaysActive = data.bookings
      .filter((b) => b.booking_date === todayStr && (b.status === 'IN_PROGRESS' || b.status === 'WAITING'))
      .sort((a, b) => a.token_number - b.token_number);

    const inProgressList = todaysActive.filter((b) => b.status === 'IN_PROGRESS');
    const waitingList = todaysActive.filter((b) => b.status === 'WAITING');
    const currentServing = inProgressList[0] || waitingList[0] || null;
    const nextCustomer = waitingList[0] || null;

    const availableBarbersCount = Math.max(
      1,
      activeStaffList.filter((s) => s.availability_status !== 'Not Available').length
    );
    const totalWaitingMins = waitingList.reduce((sum, b) => {
      const bDur = b.services?.reduce((acc, s) => acc + Number(s.duration_minutes || 30), 0) || 30;
      return sum + bDur;
    }, 0);
    const estWaitMins = Math.round(totalWaitingMins / availableBarbersCount);

    return {
      todaysActive,
      waitingList,
      currentServing,
      nextCustomer,
      estWaitMins,
    };
  }, [data.bookings, todayStr, activeStaffList]);

  // Active Customer Phone for Live Notifications & Active Appointment Banner
  const activeCustomerPhone = useMemo(() => {
    const candidates = [
      confirmedBooking?.customer_phone,
      lookupPhone.replace(/\D/g, ''),
      customerPhone.replace(/\D/g, ''),
      typeof localStorage !== 'undefined' ? localStorage.getItem('sb_customer_phone') || '' : '',
    ];
    return candidates.find((p) => p && p.length === 10) || '';
  }, [confirmedBooking?.customer_phone, lookupPhone, customerPhone]);

  // Customer Live Notifications (filtered to this customer's phone)
  const customerNotifications = useMemo(() => {
    if (activeCustomerPhone.length !== 10) return [];
    return data.notifications.filter(
      (n) => n.recipient_role === 'CUSTOMER' && n.recipient_phone === activeCustomerPhone
    );
  }, [data.notifications, activeCustomerPhone]);

  const unreadNotificationsCount = useMemo(
    () => customerNotifications.filter((n) => !n.is_read).length,
    [customerNotifications]
  );

  // Live toast + browser Notification when salon shifts timing or starts chair
  useEffect(() => {
    if (!initializedNotifRef.current) {
      for (const n of customerNotifications) {
        seenNotifIdsRef.current.add(n.id);
      }
      initializedNotifRef.current = true;
      return;
    }

    for (const n of customerNotifications) {
      if (!seenNotifIdsRef.current.has(n.id)) {
        seenNotifIdsRef.current.add(n.id);
        if (!n.is_read) {
          notify('success', `${n.title}: ${n.message}`);
          if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(`${data.salon.name} — ${n.title}`, {
                body: n.message,
              });
            } catch {
              // Ignore browser notification errors in restricted iframes
            }
          }
        }
      }
    }
  }, [customerNotifications, data.salon.name, notify]);

  // Customer's Active Appointment Today (Live Timing & Queue Position)
  const myActiveAppointment = useMemo(() => {
    if (activeCustomerPhone.length !== 10) return null;
    const active = data.bookings
      .filter(
        (b) =>
          b.customer_phone === activeCustomerPhone &&
          (b.status === 'IN_PROGRESS' || b.status === 'WAITING')
      )
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.token_number - b.token_number);

    const booking = active.find((b) => b.booking_date === todayStr) || active[0];
    if (!booking) return null;

    const aheadList =
      booking.booking_date === todayStr
        ? data.bookings.filter(
            (b) =>
              b.booking_date === todayStr &&
              b.status === 'WAITING' &&
              b.token_number < booking.token_number
          )
        : [];
    const estWaitMins = aheadList.reduce((sum, b) => {
      const dur = b.services?.reduce((acc, s) => acc + Number(s.duration_minutes || 30), 0) || 30;
      return sum + dur;
    }, 0);

    return {
      booking,
      customersAhead: aheadList.length,
      estWaitMins,
    };
  }, [activeCustomerPhone, data.bookings, todayStr]);

  // Customer My Bookings lookup
  const customerLookupData = useMemo(() => {
    const clean = lookupPhone.replace(/\D/g, '');
    if (clean.length !== 10) return null;
    const customer = data.customers.find((c) => c.phone === clean);
    const bookings = data.bookings
      .filter((b) => b.customer_phone === clean)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const history = data.serviceHistory.filter((h) => customer && h.customer_id === customer.id);
    return { customer, bookings, history };
  }, [lookupPhone, data.customers, data.bookings, data.serviceHistory]);

  const handleEnableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') {
      notify('error', 'Live browser alerts are not supported on this device.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        notify('success', 'Live turn & timing alerts enabled!');
      } else {
        notify('error', 'Alert permission was dismissed. In-app alerts will still appear here.');
      }
    } catch {
      notify('error', 'Could not enable browser notifications.');
    }
  };

  const handleMarkNotificationsRead = async () => {
    if (activeCustomerPhone.length !== 10) return;
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activeCustomerPhone }),
      });
      await onRefresh();
    } catch {
      // Ignore transient error
    }
  };

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handlePhoneInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setCustomerPhone(digits);
    setOtpVerifiedToken(null);
    setOtpSent(false);
    setOtpPreviewCode(null);
    if (digits.length === 10) {
      const existing = data.customers.find((c) => c.phone === digits);
      if (existing) {
        if (!customerName) setCustomerName(existing.name);
        if (!haircutPreference && existing.haircut_preference) {
          setHaircutPreference(existing.haircut_preference);
        }
      }
    }
  };

  const handleSendOtp = async () => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length !== 10) {
      notify('error', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not send OTP.');
        return;
      }
      setOtpSent(true);
      setOtpPreviewCode(json.verification_code_preview || null);
      notify(
        'success',
        json.verification_code_preview
          ? `Verification OTP sent (Preview Code: ${json.verification_code_preview})`
          : 'OTP sent to your mobile number.'
      );
    } catch (err) {
      notify('error', String(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const digits = customerPhone.replace(/\D/g, '');
    if (otpInput.trim().length < 4) {
      notify('error', 'Please enter the 6-digit OTP code.');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, otp: otpInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Invalid OTP.');
        return;
      }
      setOtpVerifiedToken(json.verification_token);
      if (json.existing_customer?.name && !customerName) {
        setCustomerName(json.existing_customer.name);
      }
      notify('success', 'Mobile number verified via OTP!');
    } catch (err) {
      notify('error', String(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const startWizardWithOptionalService = (preselectId?: string) => {
    if (preselectId && !selectedServiceIds.includes(preselectId)) {
      setSelectedServiceIds([preselectId]);
    }
    setWizardStep(preselectId ? 2 : 1);
    setScreen('WIZARD');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmBooking = async () => {
    if (!isOnline) {
      notify('error', 'Active internet connection required for online booking.');
      return;
    }
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!customerName.trim() || customerName.trim().length < 2) {
      notify('error', 'Please enter your full name.');
      return;
    }
    if (cleanPhone.length !== 10) {
      notify('error', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (authOption === 'OTP' && !otpVerifiedToken) {
      notify('error', 'Please verify your mobile number with OTP or switch to Guest booking.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: cleanPhone,
          service_ids: selectedServiceIds,
          booking_date: bookingDate,
          slot_time: selectedSlot,
          booking_preference: bookingPreference,
          preferred_barber_id: bookingPreference === 'SPECIFIC_STAFF' ? preferredBarberId : undefined,
          booking_type: 'ONLINE',
          haircut_preference: haircutPreference.trim(),
          notes: notes.trim(),
          verification_method: authOption === 'OTP' ? 'OTP_VERIFIED' : 'GUEST_EXPRESS',
          verification_token: authOption === 'OTP' ? otpVerifiedToken : undefined,
          website_honeypot: honeypot,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not complete booking.');
        return;
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('sb_customer_phone', cleanPhone);
      }
      setConfirmedBooking({
        id: json.booking.id,
        reference_code: json.booking.reference_code,
        token_number: json.booking.token_number,
        barber_name: json.booking.barber_name,
        booking_date: json.booking.booking_date,
        slot_time: json.booking.slot_time,
        total_amount: json.booking.total_amount,
        customer_name: json.booking.customer_name,
        customer_phone: json.booking.customer_phone,
        services_names: selectedServices.map((s) => s.name).join(', '),
      });
      setLookupPhone(cleanPhone);
      setSelectedSlot('');
      setOtpVerifiedToken(null);
      setOtpSent(false);
      setOtpInput('');
      await onRefresh();
      setScreen('CONFIRMED');
      notify('success', `Booking Confirmed! Ref: ${json.booking.reference_code}`);
    } catch (err) {
      notify('error', String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Live-synced Confirmed Booking view (auto-reflects Owner time/date/price updates!)
  const liveConfirmed = useMemo(() => {
    if (!confirmedBooking) return null;
    const liveMatch = data.bookings.find(
      (b) =>
        (confirmedBooking.id && b.id === confirmedBooking.id) ||
        b.reference_code === confirmedBooking.reference_code
    );
    if (!liveMatch) return confirmedBooking;
    return {
      ...confirmedBooking,
      token_number: liveMatch.token_number,
      barber_name: liveMatch.barber_name,
      booking_date: liveMatch.booking_date,
      slot_time: liveMatch.slot_time,
      total_amount: liveMatch.total_amount,
      status: liveMatch.status,
      notes: liveMatch.notes,
      services_names:
        liveMatch.services?.map((s) => s.service_name).join(', ') || confirmedBooking.services_names,
    };
  }, [confirmedBooking, data.bookings]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewName.trim() || !reviewComment.trim()) {
      notify('error', 'Please enter your name and review.');
      return;
    }
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: reviewName.trim(),
          rating: reviewRating,
          service_name: reviewService.trim() || undefined,
          comment: reviewComment.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not post review.');
        return;
      }
      setReviewName('');
      setReviewRating(5);
      setReviewService('');
      setReviewComment('');
      setShowReviewModal(false);
      await onRefresh();
      notify('success', 'Thank you! Review posted.');
    } catch (err) {
      notify('error', String(err));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const salonWhatsAppDigits = data.salon.phone.replace(/\D/g, '').slice(-10);
  const salonGeneralWhatsAppUrl = `https://wa.me/91${salonWhatsAppDigits}?text=${encodeURIComponent(
    `Namaste ${data.salon.name}, mujhe appointment book karna hai.\nName: ${
      customerName || ''
    }\nService: ${
      selectedServices.length > 0 ? selectedServices.map((s) => s.name).join(', ') : ''
    }\nDate: ${bookingDate || 'Today'}\nTime: ${selectedSlot || ''}`
  )}`;

  const bookingWhatsAppUrl = liveConfirmed
    ? `https://wa.me/91${salonWhatsAppDigits}?text=${encodeURIComponent(
        `Hello ${data.salon.name}, my booking is confirmed!\nRef: ${liveConfirmed.reference_code}\nToken: #${liveConfirmed.token_number}\nName: ${liveConfirmed.customer_name}\nService: ${liveConfirmed.services_names}\nBarber: ${liveConfirmed.barber_name}\nDate & Time: ${liveConfirmed.booking_date} at ${liveConfirmed.slot_time}`
      )}`
    : salonGeneralWhatsAppUrl;

  const selectedBarberDisplay =
    bookingPreference === 'OWNER_PREFERRED'
      ? `${ownerBarber?.name || 'Salon Owner'} (Owner Preferred)`
      : bookingPreference === 'SPECIFIC_STAFF'
      ? activeStaffList.find((s) => s.id === preferredBarberId)?.name || 'Selected Barber'
      : 'Any Available Barber';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex items-center gap-3 text-rose-700 dark:text-rose-300 text-sm">
          <WifiOff className="w-5 h-5 shrink-0" />
          <div>
            <strong>Internet Connection Required:</strong> Please connect to the internet to book a new appointment or check live barber slots.
          </div>
        </div>
      )}

      {/* ==========================================================================
          SCREEN 1: CUSTOMER HOME SCREEN
         ========================================================================== */}
      {screen === 'HOME' && (
        <div className="space-y-6">
          {/* Owner-Controlled Live Running Ticker */}
          {showcase?.ticker_enabled && activeTickerItems.length > 0 && (
            <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border border-amber-500/35 px-3 py-2.5 flex items-center gap-3 overflow-hidden">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-[11px] shrink-0">
                <Megaphone className="w-3.5 h-3.5" />
                <span>LIVE</span>
              </span>
              <div className="flex-1 overflow-hidden relative">
                <div className="sb-ticker-track flex items-center gap-8 whitespace-nowrap text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {[...activeTickerItems, ...activeTickerItems].map((item, idx) => (
                    <span key={`${item.id}_${idx}`} className="inline-flex items-center gap-2 shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{item.text}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Clean 3–4 Image Carousel + Separate Salon Info Card Below (Zero Photo Clutter) */}
          <div className="rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative h-56 sm:h-72 w-full bg-slate-950 overflow-hidden">
              {!failedSlides[slideIdx] ? (
                <img
                  key={heroSlides[slideIdx]}
                  src={heroSlides[slideIdx]}
                  alt={data.salon.name}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedSlides((prev) => ({ ...prev, [slideIdx]: true }))
                  }
                  className="w-full h-full object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 flex items-center justify-center">
                  <Scissors className="w-16 h-16 text-amber-500/40" />
                </div>
              )}

              {heroSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous Slide"
                    onClick={() =>
                      setSlideIdx((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next Slide"
                    onClick={() => setSlideIdx((prev) => (prev + 1) % heroSlides.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5">
                    {heroSlides.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Slide ${idx + 1}`}
                        onClick={() => setSlideIdx(idx)}
                        className={`h-2 rounded-full transition-all ${
                          idx === slideIdx
                            ? 'w-6 bg-amber-400'
                            : 'w-2 bg-white/60 hover:bg-white'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <span>{showcase?.hero_badge || 'Gents Salon & Grooming'}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span className="font-mono tabular-nums">
                    {data.settings.opening_time} – {data.settings.closing_time}
                  </span>
                  {ownerBarber && (
                    <>
                      <span aria-hidden="true">&middot;</span>
                      <span>
                        {ownerBarber.name}: {ownerBarber.availability_status}
                      </span>
                    </>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {showcase?.hero_title || data.salon.name}
                </h1>

                {showcase?.hero_subtitle && (
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    {showcase.hero_subtitle}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{data.salon.address}</span>
                  </span>
                  <span className="flex items-center gap-1.5 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      {data.settings.weekly_holidays.length > 0
                        ? `Closed: ${data.settings.weekly_holidays.join(', ')}`
                        : 'Open All 7 Days'}
                    </span>
                  </span>
                </div>
              </div>

              {activeHeroHighlights.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {activeHeroHighlights.map((hl) => (
                    <span
                      key={hl.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{hl.text}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => startWizardWithOptionalService()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base py-3.5 px-6 min-h-[52px] transition-colors shadow-sm"
                >
                  <Calendar className="w-5 h-5" />
                  <span>{t(lang, 'bookNow')}</span>
                </button>

                <a
                  href={salonGeneralWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3.5 px-5 min-h-[52px] transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>{t(lang, 'whatsappSalon')}</span>
                </a>

                {activeOffers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOfferPopup(true)}
                    className="flex items-center justify-center gap-2 rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-sm py-3.5 px-4 min-h-[52px] transition-colors"
                  >
                    <Gift className="w-5 h-5" />
                    <span>Offers ({activeOffers.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Active Appointment Live Turn Tracker + Live Salon Notifications */}
          {myActiveAppointment && (
            <div className="rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 font-mono font-extrabold text-base flex items-center justify-center shrink-0 tabular-nums">
                    #{myActiveAppointment.booking.token_number}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {myActiveAppointment.booking.status === 'IN_PROGRESS'
                        ? 'Your Turn Now — Chair Ready!'
                        : 'Your Active Appointment'}
                    </div>
                    <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {myActiveAppointment.booking.booking_date} at{' '}
                      <span className="font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                        {myActiveAppointment.booking.slot_time}
                      </span>{' '}
                      · {myActiveAppointment.booking.barber_name}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {myActiveAppointment.booking.status === 'IN_PROGRESS'
                        ? 'Barber is ready for you now.'
                        : `${myActiveAppointment.customersAhead} customer(s) ahead · Est. wait ~${myActiveAppointment.estWaitMins} mins`}
                      {myActiveAppointment.booking.notes
                        ? ` · Note: ${myActiveAppointment.booking.notes}`
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {notifPermission === 'default' && (
                    <button
                      type="button"
                      onClick={handleEnableBrowserAlerts}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs min-h-[38px]"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      <span>Enable Turn Alerts</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScreen('QUEUE')}
                    className="px-3.5 py-2 rounded-xl border border-amber-500/40 bg-white dark:bg-slate-900 text-xs font-bold min-h-[38px]"
                  >
                    Live Queue
                  </button>
                </div>
              </div>
            </div>
          )}

          {customerNotifications.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Bell className="w-4 h-4 text-amber-500" />
                  <span>Live Updates &amp; Timing Alerts</span>
                  {unreadNotificationsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-extrabold tabular-nums">
                      {unreadNotificationsCount} new
                    </span>
                  )}
                </div>
                {unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkNotificationsRead}
                    className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Mark Read
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-44 overflow-y-auto">
                {customerNotifications.slice(0, 4).map((n) => (
                  <div
                    key={n.id}
                    className={`py-2 text-xs ${!n.is_read ? 'font-semibold' : 'opacity-80'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-900 dark:text-slate-100">{n.title}</span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {new Date(n.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Status & Tracking Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setScreen('QUEUE')}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 text-left hover:border-amber-500 transition-colors flex items-center justify-between min-h-[84px]"
            >
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'liveQueue')}
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {todayQueue.currentServing
                    ? `Serving Token #${todayQueue.currentServing.token_number}`
                    : 'No Queue — Seat Available'}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                  {todayQueue.waitingList.length} waiting · ~{todayQueue.estWaitMins} {t(lang, 'mins')} wait
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setScreen('MY_BOOKINGS')}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 text-left hover:border-amber-500 transition-colors flex items-center justify-between min-h-[84px]"
            >
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Bookings</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  My Bookings &amp; History
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
            </button>
          </div>

          {/* Services & Prices Menu on Home Screen */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Services &amp; Prices
              </h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {activeServices.length} services
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeServices.map((srv) => (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => startWizardWithOptionalService(srv.id)}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-amber-500 text-left transition-all flex items-center justify-between min-h-[68px]"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {lang === 'hi' && srv.name_hi ? srv.name_hi : srv.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {lang === 'hi' ? srv.name : srv.name_hi || srv.category} · {srv.duration_minutes} mins
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                      ₹{srv.price}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">Book &rarr;</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Customer Reviews & Ratings */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Customer Reviews
                </h2>
                {avgReviewRating && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-xs font-extrabold tabular-nums">
                    {avgReviewRating} ★ ({visibleReviews.length})
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowReviewModal(true)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs min-h-[38px]"
              >
                + Write Review
              </button>
            </div>

            {visibleReviews.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                No reviews yet. Be the first to share your experience!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {rev.customer_name}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= rev.rating
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {rev.comment}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{rev.service_name || ''}</span>
                      <span className="font-mono">
                        {new Date(rev.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          SCREEN 2: 6-STEP GUIDED BOOKING WIZARD
         ========================================================================== */}
      {screen === 'WIZARD' && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6">
          {/* Wizard Top Progress Bar */}
          <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 1) {
                    setScreen('HOME');
                  } else {
                    setWizardStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5 | 6);
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-500 min-h-[36px]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{wizardStep === 1 ? 'Back to Salon Home' : 'Previous Step'}</span>
              </button>
              <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                Step {wizardStep} of 6
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((step) => (
                <div
                  key={step}
                  className={`h-1.5 rounded-full transition-colors ${
                    step <= wizardStep
                      ? 'bg-amber-500'
                      : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* STEP 1: SELECT SERVICE */}
          {wizardStep === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Step 1: Select Service
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeServices.map((srv) => {
                  const selected = selectedServiceIds.includes(srv.id);
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => toggleService(srv.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between min-h-[72px] ${
                        selected
                          ? 'bg-amber-500/10 border-amber-500 text-slate-900 dark:text-slate-100'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center border ${
                            selected
                              ? 'bg-amber-500 border-amber-500 text-slate-950'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {selected && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm">
                            {srv.name}{' '}
                            {srv.name_hi && (
                              <span className="font-normal text-xs text-slate-500">
                                ({srv.name_hi})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {srv.duration_minutes} mins · {srv.category}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono text-lg font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                        ₹{srv.price}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 flex items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500">Selected Total</div>
                  <div className="font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                    ₹{totalPrice}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({totalDuration} mins)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={selectedServiceIds.length === 0}
                  onClick={() => setWizardStep(2)}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm min-h-[48px] flex items-center gap-2"
                >
                  <span>Next: Choose Barber</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SELECT BARBER */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Step 2: Select Barber
              </h2>

              <div className="grid grid-cols-1 gap-3">
                {/* Option 1: Owner Preferred */}
                <button
                  type="button"
                  onClick={() => {
                    setBookingPreference('OWNER_PREFERRED');
                    setSelectedSlot('');
                  }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between gap-4 ${
                    bookingPreference === 'OWNER_PREFERRED'
                      ? 'bg-amber-500/10 border-amber-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-slate-100">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <span>Owner Preferred</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {ownerBarber ? ownerBarber.name : 'Salon Owner'}
                    </p>
                  </div>
                  {ownerBarber && (
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                      {ownerBarber.availability_status}
                    </span>
                  )}
                </button>

                {/* Option 2: Specific Staff */}
                <button
                  type="button"
                  onClick={() => {
                    setBookingPreference('SPECIFIC_STAFF');
                    if (!preferredBarberId && activeStaffList.length > 0) {
                      const staffOnly = activeStaffList.find((s) => !s.is_owner) || activeStaffList[0];
                      setPreferredBarberId(staffOnly.id);
                    }
                    setSelectedSlot('');
                  }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between gap-4 ${
                    bookingPreference === 'SPECIFIC_STAFF'
                      ? 'bg-amber-500/10 border-amber-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-slate-100">
                    <UserCheck className="w-5 h-5 text-amber-500" />
                    <span>Specific Staff</span>
                  </div>
                </button>

                {/* Specific Staff List */}
                {bookingPreference === 'SPECIFIC_STAFF' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pl-2">
                    {activeStaffList.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setPreferredBarberId(member.id);
                          setSelectedSlot('');
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all min-h-[64px] ${
                          preferredBarberId === member.id
                            ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 border-amber-500'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="font-bold text-sm">{member.name}</div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {member.specialty} · {member.availability_status}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Option 3: Any Available */}
                <button
                  type="button"
                  onClick={() => {
                    setBookingPreference('ANY_AVAILABLE');
                    setSelectedSlot('');
                  }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between gap-4 ${
                    bookingPreference === 'ANY_AVAILABLE'
                      ? 'bg-amber-500/10 border-amber-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-slate-100">
                    <Users className="w-5 h-5 text-amber-500" />
                    <span>Any Available</span>
                  </div>
                </button>
              </div>

              <div className="pt-2 flex justify-end border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={bookingPreference === 'SPECIFIC_STAFF' && !preferredBarberId}
                  onClick={() => setWizardStep(3)}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm min-h-[48px] flex items-center gap-2"
                >
                  <span>Next: Select Date</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SELECT DATE */}
          {wizardStep === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Step 3: Select Date
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {upcomingDates.map((d) => {
                  const isSel = bookingDate === d.dateStr;
                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      disabled={d.isHoliday}
                      onClick={() => {
                        setBookingDate(d.dateStr);
                        setSelectedSlot('');
                      }}
                      className={`p-4 rounded-2xl border-2 text-left transition-all min-h-[76px] ${
                        d.isHoliday
                          ? 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed'
                          : isSel
                          ? 'bg-amber-500/15 border-amber-500 text-slate-900 dark:text-slate-100'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {d.isHoliday ? 'Closed (Holiday)' : d.dayShort}
                      </div>
                      <div className="font-mono text-base font-extrabold mt-0.5 tabular-nums">
                        {d.dayNum}
                      </div>
                      <div className="text-[11px] text-slate-500">{d.dayFull}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <label className="text-xs font-medium text-slate-500">Or choose another date:</label>
                <input
                  type="date"
                  min={todayStr}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    setSelectedSlot('');
                  }}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>

              {isHolidayDate && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Salon is closed on {selectedDayName}s. Please pick another date.</span>
                </div>
              )}

              <div className="pt-2 flex justify-end border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={!bookingDate || isHolidayDate}
                  onClick={() => setWizardStep(4)}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm min-h-[48px] flex items-center gap-2"
                >
                  <span>Next: Available Time</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: SELECT AVAILABLE TIME */}
          {wizardStep === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Step 4: Select Available Time
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Showing open slots on <strong className="font-mono">{bookingDate}</strong> for{' '}
                  <strong>{selectedBarberDisplay}</strong>.
                </p>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                {slotAvailabilityList.map((slot) => {
                  const isSel = selectedSlot === slot.slot_time;
                  return (
                    <button
                      key={slot.slot_time}
                      type="button"
                      disabled={!slot.bookable}
                      onClick={() => setSelectedSlot(slot.slot_time)}
                      className={`py-3 px-2 rounded-xl font-mono text-sm font-bold border-2 transition-all min-h-[50px] tabular-nums ${
                        !slot.bookable
                          ? 'bg-slate-100 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800/50 text-slate-400 dark:text-slate-600 line-through cursor-not-allowed'
                          : isSel
                          ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-amber-500'
                      }`}
                    >
                      {slot.slot_time}
                    </button>
                  );
                })}
              </div>

              {slotAvailabilityList.every((s) => !s.bookable) && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                  No bookable slots remain for this barber on {bookingDate}. Go back to Step 2 or Step 3 to pick another date or barber.
                </div>
              )}

              <div className="pt-2 flex justify-end border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={!selectedSlot}
                  onClick={() => setWizardStep(5)}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm min-h-[48px] flex items-center gap-2"
                >
                  <span>Next: Your Details</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: CUSTOMER NAME & MOBILE */}
          {wizardStep === 5 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Step 5: Your Details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAuthOption('GUEST')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    authOption === 'GUEST'
                      ? 'bg-amber-500/10 border-amber-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                    <User className="w-4 h-4 text-amber-500" />
                    <span>Quick Guest Booking</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAuthOption('OTP')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    authOption === 'OTP'
                      ? 'bg-amber-500/10 border-amber-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    <span>Verify with OTP</span>
                  </div>
                </button>
              </div>

              {/* Honeypot anti-spam field (hidden from real humans) */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                aria-hidden="true"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Mobile Number (10 Digits) *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      required
                      placeholder="9876543210"
                      value={customerPhone}
                      onChange={(e) => handlePhoneInput(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-3 text-base font-mono tabular-nums"
                    />
                    {authOption === 'OTP' && !otpVerifiedToken && (
                      <button
                        type="button"
                        disabled={otpLoading || customerPhone.length !== 10}
                        onClick={handleSendOtp}
                        className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs whitespace-nowrap disabled:opacity-40"
                      >
                        {otpLoading ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-3 text-base"
                  />
                </div>
              </div>

              {/* OTP Verification Box */}
              {authOption === 'OTP' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  {otpVerifiedToken ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                      <ShieldCheck className="w-5 h-5" />
                      <span>Mobile Number Verified via OTP!</span>
                    </div>
                  ) : otpSent ? (
                    <div className="space-y-2.5">
                      {otpPreviewCode && (
                        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg">
                          Verification OTP Code: <strong className="font-mono text-sm">{otpPreviewCode}</strong>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Enter 6-digit OTP"
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-base font-mono tracking-widest"
                        />
                        <button
                          type="button"
                          disabled={otpLoading || otpInput.length < 6}
                          onClick={handleVerifyOtp}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-40 min-h-[44px]"
                        >
                          {otpLoading ? 'Verifying...' : 'Verify OTP'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      Enter your 10-digit mobile number above and tap <strong>Send OTP</strong> to verify.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Haircut Style Preference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Medium Fade, Scissor Trim"
                    value={haircutPreference}
                    onChange={(e) => setHaircutPreference(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Special Request (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Any note for your barber"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={
                    customerName.trim().length < 2 ||
                    customerPhone.length !== 10 ||
                    (authOption === 'OTP' && !otpVerifiedToken)
                  }
                  onClick={() => setWizardStep(6)}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm min-h-[48px] flex items-center gap-2"
                >
                  <span>Next: Review &amp; Confirm</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: CONFIRM BOOKING */}
          {wizardStep === 6 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Step 6: Confirm Booking
              </h2>

              <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                <div className="p-4 flex items-center justify-between">
                  <span className="text-slate-500">Services</span>
                  <span className="font-bold text-right">
                    {selectedServices.map((s) => s.name).join(', ')}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-slate-500">Barber Preference</span>
                  <span className="font-bold text-right">{selectedBarberDisplay}</span>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-slate-500">Date &amp; Time</span>
                  <span className="font-mono font-bold tabular-nums">
                    {bookingDate} · {selectedSlot}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-bold text-right">
                    {customerName} (+91 {customerPhone})
                    {authOption === 'OTP' && ' · OTP Verified'}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-between bg-amber-500/10">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    Estimated Total
                  </span>
                  <span className="font-mono text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                    ₹{totalPrice}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={submitting || !isOnline}
                onClick={handleConfirmBooking}
                className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-extrabold text-base min-h-[54px] shadow-sm transition-colors"
              >
                {submitting ? 'Confirming Booking...' : `Confirm Booking · ₹${totalPrice}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          SCREEN 3: BOOKING CONFIRMATION SCREEN (LIVE-SYNCED)
         ========================================================================== */}
      {screen === 'CONFIRMED' && liveConfirmed && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-emerald-500/40 p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Appointment Confirmed!
            </h2>
          </div>

          {notifPermission === 'default' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Live Turn Alerts
              </div>
              <button
                type="button"
                onClick={handleEnableBrowserAlerts}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Enable Alerts</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
              <div className="text-xs text-slate-500">Booking Reference Number</div>
              <div className="font-mono text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {liveConfirmed.reference_code}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
              <div className="text-xs text-slate-500">Live Queue Token</div>
              <div className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                Token #{liveConfirmed.token_number}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            <div className="p-3.5 flex justify-between">
              <span className="text-slate-500">Customer Name</span>
              <span className="font-bold">{liveConfirmed.customer_name}</span>
            </div>
            <div className="p-3.5 flex justify-between">
              <span className="text-slate-500">Services</span>
              <span className="font-bold text-right">{liveConfirmed.services_names}</span>
            </div>
            <div className="p-3.5 flex justify-between">
              <span className="text-slate-500">Assigned Barber</span>
              <span className="font-bold">{liveConfirmed.barber_name}</span>
            </div>
            <div className="p-3.5 flex justify-between">
              <span className="text-slate-500">Live Date &amp; Time</span>
              <span className="font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {liveConfirmed.booking_date} · {liveConfirmed.slot_time}
              </span>
            </div>
            <div className="p-3.5 flex justify-between">
              <span className="text-slate-500">Estimated Bill</span>
              <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                ₹{liveConfirmed.total_amount}
              </span>
            </div>
          </div>

          {data.settings.upi_id && liveConfirmed.total_amount > 0 && (
            <UpiIntentLauncher
              upiId={data.settings.upi_id}
              merchantName={data.settings.upi_merchant_name || data.salon.name}
              amount={liveConfirmed.total_amount}
              note={`Booking ${liveConfirmed.reference_code} - ${liveConfirmed.customer_name}`}
              txnRef={liveConfirmed.reference_code}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setScreen('QUEUE')}
              className="w-full py-3.5 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm min-h-[48px] flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              <span>Track Live Queue</span>
            </button>

            <a
              href={bookingWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm min-h-[48px] flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Contact Salon on WhatsApp</span>
            </a>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setScreen('HOME')}
              className="text-xs font-semibold text-slate-500 hover:text-amber-500"
            >
              &larr; Back to Salon Home
            </button>
          </div>
        </div>
      )}

      {/* ==========================================================================
          SCREEN 4: LIVE QUEUE TRACKER
         ========================================================================== */}
      {screen === 'QUEUE' && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setScreen('HOME')}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-500"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Salon Home</span>
            </button>
            <h2 className="text-base font-bold">{t(lang, 'liveQueue')}</h2>
            <button
              type="button"
              onClick={() => startWizardWithOptionalService()}
              className="text-xs font-bold text-amber-600 dark:text-amber-400"
            >
              + Book Slot
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">{t(lang, 'currentToken')}</div>
              <div className="font-mono text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {todayQueue.currentServing ? `#${todayQueue.currentServing.token_number}` : 'Open'}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">{t(lang, 'customersAhead')}</div>
              <div className="font-mono text-2xl font-extrabold mt-1 tabular-nums">
                {todayQueue.waitingList.length}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">{t(lang, 'estWaitTime')}</div>
              <div className="font-mono text-2xl font-extrabold mt-1 tabular-nums">
                ~{todayQueue.estWaitMins} {t(lang, 'mins')}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">{t(lang, 'nextCustomer')}</div>
              <div className="font-bold text-sm mt-1 truncate">
                {todayQueue.nextCustomer
                  ? `#${todayQueue.nextCustomer.token_number} ${todayQueue.nextCustomer.customer_name}`
                  : 'Seat Free'}
              </div>
            </div>
          </div>

          {todayQueue.todaysActive.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
              No waiting queue right now.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              {todayQueue.todaysActive.map((b) => (
                <div key={b.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono font-extrabold text-sm text-amber-600 dark:text-amber-400 tabular-nums">
                      #{b.token_number}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{b.customer_name}</div>
                      <div className="text-xs text-slate-500">
                        {b.barber_name} · {b.slot_time}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                      b.status === 'IN_PROGRESS'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {b.status === 'IN_PROGRESS' ? 'In Chair' : 'Waiting'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          SCREEN 5: MY BOOKINGS & HAIRCUT HISTORY
         ========================================================================== */}
      {screen === 'MY_BOOKINGS' && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setScreen('HOME')}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-500"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Salon Home</span>
            </button>
            <h2 className="text-base font-bold">My Bookings &amp; History</h2>
            <span className="w-14" />
          </div>

          <div className="max-w-md space-y-2">
            <label className="block text-sm font-bold">Enter Your 10-Digit Mobile Number</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="tel"
                placeholder="9876543210"
                value={lookupPhone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setLookupPhone(digits);
                  if (digits.length === 10 && typeof localStorage !== 'undefined') {
                    localStorage.setItem('sb_customer_phone', digits);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-3 text-base font-mono tabular-nums"
              />
            </div>
          </div>

          {customerNotifications.length > 0 && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                  <Bell className="w-4 h-4" />
                  <span>Live Timing &amp; Queue Notifications ({customerNotifications.length})</span>
                </div>
                {unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkNotificationsRead}
                    className="text-xs font-semibold text-amber-700 dark:text-amber-300 underline"
                  >
                    Mark All Read
                  </button>
                )}
              </div>
              <div className="divide-y divide-amber-500/20 max-h-44 overflow-y-auto text-xs">
                {customerNotifications.slice(0, 6).map((n) => (
                  <div key={n.id} className="py-2">
                    <div className="font-bold">{n.title}</div>
                    <div className="text-slate-600 dark:text-slate-300">{n.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!customerLookupData ? (
            <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
              Enter your 10-digit mobile number to view your booking status and haircut history.
            </div>
          ) : (
            <div className="space-y-5">
              {customerLookupData.bookings.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">Your Bookings ({customerLookupData.bookings.length})</h3>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    {customerLookupData.bookings.map((b) => (
                      <div key={b.id} className="p-4 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-sm">
                            {b.reference_code || `Token #${b.token_number}`} ·{' '}
                            {b.services?.map((s) => s.service_name).join(', ') || 'Service'}
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            {b.booking_date} at <strong className="font-mono text-amber-600 dark:text-amber-400">{b.slot_time}</strong> · {b.barber_name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-sm tabular-nums">₹{b.total_amount}</div>
                          <div className="text-slate-500">{b.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {customerLookupData.history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">Previous Haircuts ({customerLookupData.history.length})</h3>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    {customerLookupData.history.map((h) => (
                      <div key={h.id} className="p-4 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-sm">{h.services_summary}</div>
                          <div className="text-slate-500 mt-0.5">
                            Barber: {h.barber_name} · {h.visit_date}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          Paid ₹{h.amount_paid}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {customerLookupData.bookings.length === 0 && customerLookupData.history.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-500">
                  No bookings found for +91 {lookupPhone}.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          CUSTOMER SPECIAL OFFERS POPUP MODAL
         ========================================================================== */}
      {showOfferPopup && activeOffers.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          onClick={handleCloseOfferPopup}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-amber-500/40 p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Special Salon Offers
                  </h3>
                  <p className="text-xs text-slate-500">{data.salon.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseOfferPopup}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {activeOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-50 to-white dark:from-amber-500/10 dark:via-slate-950 dark:to-slate-900 border border-amber-500/30 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-[11px]">
                      <Tag className="w-3 h-3" />
                      <span>{offer.badge || 'SPECIAL OFFER'}</span>
                    </span>
                    {offer.valid_until && (
                      <span className="text-[11px] font-mono text-slate-500">
                        Valid till {offer.valid_until}
                      </span>
                    )}
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {offer.title}
                  </div>
                  {offer.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {offer.description}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseOfferPopup();
                      startWizardWithOptionalService();
                    }}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
                  >
                    Book This Offer Now &rarr;
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCloseOfferPopup}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            >
              Close Offers
            </button>
          </div>
        </div>
      )}

      {/* ==========================================================================
          WRITE CUSTOMER REVIEW MODAL
         ========================================================================== */}
      {showReviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          onClick={() => setShowReviewModal(false)}
        >
          <form
            onSubmit={handleSubmitReview}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Write a Review
              </h3>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="p-1.5 rounded-lg text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Rating *</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1.5 rounded-lg hover:bg-amber-500/10"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= reviewRating
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Your Name *</label>
              <input
                type="text"
                required
                placeholder="Enter your name"
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Service (Optional)
              </label>
              <select
                value={reviewService}
                onChange={(e) => setReviewService(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
              >
                <option value="">-- Select Service --</option>
                {activeServices.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Review *</label>
              <textarea
                rows={3}
                required
                placeholder="Share your experience..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={reviewSubmitting}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
            >
              {reviewSubmitting ? 'Submitting...' : 'Post Review'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
