import { db, flights, flightTimes, scraperLogs } from '@airways/database';
import { eq, and, not, inArray, asc, count, desc, max, sql } from 'drizzle-orm';
import { scrapeDayFlights } from './scraper';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const mins = (n: number) => n * 60_000;

/** Hour (0–23, Guernsey local) at which the scraper hard-stops for the night */
const CUTOFF_HOUR          = parseInt(process.env.SCRAPER_CUTOFF_HOUR              || '23', 10);
/** Minutes before the first scheduled flight to wake up from sleep */
const WAKE_OFFSET_MINS     = parseInt(process.env.SCRAPER_WAKE_OFFSET_MINS         || '30', 10);
/** Interval when < 20 min to next flight event (minutes) */
const INTERVAL_HIGH_MINS   = parseInt(process.env.SCRAPER_INTERVAL_HIGH_MINS       || '2',  10);
/** Interval when 20–60 min to next flight event (minutes) */
const INTERVAL_MEDIUM_MINS = parseInt(process.env.SCRAPER_INTERVAL_MEDIUM_MINS     || '5',  10);
/** Interval when 60–120 min to next flight event (minutes) */
const INTERVAL_LOW_MINS    = parseInt(process.env.SCRAPER_INTERVAL_LOW_MINS        || '10', 10);
/** Interval when > 120 min to next flight event (minutes) */
const INTERVAL_IDLE_MINS   = parseInt(process.env.SCRAPER_INTERVAL_IDLE_MINS       || '15', 10);
/** Minimum interval between tomorrow scrapes (minutes) */
const INTERVAL_TOMORROW_MINS = parseInt(process.env.SCRAPER_INTERVAL_TOMORROW_MINS || '360', 10);

/** Circuit breaker: failures before opening */
const CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.SCRAPER_CIRCUIT_BREAKER_THRESHOLD || '5', 10);
/** Circuit breaker: reset timeout (ms) */
const CIRCUIT_BREAKER_RESET_MS  = parseInt(process.env.SCRAPER_CIRCUIT_BREAKER_RESET_MS  || '60000', 10);

const TERMINAL_STATUSES = ['Landed', 'Cancelled', 'Completed'];

// ---------------------------------------------------------------------------
// Timezone helpers (Guernsey = Europe/London: UTC+0 in winter, UTC+1 in summer)
// ---------------------------------------------------------------------------

const GY_TZ = 'Europe/London';

/** Current hour (0–23) in Guernsey local time. */
function guernseyHour(d: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: GY_TZ, hour: 'numeric', hour12: false }).format(d),
    10,
  );
}

/** Current date as YYYY-MM-DD in Guernsey local time. */
function guernseyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(d);
}

/**
 * Returns tomorrow's date string (YYYY-MM-DD) in Guernsey local time.
 * Adds 1 day in UTC first, then converts — correctly handles BST boundary.
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
  const todayGY = guernseyDateStr();
  const pad = (n: number) => String(n).padStart(2, '0');
  const candidateStr = `${todayGY}T${pad(hour)}:${pad(minute)}:00`;

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
  const offsetMs = now.getTime() - gyWallNow.getTime();

  const targetGYWall = new Date(`${candidateStr}Z`);
  let targetUTC = new Date(targetGYWall.getTime() + offsetMs);

  if (targetUTC <= now) {
    targetUTC = new Date(targetUTC.getTime() + 24 * 60 * 60 * 1000);
  }

  return targetUTC;
}

// ---------------------------------------------------------------------------
// State & Circuit Breaker
// ---------------------------------------------------------------------------

interface TimerState {
  scrapeTimeout: ReturnType<typeof setTimeout> | null;
  wakeTimeout: ReturnType<typeof setTimeout> | null;
  prefetchSlotTimeout: ReturnType<typeof setTimeout> | null;
}

const timers: TimerState = {
  scrapeTimeout: null,
  wakeTimeout: null,
  prefetchSlotTimeout: null,
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

let lastTomorrowScrapeAt: Date | null = null;
let scheduledWakeAtMs: number | null = null;

function clearAllTimers(): void {
  Object.keys(timers).forEach((key) => {
    const timerKey = key as keyof TimerState;
    if (timers[timerKey]) {
      clearTimeout(timers[timerKey]!);
      timers[timerKey] = null;
    }
  });
}

function checkCircuitBreaker(): boolean {
  if (circuitBreaker.isOpen) {
    const now = Date.now();
    if (circuitBreaker.lastFailureTime &&
        now - circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_RESET_MS) {
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      console.log('[Guernsey Live] Circuit breaker reset, resuming operations');
      return true;
    }
    console.log('[Guernsey Live] Circuit breaker is OPEN, skipping operation');
    return false;
  }
  return true;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    console.error(`[Guernsey Live] Circuit breaker OPENED after ${circuitBreaker.failures} failures`);
  }
}

function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

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
        sql`LOWER(${flights.status}) NOT LIKE 'diverted%'`,
      ),
    );
}

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
    // Return empty map — caller falls back to scheduled times
  }
  return result;
}

async function msSinceLastScrape(): Promise<number> {
  try {
    const [last] = await db
      .select({ completedAt: scraperLogs.completedAt })
      .from(scraperLogs)
      .where(eq(scraperLogs.service, 'guernsey_live'))
      .orderBy(desc(scraperLogs.completedAt))
      .limit(1);
    if (!last?.completedAt) return Infinity;
    return Date.now() - new Date(last.completedAt).getTime();
  } catch {
    return Infinity;
  }
}

// ---------------------------------------------------------------------------
// Scheduler event logger
// ---------------------------------------------------------------------------

async function logSchedulerEvent(type: 'sleep' | 'wake' | 'prefetch', detail: string): Promise<void> {
  try {
    const label = type === 'sleep' ? 'SLEEP' : type === 'wake' ? 'WAKE' : 'PREFETCH';
    await db.insert(scraperLogs).values({
      service: 'guernsey_live',
      status: 'success',
      recordsScraped: 0,
      errorMessage: `[${label}] ${detail}`,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    console.log(`[Guernsey Live] [${label}] ${detail}`);
  } catch (err) {
    console.error('[Guernsey Live] Failed to write scheduler event to DB:', err);
  }
}

// ---------------------------------------------------------------------------
// Dynamic interval calculation (4-tier)
// ---------------------------------------------------------------------------

async function computeNextInterval(): Promise<{ ms: number; jitterMs: number; reason: string }> {
  const activeFlights = await getActiveFlightsToday();

  if (activeFlights.length === 0) {
    return {
      ms: mins(INTERVAL_IDLE_MINS),
      jitterMs: Math.floor(Math.random() * 90_000),
      reason: 'No active flights today — idle frequency',
    };
  }

  const now = Date.now();
  let soonestEventMs = Infinity;
  let soonestFlight = '';

  const estimatedTimesMap = await getEstimatedTimesBatch(activeFlights.map(f => f.id));

  for (const f of activeFlights) {
    const { estDep, estArr } = estimatedTimesMap.get(f.id) ?? {};
    let nextEventMs: number | null = null;

    if (!f.actualDeparture) {
      const depTime = estDep ?? f.scheduledDeparture;
      if (depTime) nextEventMs = new Date(depTime).getTime();
    } else if (!f.actualArrival) {
      const arrTime = estArr ?? f.scheduledArrival;
      if (arrTime) nextEventMs = new Date(arrTime).getTime();
    }

    if (nextEventMs !== null && nextEventMs < soonestEventMs) {
      soonestEventMs = nextEventMs;
      soonestFlight = f.flightNumber;
    }
  }

  if (soonestEventMs === Infinity) {
    return {
      ms: mins(INTERVAL_IDLE_MINS),
      jitterMs: Math.floor(Math.random() * 90_000),
      reason: `${activeFlights.length} active flight(s) but no upcoming event times found — idle frequency`,
    };
  }

  const minsUntil = (soonestEventMs - now) / 60_000;

  if (minsUntil < 20) {
    return {
      ms: mins(INTERVAL_HIGH_MINS),
      jitterMs: Math.floor(Math.random() * 15_000),
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — high frequency (${INTERVAL_HIGH_MINS} min)`,
    };
  }
  if (minsUntil < 60) {
    return {
      ms: mins(INTERVAL_MEDIUM_MINS),
      jitterMs: Math.floor(Math.random() * 30_000),
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — medium frequency (${INTERVAL_MEDIUM_MINS} min)`,
    };
  }
  if (minsUntil < 120) {
    return {
      ms: mins(INTERVAL_LOW_MINS),
      jitterMs: Math.floor(Math.random() * 60_000),
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — low frequency (${INTERVAL_LOW_MINS} min)`,
    };
  }
  return {
    ms: mins(INTERVAL_IDLE_MINS),
    jitterMs: Math.floor(Math.random() * 90_000),
    reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — idle frequency (${INTERVAL_IDLE_MINS} min)`,
  };
}

// ---------------------------------------------------------------------------
// Sleep / wake decision (with data freshness check)
// ---------------------------------------------------------------------------

async function shouldSleep(): Promise<{ sleep: boolean; reason: string }> {
  const currentHour = guernseyHour();

  if (currentHour >= CUTOFF_HOUR) {
    return {
      sleep: true,
      reason: `Hard cutoff — Guernsey local hour ${currentHour} >= ${CUTOFF_HOUR}`,
    };
  }

  const today = guernseyDateStr();
  const totalToday = await countFlightsForDate(today);

  if (totalToday === 0) {
    return { sleep: false, reason: '' };
  }

  const activeFlights = await getActiveFlightsToday();
  if (activeFlights.length === 0) {
    // All flights terminal — but only trust if data is fresh
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
// Wake time calculation (checks today first, then tomorrow)
// ---------------------------------------------------------------------------

async function computeWakeTime(): Promise<{ wakeAt: Date; reason: string }> {
  const now = new Date();
  const today = guernseyDateStr();

  // Step 1: check TODAY first — if there are active flights, wake for them
  if (guernseyHour() < CUTOFF_HOUR) {
    try {
      const activeToday = await getActiveFlightsToday();
      if (activeToday.length > 0) {
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
          return {
            wakeAt: now,
            reason: `Active flights on ${today} need tracking but wake time already passed — waking now`,
          };
        }

        return {
          wakeAt: now,
          reason: `Airborne/in-progress flights on ${today} need tracking — waking now`,
        };
      }
    } catch (err) {
      console.error('[Guernsey Live] Error querying today\'s flights for wake time:', err);
    }
  }

  // Step 2: today is done — look at tomorrow
  const tomorrow = guernseyTomorrowStr();
  const totalTomorrow = await countFlightsForDate(tomorrow);

  if (totalTomorrow > 0) {
    try {
      const [firstFlight] = await db
        .select({ scheduledDeparture: flights.scheduledDeparture })
        .from(flights)
        .where(
          and(
            eq(flights.flightDate, tomorrow),
            eq(flights.canceled, false),
          ),
        )
        .orderBy(asc(flights.scheduledDeparture))
        .limit(1);

      if (firstFlight?.scheduledDeparture) {
        const firstDepMs = new Date(firstFlight.scheduledDeparture).getTime();
        const wakeAt = new Date(firstDepMs - mins(WAKE_OFFSET_MINS));
        if (wakeAt > now) {
          return {
            wakeAt,
            reason: `${WAKE_OFFSET_MINS}m before first flight on ${tomorrow} — waking at ${wakeAt.toISOString()}`,
          };
        }
      }
    } catch (err) {
      console.error('[Guernsey Live] Error querying first flight for wake time:', err);
    }
  }

  // Step 3: Fallback — 05:00 Guernsey local time tomorrow
  const fallback = nextGuernseyTime(5, 0);
  return {
    wakeAt: fallback,
    reason: `No tomorrow schedule found (${totalTomorrow} flights loaded for ${tomorrow}) — falling back to 05:00 Guernsey`,
  };
}

// ---------------------------------------------------------------------------
// Scrape execution
// ---------------------------------------------------------------------------

async function runLiveScrape(includeTomorrow: boolean): Promise<void> {
  const startedAt = new Date();
  let totalFlights = 0;
  let totalUpdates = 0;

  const logEntry = await db
    .insert(scraperLogs)
    .values({ service: 'guernsey_live', status: 'retry', startedAt })
    .returning({ id: scraperLogs.id });
  const logId = logEntry[0].id;

  try {
    const todayStr = guernseyDateStr();
    const todayDate = new Date(todayStr);
    const todayResult = await scrapeDayFlights(todayDate);
    totalFlights += todayResult.flights;
    totalUpdates += todayResult.updates;
    if (includeTomorrow) {
      const tomorrowStr = guernseyTomorrowStr();
      const tomorrowDate = new Date(tomorrowStr);
      const tomorrowResult = await scrapeDayFlights(tomorrowDate);
      totalFlights += tomorrowResult.flights;
      totalUpdates += tomorrowResult.updates;
      lastTomorrowScrapeAt = new Date();
    }

    await db
      .update(scraperLogs)
      .set({ status: 'success', recordsScraped: totalUpdates, completedAt: new Date() })
      .where(eq(scraperLogs.id, logId));

    console.log(`[Guernsey Live] Scraped today${includeTomorrow ? '+tomorrow' : ''}: ${totalFlights} flights, ${totalUpdates} updates`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Guernsey Live] Scrape error:', errorMessage);

    await db
      .update(scraperLogs)
      .set({ status: 'failure', errorMessage, completedAt: new Date() })
      .where(eq(scraperLogs.id, logId));
  }
}

// ---------------------------------------------------------------------------
// Wall-clock prefetch scheduler (00:00, 06:00, 12:00, 18:00 GY local)
// ---------------------------------------------------------------------------

async function runBackgroundPrefetch(): Promise<void> {
  const todayStr = guernseyDateStr();
  const tomorrowStr = guernseyTomorrowStr();
  console.log(`[Guernsey Live] Background prefetch: fetching ${todayStr} + ${tomorrowStr}...`);

  try {
    const todayDate = new Date(todayStr);
    const tomorrowDate = new Date(tomorrowStr);
    const todayResult = await scrapeDayFlights(todayDate);
    const tomorrowResult = await scrapeDayFlights(tomorrowDate);
    lastTomorrowScrapeAt = new Date();

    const totalFlights = todayResult.flights + tomorrowResult.flights;
    const msg = `${totalFlights} flights scraped for ${todayStr} + ${tomorrowStr}`;
    console.log(`[Guernsey Live] Background prefetch complete: ${msg}`);
    await logSchedulerEvent('prefetch', msg);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Guernsey Live] Background prefetch failed:', errorMessage);
    await logSchedulerEvent('prefetch', `failed — ${errorMessage}`);
  }

  // If sleeping, check whether newly loaded data changes wake time
  if (timers.wakeTimeout !== null && scheduledWakeAtMs !== null) {
    const { wakeAt, reason } = await computeWakeTime();

    if (wakeAt.getTime() <= Date.now()) {
      console.log(`[Guernsey Live] Prefetch detected we should already be awake — cancelling sleep`);
      clearTimeout(timers.wakeTimeout);
      timers.wakeTimeout = null;
      scheduledWakeAtMs = null;
      await logSchedulerEvent('wake', `Early wake triggered by prefetch — ${reason}`);
      try {
        await runLiveScrape(false);
        await scheduleNextScrape();
      } catch (err) {
        console.error('[Guernsey Live] Error in prefetch-triggered wake:', err);
        await scheduleNextScrape();
      }
      return;
    }

    const diffMs = Math.abs(wakeAt.getTime() - scheduledWakeAtMs);
    if (diffMs > 5 * 60_000) {
      console.log(`[Guernsey Live] Prefetch updated first-flight data — rescheduling wake to ${wakeAt.toISOString()}`);
      clearTimeout(timers.wakeTimeout);
      scheduledWakeAtMs = wakeAt.getTime();
      const sleepMs = Math.max(0, wakeAt.getTime() - Date.now());
      timers.wakeTimeout = setTimeout(async () => {
        try {
          timers.wakeTimeout = null;
          scheduledWakeAtMs = null;
          await logSchedulerEvent('wake', `Waking up (rescheduled by prefetch) — ${reason}`);
          await runLiveScrape(false);
          await scheduleNextScrape();
        } catch (err) {
          console.error('[Guernsey Live] Error in rescheduled wake:', err);
          timers.wakeTimeout = null;
          scheduledWakeAtMs = null;
          try { await scheduleNextScrape(); } catch {
            setTimeout(() => scheduleNextScrape().catch(e => console.error('[Guernsey Live] Fatal retry failed:', e)), 5 * 60 * 1000);
          }
        }
      }, sleepMs);
    }
  }
}

async function schedulePrefetchSlot(): Promise<void> {
  const SLOT_HOURS = [0, 6, 12, 18];
  const now = new Date();
  const currentHourGY = guernseyHour(now);

  let nextSlotHour = SLOT_HOURS.find(h => h > currentHourGY);
  if (nextSlotHour === undefined) {
    nextSlotHour = 0;
  }

  const nextSlotTime = nextGuernseyTime(nextSlotHour, 0);

  const slotMs = Math.max(0, nextSlotTime.getTime() - now.getTime());
  console.log(
    `[Guernsey Live] Next prefetch slot: ${nextSlotHour.toString().padStart(2, '0')}:00 GY ` +
    `(${Math.round(slotMs / 60_000)} minutes from now)`,
  );

  if (timers.prefetchSlotTimeout) {
    clearTimeout(timers.prefetchSlotTimeout);
    timers.prefetchSlotTimeout = null;
  }

  timers.prefetchSlotTimeout = setTimeout(async () => {
    timers.prefetchSlotTimeout = null;
    try {
      if (!checkCircuitBreaker()) {
        console.log('[Guernsey Live] Circuit breaker open, skipping prefetch slot');
      } else {
        console.log('[Guernsey Live] Prefetch slot fired — running standalone');
        await runBackgroundPrefetch();
      }
      await schedulePrefetchSlot();
    } catch (err) {
      console.error('[Guernsey Live] Error in prefetch slot timeout:', err);
      setTimeout(() => schedulePrefetchSlot().catch(e => console.error('[Guernsey Live] Fatal prefetch slot error:', e)), 5 * 60 * 1000);
    }
  }, slotMs);
}

// ---------------------------------------------------------------------------
// Scheduling loop
// ---------------------------------------------------------------------------

async function scheduleNextScrape(): Promise<void> {
  const { sleep, reason } = await shouldSleep();

  if (sleep) {
    await logSchedulerEvent('sleep', reason);

    // Run final prefetch before sleeping
    console.log('[Guernsey Live] Running final prefetch before sleeping...');
    await runLiveScrape(true);

    const { wakeAt, reason: wakeReason } = await computeWakeTime();
    scheduledWakeAtMs = wakeAt.getTime();
    const sleepMs = Math.max(0, wakeAt.getTime() - Date.now());

    await logSchedulerEvent('sleep', `Sleeping for ${Math.round(sleepMs / 60_000)}m. ${wakeReason}`);

    timers.wakeTimeout = setTimeout(async () => {
      try {
        timers.wakeTimeout = null;
        scheduledWakeAtMs = null;
        await logSchedulerEvent('wake', `Waking up — ${wakeReason}`);
        await runLiveScrape(false);
        await scheduleNextScrape();
      } catch (err) {
        console.error('[Guernsey Live] Error in wake timeout:', err);
        timers.wakeTimeout = null;
        scheduledWakeAtMs = null;
        try { await scheduleNextScrape(); } catch {
          setTimeout(() => scheduleNextScrape().catch(e => console.error('[Guernsey Live] Fatal retry failed:', e)), 5 * 60 * 1000);
        }
      }
    }, sleepMs);

    return;
  }

  // Active — compute dynamic interval with jitter
  const { ms, jitterMs, reason: intervalReason } = await computeNextInterval();
  const totalMs = ms + jitterMs;

  console.log(
    `[Guernsey Live] Next scrape in ${Math.round(ms / 1000)}s + ${Math.round(jitterMs / 1000)}s jitter = ${Math.round(totalMs / 1000)}s. Reason: ${intervalReason}`,
  );

  // Include tomorrow if enough time has elapsed
  const includeTomorrow = !lastTomorrowScrapeAt ||
    (Date.now() - lastTomorrowScrapeAt.getTime()) > mins(INTERVAL_TOMORROW_MINS);

  if (timers.scrapeTimeout) {
    clearTimeout(timers.scrapeTimeout);
    timers.scrapeTimeout = null;
  }

  timers.scrapeTimeout = setTimeout(async () => {
    timers.scrapeTimeout = null;

    if (!checkCircuitBreaker()) {
      console.log('[Guernsey Live] Circuit breaker open, skipping scrape and rescheduling');
      await scheduleNextScrape();
      return;
    }

    try {
      await runLiveScrape(includeTomorrow);
      recordSuccess();
    } catch (err) {
      console.error('[Guernsey Live] Error in scheduled scrape:', err);
      recordFailure();
    }
    await scheduleNextScrape();
  }, totalMs);
}

// ---------------------------------------------------------------------------
// Startup history check — ensure the last 10 days have data
// ---------------------------------------------------------------------------

/**
 * On startup, check that each of the 10 days prior to today has at least one
 * flight record. Any day with no data is backfilled before the live loop starts.
 * This ensures the web app always has recent history even after a long outage or
 * a fresh deployment.
 */
async function ensureRecentHistory(): Promise<void> {
  const today = guernseyDateStr();
  const missing: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const n = await countFlightsForDate(dateStr);
    if (n === 0) missing.push(dateStr);
  }

  if (missing.length === 0) {
    console.log('[Guernsey Live] Recent history OK — all 10 prior days have data');
    return;
  }

  console.log(`[Guernsey Live] Missing data for ${missing.length} of last 10 days: ${missing.join(', ')} — backfilling...`);

  for (const dateStr of missing) {
    try {
      const result = await scrapeDayFlights(new Date(dateStr));
      console.log(`[Guernsey Live] Backfilled ${dateStr}: ${result.flights} flights, ${result.updates} updates`);
    } catch (err) {
      console.error(`[Guernsey Live] Failed to backfill ${dateStr}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('[Guernsey Live] Recent history backfill complete');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runLiveMode(): Promise<void> {
  console.log('[Guernsey Live] Starting live scraper...');
  console.log(`[Guernsey Live] Config — cutoff: ${CUTOFF_HOUR}:00 GY, wake offset: ${WAKE_OFFSET_MINS}m`);
  console.log(`[Guernsey Live] Intervals — high: ${INTERVAL_HIGH_MINS}m, medium: ${INTERVAL_MEDIUM_MINS}m, low: ${INTERVAL_LOW_MINS}m, idle: ${INTERVAL_IDLE_MINS}m`);

  process.on('SIGTERM', () => {
    console.log('[Guernsey Live] SIGTERM received, cleaning up...');
    clearAllTimers();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('[Guernsey Live] SIGINT received, cleaning up...');
    clearAllTimers();
    process.exit(0);
  });
  process.on('uncaughtException', (err) => {
    console.error('[Guernsey Live] Uncaught exception:', err);
    clearAllTimers();
    process.exit(1);
  });

  // Ensure at least 10 days of prior history exist before entering the live loop
  await ensureRecentHistory();

  // Schedule wall-clock prefetch slots at 00:00, 06:00, 12:00, 18:00 GY local
  schedulePrefetchSlot();

  const currentHour = guernseyHour();
  const earlyMorningCutoff = 5;
  const isInSleepWindow = currentHour >= CUTOFF_HOUR || currentHour < earlyMorningCutoff;

  if (isInSleepWindow) {
    console.log(`[Guernsey Live] Startup during sleep window (Guernsey hour: ${currentHour}) — going straight to sleep state`);
    await scheduleNextScrape();
  } else {
    const elapsed = await msSinceLastScrape();
    const { ms: nextMs } = await computeNextInterval();

    if (elapsed === Infinity) {
      console.log('[Guernsey Live] No previous scrape found — running immediately');
      await runLiveScrape(true);
    } else if (elapsed < nextMs) {
      const waitMs = nextMs - elapsed;
      console.log(
        `[Guernsey Live] Last scrape was ${Math.round(elapsed / 1000)}s ago — ` +
        `within current interval (${Math.round(nextMs / 1000)}s). ` +
        `Resuming in ~${Math.round(waitMs / 1000)}s`,
      );
      await new Promise(r => setTimeout(r, waitMs));
      await runLiveScrape(true);
    } else {
      console.log(
        `[Guernsey Live] Last scrape was ${Math.round(elapsed / 1000)}s ago — running immediately`,
      );
      await runLiveScrape(true);
    }

    await scheduleNextScrape();
  }
}
