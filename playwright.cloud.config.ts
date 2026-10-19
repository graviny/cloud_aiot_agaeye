import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'cloud.spec.ts', workers: 1, fullyParallel: false, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', ...devices['Desktop Chrome'],
    launchOptions: { args: ['--disable-gpu'] }, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) },
  webServer: [
    { command: 'npm run test:cloud:fixture', url: 'http://127.0.0.1:8012/healthz', reuseExistingServer: false },
    { command: 'npm run dev -- --port 5176', url: 'http://127.0.0.1:5176', reuseExistingServer: false,
      env: { VITE_DATA_MODE: 'cloud', VITE_SUPABASE_URL: 'https://test-project.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', VITE_API_BASE_URL: 'http://127.0.0.1:8012',
        VITE_DEVICE_ID: 'crib-01', VITE_LOCAL_AI_DEMO: 'false' } },
  ],
});
