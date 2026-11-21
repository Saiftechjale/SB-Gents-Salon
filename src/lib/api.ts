import { handleLocalApiRequest } from './localApiEngine';

const API_BASE_KEY = 'sb_api_base_url';
const LOCAL_MODE_KEY = 'sb_local_mode';

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (window.location.protocol === 'capacitor:') return true;
  // Capacitor Android serves bundled dist/ at https://localhost (no port)
  if (window.location.hostname === 'localhost' && window.location.port === '') return true;
  return false;
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(API_BASE_KEY);
    if (saved && saved.trim()) return normalizeBaseUrl(saved);
  }
  const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
  return envBase ? normalizeBaseUrl(envBase) : '';
}

export function setApiBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = normalizeBaseUrl(url);
  if (clean) {
    localStorage.setItem(API_BASE_KEY, clean);
  } else {
    localStorage.removeItem(API_BASE_KEY);
  }
}

export function isPhoneOfflineMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(LOCAL_MODE_KEY) === '1';
}

export function setPhoneOfflineMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (enabled) {
    localStorage.setItem(LOCAL_MODE_KEY, '1');
  } else {
    localStorage.removeItem(LOCAL_MODE_KEY);
  }
}

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

export async function apiFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  if (isPhoneOfflineMode() && path.startsWith('/api/')) {
    return handleLocalApiRequest(path, init);
  }

  const targetUrl = apiUrl(path);
  const timeoutMs = init?.timeoutMs ?? (path === '/api/bootstrap' ? 7500 : 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _t, ...fetchInit } = init || {};
    const res = await fetch(targetUrl, {
      ...fetchInit,
      signal: init?.signal || controller.signal,
    });

    // Guard against Capacitor / static-host SPA fallback returning index.html for /api/*
    const ct = res.headers.get('content-type') || '';
    if (path.startsWith('/api/') && ct.includes('text/html')) {
      throw new Error('Server API not available at this address (received HTML instead of JSON)');
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
