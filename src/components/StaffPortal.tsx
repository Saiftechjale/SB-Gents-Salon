import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Play,
  Scissors,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type {
  AvailabilityStatus,
  BookingStatus,
  SalonBootstrapData,
} from '../types/salon';
import { Language } from '../lib/i18n';

interface StaffPortalProps {
  data: SalonBootstrapData;
  lang: Language;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}

export const StaffPortal: React.FC<StaffPortalProps> = ({
  data,
  onRefresh,
  notify,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  const staffOptions = useMemo(
    () => data.staff.filter((s) => s.is_active),
    [data.staff]
  );

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    () => staffOptions.find((s) => !s.is_owner)?.id || staffOptions[0]?.id || ''
  );

  const currentStaff = useMemo(
    () => data.staff.find((s) => s.id === selectedStaffId) || staffOptions[0],
    [data.staff, selectedStaffId, staffOptions]
  );

  // Scoped strictly to this staff member's assigned bookings & commissions (RBAC)
  const myTodayBookings = useMemo(() => {
    if (!currentStaff) return [];
    return data.bookings
      .filter((b) => b.barber_id === currentStaff.id && b.booking_date === todayStr)
      .sort((a, b) => a.token_number - b.token_number);
  }, [data.bookings, currentStaff, todayStr]);

  const myCommissions = useMemo(() => {
    if (!currentStaff) return [];
    return data.commissions
      .filter((c) => c.staff_id === currentStaff.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.commissions, currentStaff]);

  const myTodayCommissionTotal = useMemo(
    () =>
      myCommissions
        .filter((c) => c.earned_date === todayStr)
        .reduce((sum, c) => sum + Number(c.commission_amount), 0),
    [myCommissions, todayStr]
  );

  const myTotalCommissionAllTime = useMemo(
    () => myCommissions.reduce((sum, c) => sum + Number(c.commission_amount), 0),
    [myCommissions]
  );

  const myTodayAttendance = useMemo(() => {
    if (!currentStaff) return null;
    return data.attendance.find(
      (a) => a.staff_id === currentStaff.id && a.attendance_date === todayStr
    );
  }, [data.attendance, currentStaff, todayStr]);

  const handleUpdateAvailability = async (status: AvailabilityStatus) => {
    if (!currentStaff) return;
    try {
      const res = await fetch(`/api/staff/${currentStaff.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_status: status }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Could not update availability');
        return;
      }
      await onRefresh();
      notify('success', `${currentStaff.name} status updated to ${status}`);
    } catch (e) {
      notify('error', String(e));
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
        const err = await res.json();
        notify('error', err.error || 'Failed to update booking status');
        return;
      }
      await onRefresh();
      notify('success', `Booking marked as ${status}`);
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleShiftBookingDelay = async (bookingId: string, shiftMinutes: number) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_minutes: shiftMinutes,
          delay_reason: `Haircut/Beard service running ${shiftMinutes} mins behind`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not shift booking time');
        return;
      }
      await onRefresh();
      notify(
        'success',
        `Updated to ${json.booking.slot_time} (+${shiftMinutes}m) — customer notified!`
      );
    } catch (e) {
      notify('error', String(e));
    }
  };

  const handleMarkAttendance = async (status: 'PRESENT' | 'HALF_DAY' | 'LEAVE') => {
    if (!currentStaff) return;
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: currentStaff.id,
          attendance_date: todayStr,
          status,
        }),
      });
      if (!res.ok) {
        notify('error', 'Failed to update attendance');
        return;
      }
      await onRefresh();
      notify('success', `Attendance marked as ${status}`);
    } catch (e) {
      notify('error', String(e));
    }
  };

  if (!currentStaff) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        No active staff members configured.
      </div>
    );
  }

  const statuses: AvailabilityStatus[] = ['Available', 'Busy', 'Break', 'Not Available'];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Staff Profile Selector & Availability Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Staff Panel
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <select
                  value={currentStaff.id}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-sm font-bold text-slate-900 dark:text-slate-100"
                >
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.specialty})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {statuses.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleUpdateAvailability(st)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors min-h-[40px] ${
                  currentStaff.availability_status === st
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Staff Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Today&apos;s Assigned Bookings</div>
          <div className="font-mono text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {myTodayBookings.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {myTodayBookings.filter((b) => b.status === 'COMPLETED').length} completed
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Commission Rate</div>
          <div className="font-mono text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {currentStaff.commission_pct}%
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Today&apos;s Earned Commission</div>
          <div className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            ₹{myTodayCommissionTotal}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            All-Time: ₹{myTotalCommissionAllTime}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Today&apos;s Attendance</div>
          <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
            {myTodayAttendance ? myTodayAttendance.status : 'Not Marked'}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => handleMarkAttendance('PRESENT')}
              className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20"
            >
              Present
            </button>
            <button
              type="button"
              onClick={() => handleMarkAttendance('HALF_DAY')}
              className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/20"
            >
              Half Day
            </button>
          </div>
        </div>
      </div>

      {/* My Assigned Queue Today */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-500" />
            <span>My Assigned Queue Today ({myTodayBookings.length})</span>
          </h2>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            {todayStr}
          </span>
        </div>

        {myTodayBookings.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
            No bookings assigned to {currentStaff.name} for today yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {myTodayBookings.map((booking) => {
              const customerRecord = data.customers.find((c) => c.id === booking.customer_id);
              return (
                <div
                  key={booking.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400 tabular-nums">
                        Token #{booking.token_number}
                      </span>
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {booking.customer_name}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        Slot {booking.slot_time}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Services: <strong>{booking.services?.map((s) => s.service_name).join(', ') || 'Haircut'}</strong> ·{' '}
                      <span className="font-mono tabular-nums">₹{booking.total_amount}</span>
                    </div>
                    {(customerRecord?.haircut_preference || booking.notes) && (
                      <div className="text-xs text-amber-700 dark:text-amber-400">
                        {customerRecord?.haircut_preference && `Style Pref: ${customerRecord.haircut_preference} `}
                        {booking.notes && `· Note: ${booking.notes}`}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {booking.status === 'WAITING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleShiftBookingDelay(booking.id, 10)}
                          className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold text-xs hover:bg-amber-500/10 min-h-[40px]"
                          title="Notify customer of +10 min delay"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>+10m</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShiftBookingDelay(booking.id, 15)}
                          className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold text-xs hover:bg-amber-500/10 min-h-[40px]"
                          title="Notify customer of +15 min delay"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>+15m</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateBookingStatus(booking.id, 'IN_PROGRESS')}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition-colors min-h-[40px]"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Service</span>
                        </button>
                      </>
                    )}
                    {booking.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateBookingStatus(booking.id, 'COMPLETED')}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500 transition-colors min-h-[40px]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Completed</span>
                      </button>
                    )}
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 px-2">
                      {booking.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Commission Ledger */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-500" />
          <span>My Earned Commission History ({myCommissions.length})</span>
        </h2>

        {myCommissions.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No commissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Service Amount</th>
                  <th className="py-2.5 px-3 text-right">Commission %</th>
                  <th className="py-2.5 px-3 text-right">Earned Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {myCommissions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-3 font-mono tabular-nums">{c.earned_date}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">₹{c.service_amount}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{c.commission_pct}%</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      ₹{c.commission_amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
