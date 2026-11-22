import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  MessageCircle,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
} from 'lucide-react';
import type { SalonBootstrapData } from '../types/salon';
import { apiFetch } from '../lib/api';
import { exportReportToExcel, exportReportToPDF } from '../lib/exportReports';
import {
  getAvatarColorClass,
  getLocalTodayStr,
  getSingleInitial,
} from '../lib/salonUiHelpers';
import type { AppPortalRole } from './LoginScreen';

export type MalikTab = 'KAMAI' | 'STAFF' | 'CUSTOMERS' | 'SETTINGS';

interface MalikPortalViewProps {
  data: SalonBootstrapData;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
  onSwitchRole: (role: AppPortalRole) => void;
  onOpenLogin: () => void;
  onSwitchServerConfig?: () => void;
}

export const MalikPortalView: React.FC<MalikPortalViewProps> = ({
  data,
  onRefresh,
  notify,
  onSwitchRole,
  onOpenLogin,
  onSwitchServerConfig,
}) => {
  const [activeTab, setActiveTab] = useState<MalikTab>('KAMAI');
  const [commPeriod, setCommPeriod] = useState<'TODAY' | 'WEEK' | 'MONTH'>('TODAY');
  const todayStr = getLocalTodayStr();

  // Today metrics (Screen 9)
  const todayPayments = useMemo(
    () => data.payments.filter((p) => p.payment_date === todayStr),
    [data.payments, todayStr]
  );
  const todayCash = todayPayments.reduce((s, p) => s + Number(p.cash_paid || 0), 0);
  const todayUpi = todayPayments.reduce((s, p) => s + Number(p.upi_paid || 0), 0);
  const todayRevenue = todayCash + todayUpi;

  const todayBookings = useMemo(
    () =>
      data.bookings.filter(
        (b) => b.booking_date === todayStr && b.status !== 'CANCELLED'
      ),
    [data.bookings, todayStr]
  );
  const todayOnlineCount = todayBookings.filter((b) => b.booking_type === 'ONLINE').length;
  const todayWalkinCount = todayBookings.filter((b) => b.booking_type === 'WALK_IN').length;

  // Service-wise revenue bars
  const serviceWiseData = useMemo(() => {
    const map = new Map<string, number>();
    const sourceBookings =
      todayBookings.length > 0
        ? todayBookings
        : data.bookings.filter((b) => b.status !== 'CANCELLED');

    sourceBookings.forEach((b) => {
      if (b.services && b.services.length > 0) {
        b.services.forEach((srv) => {
          map.set(
            srv.service_name,
            (map.get(srv.service_name) || 0) + Number(srv.price || 0)
          );
        });
      } else {
        map.set('Salon Service', (map.get('Salon Service') || 0) + Number(b.total_amount || 0));
      }
    });

    const entries = Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const maxVal = Math.max(1, ...entries.map((e) => e.amount));
    return { entries, maxVal };
  }, [todayBookings, data.bookings]);

  // 7-day bar chart (Mon - Sun)
  const weeklyBars = useMemo(() => {
    const base = new Date(`${todayStr}T00:00:00`);
    const dayOfWeek = base.getDay(); // 0=Sun, 1=Mon
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMon);

    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const fullNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const days = labels.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const rev = data.payments
        .filter((p) => p.payment_date === dateStr)
        .reduce((s, p) => s + Number(p.total_collected || 0), 0);
      return { label, fullName: fullNames[i], dateStr, rev };
    });
    const maxRev = Math.max(1, ...days.map((d) => d.rev));
    const peak = days.reduce((best, d) => (d.rev > best.rev ? d : best), days[0]);
    return { days, maxRev, peak };
  }, [data.payments, todayStr]);

  // Staff Commission breakdown (Screen 10)
  const staffCommissions = useMemo(() => {
    const now = new Date(`${todayStr}T00:00:00`);
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    const weekAgoStr = weekAgo.toLocaleDateString('en-CA');
    const monthPrefix = todayStr.slice(0, 7);

    const activeStaff = data.staff.filter((s) => s.is_active);
    const rows = activeStaff.map((st, idx) => {
      const comms = data.commissions.filter((c) => {
        if (c.staff_id !== st.id) return false;
        if (commPeriod === 'TODAY') return c.earned_date === todayStr;
        if (commPeriod === 'WEEK') return c.earned_date >= weekAgoStr;
        return c.earned_date.startsWith(monthPrefix);
      });
      const custCount = comms.length;
      const totalWork = comms.reduce((s, c) => s + Number(c.service_amount || 0), 0);
      const totalComm = comms.reduce((s, c) => s + Number(c.commission_amount || 0), 0);
      return {
        staff: st,
        idx,
        custCount,
        totalWork,
        totalComm,
      };
    });

    const grandTotal = rows.reduce((s, r) => s + r.totalComm, 0);
    return { rows, grandTotal };
  }, [data.staff, data.commissions, commPeriod, todayStr]);

  // Add Staff inline toggle
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPct, setNewStaffPct] = useState('40');

  // Customers & Udhar
  const [custSearch, setCustSearch] = useState('');
  const [settleId, setSettleId] = useState('');
  const [settleAmt, setSettleAmt] = useState('');
  const [settleMode, setSettleMode] = useState<'CASH' | 'UPI'>('CASH');

  // Settings form state
  const [salonName, setSalonName] = useState(data.salon.name);
  const [salonPhone, setSalonPhone] = useState(data.salon.phone);
  const [salonAddress, setSalonAddress] = useState(data.salon.address);
  const [upiId, setUpiId] = useState(data.settings.upi_id || '');
  const [openTime, setOpenTime] = useState(data.settings.opening_time);
  const [closeTime, setCloseTime] = useState(data.settings.closing_time);
  const [newSrvName, setNewSrvName] = useState('');
  const [newSrvPrice, setNewSrvPrice] = useState('');
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmt, setNewExpAmt] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [staffPin, setStaffPin] = useState('');

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) return;
    const res = await apiFetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newStaffName.trim(),
        phone: newStaffPhone.trim() || '9800000000',
        commission_pct: Number(newStaffPct || 40),
      }),
    });
    if (res.ok) {
      setNewStaffName('');
      setNewStaffPhone('');
      setShowAddStaff(false);
      await onRefresh();
      notify('success', 'New staff added!');
    }
  };

  const handleSettleUdhar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleId || Number(settleAmt) <= 0) return;
    const res = await apiFetch('/api/payments/settle-due', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: settleId,
        amount: Number(settleAmt),
        payment_mode: settleMode,
      }),
    });
    if (res.ok) {
      setSettleId('');
      setSettleAmt('');
      await onRefresh();
      notify('success', 'Udhar balance updated!');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salon_name: salonName.trim(),
        salon_phone: salonPhone.trim(),
        salon_address: salonAddress.trim(),
        upi_id: upiId.trim(),
        opening_time: openTime,
        closing_time: closeTime,
      }),
    });
    if (res.ok) {
      await onRefresh();
      notify('success', 'Salon settings saved!');
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSrvName.trim() || !newSrvPrice) return;
    const res = await apiFetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSrvName.trim(),
        name_hi: newSrvName.trim(),
        category: 'Hair',
        price: Number(newSrvPrice),
        duration_minutes: 30,
      }),
    });
    if (res.ok) {
      setNewSrvName('');
      setNewSrvPrice('');
      await onRefresh();
      notify('success', 'Service added!');
    }
  };

  const handleDeleteService = async (id: string) => {
    const res = await apiFetch(`/api/services/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await onRefresh();
      notify('success', 'Service removed');
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpTitle.trim() || Number(newExpAmt) <= 0) return;
    const res = await apiFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newExpTitle.trim(),
        category: 'Shop Supplies',
        amount: Number(newExpAmt),
        payment_mode: 'CASH',
        expense_date: todayStr,
      }),
    });
    if (res.ok) {
      setNewExpTitle('');
      setNewExpAmt('');
      await onRefresh();
      notify('success', 'Expense recorded!');
    }
  };

  const handleSavePins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerPin && !staffPin) return;
    const res = await apiFetch('/api/auth/pins', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerPin: ownerPin.trim() || undefined,
        staffPin: staffPin.trim() || undefined,
      }),
    });
    if (res.ok) {
      setOwnerPin('');
      setStaffPin('');
      notify('success', 'Security PINs updated!');
    }
  };

  const commissionWaText = encodeURIComponent(
    `${data.salon.name} — Staff Commission (${commPeriod}):\n` +
      staffCommissions.rows
        .map(
          (r) =>
            `• ${r.staff.name}: ${r.custCount} customers · ₹${r.totalWork} -> ₹${r.totalComm} (${r.staff.commission_pct}%)`
        )
        .join('\n') +
      `\nTotal Commission: ₹${staffCommissions.grandTotal}`
  );

  const exportDailyReport = (type: 'pdf' | 'excel') => {
    const opts = {
      reportTitle: 'Daily Revenue Report',
      salonName: data.salon.name,
      dateRangeLabel: todayStr,
      summaryItems: [
        { label: 'Aaj ki Kamai', value: `₹${todayRevenue}` },
        { label: 'Cash', value: `₹${todayCash}` },
        { label: 'UPI', value: `₹${todayUpi}` },
        { label: 'Customers', value: String(todayBookings.length) },
      ],
      headers: ['Date', 'Customer', 'Stylist', 'Bill', 'Cash', 'UPI', 'Udhar'],
      rows: data.payments.slice(0, 50).map((p) => [
        p.payment_date,
        p.customer_name,
        p.barber_name || '-',
        p.total_bill,
        p.cash_paid,
        p.upi_paid,
        p.udhar_amount,
      ]),
      fileNamePrefix: 'sb_salon_kamai',
    };
    if (type === 'pdf') exportReportToPDF(opts);
    else exportReportToExcel(opts);
  };

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 pb-24 md:pb-10">
      <header className="sticky top-0 z-30 bg-[#F8F7FC]/95 dark:bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 pt-[max(0.85rem,env(safe-area-inset-top))] pb-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="text-[11px] font-extrabold tracking-widest text-[#6C3BF5] uppercase truncate">
            {data.salon.name} · MALIK
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            {(
              [
                { id: 'KAMAI', label: 'Kamai' },
                { id: 'STAFF', label: 'Staff' },
                { id: 'CUSTOMERS', label: 'Customers' },
                { id: 'SETTINGS', label: 'Settings' },
              ] as { id: MalikTab; label: string }[]
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSwitchRole('RECEPTION')}
              className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-[#6C3BF5] shadow-sm whitespace-nowrap"
            >
              Reception
            </button>
            <button
              type="button"
              onClick={onOpenLogin}
              className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 shadow-sm whitespace-nowrap"
            >
              Switch
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-2 space-y-5">
        {/* SCREEN 9: ROZ KI KAMAI */}
        {activeTab === 'KAMAI' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                  Roz ki kamai
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aaj · salon band hone ke baad
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => exportDailyReport('pdf')}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-bold text-[#141028] dark:text-white"
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => exportDailyReport('excel')}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-bold text-emerald-600"
                  title="Download Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Hero Gradient Card */}
            <div className="sb-gradient rounded-3xl p-5 text-white shadow-xl shadow-purple-500/20 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-white/80">
                  AAJ KI KAMAI
                </span>
                <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-bold">
                  {todayBookings.length} customers
                </span>
              </div>
              <div className="text-4xl font-extrabold tabular-nums">
                ₹{todayRevenue.toLocaleString('en-IN')}
              </div>
              <div className="text-xs font-semibold text-white/90 tabular-nums">
                Cash ₹{todayCash.toLocaleString('en-IN')} · UPI ₹{todayUpi.toLocaleString('en-IN')}
              </div>
            </div>

            {/* 3-Col KPI Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="sb-card p-3.5">
                <div className="text-2xl font-extrabold text-[#6C3BF5] tabular-nums">
                  {todayBookings.length}
                </div>
                <div className="text-[11px] font-semibold text-slate-500">Customers</div>
              </div>
              <div className="sb-card p-3.5">
                <div className="text-2xl font-extrabold text-[#141028] dark:text-white tabular-nums">
                  {todayOnlineCount}
                </div>
                <div className="text-[11px] font-semibold text-slate-500">Booking</div>
              </div>
              <div className="sb-card p-3.5">
                <div className="text-2xl font-extrabold text-[#141028] dark:text-white tabular-nums">
                  {todayWalkinCount}
                </div>
                <div className="text-[11px] font-semibold text-slate-500">Walk-in</div>
              </div>
            </div>

            {/* Service Wise Bars */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-sm font-extrabold text-[#141028] dark:text-white">
                Service wise
              </div>
              {serviceWiseData.entries.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aaj ki bookings ya billing aane par service graph yahan dikhega.
                </p>
              ) : (
                <div className="space-y-3">
                  {serviceWiseData.entries.map((item) => {
                    const pct = Math.max(8, Math.round((item.amount / serviceWiseData.maxVal) * 100));
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-[#141028] dark:text-slate-200">{item.name}</span>
                          <span className="text-[#141028] dark:text-white tabular-nums">
                            ₹{item.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full sb-gradient"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Is Hafte 7-Day Bar Chart */}
            <div className="sb-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-[#141028] dark:text-white">
                  Is hafte
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {weeklyBars.peak.rev > 0 ? `${weeklyBars.peak.fullName} sabse zyada` : '7-day chart'}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-2 items-end h-28 pt-2">
                {weeklyBars.days.map((d) => {
                  const barH = Math.max(22, Math.round((d.rev / weeklyBars.maxRev) * 90));
                  const isPeak = d.dateStr === weeklyBars.peak.dateStr && d.rev > 0;
                  return (
                    <div key={d.dateStr} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <div
                        className={`w-full max-w-[30px] rounded-xl transition-all ${
                          isPeak ? 'bg-[#EC4899]' : 'bg-[#DDD6FE] dark:bg-purple-900/60'
                        }`}
                        style={{ height: `${barH}%` }}
                        title={`${d.fullName}: ₹${d.rev}`}
                      />
                      <span className="text-[11px] font-bold text-slate-400">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 10: STAFF KA COMMISSION */}
        {activeTab === 'STAFF' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                  Staff ka commission
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Apne aap calculate
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaff((p) => !p)}
                className="px-3.5 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-bold flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Staff</span>
              </button>
            </div>

            {showAddStaff && (
              <form onSubmit={handleAddStaff} className="sb-card p-4 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="Barber Name"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="tel"
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="Phone"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="number"
                    value={newStaffPct}
                    onChange={(e) => setNewStaffPct(e.target.value)}
                    placeholder="Commission %"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
                >
                  Save Staff Member
                </button>
              </form>
            )}

            {/* Period Segmented Switch */}
            <div className="grid grid-cols-3 gap-1 bg-slate-200/70 dark:bg-slate-900 p-1 rounded-2xl">
              {(
                [
                  { id: 'TODAY', label: 'Aaj' },
                  { id: 'WEEK', label: 'Is hafte' },
                  { id: 'MONTH', label: 'Mahina' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCommPeriod(p.id)}
                  className={`py-2.5 rounded-xl text-xs font-extrabold transition-all ${
                    commPeriod === p.id
                      ? 'bg-white dark:bg-slate-800 text-[#141028] dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Staff List Card */}
            <div className="sb-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {staffCommissions.rows.map((r) => (
                <div key={r.staff.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full text-sm font-extrabold flex items-center justify-center shrink-0 ${getAvatarColorClass(
                        r.idx
                      )}`}
                    >
                      {getSingleInitial(r.staff.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                        {r.staff.name.split(' ')[0]}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {r.custCount} customers · ₹{r.totalWork.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-bold text-slate-400 tabular-nums">
                      {r.staff.commission_pct}%
                    </div>
                    <div className="text-base font-extrabold text-emerald-600 tabular-nums">
                      ₹{r.totalComm.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Dark Total Commission Card */}
            <div className="rounded-3xl bg-[#141028] text-white px-5 py-4 flex items-center justify-between shadow-xl">
              <span className="text-sm font-bold text-slate-300">Total commission</span>
              <span className="text-2xl font-extrabold text-emerald-400 tabular-nums">
                ₹{staffCommissions.grandTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <a
              href={`https://wa.me/?text=${commissionWaText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-2xl sb-gradient text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 min-h-[52px]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Staff ko WhatsApp pe bhejo</span>
            </a>
          </div>
        )}

        {/* TAB 3: CUSTOMERS & UDHAR */}
        {activeTab === 'CUSTOMERS' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Customers & Udhar
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Sabhi customers aur baki udhar khata
              </p>
            </div>

            <input
              type="text"
              value={custSearch}
              onChange={(e) => setCustSearch(e.target.value)}
              placeholder="Naam ya mobile number se khojein..."
              className="sb-card w-full px-4 py-3 text-sm font-semibold focus:outline-none"
            />

            {settleId && (
              <form onSubmit={handleSettleUdhar} className="sb-card p-4 space-y-2.5">
                <div className="text-xs font-extrabold text-[#6C3BF5]">
                  Udhar Jama Karein
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    required
                    value={settleAmt}
                    onChange={(e) => setSettleAmt(e.target.value)}
                    placeholder="Amount ₹"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <select
                    value={settleMode}
                    onChange={(e) => setSettleMode(e.target.value as 'CASH' | 'UPI')}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 text-white text-xs font-extrabold"
                  >
                    Jama Karein
                  </button>
                </div>
              </form>
            )}

            <div className="sb-card divide-y divide-slate-100 dark:divide-slate-800">
              {data.customers
                .filter(
                  (c) =>
                    !custSearch.trim() ||
                    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
                    c.phone.includes(custSearch)
                )
                .map((c) => (
                  <div key={c.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                        {c.name}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        +91 {c.phone} · {c.total_visits} visits · ₹{c.total_spent} spent
                      </div>
                    </div>
                    {c.outstanding_due > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSettleId(c.id);
                          setSettleAmt(String(c.outstanding_due));
                        }}
                        className="px-3 py-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-extrabold tabular-nums shrink-0"
                      >
                        Udhar ₹{c.outstanding_due}
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 shrink-0">Clear</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#141028] dark:text-white">
                Settings
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Salon details, UPI ID, Services, Expenses aur PIN
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Salon & UPI Setup
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={salonName}
                  onChange={(e) => setSalonName(e.target.value)}
                  placeholder="Salon Name"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                />
                <input
                  type="tel"
                  value={salonPhone}
                  onChange={(e) => setSalonPhone(e.target.value)}
                  placeholder="WhatsApp / Salon Phone"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                />
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="Shop UPI ID (e.g. name@okaxis)"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                />
                <input
                  type="text"
                  value={salonAddress}
                  onChange={(e) => setSalonAddress(e.target.value)}
                  placeholder="Shop Address"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                />
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                />
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
              >
                Save Salon Settings
              </button>
            </form>

            {/* Services Quick Manager */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Services ({data.services.length})
              </div>
              <form onSubmit={handleAddService} className="flex gap-2">
                <input
                  type="text"
                  value={newSrvName}
                  onChange={(e) => setNewSrvName(e.target.value)}
                  placeholder="Service Name"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <input
                  type="number"
                  value={newSrvPrice}
                  onChange={(e) => setNewSrvPrice(e.target.value)}
                  placeholder="₹"
                  className="w-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
                >
                  Add
                </button>
              </form>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.services.map((s) => (
                  <div key={s.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-[#141028] dark:text-white">
                      {s.name} · ₹{s.price}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteService(s.id)}
                      className="p-1.5 text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses Quick Entry */}
            <form onSubmit={handleAddExpense} className="sb-card p-4 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Aaj ka Kharch (Expenses)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExpTitle}
                  onChange={(e) => setNewExpTitle(e.target.value)}
                  placeholder="Kharch (Chai, Blade, Cream)"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <input
                  type="number"
                  value={newExpAmt}
                  onChange={(e) => setNewExpAmt(e.target.value)}
                  placeholder="₹"
                  className="w-24 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold"
                >
                  Save
                </button>
              </div>
            </form>

            {/* Security PINs */}
            <form onSubmit={handleSavePins} className="sb-card p-4 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Change Login PINs
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  value={ownerPin}
                  onChange={(e) => setOwnerPin(e.target.value)}
                  placeholder="New Owner/Malik PIN"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value)}
                  placeholder="New Staff PIN"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-extrabold"
              >
                Update PINs
              </button>
            </form>

            {onSwitchServerConfig && (
              <button
                type="button"
                onClick={onSwitchServerConfig}
                className="w-full py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-[#6C3BF5] flex items-center justify-center gap-2"
              >
                <Wifi className="w-4 h-4" />
                <span>Live Server URL Connect / Change karein</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenLogin}
              className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm"
            >
              Login Screen / Switch Role
            </button>
          </div>
        )}
      </main>

      {/* Fixed Bottom 4-Tab Bar (PDF Screens 9, 10) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-4 h-16 pb-[env(safe-area-inset-bottom)]">
        {(
          [
            { id: 'KAMAI', label: 'Kamai', icon: TrendingUp },
            { id: 'STAFF', label: 'Staff', icon: UserCheck },
            { id: 'CUSTOMERS', label: 'Customers', icon: Users },
            { id: 'SETTINGS', label: 'Settings', icon: SettingsIcon },
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
