import { handleLocalApiRequest } from './localApiEngine';

const API_BASE_KEY = 'sb_api_base_url';
const LOCAL_MODE_KEY = 'sb_local_mode';
export const DEFAULT_LIVE_API_URL = 'https://sb-gents-salon.onrender.com';

let inMemoryAuthToken: string | null = null;
let detectedStaticHostFallback = false;

export function setAuthToken(token: string | null): void {
  inMemoryAuthToken = token && token.trim() ? token.trim() : null;
}

export function getAuthToken(): string | null {
  return inMemoryAuthToken;
}

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

export function isStaticFrontendHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (detectedStaticHostFallback) return true;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.pages.dev') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.github.io') ||
    host.endsWith('.workers.dev')
  );
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(API_BASE_KEY);
    if (saved && saved.trim()) return normalizeBaseUrl(saved);
  }
  const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (envBase) return normalizeBaseUrl(envBase);
  if (isCapacitorApp() || isStaticFrontendHost()) {
    return DEFAULT_LIVE_API_URL;
  }
  return '';
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

export function isStandaloneApkMode(): boolean {
  return isCapacitorApp() && !getApiBaseUrl();
}

export function isPhoneOfflineMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneApkMode()) return true;
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
  const mergedHeaders = new Headers(init?.headers || {});
  if (inMemoryAuthToken && !mergedHeaders.has('Authorization')) {
    mergedHeaders.set('Authorization', `Bearer ${inMemoryAuthToken}`);
  }
  const nextInit = { ...init, headers: mergedHeaders };

  if ((isPhoneOfflineMode() || isStandaloneApkMode()) && path.startsWith('/api/')) {
    return handleLocalApiRequest(path, nextInit);
  }

  const base = getApiBaseUrl();
  const targetUrl = path.startsWith('/') && base ? `${base}${path}` : path;
  const isRemote = /^https?:\/\//i.test(targetUrl);
  const timeoutMs =
    init?.timeoutMs ?? (path === '/api/bootstrap' ? (isRemote ? 45000 : 12000) : 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _t, ...fetchInit } = nextInit;
    const res = await fetch(targetUrl, {
      ...fetchInit,
      signal: init?.signal || controller.signal,
    });

    // Guard against static-host SPA fallback returning index.html for /api/*
    const ct = res.headers.get('content-type') || '';
    if (path.startsWith('/api/') && ct.includes('text/html')) {
      if (!base && !isCapacitorApp()) {
        detectedStaticHostFallback = true;
        const fallbackRes = await fetch(`${DEFAULT_LIVE_API_URL}${path}`, {
          ...fetchInit,
          signal: init?.signal || controller.signal,
        });
        const fallbackCt = fallbackRes.headers.get('content-type') || '';
        if (!fallbackCt.includes('text/html')) {
          return fallbackRes;
        }
      }
      throw new Error('Server API not available at this address (received HTML instead of JSON)');
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
