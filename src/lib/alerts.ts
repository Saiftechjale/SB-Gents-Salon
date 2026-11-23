export interface AlertChimeOptions {
  repeatCount?: number;
  vibrate?: boolean;
}

function playSingleChimeSequence(kind: 'customer' | 'owner'): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = kind === 'owner' ? [587.33, 783.99, 1046.5] : [659.25, 880, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.26);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore audio context restrictions
  }
}

export function playAlertChime(
  kind: 'customer' | 'owner' = 'customer',
  options?: AlertChimeOptions
): void {
  if (typeof window === 'undefined') return;
  const repeatCount = Math.max(1, Math.min(4, options?.repeatCount ?? 1));
  const shouldVibrate = options?.vibrate ?? true;

  if (shouldVibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(repeatCount > 1 ? [250, 120, 250, 120, 320] : [200, 100, 200]);
    } catch {
      // Ignore vibration restrictions
    }
  }

  for (let i = 0; i < repeatCount; i += 1) {
    setTimeout(() => {
      playSingleChimeSequence(kind);
    }, i * 720);
  }
}

export async function requestNotificationPermission(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const cap = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            LocalNotifications?: {
              requestPermissions?: () => Promise<unknown>;
            };
          };
        };
      }
    ).Capacitor;
    if (cap?.Plugins?.LocalNotifications?.requestPermissions) {
      await cap.Plugins.LocalNotifications.requestPermissions();
    }
  } catch {
    // Ignore native permission prompt failure
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      // Ignore Web Notification permission failure
    }
  }
}

export function sendNativeNotification(title: string, body: string): void {
  if (typeof window === 'undefined') return;

  // 1. Try Capacitor Android LocalNotifications plugin if bundled in APK
  try {
    const cap = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            LocalNotifications?: {
              schedule?: (opts: {
                notifications: Array<{
                  id: number;
                  title: string;
                  body: string;
                  schedule?: { at: Date };
                  sound?: string;
                }>;
              }) => Promise<unknown>;
            };
          };
        };
      }
    ).Capacitor;

    if (cap?.Plugins?.LocalNotifications?.schedule) {
      void cap.Plugins.LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
    }
  } catch {
    // Fallback to Web Notification API
  }

  // 2. Fallback / Desktop & PWA Notification
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg && typeof reg.showNotification === 'function') {
            return reg.showNotification(title, { body });
          }
          new Notification(title, { body });
          return undefined;
        });
      } else {
        new Notification(title, { body });
      }
    } catch {
      // Ignore restricted iframe / WebView notification errors
    }
  }
}
