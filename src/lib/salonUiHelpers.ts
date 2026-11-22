import type { ServiceItem } from '../types/salon';

export function getLocalTodayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function formatSlot12h(hhmm: string): string {
  const [hStr, mStr] = (hhmm || '09:00').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatShortTime(hhmm: string): string {
  const [hStr, mStr] = (hhmm || '09:00').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function getInitials(name: string): string {
  const parts = (name || 'U').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0][0] || 'U').toUpperCase();
}

export function getSingleInitial(name: string): string {
  return (name || 'S').trim().charAt(0).toUpperCase();
}

export function getAvatarColorClass(index: number): string {
  const palette = [
    'bg-[#7C5DFA] text-white',
    'bg-[#3B9DF8] text-white',
    'bg-[#F97316] text-white',
    'bg-[#10B981] text-white',
    'bg-[#EC4899] text-white',
  ];
  return palette[Math.abs(index) % palette.length];
}

export function getServiceVisualTag(service: ServiceItem): {
  bg: string;
  text: string;
  symbol: string;
} {
  const n = service.name.toLowerCase();
  if (n.includes('beard') && !n.includes('haircut')) {
    return { bg: 'bg-amber-100', text: 'text-amber-700', symbol: '🧔' };
  }
  if (n.includes('facial') || n.includes('skin')) {
    return { bg: 'bg-orange-100', text: 'text-orange-700', symbol: '✨' };
  }
  if (n.includes('colour') || n.includes('color')) {
    return { bg: 'bg-rose-100', text: 'text-rose-700', symbol: '🎨' };
  }
  if (n.includes('spa') || n.includes('wash')) {
    return { bg: 'bg-sky-100', text: 'text-sky-700', symbol: '💧' };
  }
  return { bg: 'bg-purple-100', text: 'text-[#6C3BF5]', symbol: '✂️' };
}

export function daysSinceDate(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const past = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(past.getTime())) return 0;
  const now = new Date();
  const diff = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function isSlotInPastForDate(dateStr: string, slotTime: string): boolean {
  const todayStr = getLocalTodayStr();
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  const [h, m] = slotTime.split(':').map(Number);
  const now = new Date();
  const slotMins = (h || 0) * 60 + (m || 0);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return slotMins <= nowMins;
}

export function cleanDisplayName(name?: string | null): string {
  return (name || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatServiceCombo(names: string[]): string {
  const parts: string[] = [];
  for (const raw of names) {
    const pieces = raw.split('+').map((p) => p.trim()).filter(Boolean);
    for (const piece of pieces) {
      if (!parts.some((existing) => existing.toLowerCase() === piece.toLowerCase())) {
        parts.push(piece);
      }
    }
  }
  return parts.join(' + ');
}

