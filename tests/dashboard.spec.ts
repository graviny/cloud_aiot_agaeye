import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('.demo-panel summary').click();
  await expect(page.getByRole('heading', { name: '수면 모니터링', exact: true })).toBeVisible();
});

test('정상 상태와 로컬 데모 표시, 데스크톱 화면', async ({ page }) => {
  await expect(page.getByRole('article', { name: '카메라: 정상 작동' })).toBeVisible();
  await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toBeVisible();
  await expect(page.getByText('모의 데이터로 실행 중이에요.', { exact: true })).toBeVisible();
  await expect(page.locator('.past-photo').getByRole('heading', { name: '지난 알림 사진', exact: true })).toBeVisible();
  await expect(page.locator('.past-photo').getByText('종료된 기록', { exact: true })).toBeVisible();
  await expect(page.locator('.past-photo .photo-help')).toContainText('실시간 화면은 아니에요');
  await page.locator('.demo-panel summary').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
});

test('사진 실패 시 경보 우선 표시, 확인해도 위험 유지', async ({ page }) => {
  await page.getByRole('button', { name: '사진 조회 실패', exact: true }).click();
  const alert = page.locator('.danger-panel');
  await expect(alert.getByRole('heading', { name: '엎드림 위험이 감지됐어요' })).toBeVisible();
  await expect(alert.getByText('사진을 불러오지 못했어요')).toBeVisible();
  await alert.getByRole('button', { name: '확인했어요', exact: true }).click();
  await expect(alert.getByRole('button', { name: '보호자 확인 완료 · 위험 지속 중' })).toBeDisabled();
  await expect(page.getByRole('article', { name: '위험 상태: 위험' })).toBeVisible();
  await page.getByRole('button', { name: '위험 종료', exact: true }).click();
  await expect(page.locator('.danger-panel')).toHaveCount(0);
  await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toBeVisible();
});

test('단절과 갱신 중단은 판단 불가, 복구 후 최신 상태 표시', async ({ page }) => {
  for (const scenario of ['카메라 단절', '라즈베리파이 단절', '서버 단절', '갱신 중단']) {
    await page.getByRole('button', { name: scenario, exact: true }).click();
    await expect(page.getByRole('article', { name: '위험 상태: 판단 불가' })).toBeVisible();
    await expect(page.getByRole('article', { name: '아기 감지: 판단 불가' })).toBeVisible();
    await page.getByRole('button', { name: '연결 복구', exact: true }).click();
    await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toBeVisible();
  }
});

test('중복 이벤트, 이력 필터, 상세 창 키보드 종료', async ({ page }) => {
  await page.getByRole('button', { name: '안면 차폐 위험', exact: true }).click();
  await expect(page.locator('.danger-panel img')).toBeVisible();
  await page.locator('.demo-panel summary').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/risk-alert.png', fullPage: true });
  await page.locator('.demo-panel summary').click();
  await page.getByRole('button', { name: '위험 이력', exact: false }).first().click();
  const before = await page.locator('.event-row').count();
  await page.getByRole('button', { name: '동일 이벤트 재수신', exact: true }).click();
  await expect(page.locator('.event-row')).toHaveCount(before);
  await page.getByRole('combobox', { name: '위험 유형', exact: true }).selectOption('face_covered');
  await expect(page.locator('.event-main strong').first()).toContainText('안면 차폐');
  await page.locator('.event-main').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('확인 기록 유지, 이력 조회 실패와 재시도', async ({ page }) => {
  await page.getByRole('button', { name: '엎드림 위험', exact: true }).click();
  await page.locator('.danger-panel').getByRole('button', { name: '확인했어요', exact: true }).click();
  await page.reload();
  await page.locator('.demo-panel summary').click();
  await expect(page.locator('.danger-panel').getByRole('button', { name: '보호자 확인 완료 · 위험 지속 중' })).toBeVisible();
  await page.getByRole('button', { name: '위험 이력', exact: false }).first().click();
  await page.getByRole('button', { name: '이력 조회 실패', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이력을 불러오지 못했어요' })).toBeVisible();
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.locator('.event-row').first()).toBeVisible();
});

test('모바일 화면과 초기화 후 빈 이력', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('article', { name: '위험 상태: 정상' })).toBeVisible();
  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflowing).toBe(false);
  await page.locator('.demo-panel summary').click();
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await page.locator('.demo-panel summary').click();
  await page.getByRole('button', { name: '데모 기록 초기화', exact: true }).click();
  await page.getByRole('button', { name: '초기화하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '아직 위험 이력이 없어요' })).toBeVisible();
});
