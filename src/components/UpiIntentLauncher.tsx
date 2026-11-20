import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Smartphone } from 'lucide-react';
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
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2.5 text-xs">
        <div className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
          <Smartphone className="w-4 h-4" />
          <span>UPI Deep Link / Direct App Payment</span>
        </div>
        {allowQuickConfig && onQuickSaveUpiId ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="yourname@okaxis"
              value={draftUpiId}
              onChange={(e) => setDraftUpiId(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              disabled={savingUpi || !isValidUpiId(draftUpiId)}
              onClick={async () => {
                setSavingUpi(true);
                await onQuickSaveUpiId(draftUpiId.trim());
                setSavingUpi(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-40"
            >
              {savingUpi ? 'Saving...' : 'Save UPI ID'}
            </button>
          </div>
        ) : (
          <p className="text-slate-600 dark:text-slate-400">UPI ID not set.</p>
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
    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4" />
            <span>Direct UPI App Payment (UPI Intent)</span>
          </div>
          <div className="text-slate-600 dark:text-slate-300 mt-0.5 font-mono">
            Payee UPI: <strong>{upiId}</strong> · Amount:{' '}
            <strong className="tabular-nums">₹{amount.toFixed(2)}</strong>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyUpiId}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold hover:border-blue-500"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied UPI ID' : 'Copy UPI ID'}</span>
        </button>
      </div>

      {/* Primary UPI Intent Button + Specific App Deep Links */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={links.generic}
          className="flex-1 min-w-[160px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs min-h-[42px] transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open Any UPI App (₹{amount})</span>
        </a>
        <a
          href={links.gpay}
          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold hover:border-blue-500 min-h-[42px] flex items-center"
        >
          GPay
        </a>
        <a
          href={links.phonepe}
          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold hover:border-blue-500 min-h-[42px] flex items-center"
        >
          PhonePe
        </a>
        <a
          href={links.paytm}
          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold hover:border-blue-500 min-h-[42px] flex items-center"
        >
          Paytm
        </a>
      </div>
    </div>
  );
};
