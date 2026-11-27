import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { OfflineDraftBill, SalonBootstrapData } from './types/salon';
import { Language } from './lib/i18n';
import { playAlertChime, requestNotificationPermission, sendNativeNotification } from './lib/alerts';
import {
  apiFetch,
  apiUrl,
  isPhoneOfflineMode,
  setAuthToken,
} from './lib/api';
import { handleLocalApiRequest } from './lib/localApiEngine';
import { supabase } from './lib/supabase';
import {
  cacheSalonStateLocally,
  getAllOfflineDraftBills,
  getCachedSalonState,
  removeOfflineDraftBill,
  saveOfflineDraftBill,
  updateOfflineDraftStatus,
} from './lib/offlineDb';
import { AppPortalRole, LoginScreen } from './components/LoginScreen';
import { CustomerPortalView } from './components/CustomerPortalView';
import { ReceptionPortalView } from './components/ReceptionPortalView';
import { StaffPortalView } from './components/StaffPortalView';
import { MalikPortalView } from './components/MalikPortalView';
import { getLocalTodayStr } from './lib/salonUiHelpers';

type AppFlavor = 'ALL' | 'CUSTOMER' | 'SHOP';

function getAppFlavor(): AppFlavor {
  if (typeof window !== 'undefined') {
    const q = (new URLSearchParams(window.location.search).get('flavor') || '').toUpperCase();
    if (q === 'CUSTOMER') return 'CUSTOMER';
    if (q === 'SHOP') return 'SHOP';
  }
  const envFlavor = String(import.meta.env.VITE_APP_FLAVOR || '').toUpperCase();
  if (envFlavor === 'CUSTOMER') return 'CUSTOMER';
  if (envFlavor === 'SHOP') return 'SHOP';
  return 'ALL';
}

function getInitialPortalRole(flavor: AppFlavor): AppPortalRole {
  if (flavor === 'CUSTOMER') return 'CUSTOMER';
  if (typeof window === 'undefined') return flavor === 'SHOP' ? 'MALIK' : 'CUSTOMER';
  const params = new URLSearchParams(window.location.search);
  const p = (params.get('portal') || '').toLowerCase();
  if (p === 'owner' || p === 'malik') return 'MALIK';
  if (p === 'reception') return 'RECEPTION';
  if (p === 'staff') return 'STAFF';
  return flavor === 'SHOP' ? 'MALIK' : 'CUSTOMER';
}

export default function App() {
  const [appFlavor] = useState<AppFlavor>(() => getAppFlavor());
  const [role, setRole] = useState<AppPortalRole>(() => getInitialPortalRole(getAppFlavor()));
  const [showLoginScreen, setShowLoginScreen] = useState<boolean>(false);
  const [loginPhone, setLoginPhone] = useState<string>(
    () => localStorage.getItem('sb_customer_phone') || ''
  );
  const [customerSessionName, setCustomerSessionName] = useState<string>(
    () => localStorage.getItem('sb_customer_name') || ''
  );
  const [lang, setLang] = useState<Language>('en');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [ownerUnlocked, setOwnerUnlocked] = useState<boolean>(false);
  const [receptionUnlocked, setReceptionUnlocked] = useState<boolean>(false);
  const [staffUnlocked, setStaffUnlocked] = useState<boolean>(false);
  const [customerUnlocked, setCustomerUnlocked] = useState<boolean>(false);
  const [loggedInStaffId, setLoggedInStaffId] = useState<string | undefined>(undefined);

  const [data, setData] = useState<SalonBootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [phoneOfflineMode, setPhoneOfflineModeState] = useState<boolean>(() => isPhoneOfflineMode());
  const [, setOfflineDrafts] = useState<OfflineDraftBill[]>([]);

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const seenOwnerNotifIdsRef = useRef<Set<string>>(new Set());
  const ownerNotifInitRef = useRef<boolean>(false);
  const seenStaffBookingIdsRef = useRef<Set<string>>(new Set());
  const staffNotifInitRef = useRef<boolean>(false);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    if (data?.salon.name) {
      document.title = data.salon.name;
      const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appleTitle) appleTitle.setAttribute('content', data.salon.name);
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', data.salon.name);
    }
  }, [data?.salon.name]);

  const loadOfflineDrafts = useCallback(async () => {
    const list = await getAllOfflineDraftBills();
    setOfflineDrafts(list);
  }, []);

  const fetchBootstrapData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/bootstrap');
      if (!res.ok) throw new Error('Failed to load salon database');
      const json = (await res.json()) as SalonBootstrapData;
      setData(json);
      await cacheSalonStateLocally(json);
    } catch {
      const cached = await getCachedSalonState();
      if (cached) {
        setData(cached);
      } else {
        const localRes = await handleLocalApiRequest('/api/bootstrap');
        if (localRes.ok) {
          const localJson = (await localRes.json()) as SalonBootstrapData;
          setData(localJson);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const syncPendingOfflineDrafts = useCallback(async () => {
    if (!navigator.onLine) return;
    const drafts = await getAllOfflineDraftBills();
    if (drafts.length === 0) return;

    let syncedCount = 0;
    for (const draft of drafts) {
      try {
        await updateOfflineDraftStatus(draft.client_sync_id, 'SYNCING');
        const res = await apiFetch('/api/payments/bill', {
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
    if (syncedCount > 0) {
      notify('success', `${syncedCount} offline bill(s) sync ho gaye.`);
    }
  }, [fetchBootstrapData, loadOfflineDrafts, notify]);

  useEffect(() => {
    fetchBootstrapData();
    loadOfflineDrafts();
  }, [fetchBootstrapData, loadOfflineDrafts]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      fetchBootstrapData();
      syncPendingOfflineDrafts();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingOfflineDrafts]);

  useEffect(() => {
    let evtSource: EventSource | null = null;
    if (!phoneOfflineMode) {
      evtSource = new EventSource(apiUrl('/api/events'));
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
    }

    let sbChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      sbChannel = supabase
        .channel('sb-salon-realtime')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          fetchBootstrapData();
        })
        .subscribe();
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchBootstrapData();
      }
    };

    if (!phoneOfflineMode) {
      pollTimer = setInterval(() => {
        fetchBootstrapData();
      }, 12000);
      window.addEventListener('focus', handleVisibilityOrFocus);
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }

    return () => {
      evtSource?.close();
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (sbChannel && supabase) {
        supabase.removeChannel(sbChannel);
      }
    };
  }, [fetchBootstrapData, phoneOfflineMode]);

  // Instant Owner / Reception notification sound on new customer booking or registration
  const ownerNotifications = (data?.notifications || []).filter(
    (n) => n.recipient_role === 'OWNER'
  );
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
        if (
          !n.is_read &&
          (role === 'MALIK' || role === 'RECEPTION') &&
          (ownerUnlocked || receptionUnlocked)
        ) {
          playAlertChime('owner', { repeatCount: 3, vibrate: true });
          notify('success', `${n.title}: ${n.message}`);
          sendNativeNotification(`${data.salon.name} — ${n.title}`, n.message);
        }
      }
    }
  }, [data, ownerNotifications, role, ownerUnlocked, receptionUnlocked, notify]);

  // Instant Staff alert sound + notification when a new booking arrives for their chair
  useEffect(() => {
    if (!data) return;
    const todayStr = getLocalTodayStr();
    const todayWaiting = data.bookings.filter(
      (b) => b.booking_date === todayStr && b.status === 'WAITING'
    );
    if (!staffNotifInitRef.current) {
      todayWaiting.forEach((b) => seenStaffBookingIdsRef.current.add(b.id));
      staffNotifInitRef.current = true;
      return;
    }
    for (const b of todayWaiting) {
      if (!seenStaffBookingIdsRef.current.has(b.id)) {
        seenStaffBookingIdsRef.current.add(b.id);
        const matchesStaff = ownerUnlocked || !loggedInStaffId || b.barber_id === loggedInStaffId;
        if (role === 'STAFF' && (staffUnlocked || ownerUnlocked) && matchesStaff) {
          const msg = `Token #${b.token_number} · ${b.customer_name} (${b.services?.map((s) => s.service_name).join(' + ') || 'Service'})`;
          playAlertChime('owner', { repeatCount: 3, vibrate: true });
          notify('success', `Nayi Booking: ${msg}`);
          sendNativeNotification(`${data.salon.name} — Nayi Booking!`, msg);
        }
      }
    }
  }, [data, role, staffUnlocked, ownerUnlocked, loggedInStaffId, notify]);

  const handleSaveOfflineDraft = async (draft: OfflineDraftBill) => {
    await saveOfflineDraftBill(draft);
    await loadOfflineDrafts();
  };

  const handleSwitchRole = (targetRole: AppPortalRole) => {
    if (appFlavor === 'CUSTOMER' && targetRole !== 'CUSTOMER') return;
    if (appFlavor === 'SHOP' && targetRole === 'CUSTOMER') return;
    if (targetRole === 'MALIK' && !ownerUnlocked) {
      setRole('MALIK');
      setShowLoginScreen(true);
      return;
    }
    if (targetRole === 'RECEPTION' && !receptionUnlocked && !ownerUnlocked) {
      setRole('RECEPTION');
      setShowLoginScreen(true);
      return;
    }
    if (targetRole === 'STAFF' && !staffUnlocked && !ownerUnlocked) {
      setRole('STAFF');
      setShowLoginScreen(true);
      return;
    }
    setRole(targetRole);
  };

  const handleLogout = useCallback(async () => {
    setAuthToken(null);
    setOwnerUnlocked(false);
    setReceptionUnlocked(false);
    setStaffUnlocked(false);
    setCustomerUnlocked(false);
    setLoggedInStaffId(undefined);
    await fetchBootstrapData();
    if (appFlavor === 'SHOP') {
      setRole('MALIK');
      setShowLoginScreen(false);
      notify('success', 'Logged out — Login screen active');
    } else {
      setRole('CUSTOMER');
      setShowLoginScreen(false);
      notify('success', 'Logged out safely');
    }
  }, [appFlavor, fetchBootstrapData, notify]);

  const needsAuthGate =
    showLoginScreen ||
    Boolean(data?.needsOwnerSetup && (role !== 'CUSTOMER' || appFlavor === 'SHOP')) ||
    (appFlavor !== 'CUSTOMER' &&
      ((role === 'MALIK' && !ownerUnlocked) ||
        (role === 'RECEPTION' && !receptionUnlocked && !ownerUnlocked) ||
        (role === 'STAFF' && !staffUnlocked && !ownerUnlocked)));

  const allowedLoginRoles: AppPortalRole[] | undefined =
    appFlavor === 'CUSTOMER'
      ? ['CUSTOMER']
      : appFlavor === 'SHOP'
      ? ['RECEPTION', 'STAFF', 'MALIK']
      : undefined;

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 text-[#141028] dark:text-slate-100">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-5 right-4 left-4 md:left-auto md:max-w-md z-50 rounded-2xl border shadow-xl px-4 py-3 flex items-center justify-between gap-3 bg-[#141028] text-white border-purple-500/30">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                toast.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
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

      {loading || !data ? (
        <div className="min-h-screen flex items-center justify-center p-10">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-3 border-[#6C3BF5] border-t-transparent animate-spin mx-auto" />
            <div className="text-sm font-bold text-slate-500">
              Loading...
            </div>
          </div>
        </div>
      ) : needsAuthGate ? (
        <LoginScreen
          salonName={data.salon.name}
          needsOwnerSetup={Boolean(data.needsOwnerSetup)}
          hideAdminRoles={Boolean(data.settings.hide_staff_login)}
          allowedRoles={allowedLoginRoles}
          initialRole={role}
          initialPhone={loginPhone}
          onClose={
            showLoginScreen
              ? () => {
                  setShowLoginScreen(false);
                }
              : undefined
          }
          onSuccess={async (selectedRole, enteredPhone, matchedStaffId, token, displayName) => {
            if (enteredPhone) setLoginPhone(enteredPhone);
            setAuthToken(token || null);
            void requestNotificationPermission();

            if (selectedRole === 'MALIK') {
              setOwnerUnlocked(true);
              setReceptionUnlocked(false);
              setStaffUnlocked(false);
              setCustomerUnlocked(false);
              setLoggedInStaffId(undefined);
            } else if (selectedRole === 'RECEPTION') {
              setOwnerUnlocked(false);
              setReceptionUnlocked(true);
              setStaffUnlocked(false);
              setCustomerUnlocked(false);
              setLoggedInStaffId(undefined);
            } else if (selectedRole === 'STAFF') {
              setOwnerUnlocked(false);
              setReceptionUnlocked(false);
              setStaffUnlocked(true);
              setCustomerUnlocked(false);
              setLoggedInStaffId(matchedStaffId);
            } else {
              setOwnerUnlocked(false);
              setReceptionUnlocked(false);
              setStaffUnlocked(false);
              setCustomerUnlocked(Boolean(token));
              setLoggedInStaffId(undefined);
              if (enteredPhone) localStorage.setItem('sb_customer_phone', enteredPhone);
              if (displayName) {
                setCustomerSessionName(displayName);
                localStorage.setItem('sb_customer_name', displayName);
              }
            }

            setRole(selectedRole);
            setShowLoginScreen(false);
            await fetchBootstrapData();
            notify('success', `${selectedRole} login successful!`);
          }}
        />
      ) : role === 'CUSTOMER' || appFlavor === 'CUSTOMER' ? (
        <CustomerPortalView
          data={data}
          lang={lang}
          setLang={setLang}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          initialPhone={loginPhone}
          initialName={customerSessionName}
          isCustomerApk={appFlavor === 'CUSTOMER'}
          isCustomerLoggedIn={customerUnlocked}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onOpenLogin={() => {
            setRole('CUSTOMER');
            setShowLoginScreen(true);
          }}
          onLogout={customerUnlocked ? handleLogout : undefined}
        />
      ) : role === 'RECEPTION' ? (
        <ReceptionPortalView
          data={data}
          isOnline={isOnline}
          isShopApk={appFlavor === 'SHOP'}
          canSwitchToOwner={ownerUnlocked}
          onSaveOfflineDraft={handleSaveOfflineDraft}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onSwitchRole={handleSwitchRole}
          onOpenLogin={() => setShowLoginScreen(true)}
          onLogout={handleLogout}
        />
      ) : role === 'STAFF' ? (
        <StaffPortalView
          data={data}
          lockedStaffId={ownerUnlocked ? undefined : loggedInStaffId}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onOpenLogin={() => setShowLoginScreen(true)}
          onLogout={handleLogout}
        />
      ) : (
        <MalikPortalView
          data={data}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onSwitchRole={handleSwitchRole}
          onOpenLogin={() => setShowLoginScreen(true)}
          onLogout={handleLogout}
          onServerUrlUpdated={async () => {
            setPhoneOfflineModeState(isPhoneOfflineMode());
            await fetchBootstrapData();
          }}
        />
      )}
    </div>
  );
}
