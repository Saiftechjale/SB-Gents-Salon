import React, { useRef, useState } from 'react';
import { ArrowRight, Scissors, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

export type AppPortalRole = 'CUSTOMER' | 'RECEPTION' | 'STAFF' | 'MALIK';

interface LoginScreenProps {
  salonName: string;
  initialRole?: AppPortalRole;
  initialPhone?: string;
  onSuccess: (role: AppPortalRole, phone?: string) => void;
  onClose?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  salonName,
  initialRole = 'CUSTOMER',
  initialPhone = '',
  onSuccess,
  onClose,
}) => {
  const [selectedRole, setSelectedRole] = useState<AppPortalRole>(initialRole);
  const [phone, setPhone] = useState<string>(initialPhone);
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

    if (code.length < 4) {
      setError('कृपया 4 अंकों का PIN डालें (Owner/Reception: 1234, Staff: 0000)');
      return;
    }

    setSubmitting(true);
    try {
      const apiRole = selectedRole === 'STAFF' ? 'STAFF' : 'OWNER';
      const res = await apiFetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: apiRole, pin: code }),
      });
      const json = await res.json();
      if (!res.ok || !json.verified) {
        setError(json.error || 'गलत PIN — कृपया फिर से जांचें');
        return;
      }
      if (selectedRole === 'STAFF') {
        sessionStorage.setItem('sb_staff_auth', '1');
      } else {
        sessionStorage.setItem('sb_owner_auth', '1');
      }
      onSuccess(selectedRole, cleanPhone || undefined);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const roles: { id: AppPortalRole; label: string }[] = [
    { id: 'CUSTOMER', label: 'Customer' },
    { id: 'RECEPTION', label: 'Reception' },
    { id: 'STAFF', label: 'Staff' },
    { id: 'MALIK', label: 'Malik' },
  ];

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
          <div className="w-20 h-20 rounded-3xl sb-gradient flex items-center justify-center mx-auto shadow-xl shadow-purple-500/25">
            <Scissors className="w-10 h-10 text-white" />
          </div>
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
            MOBILE NUMBER
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              {selectedRole === 'CUSTOMER' ? 'OTP (Optional)' : '4-DIGIT PIN'}
            </label>
            <span className="text-[11px] font-medium text-slate-400">
              {selectedRole === 'CUSTOMER'
                ? 'Customer direct login'
                : selectedRole === 'STAFF'
                ? 'Staff PIN'
                : 'Owner / Reception PIN'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type={selectedRole === 'CUSTOMER' ? 'text' : 'password'}
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

        <div className="space-y-2">
          <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            AAP KAUN HO?
          </label>
          <div className="grid grid-cols-4 gap-2">
            {roles.map((r) => {
              const active = selectedRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRole(r.id);
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
          <span>{submitting ? 'Checking...' : 'Login'}</span>
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Har kisi ko sirf apna kaam dikhega
        </p>
      </form>
    </div>
  );
};
