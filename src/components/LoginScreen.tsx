import React, { useRef, useState } from 'react';
import { ArrowRight, Lock, Scissors, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

export type AppPortalRole = 'CUSTOMER' | 'RECEPTION' | 'STAFF' | 'MALIK';

interface LoginScreenProps {
  salonName: string;
  hideAdminRoles?: boolean;
  allowedRoles?: AppPortalRole[];
  initialRole?: AppPortalRole;
  initialPhone?: string;
  onSuccess: (role: AppPortalRole, phone?: string, staffId?: string, token?: string) => void;
  onClose?: () => void;
}

const ALL_PORTAL_ROLES: { id: AppPortalRole; label: string }[] = [
  { id: 'CUSTOMER', label: 'Customer' },
  { id: 'RECEPTION', label: 'Reception' },
  { id: 'STAFF', label: 'Staff' },
  { id: 'MALIK', label: 'Malik' },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({
  salonName,
  hideAdminRoles = false,
  allowedRoles,
  initialRole = 'CUSTOMER',
  initialPhone = '',
  onSuccess,
  onClose,
}) => {
  const isStrictCustomerOnly =
    Boolean(allowedRoles && allowedRoles.length === 1 && allowedRoles[0] === 'CUSTOMER');

  const safeInitialRole: AppPortalRole =
    allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(initialRole)
      ? allowedRoles[0]
      : initialRole;

  const [selectedRole, setSelectedRole] = useState<AppPortalRole>(safeInitialRole);
  const [phone, setPhone] = useState<string>(initialPhone);
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [logoTapCount, setLogoTapCount] = useState<number>(0);
  const [adminUnlockedInModal, setAdminUnlockedInModal] = useState<boolean>(
    () => !isStrictCustomerOnly && (!hideAdminRoles || safeInitialRole !== 'CUSTOMER')
  );
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleLogoTap = () => {
    if (isStrictCustomerOnly || adminUnlockedInModal) return;
    const next = logoTapCount + 1;
    setLogoTapCount(next);
    if (next >= 5) {
      setAdminUnlockedInModal(true);
      setLogoTapCount(0);
    }
  };

  const handleDigitChange = (idx: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 4).split('');
      const next = [...digits];
      chars.forEach((c, i) => {
        if (idx + i < 4) next[idx + i] = c;
      });
      setDigits(next);
      const focusIdx = Math.min(3, idx + chars.length);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    if (idx < 3) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const code = digits.join('');

    if (selectedRole === 'CUSTOMER') {
      if (cleanPhone && cleanPhone.length < 10) {
        setError('10 अंकों का सही मोबाइल नंबर डालें');
        return;
      }
      if (cleanPhone) {
        localStorage.setItem('sb_customer_phone', cleanPhone);
      }
      onSuccess('CUSTOMER', cleanPhone || undefined);
      return;
    }

    if (cleanPhone.length !== 10) {
      setError('अपना रजिस्टर्ड 10-अंकों का मोबाइल नंबर डालें');
      return;
    }

    if (code.length < 4) {
      setError('4 अंकों का Secret PIN डालें');
      return;
    }

    setSubmitting(true);
    try {
      const apiRole = selectedRole === 'STAFF' ? 'STAFF' : 'OWNER';
      const res = await apiFetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: apiRole, phone: cleanPhone, pin: code }),
      });
      const json = await res.json();
      if (!res.ok || !json.verified) {
        setError(json.error || 'रजिस्टर्ड मोबाइल नंबर या PIN गलत है');
        return;
      }
      onSuccess(selectedRole, cleanPhone, json.staffId, json.token);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const roles: { id: AppPortalRole; label: string }[] = isStrictCustomerOnly
    ? [{ id: 'CUSTOMER', label: 'Customer' }]
    : allowedRoles && allowedRoles.length > 0
    ? ALL_PORTAL_ROLES.filter((r) => allowedRoles.includes(r.id))
    : adminUnlockedInModal
    ? ALL_PORTAL_ROLES
    : [{ id: 'CUSTOMER', label: 'Customer' }];

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 flex flex-col items-center justify-center p-5 relative">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <button
            type="button"
            onClick={handleLogoTap}
            className="w-20 h-20 rounded-3xl sb-gradient flex items-center justify-center mx-auto shadow-xl shadow-purple-500/25 focus:outline-none active:scale-95 transition-transform"
            aria-label={salonName}
          >
            <Scissors className="w-10 h-10 text-white" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#141028] dark:text-white">
              {salonName}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Login karein
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {selectedRole === 'CUSTOMER' ? 'MOBILE NUMBER' : 'REGISTERED MOBILE NUMBER'}
          </label>
          <div className="sb-card flex items-center gap-2 px-4 py-3.5">
            <span className="text-base font-bold text-slate-500">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXX XX210"
              className="w-full bg-transparent text-base font-bold text-[#141028] dark:text-white focus:outline-none tabular-nums"
            />
          </div>
        </div>

        {selectedRole !== 'CUSTOMER' && (
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <Lock className="w-3 h-3 text-[#6C3BF5]" />
              <span>SECRET PIN</span>
            </label>
            <div className="grid grid-cols-4 gap-3">
              {digits.map((d, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={d}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  placeholder="•"
                  className="h-14 rounded-2xl bg-white dark:bg-slate-900 border-2 border-[#6C3BF5]/25 focus:border-[#6C3BF5] text-center text-2xl font-extrabold text-[#141028] dark:text-white shadow-sm focus:outline-none transition-colors tabular-nums"
                />
              ))}
            </div>
          </div>
        )}

        {roles.length > 1 && (
          <div className="space-y-2">
            <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              AAP KAUN HO?
            </label>
            <div className={`grid gap-2 ${roles.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
              {roles.map((r) => {
                const active = selectedRole === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(r.id);
                      setDigits(['', '', '', '']);
                      setError('');
                    }}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all min-h-[42px] whitespace-nowrap ${
                      active
                        ? 'bg-[#6C3BF5] text-white shadow-md shadow-purple-500/25'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-[#6C3BF5]/50'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-300 text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 rounded-2xl sb-gradient text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 active:scale-[0.99] transition-transform disabled:opacity-60 min-h-[52px]"
        >
          <span>{submitting ? 'Loading...' : 'Login'}</span>
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {selectedRole === 'CUSTOMER'
            ? 'Slot book aur live number dekhne ke liye'
            : 'Registered number aur Secret PIN zaroori hai'}
        </p>
      </form>
    </div>
  );
};
