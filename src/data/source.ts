import { createApiSource } from './apiSource';
import { createMockSource } from './mockSource';

const configuredMode = import.meta.env.VITE_DATA_MODE;
export const DATA_MODE = configuredMode === 'api' ? 'api' : 'mock';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export const LOCAL_AI_DEMO = false;
export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID || 'crib-01';
const staleMs = Number(import.meta.env.VITE_STALE_AFTER_MS || 12000);
export const STALE_AFTER_MS = Number.isFinite(staleMs) && staleMs >= 2000 ? staleMs : 12000;
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Demo remains usable without persistence. */ }
export const source = DATA_MODE === 'api' ? createApiSource(API_BASE_URL) : createMockSource(storage);

export function imageUrl(path: string | null): string | null {
  if (!path) return null;
  try {
    const base = DATA_MODE !== 'mock' && API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, '')}/` : window.location.origin;
    const url = new URL(path, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}