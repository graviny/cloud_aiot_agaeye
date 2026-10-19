import { createApiSource } from './apiSource';
import { createAgaEyeSource } from './agaEyeSource';
import { createMockSource } from './mockSource';
import { CLOUD_MODE, cloudAccessToken } from './cloudAuth';

const configuredMode = import.meta.env.VITE_DATA_MODE;
export const DATA_MODE = CLOUD_MODE ? 'cloud' : configuredMode === 'agaeye' ? 'agaeye' : configuredMode === 'api' ? 'api' : 'mock';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export const LOCAL_AI_DEMO = import.meta.env.VITE_LOCAL_AI_DEMO === 'true';
export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID || 'crib-01';
const staleMs = Number(import.meta.env.VITE_STALE_AFTER_MS || 12000);
export const STALE_AFTER_MS = Number.isFinite(staleMs) && staleMs >= 2000 ? staleMs : 12000;
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Demo remains usable without persistence. */ }
export const source = DATA_MODE === 'cloud' || DATA_MODE === 'agaeye'
  ? createAgaEyeSource(API_BASE_URL || '/agaeye-api', DEVICE_ID, STALE_AFTER_MS,
    CLOUD_MODE ? { getToken: cloudAccessToken } : undefined)
  : DATA_MODE === 'api' ? createApiSource(API_BASE_URL) : createMockSource(storage);

export function imageUrl(path: string | null): string | null {
  if (!path) return null;
  try {
    const base = DATA_MODE !== 'mock' && API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, '')}/` : window.location.origin;
    const url = new URL(path, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
