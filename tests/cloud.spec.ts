import { test, expect } from '@playwright/test';

test('보호자 로그인·인증된 사진·확인 기록·로그아웃을 연결한다', async ({ page, request }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
    email: 'guardian@example.test', email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
  await page.route('https://test-project.supabase.co/auth/v1/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      route.request().url().includes('/token') ? { access_token: 'test-guardian-session', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh-session', user } : user) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '우리 아기 상태를 확인해요' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '수면 모니터링', exact: true })).toHaveCount(0);
  await page.getByLabel('이메일', { exact: true }).fill('guardian@example.test');
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await request.post('http://127.0.0.1:8012/devices/crib-01/heartbeat', {
    headers: { Authorization: 'Bearer test-device-secret-not-a-real-key-123456789' },
    data: { ts: Date.now() / 1000, status: 'risk', reason: 'prone', posture: 'prone',
      airway: 'airway_visible', active_event_id: 'risk-1' },
  });
  const photograph = page.waitForResponse(response => response.url().endsWith('/events/risk-1/snapshot'));
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '수면 모니터링', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '아기를 지금 확인해 주세요' })).toBeVisible();
  const response = await photograph;
  expect(response.status()).toBe(200);
  expect(response.request().headers()['authorization']).toBe('Bearer test-guardian-session');
  expect(response.url()).not.toContain('session');
  const image = page.getByRole('img', { name: '위험 확정 시점의 카메라 사진' }).first();
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '확인했어요', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '보호자 확인 완료 · 위험 지속 중', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '아기를 지금 확인해 주세요' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/cloud-monitor-desktop.png', fullPage: true });
  await request.post('http://127.0.0.1:8012/devices/crib-01/events', {
    headers: { Authorization: 'Bearer test-device-secret-not-a-real-key-123456789' },
    data: { event_id: 'risk-1', kind: 'risk_ended', ended_at: Date.now() / 1000 },
  });
  await request.post('http://127.0.0.1:8012/devices/crib-01/heartbeat', {
    headers: { Authorization: 'Bearer test-device-secret-not-a-real-key-123456789' },
    data: { ts: Date.now() / 1000, status: 'normal', reason: '', posture: 'supine', airway: 'airway_visible' },
  });
  await expect(page.getByRole('heading', { name: '위험 징후가 없어요' })).toBeVisible();
  // Reload uses the persisted Supabase session; no second login is required.
  await page.reload();
  await expect(page.getByRole('heading', { name: '위험 징후가 없어요' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리 아기 상태를 확인해요' })).toBeVisible();
  await expect(page.getByRole('img', { name: '위험 확정 시점의 카메라 사진' })).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/cloud-login-mobile.png', fullPage: true });
  expect(failures).toEqual([]);
});
