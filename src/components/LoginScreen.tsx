import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Scissors,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  INDIAN_MOBILE_REGEX,
  isWeakPin,
  PIN_REGEX,
  WEAK_PIN_MSG,
} from '../lib/pinSecurity';

export type AppPortalRole = 'CUSTOMER' | 'RECEPTION' | 'STAFF' | 'MALIK';

interface LoginScreenProps {
  salonName: string;
  needsOwnerSetup?: boolean;
  hideAdminRoles?: boolean;
  allowedRoles?: AppPortalRole[];
  initialRole?: AppPortalRole;
  initialPhone?: string;
  onSuccess: (
    role: AppPortalRole,
    phone?: string,
    staffId?: string,
    token?: string,
    displayName?: string
  ) => void;
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
  needsOwnerSetup = false,
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
  const [customerMode, setCustomerMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const [ownerForgotMode, setOwnerForgotMode] = useState<boolean>(false);

  const [phone, setPhone] = useState<string>(() =>
    initialPhone.replace(/\D/g, '').slice(-10)
  );
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);

  // Customer registration & forgot PIN fields
  const [customerName, setCustomerName] = useState<string>('');
  const [custResetCode, setCustResetCode] = useState<string>('');

  // First-time Malik setup & recovery fields
  const [setupSalonName, setSetupSalonName] = useState<string>(salonName || 'My Salon');
  const [setupOwnerName, setSetupOwnerName] = useState<string>('');
  const [ownerRecoveryCodeInput, setOwnerRecoveryCodeInput] = useState<string>('');
  const [pendingRecoveryModal, setPendingRecoveryModal] = useState<{
    code: string;
    phone: string;
    token?: string;
    displayName?: string;
    isFirstSetup: boolean;
  } | null>(null);
  const [copiedRecovery, setCopiedRecovery] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [logoTapCount, setLogoTapCount] = useState<number>(0);
  const [adminUnlockedInModal, setAdminUnlockedInModal] = useState<boolean>(
    () => !isStrictCustomerOnly && (!hideAdminRoles || safeInitialRole !== 'CUSTOMER')
  );

  const isOwnerSetupView = needsOwnerSetup && selectedRole === 'MALIK';

  const handleLogoTap = () => {
    if (isStrictCustomerOnly || adminUnlockedInModal) return;
    const next = logoTapCount + 1;
    setLogoTapCount(next);
    if (next >= 5) {
      setAdminUnlockedInModal(true);
      setLogoTapCount(0);
    }
  };

  const handleCopyRecoveryCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedRecovery(true);
      setTimeout(() => setCopiedRecovery(false), 2000);
    } catch {
      // Fallback ignored if clipboard unavailable
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const cleanPin = pin.trim();

    // 1. First-Time Commercial Owner Setup
    if (isOwnerSetupView) {
      if (setupSalonName.trim().length < 2 || setupOwnerName.trim().length < 2) {
        setError('Salon ka naam aur Malik ka naam daalein');
        return;
      }
      if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
        setError('Apna real 10-digit Indian mobile number (6-9 se shuru) daalein');
        return;
      }
      if (!PIN_REGEX.test(cleanPin)) {
        setError('4 se 6 digit ka Secret PIN banayein');
        return;
      }
      if (isWeakPin(cleanPin)) {
        setError(WEAK_PIN_MSG);
        return;
      }

      setSubmitting(true);
      try {
        const res = await apiFetch('/api/auth/setup-owner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salonName: setupSalonName.trim(),
            ownerName: setupOwnerName.trim(),
            phone: cleanPhone,
            pin: cleanPin,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.verified) {
          setError(json.error || 'Owner setup nahi ho paya');
          return;
        }
        if (json.recoveryCode) {
          setPendingRecoveryModal({
            code: json.recoveryCode,
            phone: cleanPhone,
            token: json.token,
            displayName: setupOwnerName.trim(),
            isFirstSetup: true,
          });
          return;
        }
        onSuccess('MALIK', cleanPhone, undefined, json.token, setupOwnerName.trim());
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 1B. Malik Forgot PIN / Mobile via Master Recovery Code
    if (selectedRole === 'MALIK' && ownerForgotMode) {
      const cleanRecovery = ownerRecoveryCodeInput.trim().toUpperCase();
      if (cleanRecovery.length < 6) {
        setError('Apna Master Recovery Code (e.g. SB-XXXX-YYYY) daalein');
        return;
      }
      if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
        setError('Apna naya ya registered 10-digit Indian mobile number daalein');
        return;
      }
      if (!PIN_REGEX.test(cleanPin)) {
        setError('Naya 4 se 6 digit Secret PIN daalein');
        return;
      }
      if (isWeakPin(cleanPin)) {
        setError(WEAK_PIN_MSG);
        return;
      }

      setSubmitting(true);
      try {
        const res = await apiFetch('/api/auth/owner/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recoveryCode: cleanRecovery,
            phone: cleanPhone,
            newPin: cleanPin,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.verified) {
          setError(json.error || 'Recovery nahi ho payi');
          return;
        }
        if (json.newRecoveryCode) {
          setPendingRecoveryModal({
            code: json.newRecoveryCode,
            phone: cleanPhone,
            token: json.token,
            isFirstSetup: false,
          });
          return;
        }
        onSuccess('MALIK', cleanPhone, undefined, json.token);
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 2. Customer Real Mobile + PIN Login / Registration / Forgot PIN
    if (selectedRole === 'CUSTOMER') {
      if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
        setError('Apna real 10-digit mobile number (6-9 se shuru) daalein');
        return;
      }
      if (!PIN_REGEX.test(cleanPin)) {
        setError('4 se 6 digit ka Secret PIN daalein');
        return;
      }

      if (customerMode === 'FORGOT') {
        const cleanResetCode = custResetCode.trim();
        if (!/^\d{6}$/.test(cleanResetCode)) {
          setError('Salon Malik se mila 6-digit Reset Code daalein');
          return;
        }
        if (isWeakPin(cleanPin)) {
          setError(WEAK_PIN_MSG);
          return;
        }

        setSubmitting(true);
        try {
          const res = await apiFetch('/api/auth/customer/forgot-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: cleanPhone,
              resetCode: cleanResetCode,
              newPin: cleanPin,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.verified) {
            setError(json.error || 'PIN reset nahi ho paya');
            return;
          }
          onSuccess(
            'CUSTOMER',
            cleanPhone,
            undefined,
            json.token,
            json.customer?.name
          );
        } catch (err) {
          setError(String(err));
        } finally {
          setSubmitting(false);
        }
        return;
      }

      if (customerMode === 'REGISTER') {
        const cleanName = customerName.trim();
        if (cleanName.length < 2) {
          setError('Apna naam daalein (kam se kam 2 akshar)');
          return;
        }
        if (isWeakPin(cleanPin)) {
          setError(WEAK_PIN_MSG);
          return;
        }

        setSubmitting(true);
        try {
          const res = await apiFetch('/api/auth/customer/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: cleanName,
              phone: cleanPhone,
              pin: cleanPin,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.verified) {
            setError(json.error || 'Account nahi ban paya');
            return;
          }
          onSuccess(
            'CUSTOMER',
            cleanPhone,
            undefined,
            json.token,
            json.customer?.name || cleanName
          );
        } catch (err) {
          setError(String(err));
        } finally {
          setSubmitting(false);
        }
        return;
      }

      // Customer LOGIN
      setSubmitting(true);
      try {
        const res = await apiFetch('/api/auth/customer/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            pin: cleanPin,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.verified) {
          if (json.needsRegister) {
            setCustomerMode('REGISTER');
          }
          setError(json.error || 'Mobile number ya PIN galat hai');
          return;
        }
        onSuccess(
          'CUSTOMER',
          cleanPhone,
          undefined,
          json.token,
          json.customer?.name
        );
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 3. Strictly Separated Staff / Reception / Malik Verification
    if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
      setError('Apna registered 10-digit mobile number daalein');
      return;
    }
    if (!PIN_REGEX.test(cleanPin)) {
      setError('4 se 6 digit ka Secret PIN daalein');
      return;
    }

    setSubmitting(true);
    try {
      const apiRole =
        selectedRole === 'STAFF'
          ? 'STAFF'
          : selectedRole === 'RECEPTION'
          ? 'RECEPTION'
          : 'OWNER';
      const res = await apiFetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: apiRole, phone: cleanPhone, pin: cleanPin }),
      });
      const json = await res.json();
      if (!res.ok || !json.verified) {
        setError(json.error || 'Registered mobile number ya PIN galat hai');
        return;
      }
      onSuccess(
        selectedRole,
        cleanPhone,
        json.staffId,
        json.token,
        json.staffName || json.receptionName
      );
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

  // Master Recovery Code One-Time Reveal View
  if (pendingRecoveryModal) {
    return (
      <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-sm sb-card p-6 space-y-5 text-center">
          <div className="w-16 h-16 rounded-3xl sb-gradient flex items-center justify-center mx-auto shadow-lg shadow-purple-500/25">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-extrabold text-[#141028] dark:text-white">
              {pendingRecoveryModal.isFirstSetup
                ? 'Malik Master Recovery Code'
                : 'Naya Master Recovery Code'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Is code ko safe diary ya phone notes me likh lein. Agar kabhi Malik apna mobile number ya PIN bhool jayein, to isi code se account recover hoga.
            </p>
          </div>

          <div className="rounded-2xl bg-[#F3EFFF] dark:bg-slate-900 border border-[#6C3BF5]/30 p-4 space-y-2.5">
            <div className="text-2xl font-extrabold tracking-widest text-[#6C3BF5] dark:text-purple-300 tabular-nums select-all">
              {pendingRecoveryModal.code}
            </div>
            <button
              type="button"
              onClick={() => handleCopyRecoveryCode(pendingRecoveryModal.code)}
              className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-extrabold text-[#141028] dark:text-white flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              {copiedRecovery ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#6C3BF5]" />}
              <span>{copiedRecovery ? 'Copy Ho Gaya ✓' : 'Recovery Code Copy Karein'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const info = pendingRecoveryModal;
              setPendingRecoveryModal(null);
              onSuccess('MALIK', info.phone, undefined, info.token, info.displayName);
            }}
            className="w-full py-3.5 rounded-2xl sb-gradient text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 min-h-[48px]"
          >
            <span>Maine Save Kar Liya · Dashboard Kholein</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FC] dark:bg-slate-950 flex flex-col items-center justify-center p-5 relative">
      {onClose && !needsOwnerSetup && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2.5">
          <button
            type="button"
            onClick={handleLogoTap}
            className="w-18 h-18 rounded-3xl sb-gradient flex items-center justify-center mx-auto shadow-xl shadow-purple-500/25 focus:outline-none active:scale-95 transition-transform"
            aria-label={salonName}
          >
            {isOwnerSetupView || ownerForgotMode ? (
              <ShieldCheck className="w-9 h-9 text-white" />
            ) : (
              <Scissors className="w-9 h-9 text-white" />
            )}
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#141028] dark:text-white">
              {isOwnerSetupView
                ? 'Malik Account Setup'
                : selectedRole === 'MALIK' && ownerForgotMode
                ? 'Malik Account Recovery'
                : salonName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isOwnerSetupView
                ? 'Pehli baar app setup karein — apna real number aur PIN banayein'
                : selectedRole === 'MALIK' && ownerForgotMode
                ? 'Master Recovery Code se naya mobile & PIN set karein'
                : selectedRole === 'CUSTOMER'
                ? customerMode === 'REGISTER'
                  ? 'Naya Customer Account banayein'
                  : customerMode === 'FORGOT'
                  ? 'Reset Code se naya Customer PIN banayein'
                  : 'Apne mobile aur PIN se login karein'
                : `${selectedRole} Portal Login`}
            </p>
          </div>
        </div>

        {/* Customer Login / Register Segmented Toggle */}
        {selectedRole === 'CUSTOMER' && !isOwnerSetupView && (
          <div className="grid grid-cols-2 gap-1 bg-slate-200/75 dark:bg-slate-900 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setCustomerMode('LOGIN');
                setError('');
              }}
              className={`py-2.5 rounded-xl text-xs font-extrabold transition-all min-h-[44px] whitespace-nowrap ${
                customerMode === 'LOGIN' || customerMode === 'FORGOT'
                  ? 'bg-white dark:bg-slate-800 text-[#141028] dark:text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              Login Karein
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomerMode('REGISTER');
                setError('');
              }}
              className={`py-2.5 rounded-xl text-xs font-extrabold transition-all min-h-[44px] whitespace-nowrap ${
                customerMode === 'REGISTER'
                  ? 'bg-white dark:bg-slate-800 text-[#141028] dark:text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              Naya Account
            </button>
          </div>
        )}

        {/* First-time Owner Setup Fields */}
        {isOwnerSetupView && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                SALON KA NAAM
              </label>
              <input
                type="text"
                required
                value={setupSalonName}
                onChange={(e) => setSetupSalonName(e.target.value)}
                placeholder="e.g. Royal Gents Salon"
                className="sb-card w-full px-4 py-3 text-sm font-bold text-[#141028] dark:text-white focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                MALIK KA NAAM
              </label>
              <input
                type="text"
                required
                value={setupOwnerName}
                onChange={(e) => setSetupOwnerName(e.target.value)}
                placeholder="Aapka poora naam"
                className="sb-card w-full px-4 py-3 text-sm font-bold text-[#141028] dark:text-white focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Malik Master Recovery Code Input */}
        {selectedRole === 'MALIK' && ownerForgotMode && !isOwnerSetupView && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <KeyRound className="w-3 h-3 text-[#6C3BF5]" />
              <span>MASTER RECOVERY CODE</span>
            </label>
            <input
              type="text"
              required
              value={ownerRecoveryCodeInput}
              onChange={(e) => setOwnerRecoveryCodeInput(e.target.value.toUpperCase())}
              placeholder="SB-XXXX-YYYY"
              className="sb-card w-full px-4 py-3.5 text-base font-extrabold tracking-widest text-[#141028] dark:text-white uppercase focus:outline-none"
            />
          </div>
        )}

        {/* Customer Registration Name */}
        {selectedRole === 'CUSTOMER' && customerMode === 'REGISTER' && !isOwnerSetupView && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <User className="w-3 h-3 text-[#6C3BF5]" />
              <span>AAPKA NAAM</span>
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Apna naam likhein"
              className="sb-card w-full px-4 py-3.5 text-base font-bold text-[#141028] dark:text-white focus:outline-none"
            />
          </div>
        )}

        {/* Mobile Number */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {selectedRole === 'CUSTOMER'
              ? 'REAL MOBILE NUMBER'
              : selectedRole === 'MALIK' && ownerForgotMode
              ? 'NAYA YA REGISTERED MOBILE NUMBER'
              : 'REGISTERED MOBILE NUMBER'}
          </label>
          <div className="sb-card flex items-center gap-2 px-4 py-3.5">
            <span className="text-base font-bold text-slate-500">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="98XXX XX210"
              className="w-full bg-transparent text-base font-bold text-[#141028] dark:text-white focus:outline-none tabular-nums"
            />
          </div>
        </div>

        {/* Customer 6-digit Reset Code (Forgot PIN mode) */}
        {selectedRole === 'CUSTOMER' && customerMode === 'FORGOT' && !isOwnerSetupView && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <KeyRound className="w-3 h-3 text-[#6C3BF5]" />
              <span>MALIK SE MILA 6-DIGIT RESET CODE</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={6}
              required
              value={custResetCode}
              onChange={(e) => setCustResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="sb-card w-full px-4 py-3.5 text-lg font-extrabold tracking-[0.28em] text-[#141028] dark:text-white focus:outline-none tabular-nums"
            />
          </div>
        )}

        {/* Secret PIN (4-6 digits) */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            <Lock className="w-3 h-3 text-[#6C3BF5]" />
            <span>
              {isOwnerSetupView ||
              (selectedRole === 'CUSTOMER' && customerMode !== 'LOGIN') ||
              (selectedRole === 'MALIK' && ownerForgotMode)
                ? 'NAYA STRONG SECRET PIN (4-6 DIGITS)'
                : 'SECRET PIN (4-6 DIGITS)'}
            </span>
          </label>
          <div className="sb-card flex items-center gap-2 px-4 py-3">
            <input
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              className="w-full bg-transparent text-xl font-extrabold tracking-[0.35em] text-[#141028] dark:text-white focus:outline-none tabular-nums"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="p-2 text-slate-400 hover:text-[#6C3BF5]"
              aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {!isOwnerSetupView && selectedRole === 'CUSTOMER' && customerMode === 'LOGIN' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCustomerMode('FORGOT');
                  setPin('');
                  setError('');
                }}
                className="text-xs font-bold text-[#6C3BF5] hover:underline py-1"
              >
                PIN Bhool Gaye? Reset Karein
              </button>
            </div>
          )}

          {!isOwnerSetupView && selectedRole === 'CUSTOMER' && customerMode === 'FORGOT' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCustomerMode('LOGIN');
                  setPin('');
                  setCustResetCode('');
                  setError('');
                }}
                className="text-xs font-bold text-slate-500 hover:text-[#6C3BF5] py-1"
              >
                Wapas Customer Login par jayein
              </button>
            </div>
          )}

          {!isOwnerSetupView && selectedRole === 'MALIK' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOwnerForgotMode((v) => !v);
                  setPin('');
                  setError('');
                }}
                className="text-xs font-bold text-[#6C3BF5] hover:underline py-1"
              >
                {ownerForgotMode ? 'Wapas Malik Login par jayein' : 'PIN ya Mobile Bhool Gaye?'}
              </button>
            </div>
          )}
        </div>

        {/* Role Selector */}
        {roles.length > 1 && (
          <div className="space-y-1.5">
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
                      setOwnerForgotMode(false);
                      if (r.id !== 'CUSTOMER') setCustomerMode('LOGIN');
                      setPin('');
                      setError('');
                    }}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all min-h-[44px] whitespace-nowrap ${
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
          <span>
            {submitting
              ? 'Loading...'
              : isOwnerSetupView
              ? 'Salon Setup Complete Karein'
              : selectedRole === 'MALIK' && ownerForgotMode
              ? 'Account Recover & Login'
              : selectedRole === 'CUSTOMER' && customerMode === 'REGISTER'
              ? 'Account Banayein & Login Karein'
              : selectedRole === 'CUSTOMER' && customerMode === 'FORGOT'
              ? 'Naya PIN Set Karein & Login'
              : 'Login'}
          </span>
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {isOwnerSetupView
            ? 'Setup ke baad aapko ek Master Recovery Code milega aur aap Staff/Reception bana sakte hain'
            : selectedRole === 'CUSTOMER'
            ? customerMode === 'FORGOT'
              ? 'Salon Malik apne Customers tab se aapko 6-digit Reset Code bhejenge.'
              : customerMode === 'LOGIN'
              ? 'PIN bhool gaye? "PIN Bhool Gaye?" par tap karke Malik se 6-digit Reset Code lein.'
              : 'Aapka account seedhe Salon Malik ko dikhega aur slot book hoga.'
            : selectedRole === 'RECEPTION'
            ? 'Receptionist ka mobile & PIN sirf Malik banate hain'
            : selectedRole === 'STAFF'
            ? 'Har staff ka apna alag mobile number aur PIN hota hai'
            : ownerForgotMode
            ? 'Setup ke samay mila Master Recovery Code daalkar naya number aur PIN set karein.'
            : 'Sirf Salon Malik ke registered number aur PIN se khulega'}
        </p>
      </form>
    </div>
  );
};

