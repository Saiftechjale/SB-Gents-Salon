import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Check,
  History,
  LogIn,
  LogOut,
  Play,
  Search,
  User,
  Wallet,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  BookingStatus,
  SalonBootstrapData,
} from '../types/salon';
import { apiFetch } from '../lib/api';
import {
  formatShortDate,
  formatShortTime,
  getAvatarColorClass,
  getInitials,
  getLocalTodayStr,
} from '../lib/salonUiHelpers';

export type StaffTab = 'AAJ' | 'HISTORY' | 'KAMAI' | 'PROFILE';

interface StaffPortalViewProps {
  data: SalonBootstrapData;
  lockedStaffId?: string;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
  onOpenLogin: () => void;
  onLogout?: () => void;
}

export const StaffPortalView: React.FC<StaffPortalViewProps> = ({
  data,
  lockedStaffId,
  onRefresh,
  notify,
  onOpenLogin,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<StaffTab>('AAJ');
  const todayStr = getLocalTodayStr();

  const staffList = useMemo(
    () => data.staff.filter((s) => s.is_active),
    [data.staff]
  );

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    () => lockedStaffId || staffList.find((s) => !s.is_owner)?.id || staffList[0]?.id || ''
  );

  useEffect(() => {
    if (lockedStaffId) {
      setSelectedStaffId(lockedStaffId);
    }
  }, [lockedStaffId]);

  const effectiveStaffId = lockedStaffId || selectedStaffId;
  const currentStaffIndex = Math.max(
    0,
    staffList.findIndex((s) => s.id === effectiveStaffId)
  );
  const currentStaff = staffList[currentStaffIndex] || staffList[0];

  const myTodayBookings = useMemo(() => {
    if (!currentStaff) return [];
    return data.bookings
      .filter(
        (b) =>
          b.barber_id === currentStaff.id &&
          b.booking_date === todayStr &&
          b.status !== 'CANCELLED'
      )
      .sort((a, b) => a.slot_time.localeCompare(b.slot_time) || a.token_number - b.token_number);
  }, [data.bookings, currentStaff, todayStr]);

  const activeBooking = useMemo(
    () => myTodayBookings.find((b) => b.status === 'IN_PROGRESS') || null,
    [myTodayBookings]
  );

  const completedBookings = useMemo(
    () => myTodayBookings.filter((b) => b.status === 'COMPLETED'),
    [myTodayBookings]
  );

  const waitingBookings = useMemo(
    () => myTodayBookings.filter((b) => b.status === 'WAITING'),
    [myTodayBookings]
  );

  const myTodayWorkAmount = useMemo(
    () => myTodayBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
    [myTodayBookings]
  );

  const completedPct =
    myTodayBookings.length > 0
      ? Math.round((completedBookings.length / myTodayBookings.length) * 100)
      : 0;

  // Customer History State (Screen 8)
  const [custSearch, setCustSearch] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    () => data.customers[0]?.id || ''
  );
  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return data.customers;
    return data.customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [data.customers, custSearch]);

  const selectedCustomer = useMemo(
    () =>
      data.customers.find((c) => c.id === selectedCustomerId) ||
      filteredCustomers[0] ||
      null,
    [data.customers, selectedCustomerId, filteredCustomers]
  );

  const [noteDraft, setNoteDraft] = useState<string>('');
  const [editingNote, setEditingNote] = useState<boolean>(false);

  useEffect(() => {
    if (selectedCustomer) {
      setNoteDraft(selectedCustomer.haircut_preference || selectedCustomer.special_notes || '');
      setEditingNote(false);
    }
  }, [selectedCustomer]);

  const selectedCustomerVisits = useMemo(() => {
    if (!selectedCustomer) return [];
    return data.serviceHistory
      .filter((h) => h.customer_id === selectedCustomer.id)
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  }, [data.serviceHistory, selectedCustomer]);

  const myCommissions = useMemo(() => {
    if (!currentStaff) return [];
    return data.commissions
      .filter((c) => c.staff_id === currentStaff.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.commissions, currentStaff]);

  const todayCommTotal = useMemo(
    () =>
      myCommissions
        .filter((c) => c.earned_date === todayStr)
        .reduce((s, c) => s + Number(c.commission_amount), 0),
    [myCommissions, todayStr]
  );

  const allTimeCommTotal = useMemo(
    () => myCommissions.reduce((s, c) => s + Number(c.commission_amount), 0),
    [myCommissions]
  );

  const myAttendance = useMemo(() => {
    if (!currentStaff) return null;
    return (
      data.attendance.find(
        (a) => a.staff_id === currentStaff.id && a.attendance_date === todayStr
      ) || null
    );
  }, [data.attendance, currentStaff, todayStr]);

  const handleUpdateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    try {
      const res = await apiFetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Could not update status');
        return;
      }
      await onRefresh();
      notify('success', status === 'IN_PROGRESS' ? 'Customer shuru kiya gaya!' : 'Kaam poora hua ✓');
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleDelayBooking = async (bookingId: string) => {
    try {
      const res = await apiFetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_minutes: 15, delay_reason: 'Running 15 min behind' }),
      });
      if (res.ok) {
        await onRefresh();
        notify('success', '+15 min update & customer notified');
      }
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleSaveCustomerNote = async () => {
    if (!selectedCustomer) return;
    try {
      const res = await apiFetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haircut_preference: noteDraft }),
      });
      if (res.ok) {
        await onRefresh();
        setEditingNote(false);
        notify('success', 'Customer cut note saved!');
      }
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleUpdateAvailability = async (status: AvailabilityStatus) => {
    if (!currentStaff) return;
    const res = await apiFetch(`/api/staff/${currentStaff.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability_status: status }),
    });
    if (res.ok) {
      await onRefresh();
      notify('success', `Status updated: ${status}`);
    }
  };

  const handleMarkAttendance = async (status: 'PRESENT' | 'HALF_DAY' | 'LEAVE') => {
    if (!currentStaff) return;
    const res = await apiFetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: currentStaff.id,
        attendance_date: todayStr,
        status,
      }),
    });
    if (res.ok) {
      await onRefresh();
      notify('success', `Attendance marked: ${status}`);
    }
  };

  if (!currentStaff) {
    return <div className="p-8 text-center text-sm text-slate-500">No active staff found.</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 pb-24 md:pb-10">
      <header className="sticky top-0 z-30 bg-[#F8F7FC]/95 dark:bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 pt-[max(0.85rem,env(safe-area-inset-top))] pb-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="text-[11px] font-extrabold tracking-widest text-[#6C3BF5] uppercase truncate">
            {data.salon.name} · STAFF
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            {(
              [
                { id: 'AAJ', label: 'Aaj' },
                { id: 'HISTORY', label: 'History' },
                { id: 'KAMAI', label: 'Kamai' },
                { id: 'PROFILE', label: 'Profile' },
              ] as { id: StaffTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#6C3BF5] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {lockedStaffId ? (
            <span className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-[#141028] dark:text-white shadow-sm">
              {currentStaff.name.split(' ')[0]} · Chair {currentStaffIndex + 1}
            </span>
          ) : (
            <select
              value={currentStaff.id}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-[#141028] dark:text-white shadow-sm focus:outline-none"
            >
              {staffList.map((st, idx) => (
                <option key={st.id} value={st.id}>
                  {st.name.split(' ')[0]} · Chair {idx + 1}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-2 space-y-5">
        {/* SCREEN 7: AAJ KE CUSTOMERS */}
        {activeTab === 'AAJ' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Aaj ke customers
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {currentStaff.name.split(' ')[0]} · Chair {currentStaffIndex + 1}
              </p>
            </div>

            {/* Progress Card */}
            <div className="sb-card p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-extrabold text-[#141028] dark:text-white">
                  Aaj: {myTodayBookings.length} customers
                </span>
                <span className="font-extrabold text-[#6C3BF5] tabular-nums">
                  ₹{myTodayWorkAmount.toLocaleString('en-IN')} ka kaam
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full sb-gradient transition-all"
                  style={{ width: `${Math.max(12, completedPct)}%` }}
                />
              </div>
            </div>

            {/* Active Customer Card (Violet Border) */}
            {activeBooking && (
              <div className="sb-card border-2 border-[#6C3BF5] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-[#7C5DFA] text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                      {getInitials(activeBooking.customer_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-extrabold text-[#141028] dark:text-white truncate">
                        {activeBooking.customer_name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {formatShortTime(activeBooking.slot_time)} ·{' '}
                        {activeBooking.services?.map((s) => s.service_name).join(' + ')}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#6C3BF5] text-white text-[11px] font-extrabold shrink-0">
                    ABHI
                  </span>
                </div>

                {/* Warm Cream Cut Preference Box */}
                {(() => {
                  const cust = data.customers.find(
                    (c) => c.id === activeBooking.customer_id
                  );
                  const prefText =
                    cust?.haircut_preference ||
                    activeBooking.notes ||
                    'Regular fade cut · clean beard trim';
                  return (
                    <div className="rounded-xl bg-[#FEF9C3] border border-[#FDE68A] px-3.5 py-2.5 text-xs font-bold text-[#854D0E]">
                      Pichli baar: {prefText}
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateBookingStatus(activeBooking.id, 'COMPLETED')}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Ho gaya</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelayBooking(activeBooking.id)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold text-[#141028] dark:text-white"
                  >
                    +15m
                  </button>
                </div>
              </div>
            )}

            {/* Remaining Customers List (Done + Next + Waiting) */}
            <div className="sb-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {completedBookings.length === 0 && waitingBookings.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {activeBooking
                    ? 'Aur koi customer line mein nahi hai.'
                    : 'Aaj aapki chair par abhi koi customer nahi hai.'}
                </div>
              ) : (
                <>
                  {completedBookings.map((b, idx) => (
                    <div
                      key={b.id}
                      className="px-4 py-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${getAvatarColorClass(
                            idx + 1
                          )}`}
                        >
                          {getInitials(b.customer_name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                            {b.customer_name}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {formatShortTime(b.slot_time)} ·{' '}
                            {b.services?.map((s) => s.service_name).join(' + ')}
                          </div>
                        </div>
                      </div>
                      <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </span>
                    </div>
                  ))}

                  {waitingBookings.map((b, idx) => {
                    const isNext = idx === 0;
                    return (
                      <div
                        key={b.id}
                        className="px-4 py-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${getAvatarColorClass(
                              idx + 2
                            )}`}
                          >
                            {getInitials(b.customer_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                              {b.customer_name}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {formatShortTime(b.slot_time)} ·{' '}
                              {b.services?.map((s) => s.service_name).join(' + ')}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUpdateBookingStatus(b.id, 'IN_PROGRESS')}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold shrink-0 flex items-center gap-1 ${
                            isNext
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-[#6C3BF5] hover:text-white'
                          }`}
                        >
                          <Play className="w-3 h-3" />
                          <span>{isNext ? 'Next · Start' : 'Start'}</span>
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 8: CUSTOMER HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Customer history
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Kaun, kab aaya, kya karwaya
              </p>
            </div>

            {/* Search Customer */}
            <div className="sb-card px-3.5 py-2.5 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                placeholder="Customer naam ya mobile khojein..."
                className="w-full bg-transparent text-xs font-semibold focus:outline-none"
              />
            </div>

            {filteredCustomers.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filteredCustomers.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 ${
                      selectedCustomer?.id === c.id
                        ? 'bg-[#6C3BF5] text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 border border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {!selectedCustomer ? (
              <div className="sb-card p-6 text-center text-xs text-slate-500">
                Abhi koi customer history saved nahi hai.
              </div>
            ) : (
              <>
                <div className="sb-card p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-[#7C5DFA] text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                      {getInitials(selectedCustomer.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-extrabold text-[#141028] dark:text-white truncate">
                        {selectedCustomer.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {selectedCustomer.total_visits} visits · +91 {selectedCustomer.phone}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#EDE9FE] text-[#6D28D9] text-[11px] font-bold shrink-0">
                    Fav: {selectedCustomerVisits[0]?.barber_name.split(' ')[0] || currentStaff.name.split(' ')[0]}
                  </span>
                </div>

                {/* Yellow NOTE Card */}
                <div className="rounded-2xl bg-[#FEF9C3] border border-[#FDE68A] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold tracking-wider text-[#92400E] uppercase">
                      NOTE
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        editingNote ? handleSaveCustomerNote() : setEditingNote(true)
                      }
                      className="text-xs font-extrabold text-[#6C3BF5]"
                    >
                      {editingNote ? 'Save' : 'Edit'}
                    </button>
                  </div>
                  {editingNote ? (
                    <textarea
                      rows={2}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Side 2 number, upar se thoda kam..."
                      className="w-full rounded-xl bg-white/80 p-2.5 text-xs font-bold text-[#141028] focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-[#78350F] leading-snug">
                      {noteDraft || 'Koi special cut note abhi save nahi hai.'}
                    </p>
                  )}
                </div>

                {/* VISITS Card */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    VISITS
                  </div>
                  <div className="sb-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedCustomerVisits.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500">
                        Is customer ki visit billing ke baad yahan dikhegi.
                      </div>
                    ) : (
                      selectedCustomerVisits.map((v) => {
                        const shortD = formatShortDate(v.visit_date).split(' ');
                        return (
                          <div
                            key={v.id}
                            className="px-4 py-3.5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="text-center w-9 shrink-0">
                                <div className="text-sm font-extrabold text-[#141028] dark:text-white leading-none">
                                  {shortD[0]}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                                  {shortD[1]}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                                  {v.services_summary}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {v.barber_name.split(' ')[0]}
                                </div>
                              </div>
                            </div>
                            <span className="text-sm font-extrabold text-[#141028] dark:text-white tabular-nums shrink-0">
                              ₹{v.total_bill}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: KAMAI */}
        {activeTab === 'KAMAI' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Meri kamai
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {currentStaff.name} · {currentStaff.commission_pct}% commission
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="sb-gradient rounded-3xl p-4 text-white">
                <div className="text-[11px] font-bold uppercase text-white/80">Aaj Commission</div>
                <div className="text-3xl font-extrabold tabular-nums mt-1">
                  ₹{todayCommTotal.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="sb-card p-4">
                <div className="text-[11px] font-bold uppercase text-slate-400">Total Earned</div>
                <div className="text-3xl font-extrabold text-emerald-600 tabular-nums mt-1">
                  ₹{allTimeCommTotal.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="sb-card divide-y divide-slate-100 dark:divide-slate-800">
              {myCommissions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Bill complete hone par commission yahan add hoga.
                </div>
              ) : (
                myCommissions.slice(0, 15).map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-[#141028] dark:text-white">
                        {formatShortDate(c.earned_date)} · Service ₹{c.service_amount}
                      </div>
                      <div className="text-slate-400">{c.commission_pct}% share</div>
                    </div>
                    <span className="text-sm font-extrabold text-emerald-600 tabular-nums">
                      +₹{c.commission_amount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PROFILE */}
        {activeTab === 'PROFILE' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Staff Profile
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Availability aur aaj ki attendance
              </p>
            </div>

            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Chair Status
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['Available', 'Busy', 'Break', 'Not Available'] as AvailabilityStatus[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleUpdateAvailability(st)}
                      className={`py-3 rounded-xl text-xs font-extrabold ${
                        currentStaff.availability_status === st
                          ? 'bg-[#6C3BF5] text-white'
                          : 'bg-[#F8F7FC] dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Aaj ki Attendance {myAttendance?.status ? `· ${myAttendance.status}` : ''}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['PRESENT', 'HALF_DAY', 'LEAVE'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => handleMarkAttendance(a)}
                    className={`py-2.5 rounded-xl text-xs font-extrabold ${
                      myAttendance?.status === a
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#F8F7FC] dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {a.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenLogin}
              className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Login / Role Badlein</span>
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout (Lock Staff Portal)</span>
              </button>
            )}
          </div>
        )}
      </main>

      {/* Fixed Bottom 4-Tab Bar (PDF Screens 7, 8) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-4 h-16 pb-[env(safe-area-inset-bottom)]">
        {(
          [
            { id: 'AAJ', label: 'Aaj', icon: CalendarCheck },
            { id: 'HISTORY', label: 'History', icon: History },
            { id: 'KAMAI', label: 'Kamai', icon: Wallet },
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
