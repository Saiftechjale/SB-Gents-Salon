import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  Clock,
  Edit3,
  MessageCircle,
  Play,
  Receipt,
  RefreshCw,
  Sparkles,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  Booking,
  BookingPreference,
  BookingStatus,
  OfflineDraftBill,
  SalonBootstrapData,
} from '../types/salon';
import { Language, t } from '../lib/i18n';
import { UpiIntentLauncher } from './UpiIntentLauncher';

export type OwnerSectionTab =
  | 'DASHBOARD'
  | 'BOOKINGS'
  | 'WALKIN'
  | 'CUSTOMERS'
  | 'STAFF'
  | 'SERVICES'
  | 'BILLING'
  | 'UDHAR'
  | 'COMMISSION'
  | 'EXPENSES'
  | 'REPORTS'
  | 'SETTINGS';

interface OwnerOperationsViewsProps {
  activeSubTab: 'DASHBOARD' | 'BOOKINGS' | 'WALKIN' | 'BILLING';
  setActiveSubTab: (tab: OwnerSectionTab) => void;
  data: SalonBootstrapData;
  lang: Language;
  isOnline: boolean;
  offlineDrafts: OfflineDraftBill[];
  onSaveOfflineDraft: (draft: OfflineDraftBill) => Promise<void>;
  onSyncOfflineDrafts: () => Promise<void>;
  isSyncingDrafts: boolean;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}

export const OwnerOperationsViews: React.FC<OwnerOperationsViewsProps> = ({
  activeSubTab,
  setActiveSubTab,
  data,
  lang,
  isOnline,
  offlineDrafts,
  onSaveOfflineDraft,
  onSyncOfflineDrafts,
  isSyncingDrafts,
  onRefresh,
  notify,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Selected booking to bill when jumping from Bookings/Walk-in -> Billing
  const [selectedBookingForBill, setSelectedBookingForBill] = useState<Booking | null>(null);

  // Walk-in / Manual Booking state
  const [bCustomerName, setBCustomerName] = useState('');
  const [bCustomerPhone, setBCustomerPhone] = useState('');
  const [bServiceIds, setBServiceIds] = useState<string[]>([]);
  const [bDate, setBDate] = useState(todayStr);
  const [bSlot, setBSlot] = useState('10:00');
  const [bPref, setBPref] = useState<BookingPreference>('ANY_AVAILABLE');
  const [bBarberId, setBBarberId] = useState('');
  const [bNotes, setBNotes] = useState('');
  const [bStartImmediately, setBStartImmediately] = useState(true);
  const [bSubmitting, setBSubmitting] = useState(false);

  // Confirmation before cancelling a booking
  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState<string | null>(null);

  // Live Edit Booking Modal (Date, Time, +10m/+15m/+30m Delay, Barber, Price)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editBarberId, setEditBarberId] = useState('');
  const [editTotalAmount, setEditTotalAmount] = useState<number>(0);
  const [editDelayReason, setEditDelayReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Booking list filters
  const [filterDate, setFilterDate] = useState(todayStr);
  const [filterStatus, setFilterStatus] = useState<'ALL' | BookingStatus>('ALL');

  // Split Billing Form State
  const [billCustomerName, setBillCustomerName] = useState('');
  const [billCustomerPhone, setBillCustomerPhone] = useState('');
  const [billBarberId, setBillBarberId] = useState('');
  const [billServiceIds, setBillServiceIds] = useState<string[]>([]);
  const [billTotalAmount, setBillTotalAmount] = useState<number>(0);
  const [billCashPaid, setBillCashPaid] = useState<number>(0);
  const [billUpiPaid, setBillUpiPaid] = useState<number>(0);
  const [billHaircutPref, setBillHaircutPref] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [forceOfflineDraftMode, setForceOfflineDraftMode] = useState(false);
  const [billSubmitting, setBillSubmitting] = useState(false);

  const ownerBarber = useMemo(
    () => data.staff.find((s) => s.is_owner),
    [data.staff]
  );

  const activeStaff = useMemo(
    () => data.staff.filter((s) => s.is_active),
    [data.staff]
  );

  const activeServices = useMemo(
    () => data.services.filter((s) => s.is_active),
    [data.services]
  );

  // ============================================================================
  // DYNAMIC OWNER DASHBOARD METRICS (Zero Static Numbers)
  // ============================================================================
  const dashboardStats = useMemo(() => {
    const todayPayments = data.payments.filter((p) => p.payment_date === todayStr);
    const todayBillPayments = todayPayments.filter((p) => p.payment_type === 'BILL_PAYMENT');

    const todayTotalSales = todayBillPayments.reduce((sum, p) => sum + Number(p.total_bill), 0);
    const todayCash = todayPayments.reduce((sum, p) => sum + Number(p.cash_paid), 0);
    const todayUpi = todayPayments.reduce((sum, p) => sum + Number(p.upi_paid), 0);
    const todayCollected = todayCash + todayUpi;

    const totalOutstandingUdhar = data.customers.reduce(
      (sum, c) => sum + Number(c.outstanding_due || 0),
      0
    );

    const todayBookings = data.bookings.filter((b) => b.booking_date === todayStr);
    const todayWalkIns = todayBookings.filter((b) => b.booking_type === 'WALK_IN');
    const activeQueueToday = todayBookings
      .filter((b) => b.status === 'WAITING' || b.status === 'IN_PROGRESS')
      .sort((a, b) => a.token_number - b.token_number);

    const todayExpenses = data.expenses
      .filter((e) => e.expense_date === todayStr)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const netCollection = todayCollected - todayExpenses;

    const ownerId = ownerBarber?.id;
    const ownerTodayCompletedBookings = todayBookings.filter(
      (b) => b.barber_id === ownerId && b.status === 'COMPLETED'
    );
    const ownerTodayRevenue = todayBillPayments
      .filter((p) => p.barber_id === ownerId)
      .reduce((sum, p) => sum + Number(p.total_bill), 0);

    const staffPerformance = data.staff.map((member) => {
      const completedToday = todayBookings.filter(
        (b) => b.barber_id === member.id && b.status === 'COMPLETED'
      ).length;
      const activeInQueue = todayBookings.filter(
        (b) =>
          b.barber_id === member.id &&
          (b.status === 'WAITING' || b.status === 'IN_PROGRESS')
      ).length;
      const revenueToday = todayBillPayments
        .filter((p) => p.barber_id === member.id)
        .reduce((sum, p) => sum + Number(p.total_bill), 0);
      const commissionToday = data.commissions
        .filter((c) => c.staff_id === member.id && c.earned_date === todayStr)
        .reduce((sum, c) => sum + Number(c.commission_amount), 0);

      return {
        ...member,
        completedToday,
        activeInQueue,
        revenueToday,
        commissionToday,
      };
    });

    return {
      todayTotalSales,
      todayCollected,
      todayCash,
      todayUpi,
      totalOutstandingUdhar,
      totalCustomers: data.customers.length,
      todayBookingsCount: todayBookings.length,
      todayWalkInsCount: todayWalkIns.length,
      activeQueueToday,
      todayExpenses,
      netCollection,
      ownerCompletedCount: ownerTodayCompletedBookings.length,
      ownerTodayRevenue,
      staffPerformance,
    };
  }, [data, todayStr, ownerBarber]);

  const openBillingForBooking = (booking: Booking) => {
    setSelectedBookingForBill(booking);
    setBillCustomerName(booking.customer_name);
    setBillCustomerPhone(booking.customer_phone);
    setBillBarberId(booking.barber_id);
    const sIds = booking.services?.map((s) => s.service_id) || [];
    setBillServiceIds(sIds);
    setBillTotalAmount(booking.total_amount);
    setBillCashPaid(booking.total_amount);
    setBillUpiPaid(0);
    const cust = data.customers.find((c) => c.id === booking.customer_id);
    setBillHaircutPref(cust?.haircut_preference || '');
    setBillNotes(booking.notes || '');
    setActiveSubTab('BILLING');
  };

  const handleToggleBillService = (serviceId: string) => {
    setBillServiceIds((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId];
      const computedTotal = data.services
        .filter((s) => next.includes(s.id))
        .reduce((sum, s) => sum + Number(s.price), 0);
      setBillTotalAmount(computedTotal);
      setBillCashPaid(computedTotal);
      setBillUpiPaid(0);
      return next;
    });
  };

  const billTotalCollected = useMemo(
    () => Math.max(0, Number(billCashPaid || 0)) + Math.max(0, Number(billUpiPaid || 0)),
    [billCashPaid, billUpiPaid]
  );

  const billRemainingUdhar = useMemo(
    () => Math.max(0, Number(billTotalAmount || 0) - billTotalCollected),
    [billTotalAmount, billTotalCollected]
  );

  const handleUpdateOwnerAvailability = async (status: AvailabilityStatus) => {
    if (!ownerBarber) return;
    try {
      const res = await fetch(`/api/staff/${ownerBarber.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_status: status }),
      });
      if (!res.ok) {
        notify('error', 'Failed to update owner availability');
        return;
      }
      await onRefresh();
      notify('success', `Owner status updated to ${status}`);
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleCreateWalkInOrManualBooking = async (
    e: React.FormEvent,
    bookingType: 'WALK_IN' | 'ONLINE',
    goStraightToBilling = false
  ) => {
    e.preventDefault();
    const cleanPhone = bCustomerPhone.replace(/\D/g, '');
    if (!bCustomerName.trim() || cleanPhone.length !== 10) {
      notify('error', 'Please enter customer name and a valid 10-digit mobile number.');
      return;
    }
    if (bServiceIds.length === 0) {
      notify('error', 'Please select at least one service.');
      return;
    }
    if (bPref === 'SPECIFIC_STAFF' && !bBarberId) {
      notify('error', 'Please choose a barber.');
      return;
    }

    const effectiveSlot =
      bookingType === 'WALK_IN'
        ? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
        : bSlot;

    setBSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: bCustomerName.trim(),
          customer_phone: cleanPhone,
          service_ids: bServiceIds,
          booking_date: bookingType === 'WALK_IN' ? todayStr : bDate,
          slot_time: effectiveSlot,
          booking_preference: bPref,
          preferred_barber_id: bPref === 'SPECIFIC_STAFF' ? bBarberId : undefined,
          booking_type: bookingType,
          notes: bNotes.trim(),
          verification_method: 'OWNER_CREATED',
          start_immediately: bookingType === 'WALK_IN' ? bStartImmediately : false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not create booking');
        return;
      }
      setBCustomerName('');
      setBCustomerPhone('');
      setBServiceIds([]);
      setBNotes('');
      await onRefresh();
      notify(
        'success',
        `${bookingType === 'WALK_IN' ? 'Walk-in' : 'Booking'} Token #${json.booking.token_number} assigned to ${json.booking.barber_name}`
      );
      if (goStraightToBilling) {
        openBillingForBooking(json.booking);
      }
    } catch (err) {
      notify('error', String(err));
    } finally {
      setBSubmitting(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = await res.json();
        notify('error', json.error || 'Failed to update status');
        return;
      }
      setConfirmCancelBookingId(null);
      await onRefresh();
      notify('success', `Booking status updated to ${status}`);
    } catch (e) {
      notify('error', String(e));
    }
  };

  const openEditBookingModal = (b: Booking) => {
    setEditingBooking(b);
    setEditDate(b.booking_date);
    setEditTime(b.slot_time);
    setEditBarberId(b.barber_id);
    setEditTotalAmount(Number(b.total_amount));
    setEditDelayReason(b.notes || '');
  };

  const handleQuickShiftBooking = async (booking: Booking, shiftMinutes: number) => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_minutes: shiftMinutes,
          delay_reason:
            editDelayReason.trim() ||
            (shiftMinutes > 0
              ? `Current haircut/beard service taking ${shiftMinutes} mins extra`
              : `Slot moved ${Math.abs(shiftMinutes)} mins earlier`),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not shift booking time');
        return;
      }
      if (editingBooking && editingBooking.id === booking.id) {
        setEditingBooking(json.booking);
        setEditTime(json.booking.slot_time);
        setEditDate(json.booking.booking_date);
      }
      await onRefresh();
      notify(
        'success',
        `Updated #${booking.token_number} to ${json.booking.slot_time} — customer notified!`
      );
    } catch (e) {
      notify('error', String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const handleSaveBookingEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/bookings/${editingBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: editDate,
          slot_time: editTime,
          barber_id: editBarberId,
          total_amount: Number(editTotalAmount),
          notes: editDelayReason.trim(),
          delay_reason: editDelayReason.trim() || 'Salon updated your appointment schedule',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not update booking');
        return;
      }
      setEditingBooking(null);
      await onRefresh();
      notify('success', `Booking #${json.booking.token_number} updated & customer notified!`);
    } catch (e) {
      notify('error', String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = billCustomerPhone.replace(/\D/g, '');
    if (!billCustomerName.trim() || cleanPhone.length !== 10) {
      notify('error', 'Customer name and 10-digit mobile number are required.');
      return;
    }
    if (billTotalAmount <= 0) {
      notify('error', 'Total bill amount must be greater than ₹0.');
      return;
    }
    if (billTotalCollected > billTotalAmount) {
      notify(
        'error',
        `Collected amount (₹${billTotalCollected}) cannot exceed Total Bill (₹${billTotalAmount}).`
      );
      return;
    }

    const targetBarber =
      data.staff.find((s) => s.id === billBarberId) ||
      ownerBarber ||
      data.staff[0];

    const clientSyncId = `bill_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (!isOnline || forceOfflineDraftMode) {
      const selectedServicesNames =
        data.services
          .filter((s) => billServiceIds.includes(s.id))
          .map((s) => s.name)
          .join(', ') || 'Salon Service';

      const draft: OfflineDraftBill = {
        client_sync_id: clientSyncId,
        booking_id: selectedBookingForBill?.id || null,
        customer_name: billCustomerName.trim(),
        customer_phone: cleanPhone,
        barber_id: targetBarber.id,
        barber_name: targetBarber.name,
        service_ids: billServiceIds,
        services_summary: selectedServicesNames,
        payment_date: todayStr,
        total_bill: Number(billTotalAmount),
        cash_paid: Number(billCashPaid || 0),
        upi_paid: Number(billUpiPaid || 0),
        udhar_amount: billRemainingUdhar,
        haircut_preference: billHaircutPref.trim(),
        notes: billNotes.trim(),
        created_at: new Date().toISOString(),
        sync_status: 'PENDING',
      };

      await onSaveOfflineDraft(draft);
      setSelectedBookingForBill(null);
      setBillCustomerName('');
      setBillCustomerPhone('');
      setBillServiceIds([]);
      setBillTotalAmount(0);
      setBillCashPaid(0);
      setBillUpiPaid(0);
      setBillNotes('');
      notify(
        'success',
        'Bill saved to Offline Queue. It will sync automatically when connected.'
      );
      return;
    }

    setBillSubmitting(true);
    try {
      const res = await fetch('/api/payments/bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_sync_id: clientSyncId,
          booking_id: selectedBookingForBill?.id || null,
          customer_name: billCustomerName.trim(),
          customer_phone: cleanPhone,
          barber_id: targetBarber.id,
          service_ids: billServiceIds,
          payment_date: todayStr,
          total_bill: Number(billTotalAmount),
          cash_paid: Number(billCashPaid || 0),
          upi_paid: Number(billUpiPaid || 0),
          haircut_preference: billHaircutPref.trim(),
          notes: billNotes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not record bill');
        return;
      }

      setSelectedBookingForBill(null);
      setBillCustomerName('');
      setBillCustomerPhone('');
      setBillServiceIds([]);
      setBillTotalAmount(0);
      setBillCashPaid(0);
      setBillUpiPaid(0);
      setBillNotes('');
      await onRefresh();
      notify(
        'success',
        `Bill Saved! Collected ₹${billTotalCollected} (Cash: ₹${billCashPaid}, UPI: ₹${billUpiPaid})${
          billRemainingUdhar > 0 ? ` · Udhar ₹${billRemainingUdhar}` : ''
        }`
      );
    } catch (err) {
      notify('error', String(err));
    } finally {
      setBillSubmitting(false);
    }
  };

  const handleQuickSaveUpiId = async (newUpiId: string) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upi_id: newUpiId,
          upi_merchant_name: data.settings.upi_merchant_name || data.salon.name,
        }),
      });
      if (!res.ok) {
        notify('error', 'Failed to save UPI ID');
        return;
      }
      await onRefresh();
      notify('success', `Salon UPI ID (${newUpiId}) saved!`);
    } catch (err) {
      notify('error', String(err));
    }
  };

  const filteredBookings = useMemo(() => {
    return data.bookings
      .filter((b) => {
        if (filterDate && b.booking_date !== filterDate) return false;
        if (filterStatus !== 'ALL' && b.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => a.token_number - b.token_number);
  }, [data.bookings, filterDate, filterStatus]);

  const availabilityStatuses: AvailabilityStatus[] = [
    'Available',
    'Busy',
    'Break',
    'Not Available',
  ];

  const walkInTotal = useMemo(
    () =>
      activeServices
        .filter((s) => bServiceIds.includes(s.id))
        .reduce((sum, s) => sum + Number(s.price), 0),
    [activeServices, bServiceIds]
  );

  return (
    <div className="space-y-6">
      {/* ==========================================================================
          1. OWNER DASHBOARD (Understand today's business in seconds)
         ========================================================================== */}
      {activeSubTab === 'DASHBOARD' && (
        <div className="space-y-6">
          {/* Top Bar: Owner Availability + Instant Actions */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'ownerAvailability')} · {ownerBarber?.name}
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Status: <span className="text-amber-600 dark:text-amber-400">{ownerBarber?.availability_status}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {availabilityStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleUpdateOwnerAvailability(status)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[40px] ${
                    ownerBarber?.availability_status === status
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('WALKIN')}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs min-h-[42px]"
              >
                + Walk-in
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('BILLING')}
                className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-semibold text-xs hover:opacity-90 min-h-[42px]"
              >
                New Bill
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('UDHAR')}
                className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 font-semibold text-xs hover:bg-rose-500/10 min-h-[42px]"
              >
                Collect Udhar
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('SETTINGS')}
                className="px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold text-xs hover:bg-amber-500/10 min-h-[42px]"
              >
                Banner &amp; Offers
              </button>
            </div>
          </div>

          {/* Primary 4 Financial Pulse Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'todayTotalSales')}</div>
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                ₹{dashboardStats.todayTotalSales}
              </div>
              <div className="text-xs text-slate-500 mt-1">Today&apos;s billed value</div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'todayCollected')}</div>
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                ₹{dashboardStats.todayCollected}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Cash ₹{dashboardStats.todayCash} · UPI ₹{dashboardStats.todayUpi}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'netCollection')}</div>
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                ₹{dashboardStats.netCollection}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Expenses today: ₹{dashboardStats.todayExpenses}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'outstandingUdhar')}</div>
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                ₹{dashboardStats.totalOutstandingUdhar}
              </div>
              <div className="text-xs text-slate-500 mt-1">Total pending dues</div>
            </div>
          </div>

          {/* Secondary Operational Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500">{t(lang, 'cashPayments')}</div>
              <div className="font-mono text-lg font-bold mt-0.5 tabular-nums">₹{dashboardStats.todayCash}</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500">{t(lang, 'upiPayments')}</div>
              <div className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums">₹{dashboardStats.todayUpi}</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500">{t(lang, 'ownerPersonalWork')}</div>
              <div className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                ₹{dashboardStats.ownerTodayRevenue}
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500">{t(lang, 'todayBookings')}</div>
              <div className="font-mono text-lg font-bold mt-0.5 tabular-nums">{dashboardStats.todayBookingsCount}</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500">{t(lang, 'walkInCustomers')}</div>
              <div className="font-mono text-lg font-bold mt-0.5 tabular-nums">{dashboardStats.todayWalkInsCount}</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500">{t(lang, 'totalCustomers')}</div>
              <div className="font-mono text-lg font-bold mt-0.5 tabular-nums">{dashboardStats.totalCustomers}</div>
            </div>
          </div>

          {/* Two-Column Split: Active Queue Today + Staff Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Active Queue Snapshot */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Live Queue Today ({dashboardStats.activeQueueToday.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('BOOKINGS')}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  View All Bookings &rarr;
                </button>
              </div>

              {dashboardStats.activeQueueToday.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  No customers waiting in queue right now.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {dashboardStats.activeQueueToday.slice(0, 5).map((b) => (
                    <div key={b.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                          #{b.token_number}
                        </span>
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {b.customer_name}
                          </div>
                          <div className="text-slate-500">
                            {b.barber_name} · {b.slot_time}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditBookingModal(b)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-amber-500"
                          title="Edit time, date, or price"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openBillingForBooking(b)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500"
                        >
                          Bill ₹{b.total_amount}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Staff Performance Snapshot */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {t(lang, 'staffPerformance')} (Today)
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('COMMISSION')}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Commission Report &rarr;
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 px-2">Barber</th>
                      <th className="py-2 px-2 text-right">Done</th>
                      <th className="py-2 px-2 text-right">Work (₹)</th>
                      <th className="py-2 px-2 text-right">Comm. (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {dashboardStats.staffPerformance.map((sp) => (
                      <tr key={sp.id}>
                        <td className="py-2.5 px-2">
                          <div className="font-bold">{sp.name}</div>
                          <div className="text-[11px] text-slate-500">{sp.availability_status}</div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">{sp.completedToday}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums">₹{sp.revenueToday}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{sp.commissionToday}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          2. TODAY'S BOOKINGS & QUEUE
         ========================================================================== */}
      {activeSubTab === 'BOOKINGS' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t(lang, 'todaysBookings')} &amp; Appointments
            </h2>
            <button
              type="button"
              onClick={() => setActiveSubTab('WALKIN')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 min-h-[44px]"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>+ Add Walk-in / Booking</span>
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">Date:</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setFilterDate('')}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline px-2"
              >
                All Dates
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
              {(['ALL', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      filterStatus === st
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-amber-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {filteredBookings.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No bookings found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono font-extrabold text-sm text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">
                        #{b.token_number}
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm">{b.customer_name}</span>
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            ({b.customer_phone})
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-semibold">
                            {b.reference_code || `Token #${b.token_number}`}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs font-medium">
                            {b.booking_type === 'WALK_IN' ? 'Walk-in' : 'Online'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          <strong>{b.services?.map((s) => s.service_name).join(', ') || 'Service'}</strong> · Barber:{' '}
                          <strong>{b.barber_name}</strong> ·{' '}
                          <span className="font-mono tabular-nums">
                            {b.booking_date} {b.slot_time}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-base mr-2 tabular-nums">
                        ₹{b.total_amount}
                      </span>

                      {b.status === 'WAITING' && (
                        <>
                          <button
                            type="button"
                            disabled={editSaving}
                            onClick={() => handleQuickShiftBooking(b, 15)}
                            className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold text-xs hover:bg-amber-500/10 min-h-[38px]"
                            title="Shift time by +15 mins & notify customer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>+15m</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateBookingStatus(b.id, 'IN_PROGRESS')}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 min-h-[38px]"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Start Chair</span>
                          </button>
                        </>
                      )}

                      {b.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() => openEditBookingModal(b)}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-xs hover:border-amber-500 min-h-[38px]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Time / Price</span>
                        </button>
                      )}

                      {b.status !== 'CANCELLED' && !b.is_billed && (
                        <button
                          type="button"
                          onClick={() => openBillingForBooking(b)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500 min-h-[38px]"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Bill Now</span>
                        </button>
                      )}

                      {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && (
                        <>
                          {confirmCancelBookingId === b.id ? (
                            <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1.5 rounded-xl">
                              <span className="text-xs text-rose-600 font-semibold">Cancel?</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateBookingStatus(b.id, 'CANCELLED')}
                                className="px-2 py-1 rounded bg-rose-600 text-white text-xs font-bold"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCancelBookingId(null)}
                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-xs"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmCancelBookingId(b.id)}
                              className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-rose-500/30 text-rose-600 text-xs font-medium hover:bg-rose-500/10 min-h-[38px]"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          )}
                        </>
                      )}

                      <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
                        {b.status} {b.is_billed ? '· BILLED' : ''}
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
          3. DEDICATED WALK-IN REGISTRATION & CHAIR ASSIGNMENT
         ========================================================================== */}
      {activeSubTab === 'WALKIN' && (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-500" />
                <span>Fast Walk-in Customer Entry</span>
              </h2>
            </div>

            <form
              onSubmit={(e) => handleCreateWalkInOrManualBooking(e, 'WALK_IN', false)}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Mobile Number (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={bCustomerPhone}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setBCustomerPhone(clean);
                      if (clean.length === 10) {
                        const found = data.customers.find((c) => c.phone === clean);
                        if (found) setBCustomerName(found.name);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Customer Full Name"
                    value={bCustomerName}
                    onChange={(e) => setBCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2">
                  Select Services * (Total: <span className="font-mono text-amber-600 dark:text-amber-400">₹{walkInTotal}</span>)
                </label>
                <div className="flex flex-wrap gap-2">
                  {activeServices.map((srv) => {
                    const selected = bServiceIds.includes(srv.id);
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() =>
                          setBServiceIds((prev) =>
                            prev.includes(srv.id)
                              ? prev.filter((id) => id !== srv.id)
                              : [...prev, srv.id]
                          )
                        }
                        className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all min-h-[44px] ${
                          selected
                            ? 'bg-amber-500 border-amber-500 text-slate-950'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {srv.name} · ₹{srv.price}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Assign Barber
                  </label>
                  <select
                    value={bPref}
                    onChange={(e) => setBPref(e.target.value as BookingPreference)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  >
                    <option value="ANY_AVAILABLE">Any Available Barber</option>
                    <option value="OWNER_PREFERRED">Owner Preferred (Owner Only)</option>
                    <option value="SPECIFIC_STAFF">Select Specific Barber</option>
                  </select>
                </div>

                {bPref === 'SPECIFIC_STAFF' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Select Staff Member
                    </label>
                    <select
                      value={bBarberId}
                      onChange={(e) => setBBarberId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                    >
                      <option value="">-- Choose Barber --</option>
                      {activeStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.availability_status})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Haircut instruction"
                      value={bNotes}
                      onChange={(e) => setBNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={bStartImmediately}
                  onChange={(e) => setBStartImmediately(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span>Start service in chair immediately (Mark IN_PROGRESS)</span>
              </label>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={bSubmitting}
                  className="flex-1 py-3.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm min-h-[48px]"
                >
                  {bSubmitting ? 'Saving...' : 'Generate Walk-in Token'}
                </button>
                <button
                  type="button"
                  disabled={bSubmitting}
                  onClick={(e) => handleCreateWalkInOrManualBooking(e, 'WALK_IN', true)}
                  className="flex-1 py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm min-h-[48px]"
                >
                  Save &amp; Go Straight to Billing &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          7. SPLIT BILLING POS (Cash + UPI + Udhar) & OFFLINE DRAFT SYNC
         ========================================================================== */}
      {activeSubTab === 'BILLING' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <form
            onSubmit={handleSubmitBill}
            className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Billing &amp; Payment Counter
              </h2>

              {(!isOnline || forceOfflineDraftMode) && (
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 rounded-xl border border-amber-500/30">
                  <input
                    type="checkbox"
                    checked={!isOnline || forceOfflineDraftMode}
                    onChange={(e) => setForceOfflineDraftMode(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Save as Offline Draft</span>
                </label>
              )}
            </div>

            {selectedBookingForBill && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                <div>
                  <strong>Billing Token #{selectedBookingForBill.token_number}:</strong>{' '}
                  {selectedBookingForBill.customer_name} ({selectedBookingForBill.barber_name})
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBookingForBill(null)}
                  className="text-amber-700 dark:text-amber-300 font-semibold hover:underline"
                >
                  Switch to Direct Walk-in Bill
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Mobile Number (10 Digits) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="9876543210"
                  value={billCustomerPhone}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setBillCustomerPhone(clean);
                    if (clean.length === 10) {
                      const existing = data.customers.find((c) => c.phone === clean);
                      if (existing) {
                        setBillCustomerName(existing.name);
                        setBillHaircutPref(existing.haircut_preference || '');
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Customer Full Name"
                  value={billCustomerName}
                  onChange={(e) => setBillCustomerName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Service Performed By (Barber) *
                </label>
                <select
                  value={billBarberId || ownerBarber?.id || ''}
                  onChange={(e) => setBillBarberId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                >
                  {data.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.commission_pct}% comm.)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Select Services to Calculate Bill
              </label>
              <div className="flex flex-wrap gap-2">
                {activeServices.map((srv) => {
                  const isSel = billServiceIds.includes(srv.id);
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => handleToggleBillService(srv.id)}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        isSel
                          ? 'bg-amber-500 border-amber-500 text-slate-950'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {srv.name} · ₹{srv.price}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Split Payment Breakdown (Cash + UPI + Udhar)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBillCashPaid(billTotalAmount);
                      setBillUpiPaid(0);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
                  >
                    100% Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillCashPaid(0);
                      setBillUpiPaid(billTotalAmount);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
                  >
                    100% UPI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillCashPaid(0);
                      setBillUpiPaid(0);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-rose-600"
                  >
                    100% Udhar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Final Bill Price (₹) — Editable *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={billTotalAmount}
                    onChange={(e) => setBillTotalAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-base font-mono font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {t(lang, 'cashPaid')} (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={billCashPaid}
                    onChange={(e) => setBillCashPaid(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-base font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {t(lang, 'upiPaid')} (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={billUpiPaid}
                    onChange={(e) => setBillUpiPaid(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-base font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500">{t(lang, 'totalBill')}</div>
                  <div className="font-mono text-lg font-extrabold tabular-nums">₹{billTotalAmount}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{t(lang, 'totalPaid')}</div>
                  <div className="font-mono text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ₹{billTotalCollected}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{t(lang, 'remainingUdhar')}</div>
                  <div
                    className={`font-mono text-lg font-extrabold tabular-nums ${
                      billRemainingUdhar > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    ₹{billRemainingUdhar}
                  </div>
                </div>
              </div>

              {billUpiPaid > 0 && (
                <UpiIntentLauncher
                  upiId={data.settings.upi_id}
                  merchantName={data.settings.upi_merchant_name || data.salon.name}
                  amount={billUpiPaid}
                  note={`${data.salon.name} Bill - ${billCustomerName || 'Walk-in'}`}
                  txnRef={selectedBookingForBill?.reference_code}
                  allowQuickConfig
                  onQuickSaveUpiId={handleQuickSaveUpiId}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Haircut Preference (Saved to History)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Zero Fade, Scissor Top"
                  value={billHaircutPref}
                  onChange={(e) => setBillHaircutPref(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional remark"
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={billSubmitting}
              className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm min-h-[48px]"
            >
              {billSubmitting
                ? 'Saving Bill...'
                : !isOnline || forceOfflineDraftMode
                ? `${t(lang, 'saveOfflineDraft')} (₹${billTotalAmount})`
                : `${t(lang, 'completeBill')} · Collected ₹${billTotalCollected} / Udhar ₹${billRemainingUdhar}`}
            </button>
          </form>

          {/* Right Column: Offline Draft Sync Queue & Recent Payments */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Offline Draft Queue ({offlineDrafts.length})</h3>
                {offlineDrafts.length > 0 && (
                  <button
                    type="button"
                    disabled={!isOnline || isSyncingDrafts}
                    onClick={onSyncOfflineDrafts}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrafts ? 'animate-spin' : ''}`} />
                    <span>{isSyncingDrafts ? 'Syncing...' : t(lang, 'syncNow')}</span>
                  </button>
                )}
              </div>

              {offlineDrafts.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
                  No pending offline drafts.
                </div>
              ) : (
                <div className="space-y-2">
                  {offlineDrafts.map((d) => (
                    <div
                      key={d.client_sync_id}
                      className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>{d.customer_name}</span>
                        <span className="font-mono tabular-nums">₹{d.total_bill}</span>
                      </div>
                      <div className="text-slate-500">
                        Cash: ₹{d.cash_paid} · UPI: ₹{d.upi_paid} · Udhar: ₹{d.udhar_amount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h3 className="text-sm font-bold">Recent Payments ({data.payments.length})</h3>
              {data.payments.length === 0 ? (
                <p className="text-xs text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto">
                  {data.payments.slice(-10).reverse().map((p) => (
                    <div key={p.id} className="py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{p.customer_name}</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          Collected ₹{p.total_collected}
                        </span>
                      </div>
                      <div className="text-slate-500 font-mono tabular-nums">
                        {p.payment_type === 'DUE_SETTLEMENT' ? 'Udhar Settlement' : `Bill ₹${p.total_bill}`} · Cash ₹{p.cash_paid} · UPI ₹{p.upi_paid}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ==========================================================================
          LIVE BOOKING TIME / DATE / DELAY / PRICE EDIT MODAL
         ========================================================================== */}
      {editingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setEditingBooking(null)}
        >
          <form
            onSubmit={handleSaveBookingEdits}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold">
                  Edit Booking · Token #{editingBooking.token_number}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingBooking.customer_name} (+91 {editingBooking.customer_phone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1-Tap Quick Time Shifts */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">
                1-Tap Live Time Shift (If hair/beard takes extra time)
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[-10, 10, 15, 30].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    disabled={editSaving}
                    onClick={() => handleQuickShiftBooking(editingBooking, delta)}
                    className={`py-2.5 rounded-xl font-mono text-xs font-bold border transition-colors ${
                      delta > 0
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {delta > 0 ? `+${delta}m` : `${delta}m`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
                <input
                  type="time"
                  required
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Assigned Barber</label>
                <select
                  value={editBarberId}
                  onChange={(e) => setEditBarberId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={editTotalAmount}
                  onChange={(e) => setEditTotalAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Live Message / Reason for Customer (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Previous haircut taking 15 mins extra, please come at new time"
                value={editDelayReason}
                onChange={(e) => setEditDelayReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <a
                href={`https://wa.me/91${editingBooking.customer_phone}?text=${encodeURIComponent(
                  `Hello ${editingBooking.customer_name}, update from ${data.salon.name} for Token #${editingBooking.token_number}:\nNew Timing: ${editDate} at ${editTime}\nPrice: ₹${editTotalAmount}${
                    editDelayReason ? `\nNote: ${editDelayReason}` : ''
                  }`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Customer</span>
              </a>

              <button
                type="submit"
                disabled={editSaving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs min-h-[42px]"
              >
                {editSaving ? 'Saving...' : 'Save & Notify Customer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
