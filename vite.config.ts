import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.VITE_DATA_MODE === 'cloud') {
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    let serviceRole = false;
    try { serviceRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { /* publishable keys are not JWTs */ }
    if (key.startsWith('sb_secret_') || serviceRole) throw new Error('Supabase secret/service_role keys must never be used in VITE_ variables. Use the publishable/anon key.');
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/agaeye-api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/agaeye-api/, ''),
        },
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    test: { include: ['src/**/*.test.ts'], environment: 'node' },
  };
});
