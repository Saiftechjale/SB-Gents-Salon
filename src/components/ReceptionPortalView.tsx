import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  CalendarCheck,
  Check,
  LayoutGrid,
  LogIn,
  LogOut,
  MessageCircle,
  Play,
  Receipt,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  Booking,
  OfflineDraftBill,
  SalonBootstrapData,
} from '../types/salon';
import { apiFetch } from '../lib/api';
import { buildUpiDeepLinks, isValidUpiId } from '../lib/upiIntent';
import {
  formatShortDate,
  formatShortTime,
  formatSlot12h,
  getAvatarColorClass,
  getInitials,
  getLocalTodayStr,
} from '../lib/salonUiHelpers';
import type { AppPortalRole } from './LoginScreen';

export type ReceptionTab = 'AAJ' | 'WALKIN' | 'BILLING' | 'MORE';

interface ReceptionPortalViewProps {
  data: SalonBootstrapData;
  isOnline: boolean;
  onSaveOfflineDraft: (draft: OfflineDraftBill) => Promise<void>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
  onSwitchRole: (role: AppPortalRole) => void;
  onOpenLogin: () => void;
  onLogout?: () => void;
}

export const ReceptionPortalView: React.FC<ReceptionPortalViewProps> = ({
  data,
  isOnline,
  onSaveOfflineDraft,
  onRefresh,
  notify,
  onSwitchRole,
  onOpenLogin,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<ReceptionTab>('AAJ');
  const todayStr = getLocalTodayStr();

  const activeStaff = useMemo(
    () => data.staff.filter((s) => s.is_active),
    [data.staff]
  );
  const activeServices = useMemo(
    () => data.services.filter((s) => s.is_active),
    [data.services]
  );

  const todayBookings = useMemo(
    () =>
      data.bookings
        .filter((b) => b.booking_date === todayStr && b.status !== 'CANCELLED')
        .sort((a, b) => a.slot_time.localeCompare(b.slot_time) || a.token_number - b.token_number),
    [data.bookings, todayStr]
  );

  const onlineTodayCount = todayBookings.filter((b) => b.booking_type === 'ONLINE').length;
  const walkinTodayCount = todayBookings.filter((b) => b.booking_type === 'WALK_IN').length;

  const [selectedBookingModal, setSelectedBookingModal] = useState<Booking | null>(null);

  // Walk-in Entry State (Screen 5)
  const [wPhone, setWPhone] = useState<string>('');
  const [wName, setWName] = useState<string>('');
  const [wServiceIds, setWServiceIds] = useState<string[]>(() =>
    activeServices.slice(0, 2).map((s) => s.id)
  );
  const [wBarberId, setWBarberId] = useState<string>('');
  const [wSubmitting, setWSubmitting] = useState<boolean>(false);
  const [createdWalkin, setCreatedWalkin] = useState<Booking | null>(null);

  const matchedWalkinCustomer = useMemo(() => {
    const digits = wPhone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) return null;
    return (
      data.customers.find((c) => c.phone.replace(/\D/g, '').slice(-10) === digits) ||
      null
    );
  }, [data.customers, wPhone]);

  useEffect(() => {
    if (matchedWalkinCustomer) {
      setWName(matchedWalkinCustomer.name);
    }
  }, [matchedWalkinCustomer]);

  const fastestBarber = useMemo(() => {
    return (
      activeStaff.find((s) => s.availability_status === 'Available') ||
      activeStaff[0] ||
      null
    );
  }, [activeStaff]);

  useEffect(() => {
    if (!wBarberId && fastestBarber) {
      setWBarberId(fastestBarber.id);
    }
  }, [fastestBarber, wBarberId]);

  const selectedWalkinBarber =
    activeStaff.find((s) => s.id === wBarberId) || fastestBarber;

  const nextTokenNumber = useMemo(() => {
    const maxTok = data.bookings
      .filter((b) => b.booking_date === todayStr)
      .reduce((m, b) => Math.max(m, b.token_number), 0);
    return maxTok + 1;
  }, [data.bookings, todayStr]);

  // Billing State (Screen 6)
  const unbilledBookings = useMemo(
    () =>
      data.bookings
        .filter((b) => !b.is_billed && b.status !== 'CANCELLED')
        .sort((a, b) => {
          const rank = (s: string) =>
            s === 'COMPLETED' ? 0 : s === 'IN_PROGRESS' ? 1 : 2;
          return rank(a.status) - rank(b.status) || a.token_number - b.token_number;
        }),
    [data.bookings]
  );

  const [billBookingId, setBillBookingId] = useState<string>(
    () => unbilledBookings[0]?.id || ''
  );
  useEffect(() => {
    if (!billBookingId && unbilledBookings[0]) {
      setBillBookingId(unbilledBookings[0].id);
    }
  }, [billBookingId, unbilledBookings]);

  const selectedBillBooking = useMemo(
    () => unbilledBookings.find((b) => b.id === billBookingId) || unbilledBookings[0] || null,
    [unbilledBookings, billBookingId]
  );

  const [payMode, setPayMode] = useState<'CASH' | 'UPI' | 'SPLIT'>('UPI');
  const [splitCash, setSplitCash] = useState<string>('0');
  const [splitUpi, setSplitUpi] = useState<string>('0');
  const [splitUdhar, setSplitUdhar] = useState<string>('0');
  const [billSubmitting, setBillSubmitting] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [quickUpiInput, setQuickUpiInput] = useState<string>(data.settings.upi_id || '');
  const [lastBilledReceiptWa, setLastBilledReceiptWa] = useState<string>('');

  const billTotal = selectedBillBooking ? Number(selectedBillBooking.total_amount) : 0;

  useEffect(() => {
    if (payMode === 'CASH') {
      setSplitCash(String(billTotal));
      setSplitUpi('0');
      setSplitUdhar('0');
    } else if (payMode === 'UPI') {
      setSplitCash('0');
      setSplitUpi(String(billTotal));
      setSplitUdhar('0');
    }
  }, [payMode, billTotal]);

  const upiLinks = useMemo(() => {
    const vpa = (data.settings.upi_id || quickUpiInput || '').trim();
    if (!vpa || billTotal <= 0) return null;
    return buildUpiDeepLinks({
      payeeVpa: vpa,
      payeeName: data.settings.upi_merchant_name || data.salon.name,
      amount: billTotal,
      transactionNote: selectedBillBooking
        ? `Token #${selectedBillBooking.token_number} ${selectedBillBooking.customer_name}`
        : `${data.salon.name} Bill`,
      transactionRef: selectedBillBooking?.reference_code,
    });
  }, [data.settings.upi_id, data.settings.upi_merchant_name, data.salon.name, quickUpiInput, billTotal, selectedBillBooking]);

  useEffect(() => {
    if (!upiLinks?.generic) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(upiLinks.generic, { width: 220, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [upiLinks?.generic]);

  // Handlers
  const handleToggleStaffAvailability = async (staffId: string, current: AvailabilityStatus) => {
    const next: AvailabilityStatus = current === 'Available' ? 'Busy' : 'Available';
    try {
      const res = await apiFetch(`/api/staff/${staffId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_status: next }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleBookingStatus = async (bookingId: string, status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') => {
    try {
      const res = await apiFetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Failed to update status');
        return;
      }
      await onRefresh();
      setSelectedBookingModal(null);
      notify('success', status === 'IN_PROGRESS' ? 'ग्राहक शुरू किया गया' : 'Status updated');
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleSubmitWalkin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = wPhone.replace(/\D/g, '').slice(-10);
    const cleanName = wName.trim() || 'Walk-in Customer';
    if (cleanPhone.length < 10) {
      notify('error', 'कृपया 10 अंकों का मोबाइल नंबर डालें');
      return;
    }
    if (wServiceIds.length === 0) {
      notify('error', 'कृपया कम से कम 1 सर्विस चुनें');
      return;
    }

    const now = new Date();
    const slotNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setWSubmitting(true);
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: cleanName,
          customer_phone: cleanPhone,
          barber_id: selectedWalkinBarber?.id,
          booking_preference: 'SPECIFIC_STAFF',
          booking_type: 'WALK_IN',
          booking_date: todayStr,
          slot_time: slotNow,
          service_ids: wServiceIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Walk-in entry failed');
        return;
      }
      const created = json.booking as Booking;
      setCreatedWalkin(created);
      setWPhone('');
      setWName('');
      await onRefresh();
      notify('success', `Token #${created.token_number} line mein add ho gaya!`);
    } catch (err) {
      notify('error', String(err));
    } finally {
      setWSubmitting(false);
    }
  };

  const handleSaveQuickUpi = async () => {
    if (!isValidUpiId(quickUpiInput)) {
      notify('error', 'सही UPI ID डालें');
      return;
    }
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upi_id: quickUpiInput.trim() }),
    });
    if (res.ok) {
      await onRefresh();
      notify('success', 'Shop UPI ID saved!');
    }
  };

  const handleSubmitBill = async () => {
    if (!selectedBillBooking) {
      notify('error', 'Koi pending bill chunein');
      return;
    }
    const cash = payMode === 'CASH' ? billTotal : payMode === 'UPI' ? 0 : Number(splitCash || 0);
    const upi = payMode === 'UPI' ? billTotal : payMode === 'CASH' ? 0 : Number(splitUpi || 0);
    const udhar = payMode === 'SPLIT' ? Number(splitUdhar || 0) : 0;

    if (Math.abs(cash + upi + udhar - billTotal) > 0.5) {
      notify('error', `Cash + UPI + Udhar must equal ₹${billTotal}`);
      return;
    }

    const servicesSummary =
      selectedBillBooking.services?.map((s) => s.service_name).join(' + ') || 'Salon Service';
    const serviceIds = selectedBillBooking.services?.map((s) => s.service_id) || [];

    const payload: OfflineDraftBill = {
      client_sync_id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      booking_id: selectedBillBooking.id,
      customer_name: selectedBillBooking.customer_name,
      customer_phone: selectedBillBooking.customer_phone,
      barber_id: selectedBillBooking.barber_id,
      barber_name: selectedBillBooking.barber_name,
      service_ids: serviceIds,
      services_summary: servicesSummary,
      payment_date: todayStr,
      total_bill: billTotal,
      cash_paid: cash,
      upi_paid: upi,
      udhar_amount: udhar,
      haircut_preference: '',
      notes: '',
      created_at: new Date().toISOString(),
      sync_status: 'PENDING',
    };

    if (!isOnline) {
      await onSaveOfflineDraft(payload);
      notify('success', 'Offline saved — internet aane par sync ho jayega');
      return;
    }

    setBillSubmitting(true);
    try {
      const res = await apiFetch('/api/payments/bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Bill save nahi hua');
        return;
      }

      const receiptMsg = `Namaste ${selectedBillBooking.customer_name} ji! ${data.salon.name} se aapka bill ₹${billTotal} (${servicesSummary}) receive ho gaya. Dhanyawad!`;
      const waLink = `https://wa.me/91${selectedBillBooking.customer_phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
        receiptMsg
      )}`;
      setLastBilledReceiptWa(waLink);
      setBillBookingId('');
      await onRefresh();
      notify('success', `₹${billTotal} bill saved! WhatsApp receipt bhej sakte hain.`);
    } catch (err) {
      notify('error', String(err));
    } finally {
      setBillSubmitting(false);
    }
  };

  const formattedTodayHeader = new Date(`${todayStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 pb-24 md:pb-10">
      {/* Compact Header */}
      <header className="sticky top-0 z-30 bg-[#F8F7FC]/95 dark:bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 pt-[max(0.85rem,env(safe-area-inset-top))] pb-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="text-[11px] font-extrabold tracking-widest text-[#6C3BF5] uppercase truncate">
            {data.salon.name} · RECEPTION
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            {(
              [
                { id: 'AAJ', label: 'Aaj' },
                { id: 'WALKIN', label: 'Walk-in' },
                { id: 'BILLING', label: 'Billing' },
                { id: 'MORE', label: 'More' },
              ] as { id: ReceptionTab; label: string }[]
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

          <button
            type="button"
            onClick={onOpenLogin}
            className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 shadow-sm whitespace-nowrap"
          >
            Switch Role
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-2 space-y-5">
        {/* SCREEN 4: AAJ KI BOOKINGS */}
        {activeTab === 'AAJ' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Aaj ki bookings
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {formattedTodayHeader} · sab ek jagah
              </p>
            </div>

            {/* Summary Card (Aaj ke customer + Booking + Walk-in) */}
            <div className="sb-card p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  AAJ KE CUSTOMER
                </div>
                <div className="text-4xl font-extrabold text-[#6C3BF5] tabular-nums leading-tight">
                  {todayBookings.length}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="rounded-2xl bg-[#F3EFFF] dark:bg-purple-950/40 px-4 py-2.5 text-center min-w-[78px]">
                  <div className="text-xl font-extrabold text-[#141028] dark:text-white tabular-nums">
                    {onlineTodayCount}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">Booking</div>
                </div>
                <div className="rounded-2xl bg-[#F3EFFF] dark:bg-purple-950/40 px-4 py-2.5 text-center min-w-[78px]">
                  <div className="text-xl font-extrabold text-[#141028] dark:text-white tabular-nums">
                    {walkinTodayCount}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">Walk-in</div>
                </div>
              </div>
            </div>

            {/* Staff Quick Status Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {activeStaff.slice(0, 4).map((member) => {
                const isFree = member.availability_status === 'Available';
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleToggleStaffAvailability(member.id, member.availability_status)}
                    className="sb-card p-3 text-left transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isFree ? 'bg-emerald-500' : 'bg-[#EC4899]'
                        }`}
                      />
                      <span className="text-xs font-extrabold text-[#141028] dark:text-white truncate">
                        {member.name.split(' ')[0]}
                      </span>
                    </div>
                    <div
                      className={`text-[11px] font-bold mt-0.5 ${
                        isFree ? 'text-emerald-600' : 'text-[#EC4899]'
                      }`}
                    >
                      {isFree ? 'Free' : member.availability_status}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Timeline Bookings Card */}
            <div className="sb-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {todayBookings.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-slate-500">
                    Aaj abhi koi booking nahi hai.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('WALKIN')}
                    className="px-5 py-2.5 rounded-xl bg-[#6C3BF5] text-white text-xs font-bold"
                  >
                    + Walk-in entry daalein
                  </button>
                </div>
              ) : (
                todayBookings.map((b) => {
                  const statusChip =
                    b.status === 'COMPLETED'
                      ? { label: 'Ho gaya', cls: 'bg-emerald-100 text-emerald-700' }
                      : b.status === 'IN_PROGRESS'
                      ? { label: 'Chal raha', cls: 'bg-[#EDE9FE] text-[#6D28D9]' }
                      : { label: 'Aane wala', cls: 'bg-amber-100 text-amber-800' };

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBookingModal(b)}
                      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="text-sm font-extrabold text-[#141028] dark:text-white tabular-nums w-12 shrink-0">
                          {formatShortTime(b.slot_time)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                            {b.customer_name}{' '}
                            <span className="text-[11px] font-bold text-[#6C3BF5]">
                              #{b.token_number}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {b.services?.map((s) => s.service_name).join(' + ') || 'Service'} ·{' '}
                            {b.barber_name.split(' ')[0]}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 ${statusChip.cls}`}
                      >
                        {statusChip.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SCREEN 5: WALK-IN ENTRY */}
        {activeTab === 'WALKIN' && (
          <form onSubmit={handleSubmitWalkin} className="space-y-4 max-w-xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Walk-in entry
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Customer aaya? 10 second mein line mein
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                MOBILE
              </label>
              <div className="sb-card px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-500">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={wPhone}
                    onChange={(e) => setWPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98XXX XX431"
                    className="w-full bg-transparent text-base font-extrabold text-[#141028] dark:text-white tabular-nums focus:outline-none"
                  />
                </div>
                {matchedWalkinCustomer && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold shrink-0">
                    Purana customer ✓
                  </span>
                )}
              </div>
            </div>

            {/* Matched Customer or Name Field */}
            {matchedWalkinCustomer ? (
              <div className="sb-card p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                  {getInitials(matchedWalkinCustomer.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                    {matchedWalkinCustomer.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    Last visit:{' '}
                    {matchedWalkinCustomer.last_visit_date
                      ? formatShortDate(matchedWalkinCustomer.last_visit_date)
                      : 'Regular'}{' '}
                    · {matchedWalkinCustomer.total_visits} visits
                  </div>
                </div>
              </div>
            ) : (
              <div className="sb-card px-4 py-3">
                <input
                  type="text"
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  placeholder="Customer ka naam"
                  className="w-full bg-transparent text-sm font-bold text-[#141028] dark:text-white focus:outline-none"
                />
              </div>
            )}

            {/* SERVICE multi-select chips */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                SERVICE
              </label>
              <div className="flex flex-wrap gap-2">
                {activeServices.map((s) => {
                  const selected = wServiceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setWServiceIds((prev) =>
                          prev.includes(s.id)
                            ? prev.filter((id) => id !== s.id)
                            : [...prev, s.id]
                        )
                      }
                      className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all min-h-[42px] flex items-center gap-1.5 ${
                        selected
                          ? 'bg-[#6C3BF5] text-white shadow-md shadow-purple-500/20'
                          : 'bg-white dark:bg-slate-900 text-[#141028] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      <span>{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SABSE JALDI FREE Barber */}
            {selectedWalkinBarber && (
              <div className="sb-card p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-sky-500 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                    {getInitials(selectedWalkinBarber.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                      SABSE JALDI FREE
                    </div>
                    <select
                      value={selectedWalkinBarber.id}
                      onChange={(e) => setWBarberId(e.target.value)}
                      className="bg-transparent text-sm font-extrabold text-[#141028] dark:text-white focus:outline-none"
                    >
                      {activeStaff.map((st, idx) => (
                        <option key={st.id} value={st.id} className="text-slate-900">
                          {st.name} · Chair {idx + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#EDE9FE] text-[#6D28D9] text-[11px] font-bold shrink-0">
                  ~10 min
                </span>
              </div>
            )}

            {/* Dark Navy Token Preview Card (#18 Token mil gaya) */}
            <div className="rounded-3xl bg-[#141028] text-white p-5 flex items-center gap-4 shadow-xl">
              <div className="text-4xl font-extrabold text-amber-400 tabular-nums shrink-0">
                #{createdWalkin ? createdWalkin.token_number : nextTokenNumber}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-extrabold">
                  {createdWalkin ? 'Token ban gaya!' : 'Token mil gaya'}
                </div>
                <div className="text-xs text-slate-300">
                  Live queue link WhatsApp pe
                </div>
              </div>
              {createdWalkin && (
                <a
                  href={`https://wa.me/91${createdWalkin.customer_phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                    `Namaste ${createdWalkin.customer_name}, ${data.salon.name} mein aapka Token #${createdWalkin.token_number} lag gaya hai! Stylist: ${createdWalkin.barber_name}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold shrink-0"
                >
                  WhatsApp
                </a>
              )}
            </div>

            <button
              type="submit"
              disabled={wSubmitting}
              className="w-full py-4 rounded-2xl sb-gradient text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 min-h-[52px]"
            >
              <span>{wSubmitting ? 'Adding...' : 'Line mein daalo'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        )}

        {/* SCREEN 6: BILLING */}
        {activeTab === 'BILLING' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Billing
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Bill banao, UPI lo, receipt WhatsApp pe
              </p>
            </div>

            {/* Customer Card */}
            {unbilledBookings.length === 0 ? (
              <div className="sb-card p-6 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-500">
                  Abhi koi pending bill nahi hai.
                </p>
                {lastBilledReceiptWa && (
                  <a
                    href={lastBilledReceiptWa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Last Receipt WhatsApp par bhejein</span>
                  </a>
                )}
              </div>
            ) : selectedBillBooking ? (
              <>
                <div className="sb-card p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-[#7C5DFA] text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                      {getInitials(selectedBillBooking.customer_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <select
                        value={selectedBillBooking.id}
                        onChange={(e) => setBillBookingId(e.target.value)}
                        className="w-full bg-transparent text-sm font-extrabold text-[#141028] dark:text-white focus:outline-none"
                      >
                        {unbilledBookings.map((b) => (
                          <option key={b.id} value={b.id} className="text-slate-900">
                            {b.customer_name} (#{b.token_number})
                          </option>
                        ))}
                      </select>
                      <div className="text-xs text-slate-500 truncate">
                        {selectedBillBooking.barber_name.split(' ')[0]} · Token #
                        {selectedBillBooking.token_number}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold shrink-0">
                    {selectedBillBooking.status === 'COMPLETED' ? 'Kaam ho gaya' : 'Active'}
                  </span>
                </div>

                {/* Itemized Receipt Card */}
                <div className="sb-card p-4 space-y-2.5">
                  {(selectedBillBooking.services && selectedBillBooking.services.length > 0
                    ? selectedBillBooking.services
                    : [{ id: '1', service_name: 'Salon Service', price: billTotal }]
                  ).map((srv) => (
                    <div key={srv.id} className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#141028] dark:text-slate-200">
                        {srv.service_name}
                      </span>
                      <span className="font-bold text-[#141028] dark:text-white tabular-nums">
                        ₹{srv.price}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2.5 flex items-center justify-between">
                    <span className="text-base font-extrabold text-[#141028] dark:text-white">
                      Total
                    </span>
                    <span className="text-2xl font-extrabold text-[#6C3BF5] tabular-nums">
                      ₹{billTotal}
                    </span>
                  </div>
                </div>

                {/* PAYMENT Toggle */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    PAYMENT
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 dark:bg-slate-900 p-1 rounded-2xl">
                    {(
                      [
                        { id: 'CASH', label: 'Cash' },
                        { id: 'UPI', label: 'UPI' },
                        { id: 'SPLIT', label: 'Split / Udhar' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPayMode(m.id)}
                        className={`py-2.5 rounded-xl text-xs font-extrabold transition-all min-h-[40px] ${
                          payMode === m.id
                            ? 'bg-[#6C3BF5] text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Real Scannable UPI QR Card */}
                {payMode === 'UPI' && (
                  <div className="sb-card p-4 space-y-3">
                    {!data.settings.upi_id && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={quickUpiInput}
                          onChange={(e) => setQuickUpiInput(e.target.value)}
                          placeholder="Shop UPI ID"
                          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={handleSaveQuickUpi}
                          className="px-3 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-bold"
                        >
                          Save UPI
                        </button>
                      </div>
                    )}

                    {qrDataUrl ? (
                      <div className="flex items-center gap-4">
                        <img
                          src={qrDataUrl}
                          alt="UPI QR Code"
                          className="w-24 h-24 rounded-xl border border-slate-200 bg-white p-1 shrink-0"
                        />
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="text-2xl font-extrabold text-[#141028] dark:text-white tabular-nums">
                            ₹{billTotal}
                          </div>
                          <div className="text-xs text-slate-500">
                            Scan karke UPI se pay
                          </div>
                          {upiLinks && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <a
                                href={upiLinks.phonepe}
                                className="px-2.5 py-1 rounded-lg bg-[#5F259F] text-white text-[10px] font-bold"
                              >
                                PhonePe
                              </a>
                              <a
                                href={upiLinks.gpay}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold"
                              >
                                GPay
                              </a>
                              <a
                                href={upiLinks.paytm}
                                className="px-2.5 py-1 rounded-lg bg-[#00BAF2] text-white text-[10px] font-bold"
                              >
                                Paytm
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        QR dikhane ke liye upar apni Shop UPI ID save karein.
                      </div>
                    )}
                  </div>
                )}

                {payMode === 'SPLIT' && (
                  <div className="sb-card p-4 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Cash ₹
                      </label>
                      <input
                        type="number"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-2.5 py-2 text-sm font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        UPI ₹
                      </label>
                      <input
                        type="number"
                        value={splitUpi}
                        onChange={(e) => setSplitUpi(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-2.5 py-2 text-sm font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Udhar ₹
                      </label>
                      <input
                        type="number"
                        value={splitUdhar}
                        onChange={(e) => setSplitUdhar(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-2.5 py-2 text-sm font-bold tabular-nums"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={billSubmitting}
                  onClick={handleSubmitBill}
                  className="w-full py-4 rounded-2xl sb-gradient text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 min-h-[52px]"
                >
                  <span>{billSubmitting ? 'Saving...' : 'Bill + receipt bhejo'}</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* MORE TAB */}
        {activeTab === 'MORE' && (
          <div className="max-w-xl mx-auto space-y-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                More
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Malik, Staff ya Customer screen par jayein
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onSwitchRole('MALIK')}
                className="sb-card p-4 text-left flex items-center gap-3 hover:border-[#6C3BF5]/50"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-[#6C3BF5] flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white">
                    Malik (Roz ki kamai)
                  </div>
                  <div className="text-xs text-slate-500">Kamai, Staff Commission, Settings</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSwitchRole('STAFF')}
                className="sb-card p-4 text-left flex items-center gap-3 hover:border-[#6C3BF5]/50"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white">
                    Staff Screen
                  </div>
                  <div className="text-xs text-slate-500">Chair queue & Customer History</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSwitchRole('CUSTOMER')}
                className="sb-card p-4 text-left flex items-center gap-3 hover:border-[#6C3BF5]/50"
              >
                <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white">
                    Customer App Preview
                  </div>
                  <div className="text-xs text-slate-500">Slot booking & Live queue</div>
                </div>
              </button>

              <button
                type="button"
                onClick={onOpenLogin}
                className="sb-card p-4 text-left flex items-center gap-3 hover:border-[#6C3BF5]/50"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <LogIn className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white">
                    Login Screen
                  </div>
                  <div className="text-xs text-slate-500">Role badlein</div>
                </div>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="sb-card p-4 text-left flex items-center gap-3 border-rose-200 dark:border-rose-900 hover:border-rose-400"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
                      Logout
                    </div>
                    <div className="text-xs text-slate-500">Customer mode me lock karein</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Quick Booking Action Sheet */}
      {selectedBookingModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelectedBookingModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#6C3BF5]">
                  Token #{selectedBookingModal.token_number} ·{' '}
                  {formatSlot12h(selectedBookingModal.slot_time)}
                </div>
                <h3 className="text-lg font-extrabold text-[#141028] dark:text-white">
                  {selectedBookingModal.customer_name}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedBookingModal.services?.map((s) => s.service_name).join(' + ')} ·{' '}
                  {selectedBookingModal.barber_name} · ₹{selectedBookingModal.total_amount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBookingModal(null)}
                className="p-2 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {selectedBookingModal.status === 'WAITING' && (
                <button
                  type="button"
                  onClick={() => handleBookingStatus(selectedBookingModal.id, 'IN_PROGRESS')}
                  className="py-3 rounded-2xl bg-[#6C3BF5] text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Play className="w-4 h-4" />
                  <span>शुरू करें</span>
                </button>
              )}
              {selectedBookingModal.status !== 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => handleBookingStatus(selectedBookingModal.id, 'COMPLETED')}
                  className="py-3 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Ho gaya</span>
                </button>
              )}
              {!selectedBookingModal.is_billed && (
                <button
                  type="button"
                  onClick={() => {
                    setBillBookingId(selectedBookingModal.id);
                    setSelectedBookingModal(null);
                    setActiveTab('BILLING');
                  }}
                  className="py-3 rounded-2xl bg-amber-500 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Bill banayein</span>
                </button>
              )}
              <a
                href={`https://wa.me/91${selectedBookingModal.customer_phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                  `Namaste ${selectedBookingModal.customer_name} ji, ${data.salon.name} mein aapki booking confirm hai (Token #${selectedBookingModal.token_number}, Time: ${formatSlot12h(selectedBookingModal.slot_time)}).`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 rounded-2xl bg-emerald-500/15 text-emerald-700 text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => handleBookingStatus(selectedBookingModal.id, 'CANCELLED')}
                className="py-3 rounded-2xl bg-rose-50 text-rose-600 text-xs font-extrabold"
              >
                Cancel karein
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom 4-Tab Bar (PDF Screens 4, 5, 6) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-4 h-16 pb-[env(safe-area-inset-bottom)]">
        {(
          [
            { id: 'AAJ', label: 'Aaj', icon: CalendarCheck },
            { id: 'WALKIN', label: 'Walk-in', icon: UserPlus },
            { id: 'BILLING', label: 'Billing', icon: Receipt },
            { id: 'MORE', label: 'More', icon: LayoutGrid },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center gap-1 min-h-[44px]"
            >
              <div
                className={`w-9 h-7 rounded-xl flex items-center justify-center transition-colors ${
                  active ? 'bg-[#6C3BF5] text-white' : 'text-slate-400'
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
