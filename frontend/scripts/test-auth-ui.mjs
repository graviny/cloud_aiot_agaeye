import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve('node_modules');
const folder = await mkdtemp(path.join(root, '.agaeye-auth-render-'));
try {
  const output = path.join(folder, 'render.mjs');
  await build({ entryPoints: ['tests/renderAuth.tsx'], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '""' } });
  await import(pathToFileURL(output).href);
} finally {
  const target = path.resolve(folder);
  if (path.dirname(target) !== root || !path.basename(target).startsWith('.agaeye-auth-render-')) throw new Error('Refusing cleanup outside the auth render temporary directory.');
  await rm(target, { recursive: true, force: true });
}
