import fs from 'node:fs';
import path from 'node:path';

// Six-line .env parser so `npm i express` stays the only install step.
export function loadEnv(dir) {
  const p = path.join(dir, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (v && !(m[1] in process.env)) process.env[m[1]] = v;
  }
}
