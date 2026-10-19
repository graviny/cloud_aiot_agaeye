import { createClient } from '@supabase/supabase-js';

export const CLOUD_MODE = import.meta.env.VITE_DATA_MODE === 'cloud';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const api = import.meta.env.VITE_API_BASE_URL || '';
const localApi = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(api);
export const cloudConfigError = CLOUD_MODE && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)
  || !key || key.startsWith('sb_secret_') || (!api.startsWith('https://') && !localApi))
  ? '클라우드 연결 설정이 필요합니다. 팀 배포 안내의 웹 환경 변수를 확인해 주세요.' : null;

// Only a publishable key (or legacy anon key) is allowed in the browser.
function isServiceRole(value: string): boolean {
  try { return JSON.parse(atob(value.split('.')[1])).role === 'service_role'; } catch { return false; }
}
export const authClient = CLOUD_MODE && !cloudConfigError && !isServiceRole(key)
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

export async function cloudAccessToken(): Promise<string | null> {
  if (!authClient) return null;
  const { data, error } = await authClient.auth.getSession();
  if (error) throw new Error('로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.');
  return data.session?.access_token || null;
}
