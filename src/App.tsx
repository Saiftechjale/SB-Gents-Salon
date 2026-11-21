import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeIndianRupee,
  BarChart3,
  Bell,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Percent,
  Phone,
  Receipt,
  RefreshCw,
  Scissors,
  Settings,
  Sun,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  OfflineDraftBill,
  SalonBootstrapData,
  UserRole,
} from './types/salon';
import { Language, t } from './lib/i18n';
import { playAlertChime, sendNativeNotification } from './lib/alerts';
import { supabase } from './lib/supabase';
import {
  cacheSalonStateLocally,
  getAllOfflineDraftBills,
  getCachedSalonState,
  removeOfflineDraftBill,
  saveOfflineDraftBill,
  updateOfflineDraftStatus,
} from './lib/offlineDb';
import { CustomerBookingPortal } from './components/CustomerBookingPortal';
import { StaffPortal } from './components/StaffPortal';
import { OwnerOperationsViews, OwnerSectionTab } from './components/OwnerOperationsViews';
import { OwnerAdminViews } from './components/OwnerAdminViews';

function getInitialPortalRole(): UserRole {
  if (typeof window === 'undefined') return 'CUSTOMER';
  const params = new URLSearchParams(window.location.search);
  const p = (params.get('portal') || '').toLowerCase();
  if (p === 'owner') return 'OWNER';
  if (p === 'staff') return 'STAFF';
  return 'CUSTOMER';
}

export default function App() {
  const [role, setRole] = useState<UserRole>(getInitialPortalRole);
  const [ownerTab, setOwnerTab] = useState<OwnerSectionTab>('DASHBOARD');
  const [showMobileMoreSheet, setShowMobileMoreSheet] = useState<boolean>(false);
  const [lang, setLang] = useState<Language>('en');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Separate Portal PIN Authentication (Customers never see Owner/Staff tabs!)
  const [ownerUnlocked, setOwnerUnlocked] = useState<boolean>(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sb_owner_auth') === '1'
  );
  const [staffUnlocked, setStaffUnlocked] = useState<boolean>(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sb_staff_auth') === '1'
  );
  const [showLoginModal, setShowLoginModal] = useState<'OWNER' | 'STAFF' | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinLoading, setPinLoading] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string>('');

  const [data, setData] = useState<SalonBootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineDraftBill[]>([]);
  const [isSyncingDrafts, setIsSyncingDrafts] = useState<boolean>(false);

  // Secret multi-tap gesture refs for hidden Staff / Owner access
  const headerTapCountRef = useRef<number>(0);
  const headerTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const footerTapCountRef = useRef<number>(0);
  const footerTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showOwnerAlerts, setShowOwnerAlerts] = useState<boolean>(false);
  const seenOwnerNotifIdsRef = useRef<Set<string>>(new Set());
  const ownerNotifInitRef = useRef<boolean>(false);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Keep page title synced with Owner-configured Salon Name
  useEffect(() => {
    if (data?.salon.name) {
      document.title = data.salon.name;
    }
  }, [data?.salon.name]);

  const loadOfflineDrafts = useCallback(async () => {
    const list = await getAllOfflineDraftBills();
    setOfflineDrafts(list);
  }, []);

  const fetchBootstrapData = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Failed to load salon database');
      const json = (await res.json()) as SalonBootstrapData;
      setData(json);
      await cacheSalonStateLocally(json);
    } catch {
      const cached = await getCachedSalonState();
      if (cached) {
        setData(cached);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const syncPendingOfflineDrafts = useCallback(async () => {
    if (!navigator.onLine) return;
    const drafts = await getAllOfflineDraftBills();
    if (drafts.length === 0) return;

    setIsSyncingDrafts(true);
    let syncedCount = 0;

    for (const draft of drafts) {
      try {
        await updateOfflineDraftStatus(draft.client_sync_id, 'SYNCING');
        const res = await fetch('/api/payments/bill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (res.ok) {
          await removeOfflineDraftBill(draft.client_sync_id);
          syncedCount += 1;
        } else {
          const err = await res.json();
          await updateOfflineDraftStatus(
            draft.client_sync_id,
            'FAILED',
            err.error || 'Sync error'
          );
        }
      } catch (e) {
        await updateOfflineDraftStatus(draft.client_sync_id, 'FAILED', String(e));
      }
    }

    await loadOfflineDrafts();
    await fetchBootstrapData();
    setIsSyncingDrafts(false);

    if (syncedCount > 0) {
      notify(
        'success',
        `Synchronized ${syncedCount} pending bill(s).`
      );
    }
  }, [fetchBootstrapData, loadOfflineDrafts, notify]);

  useEffect(() => {
    fetchBootstrapData();
    loadOfflineDrafts();
  }, [fetchBootstrapData, loadOfflineDrafts]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingOfflineDrafts();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingOfflineDrafts]);

  useEffect(() => {
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type && parsed.type !== 'CONNECTED') {
          fetchBootstrapData();
        }
      } catch {
        // Ignore parse errors
      }
    };

    let sbChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      sbChannel = supabase
        .channel('sb-salon-realtime')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          fetchBootstrapData();
        })
        .subscribe();
    }

    return () => {
      evtSource.close();
      if (sbChannel && supabase) {
        supabase.removeChannel(sbChannel);
      }
    };
  }, [fetchBootstrapData]);

  const ownerNotifications = (data?.notifications || []).filter(
    (n) => n.recipient_role === 'OWNER'
  );
  const unreadOwnerNotifications = ownerNotifications.filter((n) => !n.is_read);

  // Instant Owner Sound + Toast + Native Alert when a new customer booking arrives
  useEffect(() => {
    if (!data) return;
    if (!ownerNotifInitRef.current) {
      ownerNotifications.forEach((n) => seenOwnerNotifIdsRef.current.add(n.id));
      ownerNotifInitRef.current = true;
      return;
    }
    for (const n of ownerNotifications) {
      if (!seenOwnerNotifIdsRef.current.has(n.id)) {
        seenOwnerNotifIdsRef.current.add(n.id);
        if (!n.is_read && role === 'OWNER' && ownerUnlocked) {
          playAlertChime('owner');
          notify('success', `${n.title}: ${n.message}`);
          sendNativeNotification(`${data.salon.name} — ${n.title}`, n.message);
        }
      }
    }
  }, [data, ownerNotifications, role, ownerUnlocked, notify]);

  const handleMarkOwnerNotificationsRead = async () => {
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'OWNER' }),
      });
      await fetchBootstrapData();
    } catch {
      // Ignore transient error
    }
  };

  const handleSaveOfflineDraft = async (draft: OfflineDraftBill) => {
    await saveOfflineDraftBill(draft);
    await loadOfflineDrafts();
  };

  const openPortal = (targetRole: 'OWNER' | 'STAFF') => {
    if (targetRole === 'OWNER' && ownerUnlocked) {
      setRole('OWNER');
      return;
    }
    if (targetRole === 'STAFF' && staffUnlocked) {
      setRole('STAFF');
      return;
    }
    setPinInput('');
    setPinError('');
    setShowLoginModal(targetRole);
  };

  // Secret Gesture 1: Tap Salon Title 5x quickly on Customer Home
  const handleHeaderSecretTap = (e: React.MouseEvent) => {
    e.preventDefault();
    if (role === 'OWNER') {
      setOwnerTab('DASHBOARD');
      return;
    }
    if (role !== 'CUSTOMER') return;

    headerTapCountRef.current += 1;
    if (headerTapTimerRef.current) clearTimeout(headerTapTimerRef.current);
    if (headerTapCountRef.current >= 5) {
      headerTapCountRef.current = 0;
      openPortal('OWNER');
      return;
    }
    headerTapTimerRef.current = setTimeout(() => {
      headerTapCountRef.current = 0;
    }, 1800);
  };

  // Secret Gesture 2: Tap "Developed by Mirza Saif" 3x quickly in Footer
  const handleFooterSecretTap = () => {
    footerTapCountRef.current += 1;
    if (footerTapTimerRef.current) clearTimeout(footerTapTimerRef.current);
    if (footerTapCountRef.current >= 3) {
      footerTapCountRef.current = 0;
      openPortal('STAFF');
      return;
    }
    footerTapTimerRef.current = setTimeout(() => {
      footerTapCountRef.current = 0;
    }, 1500);
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showLoginModal) return;
    setPinLoading(true);
    setPinError('');
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: showLoginModal, pin: pinInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.verified) {
        setPinError(json.error || 'Incorrect PIN');
        return;
      }
      if (showLoginModal === 'OWNER') {
        sessionStorage.setItem('sb_owner_auth', '1');
        setOwnerUnlocked(true);
        setRole('OWNER');
      } else {
        sessionStorage.setItem('sb_staff_auth', '1');
        setStaffUnlocked(true);
        setRole('STAFF');
      }
      setShowLoginModal(null);
      setPinInput('');
      notify('success', `Logged in to ${showLoginModal === 'OWNER' ? 'Owner' : 'Staff'} Portal`);
    } catch (err) {
      setPinError(String(err));
    } finally {
      setPinLoading(false);
    }
  };

  const handleLogoutPortal = () => {
    if (role === 'OWNER') {
      sessionStorage.removeItem('sb_owner_auth');
      setOwnerUnlocked(false);
    } else if (role === 'STAFF') {
      sessionStorage.removeItem('sb_staff_auth');
      setStaffUnlocked(false);
    }
    setRole('CUSTOMER');
    if (typeof window !== 'undefined' && window.location.search.includes('portal=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // Show PIN gate if user navigated directly via ?portal=owner or ?portal=staff without unlocking yet
  const needsPinUnlock =
    (role === 'OWNER' && !ownerUnlocked) || (role === 'STAFF' && !staffUnlocked);

  // All 12 Required Owner Main Sections
  const ownerNavItems: {
    id: OwnerSectionTab;
    labelKey: keyof typeof import('./lib/i18n').translations['en'];
    icon: React.ReactNode;
  }[] = [
    { id: 'DASHBOARD', labelKey: 'dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'BOOKINGS', labelKey: 'todaysBookings', icon: <CalendarCheck className="w-4 h-4" /> },
    { id: 'WALKIN', labelKey: 'walkIn', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'CUSTOMERS', labelKey: 'customers', icon: <Users className="w-4 h-4" /> },
    { id: 'STAFF', labelKey: 'staff', icon: <UserCheck className="w-4 h-4" /> },
    { id: 'SERVICES', labelKey: 'services', icon: <Scissors className="w-4 h-4" /> },
    { id: 'BILLING', labelKey: 'billing', icon: <Receipt className="w-4 h-4" /> },
    { id: 'UDHAR', labelKey: 'udharDue', icon: <BadgeIndianRupee className="w-4 h-4" /> },
    { id: 'COMMISSION', labelKey: 'commission', icon: <Percent className="w-4 h-4" /> },
    { id: 'EXPENSES', labelKey: 'expenses', icon: <Wallet className="w-4 h-4" /> },
    { id: 'REPORTS', labelKey: 'reports', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'SETTINGS', labelKey: 'settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const mobilePrimaryTabs: {
    id: OwnerSectionTab;
    labelKey: keyof typeof import('./lib/i18n').translations['en'];
    icon: React.ReactNode;
  }[] = [
    { id: 'DASHBOARD', labelKey: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'BOOKINGS', labelKey: 'todaysBookings', icon: <CalendarCheck className="w-5 h-5" /> },
    { id: 'WALKIN', labelKey: 'walkIn', icon: <UserPlus className="w-5 h-5" /> },
    { id: 'BILLING', labelKey: 'billing', icon: <Receipt className="w-5 h-5" /> },
  ];

  const isSecondaryMobileTab = !mobilePrimaryTabs.some((tItem) => tItem.id === ownerTab);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Clean Mobile/APK-Friendly Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2.5 px-3.5 sm:px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <a
          href="#top"
          onClick={handleHeaderSecretTap}
          className="min-w-0 flex-1 text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2 select-none"
        >
          <Scissors className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="truncate">{data ? data.salon.name : t(lang, 'appName')}</span>
          {role !== 'CUSTOMER' && !needsPinUnlock && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
              {role === 'OWNER' ? 'Owner' : 'Staff'}
            </span>
          )}
        </a>

        <div className="flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </span>
          )}

          {role === 'OWNER' && ownerUnlocked && offlineDrafts.length > 0 && (
            <button
              type="button"
              onClick={syncPendingOfflineDrafts}
              disabled={!isOnline || isSyncingDrafts}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-500/30"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingDrafts ? 'animate-spin' : ''}`} />
              <span>Sync ({offlineDrafts.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'en' ? 'hi' : 'en'))}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 rounded-xl hover:bg-amber-400 transition-colors min-h-[36px]"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'हिन्दी' : 'EN'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Theme"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          {role === 'OWNER' && ownerUnlocked && (
            <button
              type="button"
              onClick={() => setShowOwnerAlerts(true)}
              className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Booking Alerts"
            >
              <Bell className="w-4 h-4 text-amber-500" />
              {unreadOwnerNotifications.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                  {unreadOwnerNotifications.length}
                </span>
              )}
            </button>
          )}

          {role !== 'CUSTOMER' && !needsPinUnlock && (
            <button
              type="button"
              onClick={handleLogoutPortal}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[36px]"
              title="Exit"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-5 right-5 z-50 max-w-md rounded-2xl border shadow-xl px-4 py-3 flex items-center justify-between gap-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 border-slate-700">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                toast.type === 'success'
                  ? 'text-emerald-400 dark:text-emerald-600'
                  : 'text-rose-400 dark:text-rose-600'
              }`}
            />
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading || !data ? (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
            <div className="text-sm font-medium text-slate-500">
              Loading {data?.salon.name || 'Salon'}...
            </div>
          </div>
        </div>
      ) : needsPinUnlock ? (
        /* Direct URL PIN Screen for ?portal=owner or ?portal=staff */
        <main className="flex-1 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const target = role === 'OWNER' ? 'OWNER' : 'STAFF';
              setPinLoading(true);
              setPinError('');
              try {
                const res = await fetch('/api/auth/verify-pin', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: target, pin: pinInput.trim() }),
                });
                const json = await res.json();
                if (!res.ok || !json.verified) {
                  setPinError(json.error || 'Incorrect PIN');
                  return;
                }
                if (target === 'OWNER') {
                  sessionStorage.setItem('sb_owner_auth', '1');
                  setOwnerUnlocked(true);
                } else {
                  sessionStorage.setItem('sb_staff_auth', '1');
                  setStaffUnlocked(true);
                }
                setPinInput('');
              } catch (err) {
                setPinError(String(err));
              } finally {
                setPinLoading(false);
              }
            }}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">
                  {role === 'OWNER' ? 'Owner Login' : 'Staff Login'}
                </h2>
                <p className="text-xs text-slate-500">Enter 4-digit PIN</p>
              </div>
            </div>

            <input
              type="password"
              inputMode="numeric"
              required
              autoFocus
              placeholder="Enter PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-center text-xl font-mono tracking-widest"
            />

            {pinError && <div className="text-xs text-rose-500 font-semibold">{pinError}</div>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole('CUSTOMER')}
                className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold"
              >
                Customer Home
              </button>
              <button
                type="submit"
                disabled={pinLoading}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
              >
                {pinLoading ? 'Checking...' : 'Unlock'}
              </button>
            </div>
          </form>
        </main>
      ) : role === 'CUSTOMER' ? (
        /* 1. CLEAN CUSTOMER EXPERIENCE (Standalone Public App View) */
        <main className="flex-1 p-4 sm:p-6 flex flex-col">
          <div className="flex-1">
            <CustomerBookingPortal
              data={data}
              lang={lang}
              isOnline={isOnline}
              onRefresh={fetchBootstrapData}
              notify={notify}
            />
          </div>

          {/* Dynamic Owner-Editable Customer Footer */}
          <footer className="max-w-4xl w-full mx-auto mt-10 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-800 space-y-5">
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-base text-slate-900 dark:text-slate-100 truncate">
                    {data.salon.name}
                  </span>
                </div>
                {data.showcase?.footer_tagline && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {data.showcase.footer_tagline}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{data.salon.address}</span>
                  </span>
                  <span className="flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{data.settings.opening_time} – {data.settings.closing_time}</span>
                  </span>
                  <span className="flex items-center gap-1 font-mono tabular-nums">
                    <Phone className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>+91 {data.salon.phone.replace(/\D/g, '').slice(-10)}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center shrink-0">
                <a
                  href={`https://wa.me/91${data.salon.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                    `Namaste ${data.salon.name}, mujhe appointment book karna hai.\nName: \nService: \nDate: Today\nTime: `
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 text-xs font-bold transition-colors min-h-[40px]"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t(lang, 'whatsappSalon')}</span>
                </a>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
              <span>
                &copy; {new Date().getFullYear()} {data.salon.name}
              </span>
              <button
                type="button"
                onClick={handleFooterSecretTap}
                className="text-xs text-slate-500 dark:text-slate-400 select-none cursor-default focus:outline-none"
              >
                Developed by{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {data.showcase?.developer_credit || 'Mirza Saif'}
                </span>
              </button>
            </div>
          </footer>
        </main>
      ) : role === 'STAFF' ? (
        /* 3. CLEAN STAFF EXPERIENCE */
        <main className="flex-1 p-4 sm:p-6">
          <StaffPortal
            data={data}
            lang={lang}
            onRefresh={fetchBootstrapData}
            notify={notify}
          />
        </main>
      ) : (
        /* 2. OWNER EXPERIENCE: Desktop Sidebar + Mobile Bottom Navigation + Main Content */
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto">
          <aside className="hidden lg:flex lg:flex-col lg:w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-1">
            <div className="px-3 py-2 text-xs font-bold text-slate-400">
              Owner Workspace
            </div>
            {ownerNavItems.map((item) => {
              const active = ownerTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOwnerTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap ${
                    active
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.icon}
                  <span>{t(lang, item.labelKey)}</span>
                </button>
              );
            })}
          </aside>

          <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 overflow-x-hidden">
            {ownerTab === 'DASHBOARD' ||
            ownerTab === 'BOOKINGS' ||
            ownerTab === 'WALKIN' ||
            ownerTab === 'BILLING' ? (
              <OwnerOperationsViews
                activeSubTab={ownerTab}
                setActiveSubTab={(tab) => setOwnerTab(tab)}
                data={data}
                lang={lang}
                isOnline={isOnline}
                offlineDrafts={offlineDrafts}
                onSaveOfflineDraft={handleSaveOfflineDraft}
                onSyncOfflineDrafts={syncPendingOfflineDrafts}
                isSyncingDrafts={isSyncingDrafts}
                onRefresh={fetchBootstrapData}
                notify={notify}
              />
            ) : (
              <OwnerAdminViews
                activeSubTab={ownerTab}
                setActiveSubTab={(tab) => setOwnerTab(tab)}
                data={data}
                lang={lang}
                onRefresh={fetchBootstrapData}
                notify={notify}
              />
            )}
          </main>

          {/* Mobile Fixed Bottom Navigation Bar */}
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-16">
            {mobilePrimaryTabs.map((item) => {
              const active = ownerTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOwnerTab(item.id);
                    setShowMobileMoreSheet(false);
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold min-h-[44px] ${
                    active
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.icon}
                  <span className="truncate max-w-[68px]">{t(lang, item.labelKey)}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowMobileMoreSheet((prev) => !prev)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold min-h-[44px] ${
                isSecondaryMobileTab || showMobileMoreSheet
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Menu className="w-5 h-5" />
              <span>More (8)</span>
            </button>
          </nav>

          {showMobileMoreSheet && (
            <div
              className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end"
              onClick={() => setShowMobileMoreSheet(false)}
            >
              <div
                className="w-full rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-5 pb-8 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">All Owner Sections</h3>
                  <button
                    type="button"
                    onClick={() => setShowMobileMoreSheet(false)}
                    className="p-1.5 rounded-lg text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {ownerNavItems
                    .filter((item) => !mobilePrimaryTabs.some((m) => m.id === item.id))
                    .map((item) => {
                      const active = ownerTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setOwnerTab(item.id);
                            setShowMobileMoreSheet(false);
                          }}
                          className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-xs font-semibold min-h-[48px] ${
                            active
                              ? 'bg-amber-500 border-amber-500 text-slate-950'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {item.icon}
                          <span>{t(lang, item.labelKey)}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden Staff / Owner PIN Modal (Unlocked via Secret Tap Gesture or Portal Link) */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowLoginModal(null)}
        >
          <form
            onSubmit={handleVerifyPin}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold">
                    {showLoginModal === 'OWNER' ? 'Owner Login' : 'Staff Login'}
                  </h3>
                  <p className="text-xs text-slate-500">Enter 4-digit PIN</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(null)}
                className="p-1.5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => {
                  if (staffUnlocked) {
                    setShowLoginModal(null);
                    setRole('STAFF');
                    return;
                  }
                  setShowLoginModal('STAFF');
                  setPinInput('');
                  setPinError('');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  showLoginModal === 'STAFF'
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Staff Login
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ownerUnlocked) {
                    setShowLoginModal(null);
                    setRole('OWNER');
                    return;
                  }
                  setShowLoginModal('OWNER');
                  setPinInput('');
                  setPinError('');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  showLoginModal === 'OWNER'
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Owner Login
              </button>
            </div>

            <input
              type="password"
              inputMode="numeric"
              required
              autoFocus
              placeholder="Enter 4-digit PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-center text-xl font-mono tracking-widest"
            />

            {pinError && <div className="text-xs text-rose-500 font-semibold">{pinError}</div>}

            <button
              type="submit"
              disabled={pinLoading}
              className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400"
            >
              {pinLoading
                ? 'Verifying...'
                : `Unlock ${showLoginModal === 'OWNER' ? 'Owner' : 'Staff'} Portal`}
            </button>
          </form>
        </div>
      )}
      {/* Owner Live Booking Alerts Drawer */}
      {showOwnerAlerts && data && role === 'OWNER' && ownerUnlocked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowOwnerAlerts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl max-h-[82vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <h3 className="text-base font-bold">Booking Notifications</h3>
              </div>
              <div className="flex items-center gap-2">
                {unreadOwnerNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkOwnerNotificationsRead}
                    className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Mark Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowOwnerAlerts(false)}
                  className="p-1 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5">
              {ownerNotifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No booking alerts yet.
                </div>
              ) : (
                ownerNotifications.slice(0, 20).map((n) => {
                  const tokenMatch = n.title.match(/#(\d+)/);
                  const tokenNo = tokenMatch ? Number(tokenMatch[1]) : null;
                  const matchingBooking = tokenNo
                    ? data.bookings.find((b) => b.token_number === tokenNo)
                    : undefined;
                  const waHref = matchingBooking
                    ? `https://wa.me/91${matchingBooking.customer_phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                        `Hello ${matchingBooking.customer_name}, your booking at ${data.salon.name} is confirmed! Token #${matchingBooking.token_number}, Date: ${matchingBooking.booking_date}, Time: ${matchingBooking.slot_time}.`
                      )}`
                    : null;

                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-2xl border space-y-2 ${
                        !n.is_read
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {n.title}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {new Date(n.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {n.message}
                      </div>
                      <div className="flex items-center gap-2">
                        {waHref && (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp Confirm</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowOwnerAlerts(false);
                            setOwnerTab('BOOKINGS');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px] font-bold"
                        >
                          Open Bookings
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
