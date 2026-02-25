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
} else {
  console.warn('[Weather] Warning: .env file not found');
}

import { fetchAllWeather } from './fetcher';
import { ensureAirportsSynced, startAirportSyncScheduler } from './airports';

const INTERVAL_MS = parseInt(process.env.WEATHER_INTERVAL_MS || '900000'); // default 15 minutes (METAR updates hourly)

async function main() {
  console.log('[Weather] Weather service starting...');
  console.log(`[Weather] Interval: ${INTERVAL_MS / 60000} minutes`);

  try {
    await ensureAirportsSynced();
    startAirportSyncScheduler();
  } catch (err) {
    console.error('[Weather] Failed to sync airports:', err);
  }

  await fetchAllWeather();

  setInterval(async () => {
    await fetchAllWeather();
  }, INTERVAL_MS);
}

main().catch(err => {
  console.error('[Weather] Fatal error:', err);
  process.exit(1);
});
