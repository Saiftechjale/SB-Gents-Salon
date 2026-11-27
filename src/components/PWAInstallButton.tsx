import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

interface PWAInstallButtonProps {
  salonName: string;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  salonName,
  compact = false,
}) => {
  const { canInstall, isInstalled, isIOS, hasNativePrompt, promptInstall } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (hasNativePrompt) {
      await promptInstall();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full py-3 px-4 rounded-2xl bg-[#EDE9FE] dark:bg-purple-950/50 text-[#5B21B6] dark:text-purple-200 text-xs font-extrabold flex items-center justify-center gap-2 min-h-[44px]"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{canInstall ? 'Web App Phone Me Install Karein' : 'Home Screen Par App Save Karein'}</span>
        </button>
      ) : (
        <div className="sb-card p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EDE9FE] dark:bg-purple-950/60 text-[#6C3BF5] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#141028] dark:text-white truncate">
                {salonName} App Install Karein
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Bina APK ke direct phone screen par kholein
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="px-3.5 py-2.5 rounded-xl bg-[#6C3BF5] text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 min-h-[44px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-[#141028] dark:text-white">
                  {salonName} Web App Install
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phone me app icon add karne ka aasan tarika:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#6C3BF5] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Safari me niche <Share className="w-3.5 h-3.5 inline text-[#6C3BF5]" />{' '}
                    <strong>Share</strong> button par tap karein.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#6C3BF5] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Scroll karke <strong>&ldquo;Add to Home Screen&rdquo;</strong> chunein aur Add dabayein.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#6C3BF5] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>Browser ke upar right side me 3-dot menu (⋮) kholein.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#6C3BF5] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    <strong>&ldquo;Install App&rdquo;</strong> ya{' '}
                    <strong>&ldquo;Add to Home screen&rdquo;</strong> par tap karein.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-3 rounded-xl sb-gradient text-white text-xs font-extrabold min-h-[44px]"
            >
              Samajh Aa Gaya
            </button>
          </div>
        </div>
      )}
    </>
  );
};
