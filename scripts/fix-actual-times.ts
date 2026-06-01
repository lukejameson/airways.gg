/**
 * One-off script: runs fixActualTimes() to correct corrupted actual_departure,
 * actual_arrival, and delay_minutes values from migration ping-pong.
 *
 * Usage: npx tsx scripts/fix-actual-times.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '.env') });

import { getDb } from '@airways/database';
import { fixActualTimes } from '../apps/guernsey-scraper/src/scraper';

async function main() {
  console.log('[fix-actual-times] Connecting to database...');
  getDb(); // initialise the connection pool + UTC type parser

  console.log('[fix-actual-times] Running fixActualTimes()...');
  const fixed = await fixActualTimes();
  console.log(`[fix-actual-times] Done. Fixed ${fixed} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[fix-actual-times] Fatal error:', err);
  process.exit(1);
});
