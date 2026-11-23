import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Download,
  FileSpreadsheet,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import type { Customer, SalonBootstrapData, ServiceItem, StaffMember } from '../types/salon';
import { apiFetch, getApiBaseUrl, setApiBaseUrl, setPhoneOfflineMode } from '../lib/api';
import { exportReportToExcel, exportReportToPDF } from '../lib/exportReports';
import {
  buildCustomerUdharOrGreetingText,
  buildSmsUrl,
  buildWhatsAppUrl,
} from '../lib/messagingTemplates';
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
  onLogout?: () => void;
  onServerUrlUpdated?: () => Promise<void>;
}

export const MalikPortalView: React.FC<MalikPortalViewProps> = ({
  data,
  onRefresh,
  notify,
  onSwitchRole,
  onOpenLogin,
  onLogout,
  onServerUrlUpdated,
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

  // Add / Edit / Delete Staff state
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPct, setNewStaffPct] = useState('40');
  const [newStaffSpecialty, setNewStaffSpecialty] = useState('Senior Barber');
  const [editingStaffId, setEditingStaffId] = useState<string>('');
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffPct, setEditStaffPct] = useState('40');
  const [editStaffSpecialty, setEditStaffSpecialty] = useState('');
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string>('');

  // Customers, Udhar, Edit & Delete state
  const [custSearch, setCustSearch] = useState('');
  const [settleId, setSettleId] = useState('');
  const [settleAmt, setSettleAmt] = useState('');
  const [settleMode, setSettleMode] = useState<'CASH' | 'UPI'>('CASH');
  const [editingCustId, setEditingCustId] = useState<string>('');
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editCustPref, setEditCustPref] = useState('');
  const [confirmDeleteCustId, setConfirmDeleteCustId] = useState<string>('');

  // Settings & Customization form state
  const [salonName, setSalonName] = useState(data.salon.name);
  const [salonPhone, setSalonPhone] = useState(data.salon.phone);
  const [salonAddress, setSalonAddress] = useState(data.salon.address);
  const [upiId, setUpiId] = useState(data.settings.upi_id || '');
  const [openTime, setOpenTime] = useState(data.settings.opening_time);
  const [closeTime, setCloseTime] = useState(data.settings.closing_time);
  const [slotDuration, setSlotDuration] = useState(String(data.settings.slot_duration_minutes || 30));
  const [regenSlots, setRegenSlots] = useState(false);
  const [hideStaffLogin, setHideStaffLogin] = useState(Boolean(data.settings.hide_staff_login));
  const [customerApkUrl, setCustomerApkUrl] = useState(
    data.settings.customer_apk_url ||
      (typeof window !== 'undefined' && window.location.origin.startsWith('http')
        ? window.location.origin
        : '')
  );
  const [customerQrDataUrl, setCustomerQrDataUrl] = useState<string>('');

  // Services Add / Edit / Delete state
  const [newSrvName, setNewSrvName] = useState('');
  const [newSrvPrice, setNewSrvPrice] = useState('');
  const [newSrvDuration, setNewSrvDuration] = useState('30');
  const [editingServiceId, setEditingServiceId] = useState<string>('');
  const [editSrvName, setEditSrvName] = useState('');
  const [editSrvNameHi, setEditSrvNameHi] = useState('');
  const [editSrvPrice, setEditSrvPrice] = useState('');
  const [editSrvDuration, setEditSrvDuration] = useState('30');
  const [editSrvActive, setEditSrvActive] = useState(true);
  const [confirmDeleteSrvId, setConfirmDeleteSrvId] = useState<string>('');

  // Expenses Add & List state
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmt, setNewExpAmt] = useState('');
  const [newExpMode, setNewExpMode] = useState<'CASH' | 'UPI'>('CASH');
  const [ownerPin, setOwnerPin] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [serverUrlDraft, setServerUrlDraft] = useState(() => getApiBaseUrl());

  useEffect(() => {
    setSalonName(data.salon.name);
    setSalonPhone(data.salon.phone);
    setSalonAddress(data.salon.address);
    setUpiId(data.settings.upi_id || '');
    setOpenTime(data.settings.opening_time);
    setCloseTime(data.settings.closing_time);
    setSlotDuration(String(data.settings.slot_duration_minutes || 30));
    setHideStaffLogin(Boolean(data.settings.hide_staff_login));
    if (data.settings.customer_apk_url) {
      setCustomerApkUrl(data.settings.customer_apk_url);
    }
  }, [data.salon, data.settings]);

  useEffect(() => {
    const clean = customerApkUrl.trim();
    if (!clean || !/^https?:\/\//i.test(clean)) {
      setCustomerQrDataUrl('');
      return;
    }
    QRCode.toDataURL(clean, { width: 260, margin: 2 })
      .then((url) => setCustomerQrDataUrl(url))
      .catch(() => setCustomerQrDataUrl(''));
  }, [customerApkUrl]);

  const handleApiError = async (res: Response, fallbackMsg: string): Promise<boolean> => {
    if (res.ok) return true;
    try {
      const err = await res.json();
      notify('error', err.error || fallbackMsg);
    } catch {
      notify('error', fallbackMsg);
    }
    if (res.status === 401) {
      onOpenLogin();
    }
    return false;
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = newStaffPhone.replace(/\D/g, '').slice(-10);
    if (!newStaffName.trim() || cleanPhone.length !== 10) {
      notify('error', 'Staff ka naam aur 10-digit mobile number zaroori hai');
      return;
    }
    const res = await apiFetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newStaffName.trim(),
        phone: cleanPhone,
        specialty: newStaffSpecialty.trim() || 'Senior Barber',
        commission_pct: Number(newStaffPct || 40),
      }),
    });
    if (!(await handleApiError(res, 'Staff add nahi ho paya'))) return;
    setNewStaffName('');
    setNewStaffPhone('');
    setNewStaffSpecialty('Senior Barber');
    setShowAddStaff(false);
    await onRefresh();
    notify('success', 'New staff added!');
  };

  const startEditStaff = (st: StaffMember) => {
    setEditingStaffId(st.id);
    setEditStaffName(st.name);
    setEditStaffPhone(st.phone);
    setEditStaffPct(String(st.commission_pct));
    setEditStaffSpecialty(st.specialty || '');
    setConfirmDeleteStaffId('');
  };

  const handleSaveStaffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffId) return;
    const cleanPhone = editStaffPhone.replace(/\D/g, '').slice(-10);
    if (!editStaffName.trim() || cleanPhone.length !== 10) {
      notify('error', 'Staff ka sahi naam aur 10-digit mobile number daalein');
      return;
    }
    const res = await apiFetch(`/api/staff/${editingStaffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editStaffName.trim(),
        phone: cleanPhone,
        commission_pct: Number(editStaffPct || 0),
        specialty: editStaffSpecialty.trim(),
      }),
    });
    if (!(await handleApiError(res, 'Staff update nahi ho paya'))) return;
    setEditingStaffId('');
    await onRefresh();
    notify('success', 'Staff details updated!');
  };

  const handleDeleteStaff = async (id: string) => {
    const res = await apiFetch(`/api/staff/${id}`, { method: 'DELETE' });
    if (!(await handleApiError(res, 'Staff remove nahi ho paya'))) return;
    setConfirmDeleteStaffId('');
    await onRefresh();
    notify('success', 'Staff removed!');
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
    if (!(await handleApiError(res, 'Udhar update nahi hua'))) return;
    setSettleId('');
    setSettleAmt('');
    await onRefresh();
    notify('success', 'Udhar balance updated!');
  };

  const startEditCustomer = (c: Customer) => {
    setEditingCustId(c.id);
    setEditCustName(c.name);
    setEditCustPhone(c.phone);
    setEditCustPref(c.haircut_preference || '');
    setConfirmDeleteCustId('');
  };

  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustId) return;
    const cleanPhone = editCustPhone.replace(/\D/g, '').slice(-10);
    if (!editCustName.trim() || cleanPhone.length !== 10) {
      notify('error', 'Customer naam aur 10-digit mobile number daalein');
      return;
    }
    const res = await apiFetch(`/api/customers/${editingCustId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editCustName.trim(),
        phone: cleanPhone,
        haircut_preference: editCustPref.trim(),
      }),
    });
    if (!(await handleApiError(res, 'Customer update nahi hua'))) return;
    setEditingCustId('');
    await onRefresh();
    notify('success', 'Customer details updated!');
  };

  const handleDeleteCustomer = async (id: string) => {
    const res = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
    if (!(await handleApiError(res, 'Customer delete nahi ho paya'))) return;
    setConfirmDeleteCustId('');
    await onRefresh();
    notify('success', 'Customer removed!');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSalonPhone = salonPhone.replace(/\D/g, '').slice(-10);
    if (!salonName.trim()) {
      notify('error', 'Salon ka naam daalein');
      return;
    }
    if (cleanSalonPhone.length !== 10) {
      notify('error', 'Owner ka 10-digit registered mobile number daalein');
      return;
    }
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salon_name: salonName.trim(),
        salon_phone: cleanSalonPhone,
        salon_address: salonAddress.trim(),
        upi_id: upiId.trim(),
        upi_merchant_name: salonName.trim(),
        opening_time: openTime,
        closing_time: closeTime,
        slot_duration_minutes: Number(slotDuration || 30),
        hide_staff_login: hideStaffLogin,
        customer_apk_url: customerApkUrl.trim(),
        regenerate_slots: regenSlots,
      }),
    });
    if (!(await handleApiError(res, 'Settings save nahi hui'))) return;
    setRegenSlots(false);
    await onRefresh();
    notify('success', 'Salon settings saved!');
  };

  const handleToggleCustomerLock = async () => {
    const nextVal = !hideStaffLogin;
    setHideStaffLogin(nextVal);
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hide_staff_login: nextVal }),
    });
    if (!(await handleApiError(res, 'Lock setting save nahi hui'))) {
      setHideStaffLogin(!nextVal);
      return;
    }
    await onRefresh();
    notify(
      'success',
      nextVal ? 'Customer Lock ON: Staff/Malik login hidden from customers' : 'Customer Lock OFF'
    );
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
        duration_minutes: Number(newSrvDuration || 30),
      }),
    });
    if (!(await handleApiError(res, 'Service add nahi hui'))) return;
    setNewSrvName('');
    setNewSrvPrice('');
    setNewSrvDuration('30');
    await onRefresh();
    notify('success', 'Service added!');
  };

  const startEditService = (s: ServiceItem) => {
    setEditingServiceId(s.id);
    setEditSrvName(s.name);
    setEditSrvNameHi(s.name_hi || s.name);
    setEditSrvPrice(String(s.price));
    setEditSrvDuration(String(s.duration_minutes || 30));
    setEditSrvActive(s.is_active);
    setConfirmDeleteSrvId('');
  };

  const handleSaveServiceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServiceId || !editSrvName.trim() || editSrvPrice === '') return;
    const res = await apiFetch(`/api/services/${editingServiceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editSrvName.trim(),
        name_hi: editSrvNameHi.trim() || editSrvName.trim(),
        price: Math.max(0, Number(editSrvPrice)),
        duration_minutes: Math.max(5, Number(editSrvDuration || 30)),
        is_active: editSrvActive,
      }),
    });
    if (!(await handleApiError(res, 'Service update nahi hui'))) return;
    setEditingServiceId('');
    await onRefresh();
    notify('success', 'Service price & details updated!');
  };

  const handleDeleteService = async (id: string) => {
    const res = await apiFetch(`/api/services/${id}`, { method: 'DELETE' });
    if (!(await handleApiError(res, 'Service delete nahi hui'))) return;
    setConfirmDeleteSrvId('');
    await onRefresh();
    notify('success', 'Service removed');
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
        payment_mode: newExpMode,
        expense_date: todayStr,
      }),
    });
    if (!(await handleApiError(res, 'Expense save nahi hua'))) return;
    setNewExpTitle('');
    setNewExpAmt('');
    await onRefresh();
    notify('success', 'Expense recorded!');
  };

  const handleDeleteExpense = async (id: string) => {
    const res = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!(await handleApiError(res, 'Expense delete nahi hua'))) return;
    await onRefresh();
    notify('success', 'Expense deleted');
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
    if (!(await handleApiError(res, 'PIN update nahi hua'))) return;
    setOwnerPin('');
    setStaffPin('');
    notify('success', 'Security PINs updated!');
  };

  const commissionText =
    `${data.salon.name} — Staff Commission (${commPeriod}):\n` +
    staffCommissions.rows
      .map(
        (r) =>
          `• ${r.staff.name}: ${r.custCount} customers · ₹${r.totalWork} -> ₹${r.totalComm} (${r.staff.commission_pct}%)`
      )
      .join('\n') +
    `\nTotal Commission: ₹${staffCommissions.grandTotal}`;

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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    required
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="10-digit Login Mobile"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={newStaffPct}
                    onChange={(e) => setNewStaffPct(e.target.value)}
                    placeholder="Commission %"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={newStaffSpecialty}
                    onChange={(e) => setNewStaffSpecialty(e.target.value)}
                    placeholder="Specialty (e.g. Fade & Beard)"
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

            {/* Staff List Card (with Edit & Delete) */}
            <div className="sb-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {staffCommissions.rows.map((r) => {
                const isEditing = editingStaffId === r.staff.id;
                const isConfirmDelete = confirmDeleteStaffId === r.staff.id;
                return (
                  <div key={r.staff.id} className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
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
                            {r.staff.name}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums truncate">
                            +91 {r.staff.phone} · {r.custCount} customers · ₹{r.totalWork.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-[11px] font-bold text-slate-400 tabular-nums">
                            {r.staff.commission_pct}%
                          </div>
                          <div className="text-sm font-extrabold text-emerald-600 tabular-nums">
                            ₹{r.totalComm.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingStaffId('') : startEditStaff(r.staff))}
                          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          aria-label="Edit staff"
                        >
                          {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        </button>
                        {!r.staff.is_owner &&
                          (isConfirmDelete ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteStaff(r.staff.id)}
                                className="px-2 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold"
                              >
                                Hatao
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteStaffId('')}
                                className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[10px] font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStaffId(r.staff.id)}
                              className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-500"
                              aria-label="Delete staff"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    </div>

                    {isEditing && (
                      <form onSubmit={handleSaveStaffEdit} className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            value={editStaffName}
                            onChange={(e) => setEditStaffName(e.target.value)}
                            placeholder="Staff Name"
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                          />
                          <input
                            type="tel"
                            required
                            value={editStaffPhone}
                            onChange={(e) => setEditStaffPhone(e.target.value)}
                            placeholder="10-digit Phone"
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editStaffPct}
                            onChange={(e) => setEditStaffPct(e.target.value)}
                            placeholder="Commission %"
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                          />
                          <input
                            type="text"
                            value={editStaffSpecialty}
                            onChange={(e) => setEditStaffSpecialty(e.target.value)}
                            placeholder="Specialty"
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dark Total Commission Card */}
            <div className="rounded-3xl bg-[#141028] text-white px-5 py-4 flex items-center justify-between shadow-xl">
              <span className="text-sm font-bold text-slate-300">Total commission</span>
              <span className="text-2xl font-extrabold text-emerald-400 tabular-nums">
                ₹{staffCommissions.grandTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={buildWhatsAppUrl(undefined, commissionText)}
                target="_blank"
                rel="noopener noreferrer"
                className="py-4 rounded-2xl sb-gradient text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 min-h-[52px]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Report</span>
              </a>
              <a
                href={buildSmsUrl(undefined, commissionText)}
                className="py-4 rounded-2xl bg-sky-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 min-h-[52px]"
              >
                <MessageSquare className="w-4 h-4" />
                <span>SMS Report</span>
              </a>
            </div>
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
                .map((c) => {
                  const isEditing = editingCustId === c.id;
                  const isConfirmDelete = confirmDeleteCustId === c.id;
                  return (
                    <div key={c.id} className="px-4 py-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                            {c.name}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            +91 {c.phone} · {c.total_visits} visits · ₹{c.total_spent} spent
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(() => {
                            const custMsg = buildCustomerUdharOrGreetingText({
                              salonName: data.salon.name,
                              customerName: c.name,
                              outstandingDue: Number(c.outstanding_due || 0),
                            });
                            return (
                              <>
                                <a
                                  href={buildWhatsAppUrl(c.phone, custMsg)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={c.outstanding_due > 0 ? 'Udhar WhatsApp' : 'WhatsApp'}
                                  aria-label="WhatsApp customer"
                                  className="p-2 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                                <a
                                  href={buildSmsUrl(c.phone, custMsg)}
                                  title={c.outstanding_due > 0 ? 'Udhar SMS' : 'SMS'}
                                  aria-label="SMS customer"
                                  className="p-2 rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              </>
                            );
                          })()}
                          {c.outstanding_due > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSettleId(c.id);
                                setSettleAmt(String(c.outstanding_due));
                              }}
                              className="px-2.5 py-1.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-extrabold tabular-nums"
                            >
                              Udhar ₹{c.outstanding_due}
                            </button>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-600 px-1.5">Clear</span>
                          )}
                          <button
                            type="button"
                            onClick={() => (isEditing ? setEditingCustId('') : startEditCustomer(c))}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            aria-label="Edit customer"
                          >
                            {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                          </button>
                          {isConfirmDelete ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomer(c.id)}
                                className="px-2 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold"
                              >
                                Hatao
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCustId('')}
                                className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[10px] font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCustId(c.id)}
                              className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-500"
                              aria-label="Delete customer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <form onSubmit={handleSaveCustomerEdit} className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              value={editCustName}
                              onChange={(e) => setEditCustName(e.target.value)}
                              placeholder="Customer Name"
                              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                            />
                            <input
                              type="tel"
                              required
                              value={editCustPhone}
                              onChange={(e) => setEditCustPhone(e.target.value)}
                              placeholder="10-digit Mobile"
                              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                            />
                          </div>
                          <input
                            type="text"
                            value={editCustPref}
                            onChange={(e) => setEditCustPref(e.target.value)}
                            placeholder="Haircut Preference Note"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                          />
                          <button
                            type="submit"
                            className="w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save Customer</span>
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
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
                Salon customization, Services, Security & Customer QR
              </p>
            </div>

            {/* 1. Salon Customization */}
            <form onSubmit={handleSaveSettings} className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Salon Customization & Timing
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Salon Name</label>
                  <input
                    type="text"
                    required
                    value={salonName}
                    onChange={(e) => setSalonName(e.target.value)}
                    placeholder="Apne Salon ka Naam"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Owner Login Mobile
                  </label>
                  <input
                    type="tel"
                    required
                    value={salonPhone}
                    onChange={(e) => setSalonPhone(e.target.value)}
                    placeholder="10-digit Owner Mobile"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Shop UPI ID</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="name@upi"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Shop Address</label>
                  <input
                    type="text"
                    value={salonAddress}
                    onChange={(e) => setSalonAddress(e.target.value)}
                    placeholder="Shop Address"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Open Time</label>
                  <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Close Time</label>
                  <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500">Slot:</label>
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold"
                  >
                    <option value="15">15 min</option>
                    <option value="20">20 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regenSlots}
                    onChange={(e) => setRegenSlots(e.target.checked)}
                    className="rounded text-[#6C3BF5]"
                  />
                  <span>Update Time Slots</span>
                </label>
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
              >
                Save Salon Settings
              </button>
            </form>

            {/* 2. Services Manager (Add + Edit + Delete) */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Services & Price ({data.services.length})
              </div>
              <form onSubmit={handleAddService} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  required
                  value={newSrvName}
                  onChange={(e) => setNewSrvName(e.target.value)}
                  placeholder="Service Name"
                  className="flex-1 min-w-[140px] rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <input
                  type="number"
                  required
                  min={0}
                  value={newSrvPrice}
                  onChange={(e) => setNewSrvPrice(e.target.value)}
                  placeholder="₹"
                  className="w-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <input
                  type="number"
                  min={5}
                  value={newSrvDuration}
                  onChange={(e) => setNewSrvDuration(e.target.value)}
                  placeholder="Min"
                  className="w-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
                >
                  Add
                </button>
              </form>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.services.map((s) => {
                  const isEditing = editingServiceId === s.id;
                  const isConfirmDelete = confirmDeleteSrvId === s.id;
                  return (
                    <div key={s.id} className="py-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <span
                            className={`font-bold ${
                              s.is_active
                                ? 'text-[#141028] dark:text-white'
                                : 'text-slate-400 line-through'
                            }`}
                          >
                            {s.name} · ₹{s.price}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-1.5">
                            {s.duration_minutes}m
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              isEditing ? setEditingServiceId('') : startEditService(s)
                            }
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            aria-label="Edit service"
                          >
                            {isEditing ? (
                              <X className="w-3.5 h-3.5" />
                            ) : (
                              <Pencil className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isConfirmDelete ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteService(s.id)}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSrvId('')}
                                className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-[10px] font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSrvId(s.id)}
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-500"
                              aria-label="Delete service"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <form
                          onSubmit={handleSaveServiceEdit}
                          className="p-2.5 rounded-xl bg-[#F8F7FC] dark:bg-slate-950 space-y-2"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              value={editSrvName}
                              onChange={(e) => setEditSrvName(e.target.value)}
                              placeholder="Service Name"
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                            />
                            <input
                              type="text"
                              value={editSrvNameHi}
                              onChange={(e) => setEditSrvNameHi(e.target.value)}
                              placeholder="Hindi Name"
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                            />
                            <input
                              type="number"
                              required
                              min={0}
                              value={editSrvPrice}
                              onChange={(e) => setEditSrvPrice(e.target.value)}
                              placeholder="Price ₹"
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                            />
                            <input
                              type="number"
                              required
                              min={5}
                              value={editSrvDuration}
                              onChange={(e) => setEditSrvDuration(e.target.value)}
                              placeholder="Duration (min)"
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editSrvActive}
                                onChange={(e) => setEditSrvActive(e.target.checked)}
                              />
                              <span>Active</span>
                            </label>
                            <button
                              type="submit"
                              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Expenses Manager (Add + List + Delete) */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Aaj ka Kharch ({data.expenses.length})
              </div>
              <form onSubmit={handleAddExpense} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newExpTitle}
                  onChange={(e) => setNewExpTitle(e.target.value)}
                  placeholder="Kharch item"
                  className="flex-1 min-w-[130px] rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <input
                  type="number"
                  value={newExpAmt}
                  onChange={(e) => setNewExpAmt(e.target.value)}
                  placeholder="₹"
                  className="w-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <select
                  value={newExpMode}
                  onChange={(e) => setNewExpMode(e.target.value as 'CASH' | 'UPI')}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-2.5 py-2 text-xs font-bold"
                >
                  <option value="CASH">CASH</option>
                  <option value="UPI">UPI</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold"
                >
                  Save
                </button>
              </form>
              {data.expenses.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.expenses.slice(0, 10).map((ex) => (
                    <div
                      key={ex.id}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#141028] dark:text-white truncate">
                          {ex.title}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ex.expense_date} · {ex.payment_mode}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-amber-600 tabular-nums">
                          ₹{ex.amount}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(ex.id)}
                          className="p-1.5 text-rose-500"
                          aria-label="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Security PINs & Customer APK Lock */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#6C3BF5]" />
                <span>Security & Customer APK Lock</span>
              </div>

              <div className="rounded-2xl bg-[#F8F7FC] dark:bg-slate-950 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#141028] dark:text-white">
                    Customer App Lock
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ON rakhne par customers ko Reception/Staff/Malik tabs nahi dikhenge
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleCustomerLock}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold shrink-0 transition-colors ${
                    hideStaffLogin
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {hideStaffLogin ? 'LOCKED ON' : 'OFF'}
                </button>
              </div>

              <form onSubmit={handleSavePins} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    placeholder="New Owner/Malik PIN (4-6 digits)"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={staffPin}
                    onChange={(e) => setStaffPin(e.target.value)}
                    placeholder="New Staff PIN (4-6 digits)"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Update Security PINs</span>
                </button>
              </form>
            </div>

            {/* 5. Customer APK / Booking QR Code Generator */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-[#6C3BF5]" />
                <span>Customer APK / App QR Code</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customerApkUrl}
                  onChange={(e) => setCustomerApkUrl(e.target.value)}
                  placeholder="https://github.com/.../app.apk ya Salon Link"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
                >
                  Save
                </button>
              </div>
              {customerQrDataUrl && (
                <div className="rounded-2xl bg-[#F8F7FC] dark:bg-slate-950 p-4 flex flex-col items-center gap-2.5 text-center">
                  <div className="text-sm font-extrabold text-[#141028] dark:text-white">
                    {data.salon.name}
                  </div>
                  <img
                    src={customerQrDataUrl}
                    alt="Customer Salon QR"
                    className="w-44 h-44 rounded-2xl bg-white p-2 shadow-sm"
                  />
                  <div className="text-[11px] font-semibold text-slate-500">
                    Customer scan karke APK download ya booking karein
                  </div>
                  <a
                    href={customerQrDataUrl}
                    download={`${data.salon.name.toLowerCase().replace(/\s+/g, '-')}-qr.png`}
                    className="px-4 py-2 rounded-xl sb-gradient text-white text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download QR PNG</span>
                  </a>
                </div>
              )}
            </div>

            {onServerUrlUpdated && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const clean = serverUrlDraft.trim();
                  setApiBaseUrl(clean);
                  setPhoneOfflineMode(!clean);
                  await onServerUrlUpdated();
                  notify('success', clean ? 'Live server URL updated!' : 'Phone storage mode active');
                }}
                className="sb-card p-4 space-y-2.5"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-[#6C3BF5]" />
                  <span>Live Server Sync</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={serverUrlDraft}
                    onChange={(e) => setServerUrlDraft(e.target.value)}
                    placeholder="https://your-salon-server.com"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onOpenLogin}
                className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm"
              >
                Switch Role / Login Screen
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full py-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 font-extrabold text-sm flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout & Lock</span>
                </button>
              )}
            </div>
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
