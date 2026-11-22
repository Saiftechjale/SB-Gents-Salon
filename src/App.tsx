import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, WifiOff, X } from 'lucide-react';
import type { OfflineDraftBill, SalonBootstrapData } from './types/salon';
import { Language } from './lib/i18n';
import { playAlertChime, sendNativeNotification } from './lib/alerts';
import {
  apiFetch,
  apiUrl,
  getApiBaseUrl,
  isPhoneOfflineMode,
  setApiBaseUrl,
  setPhoneOfflineMode,
} from './lib/api';
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

function getInitialPortalRole(): AppPortalRole {
  if (typeof window === 'undefined') return 'CUSTOMER';
  const params = new URLSearchParams(window.location.search);
  const p = (params.get('portal') || '').toLowerCase();
  if (p === 'owner' || p === 'malik') return 'MALIK';
  if (p === 'reception') return 'RECEPTION';
  if (p === 'staff') return 'STAFF';
  return 'CUSTOMER';
}

export default function App() {
  const [role, setRole] = useState<AppPortalRole>(getInitialPortalRole);
  const [showLoginScreen, setShowLoginScreen] = useState<boolean>(false);
  const [loginPhone, setLoginPhone] = useState<string>(
    () => localStorage.getItem('sb_customer_phone') || ''
  );
  const [lang, setLang] = useState<Language>('en');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [ownerUnlocked, setOwnerUnlocked] = useState<boolean>(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sb_owner_auth') === '1'
  );
  const [staffUnlocked, setStaffUnlocked] = useState<boolean>(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sb_staff_auth') === '1'
  );

  const [data, setData] = useState<SalonBootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string>('');
  const [serverUrlInput, setServerUrlInput] = useState<string>(() => getApiBaseUrl());
  const [phoneOfflineMode, setPhoneOfflineModeState] = useState<boolean>(() => isPhoneOfflineMode());
  const [, setOfflineDrafts] = useState<OfflineDraftBill[]>([]);

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const seenOwnerNotifIdsRef = useRef<Set<string>>(new Set());
  const ownerNotifInitRef = useRef<boolean>(false);

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
      setConnectionError('');
      await cacheSalonStateLocally(json);
    } catch (err) {
      const cached = await getCachedSalonState();
      if (cached) {
        setData(cached);
        setConnectionError('');
      } else {
        setConnectionError(
          err instanceof Error ? err.message : 'Unable to connect to Salon Server'
        );
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

    return () => {
      evtSource?.close();
      if (sbChannel && supabase) {
        supabase.removeChannel(sbChannel);
      }
    };
  }, [fetchBootstrapData, phoneOfflineMode]);

  // Instant Owner / Reception notification sound on new customer booking
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
        if (!n.is_read && (role === 'MALIK' || role === 'RECEPTION') && ownerUnlocked) {
          playAlertChime('owner');
          notify('success', `${n.title}: ${n.message}`);
          sendNativeNotification(`${data.salon.name} — ${n.title}`, n.message);
        }
      }
    }
  }, [data, ownerNotifications, role, ownerUnlocked, notify]);

  const handleSaveOfflineDraft = async (draft: OfflineDraftBill) => {
    await saveOfflineDraftBill(draft);
    await loadOfflineDrafts();
  };

  const handleSwitchRole = (targetRole: AppPortalRole) => {
    if ((targetRole === 'MALIK' || targetRole === 'RECEPTION') && !ownerUnlocked) {
      setRole(targetRole);
      setShowLoginScreen(true);
      return;
    }
    if (targetRole === 'STAFF' && !staffUnlocked) {
      setRole(targetRole);
      setShowLoginScreen(true);
      return;
    }
    setRole(targetRole);
  };

  const needsAuthGate =
    showLoginScreen ||
    ((role === 'MALIK' || role === 'RECEPTION') && !ownerUnlocked) ||
    (role === 'STAFF' && !staffUnlocked);

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

      {loading ? (
        <div className="min-h-screen flex items-center justify-center p-10">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-3 border-[#6C3BF5] border-t-transparent animate-spin mx-auto" />
            <div className="text-sm font-bold text-slate-500">
              लोड हो रहा है... (Loading Salon...)
            </div>
          </div>
        </div>
      ) : !data ? (
        <main className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md sb-card p-6 space-y-5">
            <div className="space-y-1.5 text-center">
              <div className="w-12 h-12 rounded-2xl sb-gradient flex items-center justify-center text-white mx-auto shadow-lg shadow-purple-500/20">
                <WifiOff className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-extrabold text-[#141028] dark:text-white">
                सर्वर से कनेक्ट नहीं हुआ
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                इस APK के अंदर लाइव सर्वर लिंक नहीं जुड़ा है। लाइव बुकिंग के लिए नीचे अपना{' '}
                <b>Website / Server Link</b> डालें, या अभी फोन में <b>Offline Mode</b> खोलें।
              </p>
              {connectionError && (
                <p className="text-[11px] font-mono text-rose-500 break-words">
                  {connectionError}
                </p>
              )}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPhoneOfflineMode(false);
                setPhoneOfflineModeState(false);
                setApiBaseUrl(serverUrlInput);
                setLoading(true);
                await fetchBootstrapData();
              }}
              className="space-y-2.5"
            >
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Live Website / Server URL (Optional)
              </label>
              <input
                type="url"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="https://your-salon-server.com"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F8F7FC] dark:bg-slate-950 px-3.5 py-3 text-sm"
              />
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#141028] text-white font-bold text-sm hover:opacity-90"
              >
                लाइव सर्वर से जोड़ें (Connect Server)
              </button>
            </form>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="shrink mx-3 text-[11px] font-bold text-slate-400">या / OR</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={async () => {
                  setPhoneOfflineMode(true);
                  setPhoneOfflineModeState(true);
                  setLoading(true);
                  await fetchBootstrapData();
                }}
                className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm shadow-lg shadow-purple-500/20"
              >
                अभी फोन में ऐप खोलें (Offline Phone Mode)
              </button>
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  await fetchBootstrapData();
                }}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                दोबारा कोशिश करें (Retry)
              </button>
            </div>
          </div>
        </main>
      ) : needsAuthGate ? (
        <LoginScreen
          salonName={data.salon.name}
          initialRole={role}
          initialPhone={loginPhone}
          onClose={
            showLoginScreen
              ? () => {
                  setShowLoginScreen(false);
                }
              : undefined
          }
          onSuccess={(selectedRole, enteredPhone) => {
            if (enteredPhone) setLoginPhone(enteredPhone);
            if (selectedRole === 'MALIK' || selectedRole === 'RECEPTION') {
              setOwnerUnlocked(true);
            } else if (selectedRole === 'STAFF') {
              setStaffUnlocked(true);
            }
            setRole(selectedRole);
            setShowLoginScreen(false);
            notify('success', `${selectedRole} screen unlocked!`);
          }}
        />
      ) : role === 'CUSTOMER' ? (
        <CustomerPortalView
          data={data}
          lang={lang}
          setLang={setLang}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          initialPhone={loginPhone}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onOpenLogin={() => setShowLoginScreen(true)}
        />
      ) : role === 'RECEPTION' ? (
        <ReceptionPortalView
          data={data}
          isOnline={isOnline}
          onSaveOfflineDraft={handleSaveOfflineDraft}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onSwitchRole={handleSwitchRole}
          onOpenLogin={() => setShowLoginScreen(true)}
        />
      ) : role === 'STAFF' ? (
        <StaffPortalView
          data={data}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onOpenLogin={() => setShowLoginScreen(true)}
        />
      ) : (
        <MalikPortalView
          data={data}
          onRefresh={fetchBootstrapData}
          notify={notify}
          onSwitchRole={handleSwitchRole}
          onOpenLogin={() => setShowLoginScreen(true)}
          onSwitchServerConfig={() => {
            setPhoneOfflineMode(false);
            setPhoneOfflineModeState(false);
            setData(null);
            setLoading(false);
          }}
        />
      )}
    </div>
  );
}
