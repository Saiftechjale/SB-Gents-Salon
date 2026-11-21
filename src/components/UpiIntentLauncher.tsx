import React, { useState } from 'react';
import { Check, Copy, Smartphone } from 'lucide-react';
import { buildUpiDeepLinks, isValidUpiId } from '../lib/upiIntent';

interface UpiIntentLauncherProps {
  upiId?: string;
  merchantName: string;
  amount: number;
  note: string;
  txnRef?: string;
  onQuickSaveUpiId?: (newUpiId: string) => Promise<void>;
  allowQuickConfig?: boolean;
}

export const UpiIntentLauncher: React.FC<UpiIntentLauncherProps> = ({
  upiId,
  merchantName,
  amount,
  note,
  txnRef,
  onQuickSaveUpiId,
  allowQuickConfig = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [draftUpiId, setDraftUpiId] = useState(upiId || '');
  const [savingUpi, setSavingUpi] = useState(false);

  const hasValidUpi = Boolean(upiId && isValidUpiId(upiId));

  if (!hasValidUpi) {
    return (
      <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2.5 text-sm">
        <div className="font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          <span>UPI ID सेट करें</span>
        </div>
        {allowQuickConfig && onQuickSaveUpiId ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="yourname@okaxis"
              value={draftUpiId}
              onChange={(e) => setDraftUpiId(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm"
            />
            <button
              type="button"
              disabled={savingUpi || !isValidUpiId(draftUpiId)}
              onClick={async () => {
                setSavingUpi(true);
                await onQuickSaveUpiId(draftUpiId.trim());
                setSavingUpi(false);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-40"
            >
              {savingUpi ? 'Saving...' : 'Save'}
            </button>
          </div>
        ) : (
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold">UPI ID उपलब्ध नहीं है</p>
        )}
      </div>
    );
  }

  if (amount <= 0) {
    return null;
  }

  const links = buildUpiDeepLinks({
    payeeVpa: upiId!,
    payeeName: merchantName,
    amount,
    transactionNote: note,
    transactionRef: txnRef,
  });

  const handleCopyUpiId = async () => {
    await navigator.clipboard.writeText(upiId!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm sm:text-base font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4" />
            <span>UPI पेमेंट · ₹{amount}</span>
          </div>
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-0.5 font-mono font-bold">
            {upiId}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyUpiId}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-extrabold hover:border-blue-500 min-h-[40px]"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'कॉपी हो गया' : 'UPI कॉपी करें'}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <a
          href={links.phonepe}
          className="py-3 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-sm min-h-[48px] flex items-center justify-center transition-colors"
        >
          PhonePe
        </a>
        <a
          href={links.gpay}
          className="py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm min-h-[48px] flex items-center justify-center transition-colors"
        >
          GPay
        </a>
        <a
          href={links.paytm}
          className="py-3 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-sm min-h-[48px] flex items-center justify-center transition-colors"
        >
          Paytm
        </a>
      </div>
    </div>
  );
};
