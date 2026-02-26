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
  console.log(`[Position] Loaded env from ${envPath}`);
} else {
  console.warn('[Position] Warning: .env file not found');
}

import { pollPositions } from './poller';

async function main() {
  const intervalSecs = parseInt(process.env.POSITION_INTERVAL_LIVE_SECS ?? '180', 10);
  console.log('[Position] Aircraft position service starting...');
  console.log(`[Position] Poll interval: ${intervalSecs}s for live/implied-airborne flights`);
  console.log('[Position] FR24 gate: status=Airborne OR actualDeparture is set (and not terminal)');
  console.log('[Position] Status back-write enabled: will write Airborne to flights table when FR24 confirms');

  if (!process.env.FR24_API_TOKEN) {
    console.error('[Position] FR24_API_TOKEN is not set — position service will not run');
    console.error('[Position] Add FR24_API_TOKEN=<your_token> to .env');
    process.exit(1);
  }

  async function runPoll() {
    try {
      const nextPollIn = await pollPositions();
      console.log(`[Position] Scheduling next poll in ${Math.round(nextPollIn/1000)}s`);
      setTimeout(runPoll, nextPollIn);
    } catch (err) {
      console.error('[Position] Poll failed:', err);
      // Retry in 1 minute on error
      setTimeout(runPoll, 60 * 1000);
    }
  }

  // Start the polling loop
  runPoll();
}

main().catch(err => {
  console.error('[Position] Fatal error:', err);
  process.exit(1);
});
