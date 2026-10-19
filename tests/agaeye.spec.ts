import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('http://127.0.0.1:8011/_test/reset'); });
const scenario = async (request: import('@playwright/test').APIRequestContext, name: string) => {
  await request.post(`http://127.0.0.1:8011/_test/scenario?name=${name}`);
};

test('미등록 기기는 서버 연결과 구별하며 데모 결과를 표시하지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/기기 crib-01의 첫 연결/)).toBeVisible();
  await expect(page.getByRole('article', { name: '서버 연결: 연결됨' })).toBeVisible();
  await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toHaveCount(0);
  await expect(page.locator('.demo-panel')).toHaveCount(0);
});

test('프록시·일반 SSE·현재 위험 사진·보호자 확인·종료를 연결한다', async ({ page, request }) => {
  await scenario(request, 'normal'); await page.goto('/');
  await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toBeVisible();
  await scenario(request, 'danger');
  await expect(page.getByRole('article', { name: '위험 상태: 위험' })).toBeVisible();
  const photo = page.locator('.danger-panel img');
  await expect(photo).toHaveAttribute('src', /\/agaeye-api\/events\/current-risk\/snapshot$/);
  await expect(photo).toBeVisible();
  expect(await photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.danger-panel').getByText('촬영 시각 미제공')).toBeVisible();
  await page.locator('.danger-panel').getByRole('button', { name: '확인했어요', exact: true }).click();
  await expect(page.locator('.danger-panel').getByRole('button', { name: '보호자 확인 완료 · 위험 지속 중' })).toBeDisabled();
  await expect(page.getByRole('article', { name: '위험 상태: 위험' })).toBeVisible();
  await scenario(request, 'end');
  await expect(page.locator('.danger-panel')).toHaveCount(0);
  await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toBeVisible();
});

test('새 생존 신호가 와도 오래된 분석은 판단 불가이고 확인 실패는 저장되지 않는다', async ({ page, request }) => {
  await scenario(request, 'danger'); await scenario(request, 'reject-ack'); await page.goto('/');
  await page.locator('.danger-panel').getByRole('button', { name: '확인했어요', exact: true }).click();
  await expect(page.locator('.connection-alert')).toContainText('500');
  await expect(page.locator('.danger-panel').getByRole('button', { name: '확인했어요', exact: true })).toBeEnabled();
  await scenario(request, 'stale');
  await expect(page.getByRole('article', { name: '위험 상태: 판단 불가' })).toBeVisible();
  await expect(page.locator('.pending-risk')).toContainText('종료가 확인되지 않은 위험 이력');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
