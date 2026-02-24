import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

// Walk up from __dirname until we find the .env file — works for both
// ts-node (src/) and compiled output (dist/apps/aurigny-scraper/src/)
function findEnvFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

const envPath = findEnvFile(__dirname);
if (envPath) {
  config({ path: envPath });
} else {
  console.warn('[Aurigny] Warning: .env file not found, relying on environment variables');
}

import { scrapeOnce } from './scraper';
import { db, scraperLogs } from '@delays/database';
import { eq, desc } from 'drizzle-orm';

const INTERVAL_MS = parseInt(process.env.SCRAPER_INTERVAL_MS || '300000');

/** Returns how many ms ago the last successful scrape completed, or Infinity if never. */
async function msSinceLastScrape(): Promise<number> {
  try {
    const [last] = await db
      .select({ completedAt: scraperLogs.completedAt })
      .from(scraperLogs)
      .where(eq(scraperLogs.service, 'aurigny_live'))
      .orderBy(desc(scraperLogs.completedAt))
      .limit(1);

    if (!last?.completedAt) return Infinity;
    return Date.now() - new Date(last.completedAt).getTime();
  } catch {
    return Infinity;
  }
}

async function runScrape(label: string) {
  const result = await scrapeOnce();
  if (!result.success) {
    console.error(`[Aurigny] ${label} failed: ${result.error}`);
  }
}

async function main() {
  console.log('[Aurigny] Scraper service starting...');
  console.log(`[Aurigny] Interval: ${INTERVAL_MS / 1000}s + up to 120s jitter`);

  const elapsed = await msSinceLastScrape();
  const remaining = INTERVAL_MS - elapsed;

  if (remaining > 0) {
    console.log(
      `[Aurigny] Last scrape was ${Math.round(elapsed / 1000)}s ago — ` +
      `still within pause window. Skipping startup scrape, next in ~${Math.round(remaining / 1000)}s.`
    );
    // Wait out the remainder of the pause window, then fall into the normal loop
    await new Promise(r => setTimeout(r, remaining));
    await runScrape('Post-pause scrape');
  } else {
    console.log(
      elapsed === Infinity
        ? '[Aurigny] No previous scrape found — running immediately.'
        : `[Aurigny] Last scrape was ${Math.round(elapsed / 1000)}s ago — running immediately.`
    );
    await runScrape('Initial scrape');
  }

  setInterval(async () => {
    const jitter = Math.floor(Math.random() * 120000);
    console.log(`[Aurigny] Next scrape in ${Math.round(jitter / 1000)}s (jitter)...`);
    await new Promise(r => setTimeout(r, jitter));
    await runScrape('Scheduled scrape');
  }, INTERVAL_MS);
}

main().catch(err => {
  console.error('[Aurigny] Fatal startup error:', err);
  process.exit(1);
});
