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
    if (parent === dir) break;
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

import { scrapeOnce, scrapeMultipleDates, guernseyDateStr } from './scraper';
import { db, scraperLogs, flights, flightTimes } from '@airways/database';
import { eq, and, not, inArray, asc, desc, count, max } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

if (process.env.SCRAPER_INTERVAL_MS) {
  console.warn('[Aurigny] SCRAPER_INTERVAL_MS is deprecated — use the tiered interval env vars instead (SCRAPER_INTERVAL_HIGH_MINS, _MEDIUM_MINS, _LOW_MINS, _IDLE_MINS)');
}

const mins = (n: number) => n * 60_000;

/** Hour (0–23, Guernsey local) at which the scraper hard-stops for the night */
const CUTOFF_HOUR          = parseInt(process.env.SCRAPER_CUTOFF_HOUR           || '23', 10);
/** Minutes before the first scheduled flight to wake up from sleep */
const WAKE_OFFSET_MINS     = parseInt(process.env.SCRAPER_WAKE_OFFSET_MINS       || '30', 10);
/** Interval when < 20 min to next flight event (ms) — env var in minutes */
const INTERVAL_HIGH_MS     = mins(parseInt(process.env.SCRAPER_INTERVAL_HIGH_MINS   || '2',  10));
/** Interval when 20–60 min to next flight event (ms) — env var in minutes */
const INTERVAL_MEDIUM_MS   = mins(parseInt(process.env.SCRAPER_INTERVAL_MEDIUM_MINS || '5',  10));
/** Interval when 60–120 min to next flight event (ms) — env var in minutes */
const INTERVAL_LOW_MS      = mins(parseInt(process.env.SCRAPER_INTERVAL_LOW_MINS    || '10', 10));
/** Interval when > 120 min to next flight event, or no active flights (ms) — env var in minutes */
const INTERVAL_IDLE_MS     = mins(parseInt(process.env.SCRAPER_INTERVAL_IDLE_MINS   || '15', 10));
/** How many minutes after a prefetch slot to bundle tomorrow's data into a live scrape (if one fires within this window) — env var in minutes */
const PREFETCH_BUNDLE_WINDOW_MINS = parseInt(process.env.SCRAPER_PREFETCH_BUNDLE_WINDOW_MINS || '15', 10);
/** Delay before running startup prefetch (milliseconds) — env var in seconds, default 30s */
const STARTUP_PREFETCH_DELAY_MS = parseInt(process.env.SCRAPER_STARTUP_PREFETCH_DELAY_SECS || '30', 10) * 1000;
/** Threshold for high-frequency mode (minutes). Below this, we don't bundle prefetches */
const HIGH_FREQ_THRESHOLD_MINS = parseInt(process.env.SCRAPER_HIGH_FREQ_THRESHOLD_MINS || '20', 10);
/** Max retries for slot operations before giving up */
const MAX_SLOT_RETRIES = parseInt(process.env.SCRAPER_MAX_SLOT_RETRIES || '5', 10);
/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = parseInt(process.env.SCRAPER_RETRY_BASE_DELAY_MS || '1000', 10);
/** Max delay for exponential backoff (ms) */
const RETRY_MAX_DELAY_MS = parseInt(process.env.SCRAPER_RETRY_MAX_DELAY_MS || '300000', 10); // 5 min
/** Circuit breaker: failures before opening */
const CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.SCRAPER_CIRCUIT_BREAKER_THRESHOLD || '5', 10);
/** Circuit breaker: reset timeout (ms) */
const CIRCUIT_BREAKER_RESET_MS = parseInt(process.env.SCRAPER_CIRCUIT_BREAKER_RESET_MS || '60000', 10); // 1 min

// Terminal statuses — a flight in one of these states is finished for the day
const TERMINAL_STATUSES = ['Landed', 'Cancelled'];

// ---------------------------------------------------------------------------
// State Management & Circuit Breaker
// ---------------------------------------------------------------------------

interface TimerState {
  scrapeTimeout: ReturnType<typeof setTimeout> | null;
  wakeTimeout: ReturnType<typeof setTimeout> | null;
  prefetchSlotTimeout: ReturnType<typeof setTimeout> | null;
  startupPrefetchTimeout: ReturnType<typeof setTimeout> | null;
}

const timers: TimerState = {
  scrapeTimeout: null,
  wakeTimeout: null,
  prefetchSlotTimeout: null,
  startupPrefetchTimeout: null,
};

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: null,
  isOpen: false,
};

interface PrefetchState {
  claimed: boolean;
  lastBundleAttempt: number | null;
  bundleAttempts: number;
  consecutiveFailures: number;
}

const prefetchState: PrefetchState = {
  claimed: false,
  lastBundleAttempt: null,
  bundleAttempts: 0,
  consecutiveFailures: 0,
};

/** Clear all active timers */
function clearAllTimers(): void {
  Object.keys(timers).forEach((key) => {
    const timerKey = key as keyof TimerState;
    if (timers[timerKey]) {
      clearTimeout(timers[timerKey]!);
      timers[timerKey] = null;
    }
  });
}

/** Check and update circuit breaker state */
function checkCircuitBreaker(): boolean {
  if (circuitBreaker.isOpen) {
    const now = Date.now();
    if (circuitBreaker.lastFailureTime && 
        now - circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_RESET_MS) {
      // Reset circuit breaker
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      console.log('[Aurigny] Circuit breaker reset, resuming operations');
      return true;
    }
    console.log('[Aurigny] Circuit breaker is OPEN, skipping operation');
    return false;
  }
  return true;
}

/** Record a failure in the circuit breaker */
function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    console.error(`[Aurigny] Circuit breaker OPENED after ${circuitBreaker.failures} failures`);
  }
}

/** Record a success in the circuit breaker */
function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
  }
}

/** Calculate exponential backoff delay */
function getBackoffDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, attempt),
    RETRY_MAX_DELAY_MS
  );
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
}

// ---------------------------------------------------------------------------
// Timezone utilities
// ---------------------------------------------------------------------------

/**
 * Guernsey shares the Europe/London timezone:
 *   UTC+0 (GMT) in winter, UTC+1 (BST) in summer.
 * The server runs UTC so all wall-clock calculations must convert explicitly.
 */
const GY_TZ = 'Europe/London';

/** Current hour (0–23) in Guernsey local time for a given UTC Date (defaults to now). */
function guernseyHour(d: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: GY_TZ, hour: 'numeric', hour12: false }).format(d),
    10,
  );
}

/**
 * Returns tomorrow's date string (YYYY-MM-DD) in Guernsey local time.
 *
 * Implementation note: we add 1 day in UTC first, then convert to the Guernsey
 * local date. This correctly handles the BST date boundary — e.g. if it is
 * 23:30 UTC on a Tuesday in summer (00:30 BST Wednesday), today in Guernsey is
 * already Wednesday and tomorrow is Thursday.
 */
function guernseyTomorrowStr(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(tomorrow);
}

/**
 * Returns the next UTC Date at which Guernsey local time will be `hour:minute`.
 * If that time today is already past, returns tomorrow's occurrence.
 */
function nextGuernseyTime(hour: number, minute: number): Date {
  // Build a candidate date string in Guernsey local time
  const todayGY = guernseyDateStr();
  const pad = (n: number) => String(n).padStart(2, '0');
  const candidateStr = `${todayGY}T${pad(hour)}:${pad(minute)}:00`;

  // Parse it as a Guernsey-local time by using the Temporal-style workaround:
  // We create a UTC date by measuring the offset at that moment.
  // Approach: format "now" in GY tz, get current GY wall time, compute offset,
  // then apply it to our target. This avoids any third-party dependency.
  const now = new Date();
  const nowGYStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: GY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(now);

  // en-GB format: "DD/MM/YYYY, HH:MM:SS"
  const [datePart, timePart] = nowGYStr.split(', ');
  const [dd, mm, yyyy] = datePart.split('/');
  const gyWallNow = new Date(`${yyyy}-${mm}-${dd}T${timePart}Z`); // treat as UTC for arithmetic
  const offsetMs = now.getTime() - gyWallNow.getTime(); // UTC - GY_wall = negative offset in BST

  // Build target in UTC from the GY-local candidate
  const targetGYWall = new Date(`${candidateStr}Z`);
  let targetUTC = new Date(targetGYWall.getTime() + offsetMs);

  // If already past, add 24 hours
  if (targetUTC <= now) {
    targetUTC = new Date(targetUTC.getTime() + 24 * 60 * 60 * 1000);
  }

  return targetUTC;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Counts all flights scheduled for the given Guernsey date string. */
async function countFlightsForDate(dateStr: string): Promise<number> {
  try {
    const [{ value }] = await db
      .select({ value: count() })
      .from(flights)
      .where(eq(flights.flightDate, dateStr));
    return value ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Returns all non-terminal, non-cancelled flights for today (Guernsey date).
 * "Active" means the scraper still needs to watch them.
 */
async function getActiveFlightsToday() {
  const today = guernseyDateStr();
  return db
    .select({
      id: flights.id,
      flightNumber: flights.flightNumber,
      scheduledDeparture: flights.scheduledDeparture,
      scheduledArrival: flights.scheduledArrival,
      actualDeparture: flights.actualDeparture,
      actualArrival: flights.actualArrival,
      status: flights.status,
    })
    .from(flights)
    .where(
      and(
        eq(flights.flightDate, today),
        eq(flights.canceled, false),
        not(inArray(flights.status, TERMINAL_STATUSES)),
      ),
    );
}

/**
 * Batch-fetches estimated departure/arrival times for multiple flights in one query.
 * Aurigny publishes EstimatedBlockOff (departure) and EstimatedBlockOn (arrival).
 * Returns a Map keyed by flightId.
 */
async function getEstimatedTimesBatch(
  flightIds: number[],
): Promise<Map<number, { estDep?: Date; estArr?: Date }>> {
  const result = new Map<number, { estDep?: Date; estArr?: Date }>();
  if (flightIds.length === 0) return result;
  try {
    const rows = await db
      .select({ flightId: flightTimes.flightId, timeType: flightTimes.timeType, timeValue: flightTimes.timeValue })
      .from(flightTimes)
      .where(
        and(
          inArray(flightTimes.flightId, flightIds),
          inArray(flightTimes.timeType, ['EstimatedBlockOff', 'EstimatedBlockOn']),
        ),
      );
    for (const row of rows) {
      const entry = result.get(row.flightId) ?? {};
      if (row.timeType === 'EstimatedBlockOff') entry.estDep = new Date(row.timeValue);
      if (row.timeType === 'EstimatedBlockOn') entry.estArr = new Date(row.timeValue);
      result.set(row.flightId, entry);
    }
  } catch {
    // Return empty map on error — caller falls back to scheduled times
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scheduler event logger
// ---------------------------------------------------------------------------

/**
 * Writes a sleep or wake event to scraper_logs for observability.
 * Repurposes errorMessage as a general notes field for non-error entries.
 */
async function logSchedulerEvent(type: 'sleep' | 'wake' | 'prefetch', detail: string): Promise<void> {
  try {
    const label = type === 'sleep' ? 'SLEEP' : type === 'wake' ? 'WAKE' : 'PREFETCH';
    await db.insert(scraperLogs).values({
      service: 'aurigny_live',
      status: 'success',
      recordsScraped: 0,
      errorMessage: `[${label}] ${detail}`,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    console.log(`[Aurigny] [${label}] ${detail}`);
  } catch (err) {
    // Never let logging failures crash the scheduler
    console.error('[Aurigny] Failed to write scheduler event to DB:', err);
  }
}

// ---------------------------------------------------------------------------
// Dynamic interval calculation
// ---------------------------------------------------------------------------

/**
 * Determines the appropriate polling interval for the next scrape cycle.
 *
 * Algorithm:
 *  1. Fetch all active (non-terminal) flights for today.
 *  2. For each flight, find the soonest upcoming event time:
 *       - Not yet departed → use EstimatedBlockOff if available, else scheduledDeparture
 *       - Departed but not arrived → use EstimatedBlockOn if available, else scheduledArrival
 *       - Both done → skip (shouldn't be in active list, but guard anyway)
 *  3. Find the minimum across all flights.
 *  4. Map minutes-until-next-event to an interval tier.
 *
 * Jitter is proportional to the interval (~12%) to avoid clustering at
 * short intervals while not adding excessive delay at longer ones.
 */
async function computeNextInterval(): Promise<{ ms: number; jitterMs: number; reason: string }> {
  const activeFlights = await getActiveFlightsToday();

  if (activeFlights.length === 0) {
    return {
      ms: INTERVAL_IDLE_MS,
      jitterMs: Math.floor(Math.random() * 90_000), // 0–90s
      reason: 'No active flights today — idle frequency',
    };
  }

  const now = Date.now();
  let soonestEventMs = Infinity;
  let soonestFlight = '';

  // Batch-fetch all estimated times in a single query instead of N per-flight queries
  const estimatedTimesMap = await getEstimatedTimesBatch(activeFlights.map(f => f.id));

  for (const f of activeFlights) {
    const { estDep, estArr } = estimatedTimesMap.get(f.id) ?? {};
    let nextEventMs: number | null = null;

    if (!f.actualDeparture) {
      // Flight hasn't left yet — next event is departure
      const depTime = estDep ?? f.scheduledDeparture;
      if (depTime) nextEventMs = new Date(depTime).getTime();
    } else if (!f.actualArrival) {
      // Airborne — next event is arrival
      const arrTime = estArr ?? f.scheduledArrival;
      if (arrTime) nextEventMs = new Date(arrTime).getTime();
    }
    // If both actual times are set the flight is complete but somehow not terminal —
    // treat it as already done (won't affect soonest calculation)

    if (nextEventMs !== null && nextEventMs < soonestEventMs) {
      soonestEventMs = nextEventMs;
      soonestFlight = f.flightNumber;
    }
  }

  if (soonestEventMs === Infinity) {
    return {
      ms: INTERVAL_IDLE_MS,
      jitterMs: Math.floor(Math.random() * 90_000),
      reason: `${activeFlights.length} active flight(s) but no upcoming event times found — idle frequency`,
    };
  }

  const minsUntil = (soonestEventMs - now) / 60_000;

  if (minsUntil < 20) {
    return {
      ms: INTERVAL_HIGH_MS,
      jitterMs: Math.floor(Math.random() * 15_000), // 0–15s
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — high frequency (2 min)`,
    };
  }
  if (minsUntil < 60) {
    return {
      ms: INTERVAL_MEDIUM_MS,
      jitterMs: Math.floor(Math.random() * 30_000), // 0–30s
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — medium frequency (5 min)`,
    };
  }
  if (minsUntil < 120) {
    return {
      ms: INTERVAL_LOW_MS,
      jitterMs: Math.floor(Math.random() * 60_000), // 0–60s
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — low frequency (10 min)`,
    };
  }
  return {
    ms: INTERVAL_IDLE_MS,
    jitterMs: Math.floor(Math.random() * 90_000), // 0–90s
    reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — idle frequency (15 min)`,
  };
}

// ---------------------------------------------------------------------------
// Sleep / wake decision
// ---------------------------------------------------------------------------

/** Returns true and a reason string if the scraper should enter sleep mode. */
async function shouldSleep(): Promise<{ sleep: boolean; reason: string }> {
  const currentHour = guernseyHour();

  // Hard cutoff — stop regardless of flight status
  if (currentHour >= CUTOFF_HOUR) {
    return {
      sleep: true,
      reason: `Hard cutoff — Guernsey local hour ${currentHour} >= ${CUTOFF_HOUR}`,
    };
  }

  const today = guernseyDateStr();
  const totalToday = await countFlightsForDate(today);

  // Don't sleep if we have no data at all — something may be wrong, keep scraping
  if (totalToday === 0) {
    return { sleep: false, reason: '' };
  }

  const activeFlights = await getActiveFlightsToday();
  if (activeFlights.length === 0) {
    // All flights appear terminal — but only trust this if the data is fresh.
    // If updatedAt on today's flights is older than 2 hours, the statuses may
    // be stale (e.g. container restarted with old DB data from a previous day).
    // In that case, keep scraping to get fresh statuses before sleeping.
    try {
      const [{ lastUpdate }] = await db
        .select({ lastUpdate: max(flights.updatedAt) })
        .from(flights)
        .where(eq(flights.flightDate, today));

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (!lastUpdate || new Date(lastUpdate) < twoHoursAgo) {
        return {
          sleep: false,
          reason: `All flights appear terminal but data is stale (last update: ${lastUpdate ?? 'never'}) — scraping to refresh`,
        };
      }
    } catch {
      // On DB error, don't sleep — safer to keep scraping
      return { sleep: false, reason: 'Could not verify data freshness — staying active' };
    }

    return {
      sleep: true,
      reason: `All ${totalToday} flights for ${today} are in terminal status`,
    };
  }

  return { sleep: false, reason: '' };
}

// ---------------------------------------------------------------------------
// Wake time calculation
// ---------------------------------------------------------------------------

/** Computes when the scraper should wake up after entering sleep. */
async function computeWakeTime(): Promise<{ wakeAt: Date; reason: string }> {
  const now = new Date();
  const today = guernseyDateStr();

  // ── Step 1: check TODAY first ────────────────────────────────────────────
  // This is the key fix: the old code always queried "tomorrow", which caused
  // the midnight prefetch to push the wake time to the day after today,
  // skipping the entire current operating day.
  if (guernseyHour() < CUTOFF_HOUR) {
    try {
      const activeToday = await getActiveFlightsToday();
      if (activeToday.length > 0) {
        // Find the earliest upcoming scheduled departure among non-terminal flights
        const upcoming = activeToday
          .filter(f => f.scheduledDeparture != null)
          .map(f => new Date(f.scheduledDeparture!).getTime())
          .filter(t => t > now.getTime())
          .sort((a, b) => a - b);

        if (upcoming.length > 0) {
          const wakeAt = new Date(upcoming[0] - WAKE_OFFSET_MINS * 60_000);
          if (wakeAt > now) {
            return {
              wakeAt,
              reason: `${WAKE_OFFSET_MINS}m before next flight on ${today} — waking at ${wakeAt.toISOString()}`,
            };
          }
          // Wake time already passed but flights still active (e.g. scraper crashed
          // mid-day and restarted). Wake immediately so live loop can track them.
          return {
            wakeAt: now,
            reason: `Active flights on ${today} need tracking but wake time already passed — waking now`,
          };
        }

        // Active (non-terminal) flights exist but all are past their scheduled
        // departure — they're either airborne or just haven't landed yet.
        // Wake immediately so the live loop can track arrivals.
        return {
          wakeAt: now,
          reason: `Airborne/in-progress flights on ${today} need tracking — waking now`,
        };
      }
    } catch (err) {
      console.error('[Aurigny] Error querying today\'s flights for wake time:', err);
      // Fall through to tomorrow logic on DB error
    }
  }

  // ── Step 2: today is done (or past cutoff) — look at tomorrow ────────────
  const tomorrow = guernseyTomorrowStr();
  const totalTomorrow = await countFlightsForDate(tomorrow);

  if (totalTomorrow > 0) {
    try {
      const [firstFlight] = await db
        .select({ scheduledDeparture: flights.scheduledDeparture })
        .from(flights)
        .where(eq(flights.flightDate, tomorrow))
        .orderBy(asc(flights.scheduledDeparture))
        .limit(1);

      if (firstFlight?.scheduledDeparture) {
        const firstDepMs = new Date(firstFlight.scheduledDeparture).getTime();
        const wakeAt = new Date(firstDepMs - WAKE_OFFSET_MINS * 60_000);
        if (wakeAt > now) {
          return {
            wakeAt,
            reason: `${WAKE_OFFSET_MINS}m before first flight on ${tomorrow} — waking at ${wakeAt.toISOString()}`,
          };
        }
        // wakeAt is already past (edge case: computing very close to first flight)
        // Fall through to fallback
      }
    } catch (err) {
      console.error('[Aurigny] Error querying first flight for wake time:', err);
    }
  }

  // ── Step 3: Fallback — 05:00 Guernsey local time tomorrow ────────────────
  const fallback = nextGuernseyTime(5, 0);
  return {
    wakeAt: fallback,
    reason: `No tomorrow schedule found (${totalTomorrow} flights loaded for ${tomorrow}) — falling back to 05:00 Guernsey`,
  };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/** The UTC timestamp we're currently scheduled to wake at (for prefetch comparison). */
let scheduledWakeAtMs: number | null = null;
/** The UTC timestamp of the next scheduled prefetch slot (00:00, 06:00, 12:00, 18:00 GY). */
let nextPrefetchSlotMs: number | null = null;

/**
 * Returns how many milliseconds ago the last successful aurigny_live scrape
 * completed, or Infinity if no record exists. Used on startup to avoid
 * firing a redundant scrape when the container restarts mid-interval.
 */
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

async function runScrape(label: string, bundleTomorrow = false): Promise<void> {
  const dates = [guernseyDateStr()];
  if (bundleTomorrow) {
    dates.push(guernseyTomorrowStr());
  }

  const result = await scrapeMultipleDates(dates, 'aurigny_live');
  if (!result.success) {
    console.error(`[Aurigny] ${label} failed: ${result.error}`);
  } else {
    console.log(
      `[Aurigny] ${label} complete — ${result.count} flights upserted` +
      (bundleTomorrow ? ' (bundled with tomorrow)' : ''),
    );
  }
}

/**
 * Core recursive scheduling loop.
 *
 * After every scrape completes, this function:
 *   1. Checks whether the scraper should sleep.
 *   2. If sleeping: logs the event, triggers a piggyback prefetch of tomorrow's
 *      schedule, computes the wake time, and sets a one-shot timeout.
 *   3. If active: computes the dynamic interval, applies proportional jitter,
 *      and schedules the next scrape.
 */
async function scheduleNextScrape(): Promise<void> {
  const { sleep, reason } = await shouldSleep();

  if (sleep) {
    await logSchedulerEvent('sleep', reason);

    // Piggyback: fetch today + tomorrow in the same browser session before sleeping.
    // This ensures wake-up calculations have fresh first-flight data.
    const today = guernseyDateStr();
    const tomorrow = guernseyTomorrowStr();
    console.log(`[Aurigny] Running piggyback prefetch for ${today} + ${tomorrow} before sleeping...`);
    const prefetchResult = await scrapeMultipleDates([today, tomorrow], 'aurigny_prefetch');
    console.log(`[Aurigny] Piggyback prefetch: ${prefetchResult.success ? `${prefetchResult.count} flights upserted` : `failed — ${prefetchResult.error}`}`);

    const { wakeAt, reason: wakeReason } = await computeWakeTime();
    scheduledWakeAtMs = wakeAt.getTime();
    const sleepMs = Math.max(0, wakeAt.getTime() - Date.now());

    await logSchedulerEvent('sleep', `Sleeping for ${Math.round(sleepMs / 60_000)}m. ${wakeReason}`);
    console.log(`[Aurigny] Setting wake timeout: will fire in ${Math.round(sleepMs / 1000)}s at ${wakeAt.toISOString()}`);

    timers.wakeTimeout = setTimeout(async () => {
      try {
        timers.wakeTimeout = null;
        scheduledWakeAtMs = null;
        await logSchedulerEvent('wake', `Waking up — ${wakeReason}`);
        await runScrape('Post-sleep scrape');
        await scheduleNextScrape();
      } catch (err) {
        console.error('[Aurigny] Error in wake timeout callback:', err);
        timers.wakeTimeout = null;
        scheduledWakeAtMs = null;
        // Reschedule to try again (with error handling)
        try {
          await scheduleNextScrape();
        } catch (err2) {
          console.error('[Aurigny] Fatal: Failed to reschedule after wake error:', err2);
          // Last resort: schedule a simple retry in 5 minutes
          setTimeout(() => scheduleNextScrape().catch(e => console.error('[Aurigny] Fatal retry failed:', e)), 5 * 60 * 1000);
        }
      }
    }, sleepMs);

    return;
  }

  // Active — compute dynamic interval
  const { ms, jitterMs, reason: intervalReason } = await computeNextInterval();
  const totalMs = ms + jitterMs;

  console.log(
    `[Aurigny] Next scrape in ${Math.round(ms / 1000)}s + ${Math.round(jitterMs / 1000)}s jitter = ${Math.round(totalMs / 1000)}s. Reason: ${intervalReason}`,
  );

  // Check if an upcoming prefetch slot falls within the bundling window
  // Bundle if slot fires within [now, scrapeTime + buffer] to avoid firing a standalone prefetch
  let bundleTomorrow = false;
  const now = Date.now();
  
  // Check if we recently failed a bundle attempt (within last 2 minutes)
  const recentBundleFailure = prefetchState.lastBundleAttempt && 
    (now - prefetchState.lastBundleAttempt < 2 * 60 * 1000);
  
  if (nextPrefetchSlotMs !== null && !prefetchState.claimed && !recentBundleFailure) {
    const msUntilSlot = nextPrefetchSlotMs - now;
    const bufferMs = PREFETCH_BUNDLE_WINDOW_MINS * 60_000;

    // Bundle if slot fires: after now AND before/at (scrape completion + buffer)
    // This prevents a standalone prefetch from firing right after this scrape
    if (msUntilSlot > 0 && msUntilSlot <= totalMs + bufferMs) {
      // Use the already-calculated interval (ms) - it's the time until next flight event
      // Convert to minutes for the frequency check
      const minsUntilNextFlight = ms / 60_000;

      // Only bundle if we have medium/low/idle frequency (minsUntilNextFlight >= HIGH_FREQ_THRESHOLD_MINS)
      if (minsUntilNextFlight >= HIGH_FREQ_THRESHOLD_MINS) {
        console.log(
          `[Aurigny] Prefetch slot in ${Math.round(msUntilSlot / 60_000)}m — ` +
          `bundling tomorrow's data into this scrape (interval: ${minsUntilNextFlight.toFixed(0)}min)`,
        );
        bundleTomorrow = true;
        prefetchState.claimed = true;
        prefetchState.bundleAttempts++;
        prefetchState.lastBundleAttempt = now;
      }
    }
  }

  // Clear any existing scrape timeout before setting new one
  if (timers.scrapeTimeout) {
    clearTimeout(timers.scrapeTimeout);
    timers.scrapeTimeout = null;
  }

  timers.scrapeTimeout = setTimeout(async () => {
    timers.scrapeTimeout = null;
    
    // Check circuit breaker before scraping
    if (!checkCircuitBreaker()) {
      console.log('[Aurigny] Circuit breaker open, skipping scrape and rescheduling');
      await scheduleNextScrape();
      return;
    }
    
    try {
      await runScrape('Scheduled scrape', bundleTomorrow);
      recordSuccess();
      prefetchState.consecutiveFailures = 0;
    } catch (err) {
      console.error('[Aurigny] Error in scheduled scrape:', err);
      recordFailure();
      prefetchState.consecutiveFailures++;
      
      // Reset the claim so the slot can fire standalone, but only if this was a recent bundle attempt
      if (bundleTomorrow && prefetchState.lastBundleAttempt && 
          (Date.now() - prefetchState.lastBundleAttempt < 5 * 60 * 1000)) {
        console.log('[Aurigny] Bundle attempt failed, resetting claim for standalone prefetch');
        prefetchState.claimed = false;
        prefetchState.bundleAttempts = 0;
      }
    }
    await scheduleNextScrape();
  }, totalMs);
}

// ---------------------------------------------------------------------------
// Background prefetch timer (every 8 hours, all day)
// ---------------------------------------------------------------------------

/**
 * Runs every PREFETCH_INTERVAL_MS (default 8h) to keep the next day's schedule
 * fresh in the DB. If the scraper is currently sleeping, and the new first-flight
 * time differs from the scheduled wake time by more than 5 minutes, the wake
 * timeout is rescheduled accordingly.
 */
async function runBackgroundPrefetch(): Promise<void> {
  const today = guernseyDateStr();
  const tomorrow = guernseyTomorrowStr();
  console.log(`[Aurigny] Background prefetch: fetching ${today} + ${tomorrow}...`);

  const result = await scrapeMultipleDates([today, tomorrow], 'aurigny_prefetch');
  const msg = result.success
    ? `${result.count} flights upserted for ${today} + ${tomorrow}`
    : `failed — ${result.error}`;
  console.log(`[Aurigny] Background prefetch complete: ${msg}`);
  await logSchedulerEvent('prefetch', msg);

  // If the scraper is sleeping, check whether the newly loaded data changes the
  // optimal wake time — reschedule if it differs by more than 5 minutes.
  if (timers.wakeTimeout !== null && scheduledWakeAtMs !== null) {
    const { wakeAt, reason } = await computeWakeTime();

    // Safety net: if computeWakeTime says we should already be awake (wake time
    // is now or in the past), cancel sleep immediately and start live scraping.
    // This handles the case where a prefetch fires during what should be operating
    // hours but the scraper is still sleeping (e.g. after a mid-day crash/restart).
    if (wakeAt.getTime() <= Date.now()) {
      console.log(`[Aurigny] Prefetch detected we should already be awake (wake=${wakeAt.toISOString()}) — cancelling sleep and starting live scraping`);
      clearTimeout(timers.wakeTimeout);
      timers.wakeTimeout = null;
      scheduledWakeAtMs = null;
      await logSchedulerEvent('wake', `Early wake triggered by prefetch — ${reason}`);
      try {
        await runScrape('Prefetch-triggered wake scrape');
        await scheduleNextScrape();
      } catch (err) {
        console.error('[Aurigny] Error in prefetch-triggered wake:', err);
        await scheduleNextScrape();
      }
      return;
    }

    const diffMs = Math.abs(wakeAt.getTime() - scheduledWakeAtMs);
    if (diffMs > 5 * 60_000) {
      console.log(`[Aurigny] Prefetch updated first-flight data — rescheduling wake from ${new Date(scheduledWakeAtMs).toISOString()} to ${wakeAt.toISOString()}`);
      clearTimeout(timers.wakeTimeout);
      scheduledWakeAtMs = wakeAt.getTime();
      const sleepMs = Math.max(0, wakeAt.getTime() - Date.now());
      console.log(`[Aurigny] Rescheduled wake timeout: will fire in ${Math.round(sleepMs / 1000)}s`);
      timers.wakeTimeout = setTimeout(async () => {
        try {
          timers.wakeTimeout = null;
          scheduledWakeAtMs = null;
          await logSchedulerEvent('wake', `Waking up (rescheduled by prefetch) — ${reason}`);
          await runScrape('Post-sleep scrape');
          await scheduleNextScrape();
        } catch (err) {
          console.error('[Aurigny] Error in rescheduled wake timeout callback:', err);
          timers.wakeTimeout = null;
          scheduledWakeAtMs = null;
          try {
            await scheduleNextScrape();
          } catch (err2) {
            console.error('[Aurigny] Fatal: Failed to reschedule after rescheduled wake error:', err2);
            setTimeout(() => scheduleNextScrape().catch(e => console.error('[Aurigny] Fatal retry failed:', e)), 5 * 60 * 1000);
          }
        }
      }, sleepMs);
    }
  }
}

// ---------------------------------------------------------------------------
// Wall-clock prefetch scheduler (00:00, 06:00, 12:00, 18:00 GY local)
// ---------------------------------------------------------------------------

/**
 * Computes the next wall-clock prefetch slot (00:00, 06:00, 12:00, 18:00 GY local)
 * and schedules a timeout for it. If a live scrape fires within PREFETCH_BUNDLE_WINDOW_MINS
 * of the slot, it will bundle tomorrow's data into that scrape instead of running standalone.
 */
// slotRetryCount is intentionally scoped outside the recursive function so
// retry state persists across recursive invocations of schedulePrefetchSlot.
// It is private to this module and only touched by schedulePrefetchSlot.
let _slotRetryCount = 0;

async function schedulePrefetchSlot(): Promise<void> {
  const SLOT_HOURS = [0, 6, 12, 18]; // GY local hours
  const now = new Date();
  const currentHourGY = guernseyHour(now);

  // Find the next slot
  let nextSlotHour = SLOT_HOURS.find(h => h > currentHourGY);
  if (nextSlotHour === undefined) {
    // All today's slots have passed — next is tomorrow at 00:00
    nextSlotHour = 0;
  }

  const nextSlotTime = nextGuernseyTime(nextSlotHour, 0);
  nextPrefetchSlotMs = nextSlotTime.getTime();
  
  // Only reset claimed state if enough time has passed (prevents double-reset on container restart)
  const nowMs = Date.now();
  if (!prefetchState.lastBundleAttempt || (nowMs - prefetchState.lastBundleAttempt > 60 * 60 * 1000)) {
    prefetchState.claimed = false;
    prefetchState.bundleAttempts = 0;
  }

  const slotMs = Math.max(0, nextSlotTime.getTime() - now.getTime());
  console.log(
    `[Aurigny] Next prefetch slot scheduled: ${nextSlotHour.toString().padStart(2, '0')}:00 GY ` +
    `(${Math.round(slotMs / 60_000)} minutes from now)`,
  );

  // Clear any existing prefetch slot timeout
  if (timers.prefetchSlotTimeout) {
    clearTimeout(timers.prefetchSlotTimeout);
    timers.prefetchSlotTimeout = null;
  }

  timers.prefetchSlotTimeout = setTimeout(async () => {
    timers.prefetchSlotTimeout = null;
    
    // Check if we've exceeded max retries
    if (_slotRetryCount >= MAX_SLOT_RETRIES) {
      console.error(`[Aurigny] Max slot retries (${MAX_SLOT_RETRIES}) exceeded, skipping this slot`);
      _slotRetryCount = 0;
      await schedulePrefetchSlot();
      return;
    }
    
    try {
      // Slot fires — if not claimed by a live scrape, run standalone prefetch
      if (!prefetchState.claimed) {
        console.log('[Aurigny] Prefetch slot fired (not bundled with live scrape) — running standalone');
        await runBackgroundPrefetch();
        _slotRetryCount = 0; // Reset on success
      } else {
        console.log('[Aurigny] Prefetch slot fired (already bundled with live scrape)');
        _slotRetryCount = 0; // Reset on success
      }

      // Reschedule the next slot
      await schedulePrefetchSlot();
    } catch (err) {
      _slotRetryCount++;
      console.error(`[Aurigny] Error in prefetch slot timeout (attempt ${_slotRetryCount}/${MAX_SLOT_RETRIES}):`, err);
      
      // Exponential backoff before retrying
      const backoffMs = getBackoffDelay(_slotRetryCount);
      console.log(`[Aurigny] Retrying slot scheduling in ${Math.round(backoffMs / 1000)}s`);
      
      setTimeout(async () => {
        try {
          await schedulePrefetchSlot();
        } catch (err2) {
          console.error('[Aurigny] Fatal error rescheduling prefetch slot:', err2);
          // Even on fatal error, try one more time with longer delay
          setTimeout(() => schedulePrefetchSlot().catch(e => {
            console.error('[Aurigny] Giving up on prefetch slot scheduling:', e);
          }), RETRY_MAX_DELAY_MS);
        }
      }, backoffMs);
    }
  }, slotMs);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log('[Aurigny] Scraper service starting...');
  console.log(`[Aurigny] Config — cutoff: ${CUTOFF_HOUR}:00 GY, wake offset: ${WAKE_OFFSET_MINS}m`);
  console.log(`[Aurigny] Intervals — high: ${INTERVAL_HIGH_MS / 1000}s, medium: ${INTERVAL_MEDIUM_MS / 1000}s, low: ${INTERVAL_LOW_MS / 1000}s, idle: ${INTERVAL_IDLE_MS / 1000}s`);
  console.log(`[Aurigny] Prefetch bundle window: ${PREFETCH_BUNDLE_WINDOW_MINS}m`);

  // Schedule wall-clock prefetch slots at 00:00, 06:00, 12:00, 18:00 GY local
  schedulePrefetchSlot();

  const currentHour = guernseyHour();
  // WAKE_OFFSET_MINS before the earliest possible first flight (05:30) gives ~05:00.
  // Treat anything before that as still inside the sleep window so we don't fire
  // a redundant scrape immediately after the scheduled wake-up scrape runs.
  const earlyMorningCutoff = 5; // 05:00 GY — consistent with nextGuernseyTime(5, 0) fallback
  const isInSleepWindow = currentHour >= CUTOFF_HOUR || currentHour < earlyMorningCutoff;

  // Schedule a delayed startup prefetch to ensure tomorrow's data is available
  // This is non-blocking and doesn't interfere with the main scheduler
  // Skip if we're in sleep mode (no point loading data until we wake up)
  if (!isInSleepWindow && STARTUP_PREFETCH_DELAY_MS > 0) {
    console.log(`[Aurigny] Scheduling startup prefetch in ${STARTUP_PREFETCH_DELAY_MS / 1000}s`);
    timers.startupPrefetchTimeout = setTimeout(async () => {
      timers.startupPrefetchTimeout = null;
      
      // Check circuit breaker before running startup prefetch
      if (!checkCircuitBreaker()) {
        console.log('[Aurigny] Circuit breaker open, skipping startup prefetch');
        return;
      }
      
      try {
        console.log('[Aurigny] Running delayed startup prefetch to load tomorrow\'s schedule...');
        const today = guernseyDateStr();
        const tomorrow = guernseyTomorrowStr();
        // Use 'aurigny_prefetch' so msSinceLastScrape (which queries 'aurigny_live')
        // doesn't see this as a recent live scrape and skip the initial live poll.
        const result = await scrapeMultipleDates([today, tomorrow], 'aurigny_prefetch');
        if (result.success) {
          console.log(`[Aurigny] Delayed startup prefetch complete: ${result.count} flights upserted`);
          recordSuccess();
        } else {
          console.warn(`[Aurigny] Delayed startup prefetch failed: ${result.error}`);
          recordFailure();
        }
      } catch (err) {
        console.error('[Aurigny] Error in delayed startup prefetch:', err);
        recordFailure();
      }
    }, STARTUP_PREFETCH_DELAY_MS);
  } else {
    console.log(`[Aurigny] Skipping startup prefetch (in sleep window or disabled)`);
  }

  if (isInSleepWindow) {
    // Container restarted during the sleep window — skip the initial scrape and
    // go straight to sleep state so we don't hammer the site in the early hours.
    console.log(`[Aurigny] Startup during sleep window (Guernsey hour: ${currentHour}) — going straight to sleep state`);
    await scheduleNextScrape();
  } else {
    // Check how long ago the last successful scrape ran so we don't fire
    // a redundant browser launch if the container just restarted mid-interval.
    const elapsed = await msSinceLastScrape();
    const { ms: nextMs } = await computeNextInterval();

    if (elapsed === Infinity) {
      console.log('[Aurigny] No previous scrape found — running immediately');
      await runScrape('Initial scrape');
    } else if (elapsed < nextMs) {
      const waitMs = nextMs - elapsed;
      console.log(
        `[Aurigny] Last scrape was ${Math.round(elapsed / 1000)}s ago — ` +
        `within current interval (${Math.round(nextMs / 1000)}s). ` +
        `Resuming in ~${Math.round(waitMs / 1000)}s`,
      );
      await new Promise(r => setTimeout(r, waitMs));
      await runScrape('Resume scrape');
    } else {
      console.log(
        `[Aurigny] Last scrape was ${Math.round(elapsed / 1000)}s ago — running immediately`,
      );
      await runScrape('Initial scrape');
    }

    await scheduleNextScrape();
  }
}

// Cleanup handlers for graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Aurigny] SIGTERM received, cleaning up...');
  clearAllTimers();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Aurigny] SIGINT received, cleaning up...');
  clearAllTimers();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[Aurigny] Uncaught exception:', err);
  clearAllTimers();
  process.exit(1);
});

main().catch(err => {
  console.error('[Aurigny] Fatal startup error:', err);
  clearAllTimers();
  process.exit(1);
});
