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

import { fetchAllWeather, fetchWeatherForUpcomingFlights } from './fetcher';
import { ensureAirportsSynced, startAirportSyncScheduler } from './airports';

const INTERVAL_MS = parseInt(process.env.WEATHER_INTERVAL_MS || '900000'); // default 15 minutes (METAR updates hourly)
const UPCOMING_CHECK_INTERVAL_MS = 2 * 60 * 1000; // Check for upcoming flights every 2 minutes

async function main() {
  console.log('[Weather] Weather service starting...');
  console.log(`[Weather] Full refresh interval: ${INTERVAL_MS / 60000} minutes`);
  console.log(`[Weather] Upcoming flights check interval: ${UPCOMING_CHECK_INTERVAL_MS / 1000} seconds`);

  try {
    await ensureAirportsSynced();
    startAirportSyncScheduler();
  } catch (err) {
    console.error('[Weather] Failed to sync airports:', err);
  }

  // Initial full weather fetch
  await fetchAllWeather();

  // Schedule full weather refresh (baseline for all airports)
  setInterval(async () => {
    await fetchAllWeather();
  }, INTERVAL_MS);

  // Schedule frequent checks for upcoming flights to refresh weather 15 min before departure/arrival
  setInterval(async () => {
    await fetchWeatherForUpcomingFlights();
  }, UPCOMING_CHECK_INTERVAL_MS);
}

main().catch(err => {
  console.error('[Weather] Fatal error:', err);
  process.exit(1);
});
