import { emptyData, type AppData } from './domain.ts';
import type { Child } from './api/deviceClient.ts';

// A stored preview email is not evidence of a server-authenticated session.
export const previewAccount = (stored: string | null) => stored === 'demo' ? 'demo' : null;
export function pairingFragment(hash: string) {
  const code = (new URLSearchParams(hash.replace(/^#/, '')).get('code') || '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? `#code=${code.slice(0, 4)}-${code.slice(4)}` : '';
}
export const deviceLoginRoute = (hash = '') => '/login?next=/devices' + pairingFragment(hash);
export function authContinuation(search: string, hash: string) {
  return new URLSearchParams(search).get('next') === '/devices' ? '/devices' + pairingFragment(hash) : null;
}
export function authModeRoute(mode: 'login' | 'signup', search: string, hash: string) {
  return `/${mode}` + (authContinuation(search, hash) ? '?next=/devices' + pairingFragment(hash) : '');
}
export const homeRoute = (data: AppData) => !data.child ? '/onboarding/child' : data.onboardingComplete ? '/home' : '/onboarding/notifications';
export function routeRedirect(path: string, account: string | null, authenticated: boolean, data: AppData, search = '', hash = '') {
  if (path === '/devices') return authenticated ? null : deviceLoginRoute(hash);
  const authPage = ['/welcome', '/signup', '/login', '/'].includes(path);
  if (path === '/login' || path === '/signup') {
    if (!authenticated) return null;
    return authContinuation(search, hash) || homeRoute(data);
  }
  if (!account) return authPage ? null : '/welcome';
  if (!data.child && path !== '/onboarding/child') return '/onboarding/child';
  if (data.child && !data.onboardingComplete && !path.startsWith('/onboarding/')) return '/onboarding/notifications';
  if (authPage) return homeRoute(data);
  return null;
}
export function withServerChild(previous: AppData, child: Child | null): AppData {
  // Do not relabel another child's demo/history records when the selected child changes.
  const sameChild = !previous.demo && previous.child?.id === child?.id;
  const next = sameChild ? previous : { ...emptyData(), preferences: previous.preferences };
  return { ...next, demo: false, child: child ? { ...(sameChild ? previous.child : {}), id: child.id, name: child.displayName, birthDate: child.birthDate } : null };
}
