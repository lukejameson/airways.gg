import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

function findEnvFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = findEnvFile(__dirname);
if (envPath) {
  config({ path: envPath });
  console.log(`[Notify] Loaded env from ${envPath}`);
} else {
  console.warn('[Notify] Warning: .env file not found');
}

import { dispatch } from './dispatcher';

async function main() {
  const intervalMs = parseInt(process.env.NOTIFY_POLL_INTERVAL_MS ?? '15000', 10);
  console.log('[Notify] Notification service starting...');
  console.log(`[Notify] Poll interval: ${intervalMs}ms`);

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    console.error('[Notify] VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set');
    process.exit(1);
  }

  async function runPoll() {
    try {
      await dispatch();
    } catch (err) {
      console.error('[Notify] Dispatch failed:', err);
    }
    setTimeout(runPoll, intervalMs);
  }

  runPoll();
}

main().catch(err => {
  console.error('[Notify] Fatal error:', err);
  process.exit(1);
});
