import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

// Walk up from __dirname to find .env — works for ts-node (src/) and compiled output
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
  console.warn('[Guernsey] Warning: .env file not found, relying on environment variables');
}

import { runBackfill, linkOrphanedStatusHistory } from './scraper';

async function main() {
  const mode = process.env.SCRAPER_MODE || 'backfill';

  if (mode === 'link-only') {
    // Fix existing orphaned flight_status_history rows without re-scraping
    console.log('[Guernsey] Running link-only mode...');
    await linkOrphanedStatusHistory();
    console.log('[Guernsey] Linking completed. Exiting...');
    process.exit(0);
  }

  console.log('[Guernsey] Historical scraper starting...');

  const startDate = process.env.BACKFILL_START_DATE;
  const endDate = process.env.BACKFILL_END_DATE;

  await runBackfill(startDate, endDate, (current, total, completed) => {
    const progress = ((completed / total) * 100).toFixed(1);
    console.log(`[Guernsey] Progress: ${completed}/${total} (${progress}%) - ${current.toISOString().split('T')[0]}`);
  });

  console.log('[Guernsey] Backfill completed. Exiting...');
  process.exit(0);
}

main().catch(err => {
  console.error('[Guernsey] Fatal error:', err);
  process.exit(1);
});
