import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquare,
  Pencil,
  Percent,
  Plus,
  QrCode,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Tag,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import type {
  Customer,
  OfferAccentTheme,
  OfferDiscountType,
  ReceptionAccount,
  SalonBootstrapData,
  SalonOffer,
  ServiceItem,
  StaffMember,
} from '../types/salon';
import {
  apiFetch,
  getApiBaseUrl,
  isPhoneOfflineMode,
  setApiBaseUrl,
  setPhoneOfflineMode,
} from '../lib/api';
import { exportReportToExcel, exportReportToPDF } from '../lib/exportReports';
import {
  buildCustomerPinResetCodeText,
  buildCustomerUdharOrGreetingText,
  buildSmsUrl,
  buildWhatsAppUrl,
} from '../lib/messagingTemplates';
import { isWeakPin, WEAK_PIN_MSG } from '../lib/pinSecurity';
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
  const [newStaffPin, setNewStaffPin] = useState('');
  const [newStaffPct, setNewStaffPct] = useState('40');
  const [newStaffSpecialty, setNewStaffSpecialty] = useState('Senior Barber');
  const [editingStaffId, setEditingStaffId] = useState<string>('');
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffPin, setEditStaffPin] = useState('');
  const [editStaffPct, setEditStaffPct] = useState('40');
  const [editStaffSpecialty, setEditStaffSpecialty] = useState('');
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string>('');

  // Reception Counter Logins state (Malik-managed)
  const [showAddReception, setShowAddReception] = useState(false);
  const [newRecName, setNewRecName] = useState('');
  const [newRecPhone, setNewRecPhone] = useState('');
  const [newRecPin, setNewRecPin] = useState('');
  const [editingRecId, setEditingRecId] = useState<string>('');
  const [editRecName, setEditRecName] = useState('');
  const [editRecPhone, setEditRecPhone] = useState('');
  const [editRecPin, setEditRecPin] = useState('');
  const [editRecActive, setEditRecActive] = useState(true);
  const [confirmDeleteRecId, setConfirmDeleteRecId] = useState<string>('');

  // Customers, Udhar, Edit, PIN Reset & Delete state
  const [custSearch, setCustSearch] = useState('');
  const [settleId, setSettleId] = useState('');
  const [settleAmt, setSettleAmt] = useState('');
  const [settleMode, setSettleMode] = useState<'CASH' | 'UPI'>('CASH');
  const [editingCustId, setEditingCustId] = useState<string>('');
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editCustPref, setEditCustPref] = useState('');
  const [resetCustPin, setResetCustPin] = useState('');
  const [confirmDeleteCustId, setConfirmDeleteCustId] = useState<string>('');
  const [custResetCodes, setCustResetCodes] = useState<
    Record<string, { code: string; copied?: boolean }>
  >({});
  const [generatingResetForId, setGeneratingResetForId] = useState<string>('');

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
  const [customerApkUrl, setCustomerApkUrl] = useState(() => {
    const saved = (data.settings.customer_apk_url || '').trim();
    const isLocalOrigin = (url: string) =>
      /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
    if (saved && !isLocalOrigin(saved)) return saved;
    const apiBase = getApiBaseUrl();
    if (apiBase && !isLocalOrigin(apiBase)) return apiBase;
    if (
      typeof window !== 'undefined' &&
      window.location.origin.startsWith('http') &&
      !isLocalOrigin(window.location.origin)
    ) {
      return window.location.origin;
    }
    return '';
  });
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

  // Customer Offers & Discount Slider state
  const [offerTitle, setOfferTitle] = useState('');
  const [offerSubtitle, setOfferSubtitle] = useState('');
  const [offerType, setOfferType] = useState<OfferDiscountType>('PERCENT');
  const [offerValue, setOfferValue] = useState('20');
  const [offerMinBill, setOfferMinBill] = useState('0');
  const [offerPromo, setOfferPromo] = useState('');
  const [offerTheme, setOfferTheme] = useState<OfferAccentTheme>('PURPLE');
  const [confirmDeleteOfferId, setConfirmDeleteOfferId] = useState<string>('');
  const [savingOffer, setSavingOffer] = useState<boolean>(false);

  // Expenses Add & List state
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmt, setNewExpAmt] = useState('');
  const [newExpMode, setNewExpMode] = useState<'CASH' | 'UPI'>('CASH');
  const [ownerPin, setOwnerPin] = useState('');
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState<string>('');
  const [recoveryCopied, setRecoveryCopied] = useState<boolean>(false);
  const [generatingRecovery, setGeneratingRecovery] = useState<boolean>(false);
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
    const saved = (data.settings.customer_apk_url || '').trim();
    if (saved && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(saved)) {
      setCustomerApkUrl(saved);
    }
  }, [data.salon, data.settings]);

  useEffect(() => {
    const clean = customerApkUrl.trim();
    const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(clean);
    if (!clean || !/^https?:\/\//i.test(clean) || isLocalOrigin) {
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
    const cleanPin = newStaffPin.trim();
    if (!newStaffName.trim() || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('error', 'Staff ka naam aur sahi 10-digit Indian mobile number daalein');
      return;
    }
    if (!/^\d{4,6}$/.test(cleanPin)) {
      notify('error', 'Staff login ke liye 4 se 6 digit ka PIN set karein');
      return;
    }
    if (isWeakPin(cleanPin)) {
      notify('error', WEAK_PIN_MSG);
      return;
    }
    const res = await apiFetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newStaffName.trim(),
        phone: cleanPhone,
        pin: cleanPin,
        specialty: newStaffSpecialty.trim() || 'Senior Barber',
        commission_pct: Number(newStaffPct || 40),
      }),
    });
    if (!(await handleApiError(res, 'Staff add nahi ho paya'))) return;
    setNewStaffName('');
    setNewStaffPhone('');
    setNewStaffPin('');
    setNewStaffSpecialty('Senior Barber');
    setShowAddStaff(false);
    await onRefresh();
    notify('success', 'New staff + login PIN saved!');
  };

  const startEditStaff = (st: StaffMember) => {
    setEditingStaffId(st.id);
    setEditStaffName(st.name);
    setEditStaffPhone(st.phone);
    setEditStaffPin('');
    setEditStaffPct(String(st.commission_pct));
    setEditStaffSpecialty(st.specialty || '');
    setConfirmDeleteStaffId('');
  };

  const handleSaveStaffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffId) return;
    const cleanPhone = editStaffPhone.replace(/\D/g, '').slice(-10);
    const cleanPin = editStaffPin.trim();
    if (!editStaffName.trim() || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('error', 'Staff ka sahi naam aur 10-digit Indian mobile number daalein');
      return;
    }
    if (cleanPin && !/^\d{4,6}$/.test(cleanPin)) {
      notify('error', 'Naya PIN 4 se 6 digits ka number hona chahiye');
      return;
    }
    if (cleanPin && isWeakPin(cleanPin)) {
      notify('error', WEAK_PIN_MSG);
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
        pin: cleanPin || undefined,
      }),
    });
    if (!(await handleApiError(res, 'Staff update nahi ho paya'))) return;
    setEditingStaffId('');
    setEditStaffPin('');
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

  const handleAddReception = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = newRecPhone.replace(/\D/g, '').slice(-10);
    const cleanPin = newRecPin.trim();
    if (newRecName.trim().length < 2 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('error', 'Receptionist ka naam aur sahi 10-digit mobile number daalein');
      return;
    }
    if (!/^\d{4,6}$/.test(cleanPin)) {
      notify('error', 'Reception login ke liye 4 se 6 digit PIN daalein');
      return;
    }
    if (isWeakPin(cleanPin)) {
      notify('error', WEAK_PIN_MSG);
      return;
    }
    const res = await apiFetch('/api/reception-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRecName.trim(),
        phone: cleanPhone,
        pin: cleanPin,
      }),
    });
    if (!(await handleApiError(res, 'Reception account nahi ban paya'))) return;
    setNewRecName('');
    setNewRecPhone('');
    setNewRecPin('');
    setShowAddReception(false);
    await onRefresh();
    notify('success', 'Reception Counter login ban gaya!');
  };

  const startEditReception = (r: ReceptionAccount) => {
    setEditingRecId(r.id);
    setEditRecName(r.name);
    setEditRecPhone(r.phone);
    setEditRecPin('');
    setEditRecActive(r.is_active);
    setConfirmDeleteRecId('');
  };

  const handleSaveReceptionEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecId) return;
    const cleanPhone = editRecPhone.replace(/\D/g, '').slice(-10);
    const cleanPin = editRecPin.trim();
    if (editRecName.trim().length < 2 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('error', 'Receptionist ka naam aur 10-digit mobile number daalein');
      return;
    }
    if (cleanPin && !/^\d{4,6}$/.test(cleanPin)) {
      notify('error', 'PIN 4 se 6 digits ka hona chahiye');
      return;
    }
    if (cleanPin && isWeakPin(cleanPin)) {
      notify('error', WEAK_PIN_MSG);
      return;
    }
    const res = await apiFetch(`/api/reception-accounts/${editingRecId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editRecName.trim(),
        phone: cleanPhone,
        is_active: editRecActive,
        pin: cleanPin || undefined,
      }),
    });
    if (!(await handleApiError(res, 'Reception update nahi hua'))) return;
    setEditingRecId('');
    setEditRecPin('');
    await onRefresh();
    notify('success', 'Reception account updated!');
  };

  const handleDeleteReception = async (id: string) => {
    const res = await apiFetch(`/api/reception-accounts/${id}`, { method: 'DELETE' });
    if (!(await handleApiError(res, 'Reception remove nahi hua'))) return;
    setConfirmDeleteRecId('');
    await onRefresh();
    notify('success', 'Reception account removed!');
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
    setResetCustPin('');
    setConfirmDeleteCustId('');
  };

  const handleResetCustomerPin = async (customerId: string) => {
    const cleanPin = resetCustPin.trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      notify('error', 'Naya PIN 4 se 6 digits ka number daalein');
      return;
    }
    if (isWeakPin(cleanPin)) {
      notify('error', WEAK_PIN_MSG);
      return;
    }
    const res = await apiFetch(`/api/customers/${customerId}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cleanPin }),
    });
    if (!(await handleApiError(res, 'Customer PIN reset nahi hua'))) return;
    setResetCustPin('');
    await onRefresh();
    notify('success', 'Customer ka naya PIN set ho gaya!');
  };

  const handleGenerateCustomerResetCode = async (customerId: string) => {
    setGeneratingResetForId(customerId);
    try {
      const res = await apiFetch(`/api/customers/${customerId}/reset-code`, {
        method: 'POST',
      });
      if (!(await handleApiError(res, 'Reset code generate nahi ho paya'))) return;
      const json = await res.json();
      if (json.resetCode) {
        setCustResetCodes((prev) => ({
          ...prev,
          [customerId]: { code: String(json.resetCode), copied: false },
        }));
        notify('success', '15-minute ka 1-time reset code ban gaya! Customer ko bhejein.');
      }
    } catch (e) {
      notify('error', String(e));
    } finally {
      setGeneratingResetForId('');
    }
  };

  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustId) return;
    const cleanPhone = editCustPhone.replace(/\D/g, '').slice(-10);
    if (!editCustName.trim() || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('error', 'Customer naam aur sahi 10-digit Indian mobile number daalein');
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
        customer_apk_url: /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(customerApkUrl.trim())
          ? ''
          : customerApkUrl.trim(),
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
    const cleanOwner = ownerPin.trim();
    if (!/^\d{4,6}$/.test(cleanOwner)) {
      notify('error', 'Malik ka naya PIN 4 se 6 digits ka number daalein');
      return;
    }
    if (isWeakPin(cleanOwner)) {
      notify('error', WEAK_PIN_MSG);
      return;
    }
    const res = await apiFetch('/api/auth/pins', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerPin: cleanOwner }),
    });
    if (!(await handleApiError(res, 'Malik PIN update nahi hua'))) return;
    setOwnerPin('');
    await onRefresh();
    notify('success', 'Malik Secret PIN updated!');
  };

  const handleGenerateOwnerRecoveryCode = async () => {
    setGeneratingRecovery(true);
    try {
      const res = await apiFetch('/api/auth/owner/recovery-code', {
        method: 'POST',
      });
      if (!(await handleApiError(res, 'Recovery code generate nahi ho paya'))) return;
      const json = await res.json();
      if (json.recoveryCode) {
        setGeneratedRecoveryCode(String(json.recoveryCode));
        setRecoveryCopied(false);
        await onRefresh();
        notify('success', 'Naya Master Recovery Code ban gaya — ise safe note kar lein!');
      }
    } catch (e) {
      notify('error', String(e));
    } finally {
      setGeneratingRecovery(false);
    }
  };

  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerTitle.trim() || Number(offerValue) <= 0) {
      notify('error', 'Offer ka title aur sahi discount value daalein');
      return;
    }
    setSavingOffer(true);
    try {
      const cleanVal = Math.max(1, Number(offerValue));
      const badge =
        offerType === 'PERCENT' ? `${Math.min(90, cleanVal)}% OFF` : `₹${cleanVal} OFF`;
      const res = await apiFetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: offerTitle.trim(),
          subtitle: offerSubtitle.trim(),
          badge_text: badge,
          discount_type: offerType,
          discount_value: offerType === 'PERCENT' ? Math.min(90, cleanVal) : cleanVal,
          min_bill: Math.max(0, Number(offerMinBill || 0)),
          promo_code: offerPromo.trim().toUpperCase(),
          accent_theme: offerTheme,
          is_active: true,
        }),
      });
      if (!(await handleApiError(res, 'Offer save nahi ho paya'))) return;
      setOfferTitle('');
      setOfferSubtitle('');
      setOfferValue('20');
      setOfferMinBill('0');
      setOfferPromo('');
      await onRefresh();
      notify('success', 'Offer customer slider par live ho gaya!');
    } finally {
      setSavingOffer(false);
    }
  };

  const handleToggleOfferActive = async (offer: SalonOffer) => {
    const res = await apiFetch(`/api/offers/${offer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !offer.is_active }),
    });
    if (!(await handleApiError(res, 'Offer update nahi hua'))) return;
    await onRefresh();
    notify('success', offer.is_active ? 'Offer pause kiya gaya' : 'Offer live kiya gaya');
  };

  const handleDeleteOffer = async (id: string) => {
    const res = await apiFetch(`/api/offers/${id}`, { method: 'DELETE' });
    if (!(await handleApiError(res, 'Offer remove nahi hua'))) return;
    setConfirmDeleteOfferId('');
    await onRefresh();
    notify('success', 'Offer removed!');
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
        {data.isDefaultOwnerPin && (
          <div className="max-w-2xl mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Security Alert: Abhi default PIN laga hai. Kripya Settings me apna naya Secret PIN set karein.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('SETTINGS')}
              className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-extrabold shrink-0 whitespace-nowrap"
            >
              PIN Badlein
            </button>
          </div>
        )}

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
                <div className="text-xs font-extrabold text-[#141028] dark:text-white">
                  Naya Staff + Login PIN Banayein
                </div>
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
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit Login Mobile"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Personal Login PIN (4-6 digits)"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
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
                    className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold min-h-[44px]"
                >
                  Save Staff + Login PIN
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

            {/* Staff List Card (with Edit, Individual PIN & Delete) */}
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
                            {!r.staff.is_owner && (
                              <span
                                className={`ml-1.5 font-bold ${
                                  r.staff.has_pin ? 'text-emerald-600' : 'text-amber-600'
                                }`}
                              >
                                · {r.staff.has_pin ? 'PIN Set ✓' : 'PIN Pending'}
                              </span>
                            )}
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
                            inputMode="numeric"
                            maxLength={10}
                            required
                            value={editStaffPhone}
                            onChange={(e) => setEditStaffPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="10-digit Phone"
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
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
                          {!r.staff.is_owner && (
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={6}
                              value={editStaffPin}
                              onChange={(e) => setEditStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="New Login PIN (khali chhodein agar nahi badalna)"
                              className="col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
                            />
                          )}
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1 min-h-[42px]"
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

            {/* Reception Counter Logins (Created Exclusively by Malik) */}
            <div className="sb-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Reception Counter Logins ({data.receptionAccounts?.length || 0})
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Receptionist apna mobile aur PIN se sirf counter & billing khol payega
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddReception((p) => !p)}
                  className="px-3 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Reception</span>
                </button>
              </div>

              {showAddReception && (
                <form onSubmit={handleAddReception} className="p-3 rounded-2xl bg-[#F8F7FC] dark:bg-slate-950 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={newRecName}
                      onChange={(e) => setNewRecName(e.target.value)}
                      placeholder="Receptionist Name"
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold"
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      value={newRecPhone}
                      onChange={(e) => setNewRecPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit Mobile"
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={newRecPin}
                      onChange={(e) => setNewRecPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Login PIN (4-6 digits)"
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold min-h-[42px]"
                  >
                    Save Reception Login
                  </button>
                </form>
              )}

              {(!data.receptionAccounts || data.receptionAccounts.length === 0) ? (
                <div className="rounded-xl bg-[#F8F7FC] dark:bg-slate-950 px-3.5 py-3 text-xs text-slate-500">
                  Abhi koi alag Receptionist account nahi bana hai. Upar &ldquo;+ Reception&rdquo; se banayein.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.receptionAccounts.map((rec) => {
                    const isEditing = editingRecId === rec.id;
                    const isConfirmDelete = confirmDeleteRecId === rec.id;
                    return (
                      <div key={rec.id} className="py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-[#141028] dark:text-white truncate">
                              {rec.name}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              +91 {rec.phone} ·{' '}
                              <span className={rec.is_active ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                                {rec.is_active ? 'Active' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditingRecId('') : startEditReception(rec))}
                              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                              aria-label="Edit reception"
                            >
                              {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                            </button>
                            {isConfirmDelete ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReception(rec.id)}
                                  className="px-2 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold"
                                >
                                  Hatao
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRecId('')}
                                  className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[10px] font-bold"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRecId(rec.id)}
                                className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-500"
                                aria-label="Delete reception"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing && (
                          <form onSubmit={handleSaveReceptionEdit} className="p-2.5 rounded-xl bg-[#F8F7FC] dark:bg-slate-950 space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                required
                                value={editRecName}
                                onChange={(e) => setEditRecName(e.target.value)}
                                placeholder="Name"
                                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold"
                              />
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={10}
                                required
                                value={editRecPhone}
                                onChange={(e) => setEditRecPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="10-digit Mobile"
                                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums"
                              />
                              <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={editRecPin}
                                onChange={(e) => setEditRecPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="New PIN (optional)"
                                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editRecActive}
                                  onChange={(e) => setEditRecActive(e.target.checked)}
                                />
                                <span>Login Active</span>
                              </label>
                              <button
                                type="submit"
                                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1"
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
              )}
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
                            +91 {c.phone} · {c.total_visits} visits · ₹{c.total_spent} spent ·{' '}
                            <span className={c.is_registered ? 'text-[#6C3BF5] font-bold' : 'text-slate-400'}>
                              {c.is_registered ? 'App Account' : 'Walk-in'}
                            </span>
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
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                          <form onSubmit={handleSaveCustomerEdit} className="space-y-2">
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
                                inputMode="numeric"
                                maxLength={10}
                                required
                                value={editCustPhone}
                                onChange={(e) => setEditCustPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="10-digit Mobile"
                                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
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

                          <div className="flex gap-2 pt-1">
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={6}
                              value={resetCustPin}
                              onChange={(e) => setResetCustPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="Seedha naya PIN set karein (4-6 digits)"
                              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => handleResetCustomerPin(c.id)}
                              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-extrabold flex items-center gap-1 whitespace-nowrap min-h-[42px]"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Set PIN</span>
                            </button>
                          </div>

                          {/* 1-Time 6-Digit Customer Self-Reset Code */}
                          <div className="rounded-xl bg-[#F8F7FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                Customer khud naya PIN banaye (15 min 1-time code):
                              </span>
                              <button
                                type="button"
                                disabled={generatingResetForId === c.id}
                                onClick={() => handleGenerateCustomerResetCode(c.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#6C3BF5] text-white text-[11px] font-extrabold whitespace-nowrap min-h-[36px]"
                              >
                                {generatingResetForId === c.id ? 'Ban raha...' : 'Reset Code Banayein'}
                              </button>
                            </div>

                            {custResetCodes[c.id]?.code && (() => {
                              const resetEntry = custResetCodes[c.id];
                              const shareMsg = buildCustomerPinResetCodeText({
                                salonName: data.salon.name,
                                customerName: c.name,
                                resetCode: resetEntry.code,
                              });
                              return (
                                <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <div className="text-[10px] font-bold uppercase text-slate-400">
                                        1-Time Reset Code
                                      </div>
                                      <div className="text-lg font-extrabold tracking-widest text-[#6C3BF5] tabular-nums">
                                        {resetEntry.code}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard?.writeText(resetEntry.code);
                                          setCustResetCodes((prev) => ({
                                            ...prev,
                                            [c.id]: { ...resetEntry, copied: true },
                                          }));
                                          notify('success', 'Reset code copy ho gaya!');
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px] font-bold flex items-center gap-1"
                                      >
                                        <Copy className="w-3 h-3" />
                                        <span>{resetEntry.copied ? 'Copied' : 'Copy'}</span>
                                      </button>
                                      <a
                                        href={buildWhatsAppUrl(c.phone, shareMsg)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                                      >
                                        <MessageCircle className="w-3 h-3" />
                                        <span>WA</span>
                                      </a>
                                      <a
                                        href={buildSmsUrl(c.phone, shareMsg)}
                                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1"
                                      >
                                        <MessageSquare className="w-3 h-3" />
                                        <span>SMS</span>
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
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

            {/* 3.5 Customer Offers & Discount Slider Manager */}
            <div className="sb-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-[#6C3BF5]" />
                  <span>Customer Offers &amp; Discount Slider ({(data.offers || []).length})</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Yahan se banaye gaye offers seedhe customer ke Home screen slider aur Booking discount me dikhenge.
              </p>

              <form onSubmit={handleAddOffer} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value)}
                    placeholder="Offer Title (e.g. Festival 20% Off)"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={offerSubtitle}
                    onChange={(e) => setOfferSubtitle(e.target.value)}
                    placeholder="Short Line (e.g. Haircut + Beard par)"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as OfferDiscountType)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-2.5 py-2 text-xs font-bold"
                  >
                    <option value="PERCENT">Discount %</option>
                    <option value="FLAT">Flat ₹ Off</option>
                  </select>
                  <input
                    type="number"
                    required
                    min={1}
                    max={offerType === 'PERCENT' ? 90 : 5000}
                    value={offerValue}
                    onChange={(e) => setOfferValue(e.target.value)}
                    placeholder={offerType === 'PERCENT' ? 'e.g. 20%' : 'e.g. ₹50'}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
                  />
                  <input
                    type="number"
                    min={0}
                    value={offerMinBill}
                    onChange={(e) => setOfferMinBill(e.target.value)}
                    placeholder="Min Bill ₹"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold tabular-nums"
                  />
                  <input
                    type="text"
                    value={offerPromo}
                    onChange={(e) => setOfferPromo(e.target.value.toUpperCase())}
                    placeholder="Code (SAVE20)"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2 text-xs font-bold uppercase"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    {(['PURPLE', 'GOLD', 'EMERALD', 'ROSE'] as OfferAccentTheme[]).map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => setOfferTheme(th)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border ${
                          offerTheme === th
                            ? 'bg-[#141028] dark:bg-white text-white dark:text-[#141028] border-transparent'
                            : 'bg-[#F8F7FC] dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {th}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={savingOffer}
                    className="px-4 py-2 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold flex items-center gap-1 min-h-[40px]"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>{savingOffer ? 'Saving...' : 'Offer Slider Me Daalein'}</span>
                  </button>
                </div>
              </form>

              {(data.offers || []).length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-1">
                  {(data.offers || []).map((o) => {
                    const isConfirmDel = confirmDeleteOfferId === o.id;
                    return (
                      <div key={o.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-[#6C3BF5] text-[10px] font-extrabold shrink-0">
                              {o.badge_text}
                            </span>
                            <span
                              className={`text-xs font-extrabold truncate ${
                                o.is_active
                                  ? 'text-[#141028] dark:text-white'
                                  : 'text-slate-400 line-through'
                              }`}
                            >
                              {o.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                            {Number(o.min_bill || 0) > 0 ? `Min ₹${o.min_bill}` : 'No min bill'}
                            {o.promo_code ? ` · Code: ${o.promo_code}` : ''}
                            {` · ${o.accent_theme}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleOfferActive(o)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold ${
                              o.is_active
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {o.is_active ? 'LIVE' : 'PAUSED'}
                          </button>
                          {isConfirmDel ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteOffer(o.id)}
                                className="px-2 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold"
                              >
                                Hatao
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOfferId('')}
                                className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[10px] font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOfferId(o.id)}
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-500"
                              aria-label="Delete offer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Security PINs & Customer APK Lock */}
            <div className="sb-card p-4 space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#6C3BF5]" />
                <span>Security &amp; Customer APK Lock</span>
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
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Malik Login PIN Badlein (Staff &amp; Reception PIN Staff tab me set karein)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="New Malik Secret PIN (4-6 digits)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3 py-2.5 text-xs font-bold tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 min-h-[42px]"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Update Malik PIN</span>
                </button>
              </form>

              {/* Malik Master Recovery Code (Recover forgotten Mobile or PIN) */}
              <div className="rounded-2xl bg-[#F8F7FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-[#141028] dark:text-white">
                      Malik Master Recovery Code
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {data.hasOwnerRecoveryCode
                        ? 'Recovery Code Active ✓ (Bhulne par mobile + PIN dono recover honge)'
                        : 'Abhi generate karein taaki kabhi login lock na ho'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={generatingRecovery}
                    onClick={handleGenerateOwnerRecoveryCode}
                    className="px-3 py-2 rounded-xl bg-[#6C3BF5] text-white text-[11px] font-extrabold flex items-center gap-1 shrink-0 min-h-[38px]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generatingRecovery ? 'animate-spin' : ''}`} />
                    <span>{data.hasOwnerRecoveryCode ? 'Naya Banayein' : 'Generate Code'}</span>
                  </button>
                </div>

                {generatedRecoveryCode && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                          Aapka Master Recovery Code (Safe Likh Lein)
                        </div>
                        <div className="text-lg font-extrabold tracking-widest text-amber-950 dark:text-amber-100 font-mono">
                          {generatedRecoveryCode}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(generatedRecoveryCode);
                          setRecoveryCopied(true);
                          notify('success', 'Master Recovery Code copy ho gaya!');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-extrabold flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{recoveryCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                      Yeh code dobara nahi dikhega. Agar Malik mobile number ya PIN bhul jaye to Login screen par isse naya mobile + PIN set ho jayega.
                    </p>
                  </div>
                )}
              </div>
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
              {/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(customerApkUrl.trim()) && (
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  https://localhost sirf phone ke andar ka local link hai. Yahan apna GitHub APK download link ya live website URL daalein.
                </p>
              )}
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
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-[#6C3BF5]" />
                    <span>Live Server Sync</span>
                  </div>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      !isPhoneOfflineMode() && getApiBaseUrl()
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {!isPhoneOfflineMode() && getApiBaseUrl() ? 'Live Connected' : 'Local Phone Only'}
                  </span>
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
