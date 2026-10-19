import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativePython = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
const python = process.env.AGAEYE_PYTHON || ['.venv-cloud', '.venv-ai'].map(folder => path.join(root, folder, ...relativePython)).find(existsSync);
if (!python) {
  console.error('클라우드 실행용 Python 환경이 필요합니다. docs/CLOUD_DEPLOYMENT.md의 로컬 실행 절차를 확인해 주세요.');
  process.exit(1);
}
const child = spawn(python, ['-X', 'utf8', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, PYTHONPATH: [root, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
