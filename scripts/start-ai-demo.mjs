import { createServer as createProbe } from 'node:net';
import { spawn, execFile, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = join(root, '.venv-ai', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const args = process.argv.slice(2);
const modelFlag = args.indexOf('--model');
const model = modelFlag >= 0 ? resolve(args[modelFlag + 1] || '') : join(root, 'models/agaeye_A_original_320_aug.onnx');
let vite = null;
let backend = null;
let closing = false;
const open = url => {
  if (args.includes('--no-open')) return;
  if (process.platform === 'win32') execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, () => {});
  else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => {});
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const probe = async url => {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(700) }); return response.ok ? await response.json() : null; }
  catch { return null; }
};
async function freePort(ports) {
  for (const port of ports) {
    const available = await new Promise(resolve => {
      const server = createProbe();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('데모용 포트를 사용할 수 없습니다. 기존 데모를 종료한 뒤 다시 실행하세요.');
}
async function stop() {
  if (closing) return;
  closing = true;
  if (backend && backend.exitCode === null) {
    await fetch(`http://127.0.0.1:${backend.demoPort}/demo/stop`, { method: 'POST', signal: AbortSignal.timeout(6000) }).catch(() => {});
    backend.kill();
  }
  await vite?.close();
}
async function main() {
  if (args.includes('--help')) {
    console.log('npm.cmd run demo:ai -- [--model C:\\path\\model.onnx] [--no-open]\n웹에서 웹캠 또는 영상을 선택합니다. Ctrl+C로 전체 종료합니다.');
    return;
  }
  for (const port of [5173, 5175, 5176, 5177, 5178, 5179, 5180]) {
    const value = await probe(`http://127.0.0.1:${port}/__agaeye/laptop-demo`);
    if (value?.app === 'aga-eye-laptop-demo') {
      const url = `http://127.0.0.1:${port}/`;
      console.log(`이미 실행 중인 실제 모델 데모를 엽니다: ${url}`);
      if (modelFlag >= 0) console.log('모델을 변경하려면 기존 데모 터미널에서 Ctrl+C 후 다시 실행하세요.');
      open(url); return;
    }
  }
  if (!existsSync(python)) throw new Error('먼저 setup-ai-demo.cmd로 노트북 분석 환경을 준비하세요.');
  if (!existsSync(model)) throw new Error(`ONNX 모델 파일이 없습니다: ${model}`);
  const childEnv = { ...process.env, PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '2', CUDA_VISIBLE_DEVICES: '-1' };
  const checked = spawnSync(python, ['scripts/laptop_edge.py', '--model', model, '--check'], {
    cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true,
  });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) throw new Error('모델 또는 Python 의존성을 확인하세요. setup-ai-demo.cmd로 환경을 준비할 수 있습니다.');
  const apiPort = await freePort([8000, 8001, 8002, 8003, 8004]);
  const webPort = await freePort([5173, 5175, 5176, 5177, 5178, 5179, 5180]);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  backend = spawn(python, ['-u', '-m', 'uvicorn', 'laptop_api:app', '--app-dir', join(root, 'scripts'),
    '--host', '127.0.0.1', '--port', String(apiPort), '--log-level', 'warning'], {
    cwd: root, env: { ...childEnv, AGAEYE_MODEL: model, AGAEYE_SERVER_URL: apiUrl }, stdio: 'inherit', windowsHide: true,
  });
  backend.demoPort = apiPort;
  backend.on('error', error => { console.error(error.message); void stop(); });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (backend.exitCode !== null) throw new Error('노트북 분석 서버가 시작되지 않았습니다. 위 오류를 확인하세요.');
    if (await probe(`${apiUrl}/demo/info`)) { ready = true; break; }
    await pause(250);
  }
  if (!ready) throw new Error('노트북 분석 서버의 응답을 기다리지 못했습니다.');
  Object.assign(process.env, { VITE_DATA_MODE: 'agaeye', VITE_DEVICE_ID: 'laptop-demo', VITE_LOCAL_AI_DEMO: 'true',
    VITE_API_BASE_URL: '', API_PROXY_TARGET: apiUrl });
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { host: '127.0.0.1', port: webPort, strictPort: true },
    plugins: [{ name: 'laptop-demo-runtime', configureServer(server) {
      server.middlewares.use('/__agaeye/laptop-demo', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ app: 'aga-eye-laptop-demo' }));
      });
    } }],
  });
  await vite.listen();
  const url = `http://127.0.0.1:${webPort}/`;
  console.log(`\n아가 아이 실제 모델 데모: ${url}\n웹에서 [웹캠 시작] 또는 [영상으로 분석]을 선택하세요.\n분석: CPU / 모델: ${model}\n전체 종료: 이 터미널에서 Ctrl+C\n`);
  open(url);
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
try { await main(); }
catch (error) { console.error(error.message); await stop(); process.exitCode = 1; }
