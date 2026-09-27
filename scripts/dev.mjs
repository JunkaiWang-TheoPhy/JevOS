import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', 'server/index.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: '4107' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of processes) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
