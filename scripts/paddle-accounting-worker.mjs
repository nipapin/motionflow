import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

let stopping = false, child = null;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopping = true; child?.kill(signal); });
while (!stopping) {
  await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [fileURLToPath(new URL('./paddle-accounting.mjs',import.meta.url)),'retry'], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => { if (code) console.error('[paddle-accounting] Reconciliation failed; retained for the next pass'); child = null; resolve(); });
  }).catch(error => console.error('[paddle-accounting] Worker error',error.message));
  if (!stopping) await setTimeout(60_000);
}
