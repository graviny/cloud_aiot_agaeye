import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'agaeye.spec.ts', fullyParallel: false, workers: 1, reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174', ...devices['Desktop Chrome'],
    launchOptions: { args: ['--disable-gpu'] },
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  webServer: [
    { command: 'node tests/fixtures/agaeyeServer.mjs', url: 'http://127.0.0.1:8011/health', reuseExistingServer: false },
    {
      command: 'npm run dev -- --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false,
      env: { VITE_DATA_MODE: 'agaeye', VITE_DEVICE_ID: 'crib-01', VITE_API_BASE_URL: '', API_PROXY_TARGET: 'http://127.0.0.1:8011' },
    },
  ],
});
