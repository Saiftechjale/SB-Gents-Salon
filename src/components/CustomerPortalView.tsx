import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  KeyRound,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  Moon,
  QrCode,
  Receipt,
  Search,
  Sparkles,
  Sun,
  Tag,
  User,
  Users,
} from 'lucide-react';
import type {
  Booking,
  BookingPreference,
  OfferAccentTheme,
  SalonBootstrapData,
} from '../types/salon';
import { Language } from '../lib/i18n';
import { apiFetch } from '../lib/api';
import { playAlertChime, requestNotificationPermission, sendNativeNotification } from '../lib/alerts';
import {
  buildCustomerBookingToSalonText,
  buildCustomerReceiptRequestText,
  buildSmsUrl,
  buildWhatsAppUrl,
  cleanPhone10,
} from '../lib/messagingTemplates';
import { calculateOfferDiscount, isWeakPin, WEAK_PIN_MSG } from '../lib/pinSecurity';
import { buildUpiDeepLinks } from '../lib/upiIntent';
import { PWAInstallButton } from './PWAInstallButton';
import {
  cleanDisplayName,
  formatServiceCombo,
  formatShortDate,
  formatSlot12h,
  getAvatarColorClass,
  getInitials,
  getLocalTodayStr,
  getServiceVisualTag,
  getSingleInitial,
  isSlotInPastForDate,
  normalizeTimesInText12h,
} from '../lib/salonUiHelpers';

const OFFER_THEME_CLASSES: Record<OfferAccentTheme, string> = {
  PURPLE: 'from-[#6C3BF5] via-[#8B5CF6] to-[#EC4899]',
  GOLD: 'from-amber-500 via-orange-500 to-rose-500',
  EMERALD: 'from-emerald-600 via-teal-600 to-cyan-600',
  ROSE: 'from-rose-600 via-pink-600 to-fuchsia-600',
};

export type CustomerTab = 'HOME' | 'BOOKING' | 'QUEUE' | 'BILLING' | 'PROFILE';

interface CustomerPortalViewProps {
  data: SalonBootstrapData;
  lang: Language;
  setLang: (lang: Language) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  initialPhone?: string;
  initialName?: string;
  isCustomerApk?: boolean;
  isCustomerLoggedIn?: boolean;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
  onOpenLogin: () => void;
  onLogout?: () => void;
}

export const CustomerPortalView: React.FC<CustomerPortalViewProps> = ({
  data,
  lang,
  setLang,
  darkMode,
  setDarkMode,
  initialPhone,
  initialName,
  isCustomerApk = false,
  isCustomerLoggedIn = false,
  onRefresh,
  notify,
  onOpenLogin,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>('HOME');

  const [customerPhone, setCustomerPhone] = useState<string>(
    () =>
      (initialPhone || localStorage.getItem('sb_customer_phone') || '')
        .replace(/\D/g, '')
        .slice(-10)
  );
  const [customerName, setCustomerName] = useState<string>(
    () => initialName || localStorage.getItem('sb_customer_name') || ''
  );

  useEffect(() => {
    if (initialPhone) {
      const clean = initialPhone.replace(/\D/g, '').slice(-10);
      if (clean.length === 10) setCustomerPhone(clean);
    }
  }, [initialPhone]);

  useEffect(() => {
    if (initialName && initialName.trim()) {
      setCustomerName(initialName.trim());
    }
  }, [initialName]);

  const activeServices = useMemo(
    () => data.services.filter((s) => s.is_active),
    [data.services]
  );
  const activeBarbers = useMemo(
    () => data.staff.filter((s) => s.is_active),
    [data.staff]
  );

  // Offers & Discounts Slider state
  const activeOffers = useMemo(
    () => (data.offers || []).filter((o) => o.is_active),
    [data.offers]
  );
  const [offerSlideIdx, setOfferSlideIdx] = useState<number>(0);
  const [sliderPaused, setSliderPaused] = useState<boolean>(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [promoInput, setPromoInput] = useState<string>('');

  // Booking State (Screen 1)
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(() => {
    const first = activeServices[0];
    return first ? [first.id] : [];
  });
  const [selectedBarberId, setSelectedBarberId] = useState<string>('ANY');
  const todayStr = getLocalTodayStr();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [showAllServices, setShowAllServices] = useState<boolean>(false);
  const [showAllSlots, setShowAllSlots] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastBookedId, setLastBookedId] = useState<string>(
    () => localStorage.getItem('sb_last_booking_id') || ''
  );
  const [trackQuery, setTrackQuery] = useState<string>('');
  const [showQueueSearch, setShowQueueSearch] = useState<boolean>(false);
  const [billingMode, setBillingMode] = useState<'CASH' | 'UPI'>('UPI');
  const [billingQrUrl, setBillingQrUrl] = useState<string>('');

  // Customer PIN Change form state in Profile
  const [curPin, setCurPin] = useState<string>('');
  const [newCustPin, setNewCustPin] = useState<string>('');
  const [changingPin, setChangingPin] = useState<boolean>(false);

  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (activeOffers.length <= 1 || sliderPaused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = setInterval(() => {
      setOfferSlideIdx((prev) => (prev + 1) % activeOffers.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [activeOffers.length, sliderPaused]);

  // Proximity alert tracker refs
  const proximityAlertSentRef = useRef<Set<string>>(new Set());
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifInitRef = useRef<boolean>(false);

  // Sync saved customer profile when phone matches DB
  const matchedCustomer = useMemo(() => {
    const clean = customerPhone.replace(/\D/g, '').slice(-10);
    if (clean.length < 10) return null;
    return (
      data.customers.find((c) => c.phone.replace(/\D/g, '').slice(-10) === clean) ||
      null
    );
  }, [data.customers, customerPhone]);

  useEffect(() => {
    if (matchedCustomer && !customerName.trim()) {
      setCustomerName(matchedCustomer.name);
      localStorage.setItem('sb_customer_name', matchedCustomer.name);
    }
  }, [matchedCustomer, customerName]);

  // 5-day date strip (Aaj + next 4 days)
  const dateStrip = useMemo(() => {
    const list: { dateStr: string; topLabel: string; dayNum: string }[] = [];
    const base = new Date(`${todayStr}T00:00:00`);
    for (let i = 0; i < 5; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const topLabel =
        i === 0
          ? 'Aaj'
          : d.toLocaleDateString('en-US', { weekday: 'short' });
      list.push({ dateStr, topLabel, dayNum: String(d.getDate()) });
    }
    return list;
  }, [todayStr]);

  // Enabled time slots & 3x3 upcoming window
  const enabledSlots = useMemo(
    () =>
      data.timeSlots
        .filter((t) => t.is_enabled)
        .sort((a, b) => a.slot_time.localeCompare(b.slot_time)),
    [data.timeSlots]
  );

  const displaySlots = useMemo(() => {
    if (showAllSlots || enabledSlots.length <= 9) return enabledSlots;
    const firstUpcomingIdx = enabledSlots.findIndex(
      (s) => !isSlotInPastForDate(selectedDate, s.slot_time)
    );
    if (firstUpcomingIdx === -1) return enabledSlots.slice(-9);
    const startIdx = Math.max(0, Math.min(firstUpcomingIdx - 2, enabledSlots.length - 9));
    return enabledSlots.slice(startIdx, startIdx + 9);
  }, [enabledSlots, selectedDate, showAllSlots]);

  // 2x2 primary services matching single-screen mobile view
  const displayServices = useMemo(() => {
    if (showAllServices || activeServices.length <= 4) return activeServices;
    const preferredOrder = ['haircut', 'beard', 'facial', 'colour', 'color'];
    const singles = activeServices.filter((s) => !s.name.includes('+'));
    const sorted = [...(singles.length >= 4 ? singles : activeServices)].sort((a, b) => {
      const idxA = preferredOrder.findIndex((k) => a.name.toLowerCase().includes(k));
      const idxB = preferredOrder.findIndex((k) => b.name.toLowerCase().includes(k));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    return sorted.slice(0, 4);
  }, [activeServices, showAllServices]);

  const isSlotBookedForSelection = (slotTime: string, dateStr: string, barberChoice: string) => {
    const activeOnSlot = data.bookings.filter(
      (b) =>
        b.booking_date === dateStr &&
        b.slot_time === slotTime &&
        b.status !== 'CANCELLED'
    );
    if (barberChoice === 'ANY') {
      const availBarbers = activeBarbers.filter(
        (b) => b.availability_status !== 'Not Available'
      );
      return availBarbers.length > 0 && activeOnSlot.length >= availBarbers.length;
    }
    return activeOnSlot.some((b) => b.barber_id === barberChoice);
  };

  // Auto-pick first valid open slot if selectedSlot is empty or invalid
  useEffect(() => {
    const firstOpen = enabledSlots.find(
      (s) =>
        !isSlotInPastForDate(selectedDate, s.slot_time) &&
        !isSlotBookedForSelection(s.slot_time, selectedDate, selectedBarberId)
    );
    if (!selectedSlot && firstOpen) {
      setSelectedSlot(firstOpen.slot_time);
    } else if (selectedSlot) {
      const stillValid =
        !isSlotInPastForDate(selectedDate, selectedSlot) &&
        !isSlotBookedForSelection(selectedSlot, selectedDate, selectedBarberId);
      if (!stillValid && firstOpen) {
        setSelectedSlot(firstOpen.slot_time);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedBarberId, enabledSlots]);

  const selectedServices = useMemo(
    () => activeServices.filter((s) => selectedServiceIds.includes(s.id)),
    [activeServices, selectedServiceIds]
  );
  const totalBill = useMemo(
    () => selectedServices.reduce((sum, s) => sum + Number(s.price), 0),
    [selectedServices]
  );

  const appliedOffer = useMemo(() => {
    if (selectedOfferId) {
      return activeOffers.find((o) => o.id === selectedOfferId) || null;
    }
    const cleanCode = promoInput.trim().toUpperCase();
    if (cleanCode) {
      return (
        activeOffers.find((o) => (o.promo_code || '').trim().toUpperCase() === cleanCode) ||
        null
      );
    }
    return null;
  }, [activeOffers, selectedOfferId, promoInput]);

  const bookingDiscount = useMemo(
    () => calculateOfferDiscount(totalBill, appliedOffer),
    [totalBill, appliedOffer]
  );

  const finalBookingTotal = useMemo(
    () => Math.max(0, totalBill - bookingDiscount),
    [totalBill, bookingDiscount]
  );

  const minBillMissing =
    appliedOffer && Number(appliedOffer.min_bill || 0) > totalBill
      ? Number(appliedOffer.min_bill) - totalBill
      : 0;

  const selectedBarberObj = useMemo(
    () => activeBarbers.find((b) => b.id === selectedBarberId) || null,
    [activeBarbers, selectedBarberId]
  );

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Active Customer Booking for Live Queue (Screen 2)
  const myTrackedBooking = useMemo<Booking | null>(() => {
    const cleanQuery = trackQuery.trim().toLowerCase();
    if (cleanQuery) {
      const qDigits = cleanQuery.replace(/\D/g, '');
      const found = data.bookings
        .filter((b) => {
          const refMatch = (b.reference_code || '').toLowerCase().includes(cleanQuery);
          const tokMatch = qDigits && String(b.token_number) === qDigits;
          const phoneMatch =
            qDigits.length >= 6 &&
            b.customer_phone.replace(/\D/g, '').includes(qDigits);
          return refMatch || tokMatch || phoneMatch;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (found) return found;
    }

    if (lastBookedId) {
      const byId = data.bookings.find((b) => b.id === lastBookedId);
      if (byId && byId.status !== 'CANCELLED') return byId;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length === 10) {
      const byPhone = data.bookings
        .filter(
          (b) =>
            b.customer_phone.replace(/\D/g, '').slice(-10) === cleanPhone &&
            b.status !== 'CANCELLED'
        )
        .sort((a, b) => {
          const rank = (s: string) =>
            s === 'IN_PROGRESS' ? 0 : s === 'WAITING' ? 1 : 2;
          return rank(a.status) - rank(b.status) || b.created_at.localeCompare(a.created_at);
        })[0];
      if (byPhone) return byPhone;
    }

    return null;
  }, [data.bookings, trackQuery, lastBookedId, customerPhone]);

  // Queue metrics for Screen 2
  const queueDate = myTrackedBooking?.booking_date || todayStr;
  const dayQueue = useMemo(
    () =>
      data.bookings
        .filter((b) => b.booking_date === queueDate && b.status !== 'CANCELLED')
        .sort((a, b) => a.token_number - b.token_number),
    [data.bookings, queueDate]
  );

  const activeChairs = useMemo(() => {
    return activeBarbers.slice(0, 4).map((barber, idx) => {
      const inProgress = dayQueue.find(
        (b) => b.barber_id === barber.id && b.status === 'IN_PROGRESS'
      );
      return {
        barber,
        chairNo: idx + 1,
        inProgress,
      };
    });
  }, [activeBarbers, dayQueue]);

  const aheadBookings = useMemo(() => {
    if (!myTrackedBooking) {
      return dayQueue.filter((b) => b.status === 'WAITING');
    }
    if (myTrackedBooking.status !== 'WAITING') return [];
    return dayQueue.filter(
      (b) =>
        b.status === 'WAITING' &&
        b.token_number < myTrackedBooking.token_number
    );
  }, [dayQueue, myTrackedBooking]);

  const estWaitMins = useMemo(() => {
    if (!myTrackedBooking) {
      return aheadBookings.length === 0
        ? 0
        : Math.round((aheadBookings.length * 15) / Math.max(1, activeBarbers.length));
    }
    if (myTrackedBooking.status === 'IN_PROGRESS' || myTrackedBooking.status === 'COMPLETED') {
      return 0;
    }

    const [hStr, mStr] = (myTrackedBooking.slot_time || '09:00').split(':');
    const slotTarget = new Date(`${myTrackedBooking.booking_date}T00:00:00`);
    slotTarget.setHours(Number(hStr) || 0, Number(mStr) || 0, 0, 0);
    const minsUntilSlot = Math.max(0, Math.round((slotTarget.getTime() - nowTick) / 60000));

    const isSameBarberQueue =
      myTrackedBooking.booking_preference === 'SPECIFIC_STAFF' ||
      myTrackedBooking.booking_preference === 'OWNER_PREFERRED';

    const relevantAhead = isSameBarberQueue
      ? aheadBookings.filter((b) => b.barber_id === myTrackedBooking.barber_id)
      : aheadBookings;

    const barberBusyNow = isSameBarberQueue
      ? dayQueue.some((b) => b.barber_id === myTrackedBooking.barber_id && b.status === 'IN_PROGRESS')
      : activeChairs.length > 0 && activeChairs.every((ch) => Boolean(ch.inProgress));

    const chairDivisor = isSameBarberQueue ? 1 : Math.max(1, activeBarbers.length);
    const queueWorkMins =
      relevantAhead.length > 0 || barberBusyNow
        ? Math.round(((relevantAhead.length * 15) / chairDivisor) + (barberBusyNow ? 10 : 0))
        : 0;

    return Math.max(minsUntilSlot, queueWorkMins);
  }, [myTrackedBooking, aheadBookings, dayQueue, activeChairs, activeBarbers.length, nowTick]);

  const visibleQueue = useMemo(() => {
    if (dayQueue.length <= 5) return dayQueue;
    const priority = dayQueue.filter((b) => b.status === 'IN_PROGRESS' || b.status === 'WAITING');
    const base = (priority.length > 0 ? priority : dayQueue).slice(0, 5);
    if (myTrackedBooking && dayQueue.some((b) => b.id === myTrackedBooking.id) && !base.some((b) => b.id === myTrackedBooking.id)) {
      return [...base.slice(0, 4), myTrackedBooking];
    }
    return base;
  }, [dayQueue, myTrackedBooking]);

  // Token-isolated Hindi notifications for tracked booking
  const myTokenAlerts = useMemo(() => {
    const phone = (myTrackedBooking?.customer_phone || customerPhone)
      .replace(/\D/g, '')
      .slice(-10);
    if (phone.length < 10) return [];
    return data.notifications
      .filter((n) => {
        if (n.recipient_role !== 'CUSTOMER') return false;
        const nPhone = (n.recipient_phone || '').replace(/\D/g, '').slice(-10);
        if (nPhone !== phone) return false;
        if (!myTrackedBooking) return true;
        const createdMs = new Date(n.created_at).getTime();
        const bCreatedMs = new Date(myTrackedBooking.created_at).getTime() - 2000;
        const tokenPattern = new RegExp(`#${myTrackedBooking.token_number}(?!\\d)`);
        return createdMs >= bCreatedMs && tokenPattern.test(n.title);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.notifications, myTrackedBooking, customerPhone]);

  // Real-time sound + notification on new customer alert
  useEffect(() => {
    if (!notifInitRef.current) {
      myTokenAlerts.forEach((n) => seenNotifIdsRef.current.add(n.id));
      notifInitRef.current = true;
      return;
    }
    for (const n of myTokenAlerts) {
      if (!seenNotifIdsRef.current.has(n.id)) {
        seenNotifIdsRef.current.add(n.id);
        if (!n.is_read) {
          playAlertChime('customer', { repeatCount: 3, vibrate: true });
          notify('success', `${n.title}: ${n.message}`);
          sendNativeNotification(n.title, n.message);
        }
      }
    }
  }, [myTokenAlerts, notify]);

  // Automatic timing proximity alert (~15m & ~5m before slot)
  useEffect(() => {
    if (!myTrackedBooking || myTrackedBooking.status !== 'WAITING') return;
    const check = () => {
      const [h, m] = myTrackedBooking.slot_time.split(':').map(Number);
      const target = new Date(`${myTrackedBooking.booking_date}T00:00:00`);
      target.setHours(h || 0, m || 0, 0, 0);
      const minsLeft = Math.round((target.getTime() - Date.now()) / 60000);
      if (minsLeft <= 15 && minsLeft > 5) {
        const key = `${myTrackedBooking.id}-15`;
        if (!proximityAlertSentRef.current.has(key)) {
          proximityAlertSentRef.current.add(key);
          const msg = `टोकन #${myTrackedBooking.token_number}: आपके समय में लगभग ${minsLeft} मिनट बाकी हैं, कृपया तैयार हो जाएं!`;
          playAlertChime('customer', { repeatCount: 2, vibrate: true });
          notify('success', msg);
          sendNativeNotification(`${data.salon.name} — Slot Reminder`, msg);
        }
      } else if (minsLeft <= 5 && minsLeft >= -2) {
        const key = `${myTrackedBooking.id}-5`;
        if (!proximityAlertSentRef.current.has(key)) {
          proximityAlertSentRef.current.add(key);
          const msg = `टोकन #${myTrackedBooking.token_number}: आपका समय हो गया है, कृपया सैलून पहुंचें!`;
          playAlertChime('customer', { repeatCount: 3, vibrate: true });
          notify('success', msg);
          sendNativeNotification(`${data.salon.name} — Turn Ready`, msg);
        }
      }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [myTrackedBooking, data.salon.name, notify]);

  // Create Booking Handler (Screen 1 + Screen 3 1-Tap)
  const submitBooking = async (opts?: {
    serviceIds?: string[];
    barberId?: string;
    dateStr?: string;
    slotTime?: string;
  }) => {
    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
    const cleanName = customerName.trim();
    const useServices = opts?.serviceIds || selectedServiceIds;
    const useBarberId = opts?.barberId || selectedBarberId;
    const useDate = opts?.dateStr || selectedDate;
    const useSlot = opts?.slotTime || selectedSlot;

    if (useServices.length === 0) {
      notify('error', 'कृपया कम से कम 1 सर्विस चुनें');
      return;
    }
    if (!useSlot) {
      notify('error', 'कृपया कोई उपलब्ध टाइम चुनें');
      return;
    }
    if (!isCustomerLoggedIn || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('error', 'Slot book karne ke liye pehle apne mobile number se Login ya Naya Account banayein');
      onOpenLogin();
      return;
    }

    localStorage.setItem('sb_customer_phone', cleanPhone);
    if (cleanName) localStorage.setItem('sb_customer_name', cleanName);
    void requestNotificationPermission();

    const pref: BookingPreference =
      useBarberId === 'ANY'
        ? 'ANY_AVAILABLE'
        : activeBarbers.find((b) => b.id === useBarberId)?.is_owner
        ? 'OWNER_PREFERRED'
        : 'SPECIFIC_STAFF';

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: cleanName || matchedCustomer?.name || 'Customer',
          customer_phone: cleanPhone,
          preferred_barber_id: useBarberId === 'ANY' ? undefined : useBarberId,
          barber_id: useBarberId === 'ANY' ? undefined : useBarberId,
          booking_preference: pref,
          booking_type: 'ONLINE',
          booking_date: useDate,
          slot_time: useSlot,
          service_ids: useServices,
          offer_id: bookingDiscount > 0 ? appliedOffer?.id : undefined,
          promo_code:
            bookingDiscount > 0 && promoInput.trim()
              ? promoInput.trim().toUpperCase()
              : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'बुकिंग नहीं हो सकी');
        if (res.status === 401) {
          onOpenLogin();
        }
        return;
      }
      const created = json.booking as Booking;
      setLastBookedId(created.id);
      localStorage.setItem('sb_last_booking_id', created.id);
      setSelectedOfferId('');
      setPromoInput('');
      await onRefresh();
      playAlertChime('customer', { repeatCount: 2, vibrate: true });
      notify('success', `बुकिंग पक्की! आपका टोकन #${created.token_number} है`);
      setActiveTab('QUEUE');
    } catch (e) {
      notify('error', String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeCustomerPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(curPin.trim()) || !/^\d{4,6}$/.test(newCustPin.trim())) {
      notify('error', 'Purana aur naya 4 se 6 digit ka PIN daalein');
      return;
    }
    if (isWeakPin(newCustPin.trim())) {
      notify('error', WEAK_PIN_MSG);
      return;
    }
    setChangingPin(true);
    try {
      const res = await apiFetch('/api/auth/customer/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_pin: curPin.trim(),
          new_pin: newCustPin.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify('error', json.error || 'PIN update nahi ho paya');
        return;
      }
      setCurPin('');
      setNewCustPin('');
      notify('success', 'Aapka naya Secret PIN save ho gaya!');
    } catch (err) {
      notify('error', String(err));
    } finally {
      setChangingPin(false);
    }
  };

  // Customer visit history
  const customerVisits = useMemo(() => {
    if (!matchedCustomer) return [];
    return data.serviceHistory
      .filter((h) => h.customer_id === matchedCustomer.id)
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  }, [data.serviceHistory, matchedCustomer]);

  const lastVisit = customerVisits[0] || null;
  const featuredStylist =
    activeBarbers.find((b) => b.name === lastVisit?.barber_name) ||
    activeBarbers[0];

  const billingPreview = useMemo(() => {
    if (myTrackedBooking) {
      const items =
        myTrackedBooking.services && myTrackedBooking.services.length > 0
          ? myTrackedBooking.services.map((s) => ({
              id: s.id,
              name: s.service_name,
              price: Number(s.price),
            }))
          : [
              {
                id: 'svc',
                name: 'Salon Service',
                price: Number(myTrackedBooking.total_amount),
              },
            ];
      const barberIdx = activeBarbers.findIndex((b) => b.id === myTrackedBooking.barber_id);
      const itemSum = items.reduce((s, i) => s + Number(i.price || 0), 0);
      const subtotal = Number(myTrackedBooking.subtotal_amount ?? itemSum);
      const discountAmount = Math.max(0, Number(myTrackedBooking.discount_amount || 0));
      return {
        customerLabel: myTrackedBooking.customer_name,
        stylistName: cleanDisplayName(myTrackedBooking.barber_name),
        chairNo: barberIdx >= 0 ? barberIdx + 1 : 1,
        statusLabel:
          myTrackedBooking.is_billed
            ? 'Paid ✓'
            : myTrackedBooking.status === 'COMPLETED'
            ? 'Kaam ho gaya'
            : 'Active',
        tokenNumber: myTrackedBooking.token_number,
        referenceCode: myTrackedBooking.reference_code,
        items,
        subtotal,
        discountAmount,
        appliedOfferTitle: myTrackedBooking.applied_offer_title || '',
        total: Number(myTrackedBooking.total_amount),
      };
    }

    const items =
      selectedServices.length > 0
        ? selectedServices.map((s) => ({
            id: s.id,
            name: lang === 'hi' && s.name_hi ? s.name_hi : s.name,
            price: Number(s.price),
          }))
        : activeServices.slice(0, 2).map((s) => ({
            id: s.id,
            name: lang === 'hi' && s.name_hi ? s.name_hi : s.name,
            price: Number(s.price),
          }));
    const barberIdx = selectedBarberObj
      ? activeBarbers.findIndex((b) => b.id === selectedBarberObj.id)
      : 0;
    const subtotal = items.reduce((sum, i) => sum + i.price, 0);
    const previewDiscount =
      selectedServices.length > 0 ? calculateOfferDiscount(subtotal, appliedOffer) : 0;
    return {
      customerLabel: customerName.trim() || matchedCustomer?.name || 'Customer',
      stylistName: cleanDisplayName(selectedBarberObj?.name || featuredStylist?.name) || 'Stylist',
      chairNo: barberIdx >= 0 ? barberIdx + 1 : 1,
      statusLabel: 'Pending',
      tokenNumber: null as number | null,
      referenceCode: undefined as string | undefined,
      items,
      subtotal,
      discountAmount: previewDiscount,
      appliedOfferTitle: previewDiscount > 0 ? appliedOffer?.title || 'Offer' : '',
      total: Math.max(0, subtotal - previewDiscount),
    };
  }, [
    myTrackedBooking,
    activeBarbers,
    selectedServices,
    activeServices,
    selectedBarberObj,
    featuredStylist,
    customerName,
    matchedCustomer,
    lang,
    appliedOffer,
  ]);

  const billingUpiLinks = useMemo(() => {
    const vpa = (data.settings.upi_id || '').trim();
    if (!vpa || billingPreview.total <= 0) return null;
    return buildUpiDeepLinks({
      payeeVpa: vpa,
      payeeName: data.settings.upi_merchant_name || data.salon.name,
      amount: billingPreview.total,
      transactionNote: billingPreview.tokenNumber
        ? `Token #${billingPreview.tokenNumber} ${billingPreview.customerLabel}`
        : `${data.salon.name} Bill`,
      transactionRef: billingPreview.referenceCode,
    });
  }, [data.settings.upi_id, data.settings.upi_merchant_name, data.salon.name, billingPreview]);

  useEffect(() => {
    if (!billingUpiLinks?.generic) {
      setBillingQrUrl('');
      return;
    }
    QRCode.toDataURL(billingUpiLinks.generic, { width: 200, margin: 1 })
      .then((url) => setBillingQrUrl(url))
      .catch(() => setBillingQrUrl(''));
  }, [billingUpiLinks?.generic]);

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 pb-20 md:pb-10">
      {/* Compact Header matching PDF Eyebrow */}
      <header className="sticky top-0 z-30 bg-[#F8F7FC]/95 dark:bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 pt-[max(0.65rem,env(safe-area-inset-top))] pb-1.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="text-[11px] font-extrabold tracking-widest text-[#6C3BF5] uppercase truncate">
            {data.salon.name} · CUSTOMER
          </div>

          {/* Desktop Inline Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            {(
              [
                { id: 'HOME', label: 'Home' },
                { id: 'BOOKING', label: 'Booking' },
                { id: 'QUEUE', label: 'Queue' },
                { id: 'BILLING', label: 'Billing' },
                { id: 'PROFILE', label: 'Profile' },
              ] as { id: CustomerTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#6C3BF5] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {customerPhone ? (
            <span className="text-[11px] font-bold text-slate-400 tabular-nums whitespace-nowrap">
              ••{customerPhone.slice(-4)}
            </span>
          ) : null}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-1 space-y-4">
        {/* CLEAN SIMPLE HOME SCREEN */}
        {activeTab === 'HOME' && (() => {
          const displayCustomerName = matchedCustomer?.name || customerName.trim();
          const waitingCount = dayQueue.filter((b) => b.status === 'WAITING').length;
          const freeBarbersCount = activeBarbers.filter(
            (b) => b.availability_status === 'Available'
          ).length;

          return (
            <div className="max-w-xl mx-auto space-y-4">
              {/* 1. Salon Welcome Header */}
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white leading-tight">
                  Namaste{isCustomerLoggedIn && displayCustomerName ? `, ${displayCustomerName}` : ''}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#6C3BF5]" />
                    <span>{data.salon.address || data.salon.name}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-[#6C3BF5]" />
                    <span>
                      {formatSlot12h(data.settings.opening_time)} – {formatSlot12h(data.settings.closing_time)}
                    </span>
                  </span>
                </div>
              </div>

              {/* 2. Single Primary Action / Live Status Hero Card */}
              {!isCustomerLoggedIn ? (
                <div className="sb-gradient rounded-3xl p-5 text-white shadow-xl shadow-purple-500/20 space-y-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-extrabold tracking-wider uppercase text-white/80">
                      {data.salon.name}
                    </div>
                    <div className="text-xl font-extrabold leading-snug">
                      Bina line me lage apna slot book karein
                    </div>
                    <p className="text-xs text-white/85">
                      Apne real mobile number se Login ya Naya Account banayein.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="py-3 px-3 rounded-2xl bg-white text-[#141028] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap"
                    >
                      <LogIn className="w-4 h-4 text-[#6C3BF5]" />
                      <span>Login / Account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('BOOKING')}
                      className="py-3 px-3 rounded-2xl bg-white/15 border border-white/25 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap"
                    >
                      <span>Slot Dekhein</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : myTrackedBooking ? (
                <div className="sb-gradient rounded-3xl p-5 text-white shadow-xl shadow-purple-500/20 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold tracking-wider uppercase text-white/80">
                      AAPKI ACTIVE BOOKING
                    </span>
                    <span className="text-xs font-extrabold bg-white/20 px-2.5 py-1 rounded-full tabular-nums">
                      Token #{myTrackedBooking.token_number}
                    </span>
                  </div>
                  <div className="text-xl font-extrabold leading-snug">
                    {myTrackedBooking.status === 'IN_PROGRESS'
                      ? 'Aapka number aa gaya — Chair par pahunchein'
                      : myTrackedBooking.status === 'COMPLETED'
                      ? 'Aaj ki service poori ho gayi hai'
                      : `Aapse pehle ${aheadBookings.length} log line me hain`}
                  </div>
                  <div className="text-xs font-semibold text-white/90">
                    {myTrackedBooking.booking_date === todayStr
                      ? 'Aaj'
                      : formatShortDate(myTrackedBooking.booking_date)}{' '}
                    · {formatSlot12h(myTrackedBooking.slot_time)} ·{' '}
                    {cleanDisplayName(myTrackedBooking.barber_name).split(' ')[0]}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('QUEUE')}
                    className="w-full py-3 rounded-2xl bg-white text-[#141028] font-extrabold text-sm flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    <span>Live Queue Dekhein</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="sb-gradient rounded-3xl p-5 text-white shadow-xl shadow-purple-500/20 space-y-3">
                  <div className="text-[11px] font-extrabold tracking-wider uppercase text-white/80">
                    AAJ KA SALON STATUS
                  </div>
                  <div className="text-xl font-extrabold leading-snug">
                    {waitingCount === 0
                      ? 'Abhi salon khali hai — turant slot book karein'
                      : `Abhi line me ${waitingCount} log · ${freeBarbersCount} stylists free`}
                  </div>
                  <p className="text-xs text-white/85">
                    Apni pasand ki service aur stylist chunein, sahi time par aayein.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOOKING')}
                    className="w-full py-3.5 rounded-2xl bg-white text-[#141028] font-extrabold text-sm flex items-center justify-center gap-2 min-h-[46px]"
                  >
                    <span>Slot Book Karein</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 2.5 Special Offers & Discounts Slider (Editable by Malik) */}
              {activeOffers.length > 0 && (() => {
                const safeIdx = offerSlideIdx % activeOffers.length;
                const offer = activeOffers[safeIdx];
                const gradient = OFFER_THEME_CLASSES[offer.accent_theme] || OFFER_THEME_CLASSES.PURPLE;
                return (
                  <div
                    className="space-y-2"
                    onMouseEnter={() => setSliderPaused(true)}
                    onMouseLeave={() => setSliderPaused(false)}
                    onTouchStart={() => setSliderPaused(true)}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-extrabold tracking-wider text-slate-500 uppercase flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#6C3BF5]" />
                        <span>SPECIAL OFFERS &amp; DISCOUNTS</span>
                      </h2>
                      {activeOffers.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setOfferSlideIdx(
                                (safeIdx - 1 + activeOffers.length) % activeOffers.length
                              )
                            }
                            aria-label="Previous offer"
                            className="w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setOfferSlideIdx((safeIdx + 1) % activeOffers.length)
                            }
                            aria-label="Next offer"
                            className="w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      className={`rounded-3xl bg-gradient-to-br ${gradient} p-4 sm:p-5 text-white shadow-lg space-y-3 transition-all`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider bg-black/20 px-2.5 py-1 rounded-lg">
                          <Tag className="w-3 h-3" />
                          <span>{offer.badge_text}</span>
                        </span>
                        {offer.promo_code && (
                          <span className="text-[11px] font-extrabold tracking-wider uppercase bg-white/20 px-2.5 py-1 rounded-lg tabular-nums">
                            CODE: {offer.promo_code}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-lg sm:text-xl font-extrabold leading-snug">
                          {offer.title}
                        </div>
                        {offer.subtitle && (
                          <p className="text-xs text-white/90 mt-0.5">{offer.subtitle}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-[11px] font-bold text-white/85 tabular-nums">
                          {Number(offer.min_bill || 0) > 0
                            ? `Min Bill ₹${offer.min_bill}`
                            : 'Sabhi bookings par valid'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOfferId(offer.id);
                            if (offer.promo_code) setPromoInput(offer.promo_code);
                            setActiveTab('BOOKING');
                          }}
                          className="px-4 py-2.5 rounded-xl bg-white text-[#141028] text-xs font-extrabold flex items-center gap-1.5 min-h-[44px] whitespace-nowrap shadow-sm"
                        >
                          <span>Offer Lagayein</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {activeOffers.length > 1 && (
                      <div className="flex items-center justify-center gap-1.5">
                        {activeOffers.map((o, idx) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setOfferSlideIdx(idx)}
                            aria-label={`Offer ${idx + 1}`}
                            className={`h-2 rounded-full transition-all ${
                              idx === safeIdx
                                ? 'w-6 bg-[#6C3BF5]'
                                : 'w-2 bg-slate-300 dark:bg-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 3. Services & Rate Card (Tap to book immediately) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-extrabold tracking-wider text-slate-500 uppercase">
                    SERVICES &amp; RATE LIST
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOOKING')}
                    className="text-xs font-bold text-[#6C3BF5]"
                  >
                    Sab Dekhein
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {activeServices.slice(0, 6).map((srv) => {
                    const visual = getServiceVisualTag(srv);
                    const title = lang === 'hi' && srv.name_hi ? srv.name_hi : srv.name;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => {
                          setSelectedServiceIds([srv.id]);
                          setActiveTab('BOOKING');
                        }}
                        className="sb-card p-3 text-left flex items-center gap-2.5 hover:border-[#6C3BF5]/50 transition-colors min-h-[64px]"
                      >
                        <div
                          className={`w-9 h-9 rounded-xl ${visual.bg} flex items-center justify-center text-base shrink-0`}
                        >
                          {visual.symbol}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold text-[#141028] dark:text-white truncate">
                            {title}
                          </div>
                          <div className="text-[11px] font-bold text-[#6C3BF5] tabular-nums mt-0.5">
                            ₹{srv.price} · {srv.duration_minutes}m
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Hamare Stylists */}
              <div className="space-y-2">
                <h2 className="text-xs font-extrabold tracking-wider text-slate-500 uppercase">
                  HAMARE STYLISTS
                </h2>
                <div className="sb-card divide-y divide-slate-100 dark:divide-slate-800">
                  {activeBarbers.map((barber, idx) => {
                    const bName = cleanDisplayName(barber.name);
                    const isAvail = barber.availability_status === 'Available';
                    return (
                      <button
                        key={barber.id}
                        type="button"
                        onClick={() => {
                          setSelectedBarberId(barber.id);
                          setActiveTab('BOOKING');
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors min-h-[54px]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${getAvatarColorClass(
                              idx
                            )}`}
                          >
                            {getSingleInitial(bName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                              {bName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {barber.specialty || 'Salon Stylist'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isAvail ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          <span className={isAvail ? 'text-emerald-600' : 'text-amber-600'}>
                            {barber.availability_status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Direct Salon Contact */}
              <div className="sb-card p-3.5 space-y-2">
                <div className="text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">
                  SALON SE SEEDHA SAMPARK
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <a
                    href={buildWhatsAppUrl(
                      data.salon.phone,
                      `Namaste ${data.salon.name}, mujhe booking ke baare me poochhna hai.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </a>
                  <a
                    href={buildSmsUrl(
                      data.salon.phone,
                      `Namaste ${data.salon.name}, mujhe slot booking chahiye.`
                    )}
                    className="py-3 rounded-xl bg-sky-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>SMS Karein</span>
                  </a>
                </div>
              </div>

              {/* 6. Direct Web App Install / Save to Home Screen */}
              <PWAInstallButton salonName={data.salon.name} />
            </div>
          );
        })()}

        {/* SCREEN 1: BOOKING (Zero-scroll single-screen layout matching PDF Page 1) */}
        {activeTab === 'BOOKING' && (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white leading-tight">
                  Slot book karo
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Service, stylist, time — line ka jhanjhat nahi
                </p>
              </div>
              {activeServices.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllServices((v) => !v)}
                  className="text-[11px] font-bold text-[#6C3BF5] bg-purple-50 dark:bg-purple-950/50 px-2.5 py-1 rounded-full shrink-0"
                >
                  {showAllServices ? '2x2 View' : `+${activeServices.length - 4} More`}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
              {/* Left Column: 2x2 Services + 1-line Stylist */}
              <div className="lg:col-span-6 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {displayServices.map((srv) => {
                    const selected = selectedServiceIds.includes(srv.id);
                    const visual = getServiceVisualTag(srv);
                    const displayTitle = lang === 'hi' && srv.name_hi ? srv.name_hi : srv.name;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => toggleService(srv.id)}
                        className={`relative p-2.5 rounded-2xl text-left flex items-center gap-2.5 transition-all min-h-[60px] bg-white dark:bg-slate-900 shadow-sm ${
                          selected
                            ? 'border-2 border-[#6C3BF5] shadow-md shadow-purple-500/10'
                            : 'border border-slate-200/80 dark:border-slate-800 hover:border-[#6C3BF5]/40'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl ${visual.bg} flex items-center justify-center text-base shrink-0`}
                        >
                          {visual.symbol}
                        </div>
                        <div className="min-w-0 flex-1 pr-4">
                          <div className="text-[13px] font-extrabold text-[#141028] dark:text-white leading-tight line-clamp-2">
                            {displayTitle}
                          </div>
                          <div className="text-xs font-bold text-[#6C3BF5] tabular-nums mt-0.5">
                            ₹{srv.price}
                          </div>
                        </div>
                        {selected && (
                          <span className="absolute top-2 right-2 w-4.5 h-4.5 rounded-full bg-[#6C3BF5] text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* STYLIST (Single horizontal strip) */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    STYLIST
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedBarberId('ANY')}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all min-h-[38px] shrink-0 whitespace-nowrap ${
                        selectedBarberId === 'ANY'
                          ? 'bg-[#6C3BF5] text-white shadow-md shadow-purple-500/20'
                          : 'bg-white dark:bg-slate-900 text-[#141028] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      Koi bhi
                    </button>
                    {activeBarbers.map((barber, idx) => {
                      const active = selectedBarberId === barber.id;
                      const shortName = cleanDisplayName(barber.name).split(' ')[0];
                      return (
                        <button
                          key={barber.id}
                          type="button"
                          onClick={() => setSelectedBarberId(barber.id)}
                          className={`pl-1.5 pr-3 py-1.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all min-h-[38px] shrink-0 whitespace-nowrap ${
                            active
                              ? 'bg-[#6C3BF5] text-white shadow-md shadow-purple-500/20'
                              : 'bg-white dark:bg-slate-900 text-[#141028] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center ${
                              active ? 'bg-white/25 text-white' : getAvatarColorClass(idx)
                            }`}
                          >
                            {getSingleInitial(shortName)}
                          </span>
                          <span>{shortName}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedBarberObj && cleanPhone10(selectedBarberObj.phone).length === 10 && (() => {
                    const barberShort = cleanDisplayName(selectedBarberObj.name).split(' ')[0];
                    const quickDirectText = `Namaste ${barberShort} ji (${data.salon.name}), mujhe ${
                      selectedServices.length > 0
                        ? formatServiceCombo(selectedServices.map((s) => s.name))
                        : 'salon service'
                    } ke liye ${selectedDate === todayStr ? 'aaj' : formatShortDate(selectedDate)}${
                      selectedSlot ? ` ${formatSlot12h(selectedSlot)}` : ''
                    } ka slot chahiye.`;
                    return (
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 text-[11px]">
                        <span className="font-bold text-slate-600 dark:text-slate-300 truncate">
                          {barberShort}: {selectedBarberObj.availability_status}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={buildWhatsAppUrl(selectedBarberObj.phone, quickDirectText)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                          <a
                            href={buildSmsUrl(selectedBarberObj.phone, quickDirectText)}
                            className="px-2 py-1 rounded-lg bg-sky-600 text-white font-bold flex items-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>SMS</span>
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: DIN + 3x3 TIME + Summary + CTA */}
              <div className="lg:col-span-6 space-y-3">
                {/* DIN (5-day strip) */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    DIN
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {dateStrip.map((d) => {
                      const active = selectedDate === d.dateStr;
                      return (
                        <button
                          key={d.dateStr}
                          type="button"
                          onClick={() => setSelectedDate(d.dateStr)}
                          className={`py-2 px-1 rounded-2xl text-center transition-all min-h-[52px] flex flex-col items-center justify-center ${
                            active
                              ? 'bg-[#141028] text-white shadow-md'
                              : 'bg-white dark:bg-slate-900 text-[#141028] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold ${
                              active ? 'text-slate-300' : 'text-slate-400'
                            }`}
                          >
                            {d.topLabel}
                          </span>
                          <span className="text-base font-extrabold leading-tight tabular-nums">
                            {d.dayNum}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* TIME (3x3 grid matching PDF Page 1) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      TIME
                    </span>
                    {enabledSlots.length > 9 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSlots((v) => !v)}
                        className="text-[11px] font-bold text-[#6C3BF5]"
                      >
                        {showAllSlots ? 'Less' : 'All times'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {displaySlots.map((slot) => {
                      const past = isSlotInPastForDate(selectedDate, slot.slot_time);
                      const booked = isSlotBookedForSelection(
                        slot.slot_time,
                        selectedDate,
                        selectedBarberId
                      );
                      const disabled = past || booked;
                      const active = selectedSlot === slot.slot_time && !disabled;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedSlot(slot.slot_time)}
                          className={`py-2.5 px-1.5 rounded-xl text-xs font-extrabold transition-all min-h-[40px] tabular-nums ${
                            disabled
                              ? 'bg-slate-200/70 dark:bg-slate-900/50 text-slate-400 line-through cursor-not-allowed'
                              : active
                              ? 'bg-[#6C3BF5] text-white shadow-md shadow-purple-500/25'
                              : 'bg-white dark:bg-slate-900 text-[#141028] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 hover:border-[#6C3BF5]/50'
                          }`}
                        >
                          {formatSlot12h(slot.slot_time)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Offers & Promo Discount Selector */}
                {activeOffers.length > 0 && (
                  <div className="sb-card p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase flex items-center gap-1">
                        <Tag className="w-3 h-3 text-[#6C3BF5]" />
                        <span>DISCOUNT / PROMO CODE</span>
                      </span>
                      {appliedOffer && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOfferId('');
                            setPromoInput('');
                          }}
                          className="text-[11px] font-bold text-rose-500"
                        >
                          Hatayein
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {activeOffers.map((off) => {
                        const active = appliedOffer?.id === off.id;
                        return (
                          <button
                            key={off.id}
                            type="button"
                            onClick={() => {
                              if (active) {
                                setSelectedOfferId('');
                                setPromoInput('');
                              } else {
                                setSelectedOfferId(off.id);
                                setPromoInput(off.promo_code || '');
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold shrink-0 whitespace-nowrap border transition-colors min-h-[36px] ${
                              active
                                ? 'bg-[#6C3BF5] text-white border-[#6C3BF5]'
                                : 'bg-[#F8F7FC] dark:bg-slate-950 text-[#141028] dark:text-slate-200 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {off.badge_text}
                            {Number(off.min_bill || 0) > 0 ? ` (₹${off.min_bill}+)` : ''}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => {
                          setSelectedOfferId('');
                          setPromoInput(e.target.value.toUpperCase());
                        }}
                        placeholder="Promo Code daalein (e.g. WELCOME20)"
                        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#6C3BF5]"
                      />
                      {promoInput.trim() && !appliedOffer && (
                        <span className="self-center text-[11px] font-bold text-rose-500 whitespace-nowrap pr-1">
                          Invalid code
                        </span>
                      )}
                    </div>

                    {minBillMissing > 0 && (
                      <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Is offer ke liye ₹{minBillMissing} ki aur service jodein (Min ₹
                        {appliedOffer?.min_bill})
                      </div>
                    )}
                  </div>
                )}

                {/* Summary Bar + Gradient CTA */}
                <div className="space-y-2.5 pt-0.5">
                  {bookingDiscount > 0 && (
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                      <span className="truncate pr-2">
                        Offer Savings ({appliedOffer?.badge_text || 'Discount'})
                      </span>
                      <span>
                        ₹{totalBill} − ₹{bookingDiscount} = ₹{finalBookingTotal}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 px-0.5">
                    <span className="truncate pr-3">
                      {selectedServices.length > 0
                        ? formatServiceCombo(selectedServices.map((s) => s.name))
                        : 'Select service'}{' '}
                      ·{' '}
                      {selectedBarberObj
                        ? cleanDisplayName(selectedBarberObj.name).split(' ')[0]
                        : 'Koi bhi'}{' '}
                      · {selectedSlot ? formatSlot12h(selectedSlot) : '--'}
                    </span>
                    <span className="text-lg font-extrabold text-[#141028] dark:text-white tabular-nums shrink-0">
                      ₹{finalBookingTotal}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitBooking()}
                    className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 active:scale-[0.99] transition-transform disabled:opacity-60 min-h-[48px]"
                  >
                    <span>{submitting ? 'Booking ho rahi hai...' : 'Slot book karo'}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 2: QUEUE (Live queue — single screen matching PDF Page 2) */}
        {activeTab === 'QUEUE' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white leading-tight">
                  Live queue
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ghar se dekho, sahi time pe aao
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQueueSearch((v) => !v)}
                aria-label="Search queue"
                className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                  showQueueSearch
                    ? 'bg-[#6C3BF5] text-white border-[#6C3BF5]'
                    : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {showQueueSearch && (
              <div className="sb-card px-3 py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={trackQuery}
                  onChange={(e) => setTrackQuery(e.target.value)}
                  placeholder="Token # ya mobile number..."
                  className="w-full bg-transparent text-xs font-semibold focus:outline-none"
                />
              </div>
            )}

            {/* Hero Gradient Card (Enlarged matching PDF Page 2) */}
            <div className="sb-gradient rounded-3xl p-5 sm:p-6 min-h-[138px] text-white shadow-xl shadow-purple-500/20 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-extrabold tracking-wider uppercase text-white/85">
                  {myTrackedBooking
                    ? myTrackedBooking.status === 'IN_PROGRESS'
                      ? 'ABHI CHAL RAHA HAI'
                      : myTrackedBooking.status === 'COMPLETED'
                      ? 'KAAM POORA HUA'
                      : 'AAPSE PEHLE'
                    : 'LIVE SALON LINE'}
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-5xl font-extrabold tabular-nums leading-none">
                    {myTrackedBooking
                      ? myTrackedBooking.status === 'IN_PROGRESS'
                        ? '0'
                        : aheadBookings.length
                      : aheadBookings.length}
                  </span>
                  <span className="text-lg font-bold text-white/90">log</span>
                </div>
                <div className="text-xs sm:text-sm font-semibold text-white/90 truncate pt-1">
                  {myTrackedBooking
                    ? `Token #${myTrackedBooking.token_number} · ${formatSlot12h(myTrackedBooking.slot_time)} · ${
                        cleanDisplayName(myTrackedBooking.barber_name).split(' ')[0]
                      }`
                    : 'Apna slot book karein'}
                </div>
                {myTrackedBooking && (
                  <div className="text-[11px] font-medium text-white/80 truncate">
                    {myTrackedBooking.booking_date === todayStr
                      ? 'Aaj'
                      : formatShortDate(myTrackedBooking.booking_date)}{' '}
                    ·{' '}
                    {myTrackedBooking.services?.map((s) => s.service_name).join(' + ') ||
                      'Salon Service'}
                    {Number(myTrackedBooking.discount_amount || 0) > 0
                      ? ` · ₹${myTrackedBooking.discount_amount} Offer Bachat`
                      : ''}
                  </div>
                )}
              </div>

              {/* Large Circular Progress Ring matching PDF Page 2 */}
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    fill="none"
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth="7.5"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="7.5"
                    strokeLinecap="round"
                    strokeDasharray={`${
                      estWaitMins === 0
                        ? 239
                        : Math.max(48, Math.min(210, 239 - Math.min(estWaitMins, 180) * 1.1))
                    } 239`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  {estWaitMins === 0 ? (
                    <>
                      <span className="text-base font-extrabold leading-none">
                        {myTrackedBooking?.status === 'COMPLETED'
                          ? 'Done'
                          : myTrackedBooking?.status === 'IN_PROGRESS'
                          ? 'Chair'
                          : 'Ready'}
                      </span>
                      <span className="text-[10px] font-bold text-white/85 mt-0.5">0 min</span>
                    </>
                  ) : estWaitMins >= 60 ? (
                    <>
                      <span className="text-base font-extrabold leading-none tabular-nums">
                        ~{Math.floor(estWaitMins / 60)}h {estWaitMins % 60}m
                      </span>
                      <span className="text-[10px] font-bold text-white/85 mt-0.5">baaki</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-extrabold leading-none tabular-nums">
                        ~{estWaitMins}
                      </span>
                      <span className="text-xs font-bold text-white/85 mt-0.5">min</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ABHI CHAL RAHA (Chair cards) */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                ABHI CHAL RAHA
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {activeChairs.slice(0, 2).map((ch, idx) => {
                  const barberShort = cleanDisplayName(ch.barber.name).split(' ')[0];
                  return (
                    <div key={ch.barber.id} className="sb-card p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${getAvatarColorClass(
                            idx
                          )}`}
                        >
                          {getSingleInitial(barberShort)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#141028] dark:text-white truncate">
                            {barberShort}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Chair {ch.chairNo}
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] font-bold text-[#141028] dark:text-slate-200 truncate">
                        {ch.inProgress
                          ? `#${ch.inProgress.token_number} · ${
                              ch.inProgress.services?.[0]?.service_name || 'Service'
                            }`
                          : `Free · ${ch.barber.availability_status}`}
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            ch.inProgress ? 'bg-[#6C3BF5] w-3/4' : 'bg-emerald-500 w-1/4'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Queue List (5 rows cleanly visible on 1 screen) */}
            <div className="sb-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {dayQueue.length === 0 ? (
                <div className="p-5 text-center space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500">
                    Aaj abhi koi line mein nahi hai
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOOKING')}
                    className="px-4 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-bold"
                  >
                    Slot book karo
                  </button>
                </div>
              ) : (
                visibleQueue.map((item) => {
                  const isMine = myTrackedBooking?.id === item.id;
                  const statusLabel =
                    isMine && item.status === 'WAITING'
                      ? 'Aapka number'
                      : item.status === 'IN_PROGRESS'
                      ? 'Chal raha'
                      : item.status === 'COMPLETED'
                      ? 'Ho gaya'
                      : 'Line mein';

                  const badgeClass =
                    isMine && item.status === 'WAITING'
                      ? 'bg-[#FCE7F3] text-[#DB2777]'
                      : item.status === 'IN_PROGRESS'
                      ? 'bg-[#EDE9FE] text-[#6D28D9]'
                      : item.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500';

                  return (
                    <div
                      key={item.id}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 ${
                        isMine
                          ? 'bg-[#FDF2F8] dark:bg-pink-950/25 border-y border-pink-200/70 dark:border-pink-800/50'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`text-xs font-extrabold tabular-nums w-8 shrink-0 ${
                            isMine ? 'text-[#DB2777]' : 'text-slate-400'
                          }`}
                        >
                          #{item.token_number}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                            {isMine ? 'Aap' : item.customer_name}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 truncate">
                            {cleanDisplayName(item.barber_name).split(' ')[0]} ·{' '}
                            {formatSlot12h(item.slot_time)}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${badgeClass}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Notification Promise / Latest Hindi Alert Banner */}
            <div className="rounded-2xl bg-[#EDE9FE] dark:bg-purple-950/40 px-3.5 py-3 flex items-center gap-2.5 text-xs font-bold text-[#5B21B6] dark:text-purple-200">
              <Bell className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="leading-snug">
                {myTokenAlerts[0]?.message
                  ? normalizeTimesInText12h(myTokenAlerts[0].message)
                  : '1 log bachega tab WhatsApp / App Alert aayega'}
              </span>
            </div>

            {myTrackedBooking && (() => {
              const assignedBarber = data.staff.find((s) => s.id === myTrackedBooking.barber_id);
              const barberPhone10 = cleanPhone10(assignedBarber?.phone);
              const salonPhone10 = cleanPhone10(data.salon.phone);
              const hasDirectStaffPhone =
                Boolean(assignedBarber) &&
                barberPhone10.length === 10 &&
                barberPhone10 !== salonPhone10;
              const barberShort = cleanDisplayName(
                assignedBarber?.name || myTrackedBooking.barber_name
              ).split(' ')[0];

              const bookingMsg = buildCustomerBookingToSalonText({
                salonName: data.salon.name,
                customerName: myTrackedBooking.customer_name,
                customerPhone: myTrackedBooking.customer_phone,
                tokenNumber: myTrackedBooking.token_number,
                servicesText:
                  myTrackedBooking.services?.map((s) => s.service_name).join(' + ') ||
                  'Salon Service',
                barberName: cleanDisplayName(myTrackedBooking.barber_name),
                bookingDate: myTrackedBooking.booking_date,
                slotTime: myTrackedBooking.slot_time,
                totalAmount: Number(myTrackedBooking.total_amount || 0),
              });
              return (
                <div className="sb-card p-3 space-y-2.5">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">
                      {hasDirectStaffPhone
                        ? '1-TAP SALON KO BHEJO'
                        : `1-TAP SALON / ${barberShort.toUpperCase()} KO BHEJO`}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={buildWhatsAppUrl(data.salon.phone, bookingMsg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Salon WhatsApp</span>
                      </a>
                      <a
                        href={buildSmsUrl(data.salon.phone, bookingMsg)}
                        className="py-2.5 rounded-xl bg-sky-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Salon SMS</span>
                      </a>
                    </div>
                  </div>

                  {hasDirectStaffPhone && assignedBarber && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-[11px] font-extrabold tracking-wider text-[#6C3BF5] uppercase">
                        SEEDHE STYLIST KO BHEJO ({cleanDisplayName(assignedBarber.name)})
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={buildWhatsAppUrl(assignedBarber.phone, bookingMsg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{barberShort} WhatsApp</span>
                        </a>
                        <a
                          href={buildSmsUrl(assignedBarber.phone, bookingMsg)}
                          className="py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>{barberShort} SMS</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* SCREEN 6: BILLING (Separate tab next to Queue matching PDF Page 6 on 1 screen) */}
        {activeTab === 'BILLING' && (
          <div className="space-y-3 max-w-xl mx-auto">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white leading-tight">
                Billing
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bill dekho, UPI pay karo, receipt WhatsApp pe
              </p>
            </div>

            {/* Customer Card */}
            <div className="sb-card p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#7C5DFA] text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                  {getInitials(billingPreview.customerLabel)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                    {billingPreview.customerLabel}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {billingPreview.stylistName.split(' ')[0]} · Chair {billingPreview.chairNo}
                    {billingPreview.tokenNumber ? ` · #${billingPreview.tokenNumber}` : ''}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold shrink-0">
                {billingPreview.statusLabel}
              </span>
            </div>

            {/* Itemized Receipt Card */}
            <div className="sb-card p-3.5 space-y-2">
              {billingPreview.items.slice(0, 4).map((srv) => (
                <div key={srv.id} className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-semibold text-[#141028] dark:text-slate-200 truncate pr-3">
                    {srv.name}
                  </span>
                  <span className="font-bold text-[#141028] dark:text-white tabular-nums shrink-0">
                    ₹{srv.price}
                  </span>
                </div>
              ))}
              {billingPreview.discountAmount > 0 && (
                <>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Subtotal</span>
                    <span className="font-bold tabular-nums">₹{billingPreview.subtotal}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="truncate pr-2">
                      Discount ({billingPreview.appliedOfferTitle || 'Offer'})
                    </span>
                    <span className="tabular-nums shrink-0">
                      −₹{billingPreview.discountAmount}
                    </span>
                  </div>
                </>
              )}
              <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2 flex items-center justify-between">
                <span className="text-sm font-extrabold text-[#141028] dark:text-white">
                  Total
                </span>
                <span className="text-xl font-extrabold text-[#6C3BF5] tabular-nums">
                  ₹{billingPreview.total}
                </span>
              </div>
            </div>

            {/* PAYMENT Toggle */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                PAYMENT
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 dark:bg-slate-900 p-1 rounded-2xl">
                {(
                  [
                    { id: 'CASH', label: 'Cash' },
                    { id: 'UPI', label: 'UPI' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setBillingMode(m.id)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all min-h-[38px] ${
                      billingMode === m.id
                        ? 'bg-[#6C3BF5] text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* QR / Cash Card */}
            {billingMode === 'UPI' ? (
              <div className="sb-card p-3.5 flex items-center gap-3.5">
                {billingQrUrl ? (
                  <img
                    src={billingQrUrl}
                    alt="UPI QR Code"
                    className="w-20 h-20 rounded-xl border border-slate-200 bg-white p-1 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 flex items-center justify-center shrink-0">
                    <QrCode className="w-11 h-11 text-[#141028] dark:text-slate-200" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xl font-extrabold text-[#141028] dark:text-white tabular-nums leading-none">
                    ₹{billingPreview.total}
                  </div>
                  <div className="text-xs text-slate-500">
                    Scan karke UPI se pay
                  </div>
                  {billingUpiLinks && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <a
                        href={billingUpiLinks.gpay}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold"
                      >
                        GPay
                      </a>
                      <a
                        href={billingUpiLinks.phonepe}
                        className="px-2.5 py-1 rounded-lg bg-[#5F259F] text-white text-[10px] font-bold"
                      >
                        PhonePe
                      </a>
                      <a
                        href={billingUpiLinks.paytm}
                        className="px-2.5 py-1 rounded-lg bg-[#00BAF2] text-white text-[10px] font-bold"
                      >
                        Paytm
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="sb-card p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xl font-extrabold text-[#141028] dark:text-white tabular-nums leading-none">
                    ₹{billingPreview.total}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Counter par Cash jama karein
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-extrabold">
                  Cash Pay
                </span>
              </div>
            )}

            {(() => {
              const receiptReqMsg = buildCustomerReceiptRequestText({
                salonName: data.salon.name,
                totalAmount: billingPreview.total,
                servicesText: billingPreview.items.map((i) => i.name).join(' + '),
                tokenNumber: billingPreview.tokenNumber || undefined,
                paymentMode: billingMode,
              });
              return (
                <div className="grid grid-cols-2 gap-2.5">
                  <a
                    href={buildWhatsAppUrl(data.salon.phone, receiptReqMsg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/25 min-h-[48px]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp Bill</span>
                  </a>
                  <a
                    href={buildSmsUrl(data.salon.phone, receiptReqMsg)}
                    className="py-3.5 rounded-2xl bg-sky-600 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/20 min-h-[48px]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>SMS Bhejo</span>
                  </a>
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 4: PROFILE */}
        {activeTab === 'PROFILE' && (
          <div className="max-w-xl mx-auto space-y-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Profile
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isCustomerLoggedIn ? 'Aapka account aur pichli visits' : 'Login ya Naya Account banayein'}
              </p>
            </div>

            {!isCustomerLoggedIn ? (
              <div className="sb-card p-5 space-y-3">
                <div className="text-base font-extrabold text-[#141028] dark:text-white">
                  Apne mobile number se login karein
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Slot book karne, live queue dekhne aur pichli visits track karne ke liye login zaroori hai.
                </p>
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login / Naya Account Banayein</span>
                </button>
              </div>
            ) : (
              <>
                <div className="sb-card p-5 space-y-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl sb-gradient text-white font-extrabold text-lg flex items-center justify-center">
                      {getSingleInitial(customerName || matchedCustomer?.name || 'C')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-extrabold text-[#141028] dark:text-white truncate">
                        {matchedCustomer?.name || customerName || 'Customer'}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {customerPhone ? `+91 ${customerPhone}` : 'Verified Account'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-2xl bg-[#F8F7FC] dark:bg-slate-950 p-3">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Total Visits</div>
                      <div className="text-xl font-extrabold text-[#6C3BF5] tabular-nums">
                        {matchedCustomer?.total_visits || customerVisits.length}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#F8F7FC] dark:bg-slate-950 p-3">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Saved Stylist</div>
                      <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate mt-1">
                        {cleanDisplayName(featuredStylist?.name).split(' ')[0] || 'Any'}
                      </div>
                    </div>
                  </div>
                </div>

                {customerVisits.length > 0 && (
                  <div className="sb-card p-4 space-y-2.5">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                      Pichli Visits
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {customerVisits.slice(0, 5).map((v) => (
                        <div key={v.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                          <div>
                            <div className="font-bold text-[#141028] dark:text-white">
                              {v.services_summary}
                            </div>
                            <div className="text-slate-400">
                              {formatShortDate(v.visit_date)} · {cleanDisplayName(v.barber_name)}
                            </div>
                          </div>
                          <span className="font-extrabold text-[#141028] dark:text-white tabular-nums">
                            ₹{v.total_bill}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Change Secret PIN */}
                <form onSubmit={handleChangeCustomerPin} className="sb-card p-4 space-y-2.5">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#6C3BF5]" />
                    <span>Apna Secret PIN Badlein</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={curPin}
                      onChange={(e) => setCurPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Purana PIN"
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold tabular-nums"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={newCustPin}
                      onChange={(e) => setNewCustPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Naya PIN (4-6 digits)"
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={changingPin}
                    className="w-full py-2.5 rounded-xl bg-[#141028] dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-extrabold min-h-[44px]"
                  >
                    {changingPin ? 'Saving...' : 'PIN Update Karein'}
                  </button>
                </form>
              </>
            )}

            {/* App Settings & Session */}
            <div className="sb-card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
                  className="py-3 rounded-xl bg-[#F8F7FC] dark:bg-slate-950 text-xs font-bold text-[#141028] dark:text-white min-h-[44px]"
                >
                  Language: {lang === 'en' ? 'English / Hinglish' : 'हिन्दी'}
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode(!darkMode)}
                  className="py-3 rounded-xl bg-[#F8F7FC] dark:bg-slate-950 text-xs font-bold text-[#141028] dark:text-white flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#6C3BF5]" />}
                  <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>

              <PWAInstallButton salonName={data.salon.name} compact />

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 font-extrabold text-sm flex items-center justify-center gap-2 min-h-[46px]"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout Karein</span>
                </button>
              )}

              {!isCustomerApk && !data.settings.hide_staff_login && (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="w-full py-2.5 rounded-xl bg-[#F8F7FC] dark:bg-slate-950 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 min-h-[42px]"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Staff / Malik Login</span>
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom 5-Tab Bar (Home · Booking · Queue · Billing · Profile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-5 h-14 pb-[env(safe-area-inset-bottom)]">
        {(
          [
            { id: 'HOME', label: 'Home', icon: Home },
            { id: 'BOOKING', label: 'Booking', icon: Calendar },
            { id: 'QUEUE', label: 'Queue', icon: Users },
            { id: 'BILLING', label: 'Billing', icon: Receipt },
            { id: 'PROFILE', label: 'Profile', icon: User },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
            >
              <div
                className={`w-8 h-6 rounded-xl flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-[#6C3BF5] text-white'
                    : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] font-bold ${
                  active ? 'text-[#6C3BF5]' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
