import { loadEnv } from '@airways/common';
loadEnv({ serviceName: 'Guernsey', startDir: __dirname });

import { runBackfill, linkOrphanedStatusHistory, deduplicateFlights, fixActualTimes } from './scraper';
import { runLiveMode } from './live';

async function main() {
  const mode = process.env.SCRAPER_MODE || 'backfill';

  if (mode === 'live') {
    await runLiveMode();
    return; // loop runs indefinitely via setTimeout
  }

  if (mode === 'link-only') {
    // Fix existing orphaned flight_status_history rows without re-scraping
    console.log('[Guernsey] Running link-only mode...');
    await linkOrphanedStatusHistory();
    console.log('[Guernsey] Linking completed. Exiting...');
    process.exit(0);
  }

  if (mode === 'dedup') {
    console.log('[Guernsey] Running dedup mode...');
    await deduplicateFlights();
    console.log('[Guernsey] Dedup completed. Exiting...');
    process.exit(0);
  }

  if (mode === 'fix-actual-times') {
    // Correct actual_departure/actual_arrival/delay_minutes for flights where the
    // status timestamp date was used instead of the flight date (bug now fixed in scraper).
    console.log('[Guernsey] Running fix-actual-times mode...');
    await fixActualTimes();
    console.log('[Guernsey] Fix completed. Exiting...');
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

process.on('uncaughtException', (err) => {
  console.error('[Guernsey] Uncaught exception:', err);
  process.exit(1);
});

main().catch(err => {
  console.error('[Guernsey] Fatal error:', err);
  process.exit(1);
});
