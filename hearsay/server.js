import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './lib/env.js';
import { createApp, MODELS, hasKey, embedProvider } from './app.js';

// Every module reads process.env lazily, so parsing .env after the import graph
// resolves is still early enough.
loadEnv(path.dirname(fileURLToPath(import.meta.url)));

const PORT = Number(process.env.PORT) || 3000;
const server = createApp().listen(PORT, () => {
  // process.stdout.write, not console.log: when stdout is a pipe Node buffers
  // it, and a server killed before flush looks like one that never started.
  process.stdout.write(
    `\n  Hearsay running → http://localhost:${PORT}\n` +
    `  write path : ${MODELS.reason} (effort=${process.env.REASONING_EFFORT || 'high'})\n` +
    `  read path  : ${MODELS.fast}\n` +
    `  embeddings : ${embedProvider()}\n` +
    `  xai key    : ${hasKey() ? 'present' : 'MISSING — cached/offline mode'}\n\n`,
  );
});

server.on('error', (e) => {
  process.stderr.write(
    e.code === 'EADDRINUSE'
      ? `\n  Port ${PORT} is already in use.\n  Start on another:  PORT=3001 npm start\n\n`
      : `\n  Server error: ${e.code} ${e.message}\n\n`,
  );
  process.exit(1);
});

process.on('unhandledRejection', (e) => {
  process.stderr.write(`\n  Unhandled rejection: ${e?.stack || e}\n\n`);
});
