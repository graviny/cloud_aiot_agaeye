import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['agaeye.spec.ts', 'cloud.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5188',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--disable-gpu'] },
    ...devices['Desktop Chrome'],
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  webServer: {
    command: 'npm run dev -- --port 5188',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
    env: { VITE_DATA_MODE: 'mock', VITE_LOCAL_AI_DEMO: 'false' },
    timeout: 30000,
  },
});
