import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

// Walk up from __dirname until we find the .env file
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
  console.warn('[FR24] Warning: .env file not found, relying on environment variables');
}

import { scrapeOnce, guernseyDateStr } from './scraper';
import { db, scraperLogs, flights, flightTimes } from '@airways/database';
import { eq, and, not, inArray, desc, count, max, asc, isNull, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const mins = (n: number) => n * 60_000;

const CUTOFF_HOUR          = parseInt(process.env.SCRAPER_CUTOFF_HOUR           || '23', 10);
const WAKE_OFFSET_MINS     = parseInt(process.env.SCRAPER_WAKE_OFFSET_MINS       || '30', 10);
const INTERVAL_HIGH_MS     = mins(parseInt(process.env.SCRAPER_INTERVAL_HIGH_MINS   || '2',  10));
const INTERVAL_MEDIUM_MS   = mins(parseInt(process.env.SCRAPER_INTERVAL_MEDIUM_MINS || '5',  10));
const INTERVAL_LOW_MS      = mins(parseInt(process.env.SCRAPER_INTERVAL_LOW_MINS    || '10', 10));
const INTERVAL_IDLE_MS     = mins(parseInt(process.env.SCRAPER_INTERVAL_IDLE_MINS   || '15', 10));
const CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.SCRAPER_CIRCUIT_BREAKER_THRESHOLD || '5', 10);
const CIRCUIT_BREAKER_RESET_MS = parseInt(process.env.SCRAPER_CIRCUIT_BREAKER_RESET_MS || '60000', 10);

const TERMINAL_STATUSES = ['Landed', 'Cancelled'];

// ---------------------------------------------------------------------------
// State Management & Circuit Breaker
// ---------------------------------------------------------------------------

interface TimerState {
  scrapeTimeout: ReturnType<typeof setTimeout> | null;
  wakeTimeout: ReturnType<typeof setTimeout> | null;
}

const timers: TimerState = {
  scrapeTimeout: null,
  wakeTimeout: null,
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
      console.log('[FR24] Circuit breaker reset, resuming operations');
      return true;
    }
    console.log('[FR24] Circuit breaker is OPEN, skipping operation');
    return false;
  }
  return true;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    console.error(`[FR24] Circuit breaker OPENED after ${circuitBreaker.failures} failures`);
  }
}

function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
  }
}

// ---------------------------------------------------------------------------
// Timezone utilities
// ---------------------------------------------------------------------------

const GY_TZ = 'Europe/London';

function guernseyHour(d: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: GY_TZ, hour: 'numeric', hour12: false }).format(d),
    10,
  );
}

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

  const [datePart, timePart] = nowGYStr.split(', ');
  const [dd, mm, yyyy] = datePart.split('/');
  const gyWallNow = new Date(`${yyyy}-${mm}-${dd}T${timePart}Z`);
  const offsetMs = now.getTime() - gyWallNow.getTime();

  const targetGYWall = new Date(`${candidateStr}Z`);
  let targetUTC = new Date(targetGYWall.getTime() + offsetMs);

  if (targetUTC <= now) {
    targetUTC = new Date(targetUTC.getTime() + 24 * 60 * 60 * 1000);
  }

  return targetUTC;
}

function guernseyTomorrowStr(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(tomorrow);
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
    // Return empty map on error
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scheduler event logger
// ---------------------------------------------------------------------------

async function logSchedulerEvent(type: 'sleep' | 'wake', detail: string): Promise<void> {
  try {
    const label = type === 'sleep' ? 'SLEEP' : 'WAKE';
    await db.insert(scraperLogs).values({
      service: 'fr24_live' as any,
      status: 'success',
      recordsScraped: 0,
      errorMessage: `[${label}] ${detail}`,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    console.log(`[FR24] [${label}] ${detail}`);
  } catch (err) {
    console.error('[FR24] Failed to write scheduler event to DB:', err);
  }
}

// ---------------------------------------------------------------------------
// Dynamic interval calculation
// ---------------------------------------------------------------------------

async function computeNextInterval(): Promise<{ ms: number; jitterMs: number; reason: string }> {
  const activeFlights = await getActiveFlightsToday();

  if (activeFlights.length === 0) {
    return {
      ms: INTERVAL_IDLE_MS,
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
      ms: INTERVAL_IDLE_MS,
      jitterMs: Math.floor(Math.random() * 90_000),
      reason: `${activeFlights.length} active flight(s) but no upcoming event times found — idle frequency`,
    };
  }

  const minsUntil = (soonestEventMs - now) / 60_000;

  if (minsUntil < 20) {
    return {
      ms: INTERVAL_HIGH_MS,
      jitterMs: Math.floor(Math.random() * 15_000),
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — high frequency (2 min)`,
    };
  }
  if (minsUntil < 60) {
    return {
      ms: INTERVAL_MEDIUM_MS,
      jitterMs: Math.floor(Math.random() * 30_000),
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — medium frequency (5 min)`,
    };
  }
  if (minsUntil < 120) {
    return {
      ms: INTERVAL_LOW_MS,
      jitterMs: Math.floor(Math.random() * 60_000),
      reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — low frequency (10 min)`,
    };
  }
  return {
    ms: INTERVAL_IDLE_MS,
    jitterMs: Math.floor(Math.random() * 90_000),
    reason: `${minsUntil.toFixed(0)}m until ${soonestFlight} event — idle frequency (15 min)`,
  };
}

// ---------------------------------------------------------------------------
// Sleep / wake decision
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
    try {
      const [{ lastUpdate }] = await db
        .select({ lastUpdate: max(flights.updatedAt) })
        .from(flights)
        .where(eq(flights.flightDate, today));

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (!lastUpdate || new Date(lastUpdate) < twoHoursAgo) {
        return {
          sleep: false,
          reason: `All flights appear terminal but data is stale — scraping to refresh`,
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
// Wake time calculation
// ---------------------------------------------------------------------------

async function computeWakeTime(): Promise<{ wakeAt: Date; reason: string }> {
  const now = new Date();
  const today = guernseyDateStr();

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
              reason: `${WAKE_OFFSET_MINS}m before next flight on ${today}`,
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
      console.error('[FR24] Error querying today\'s flights for wake time:', err);
    }
  }

  const tomorrow = guernseyTomorrowStr();
  const totalTomorrow = await countFlightsForDate(tomorrow);

  if (totalTomorrow > 0) {
    try {
      const [firstFlight] = await db
        .select({ scheduledDeparture: flights.scheduledDeparture })
        .from(flights)
        .where(eq(flights.flightDate, tomorrow))
        .orderBy(flights.scheduledDeparture)
        .limit(1);

      if (firstFlight?.scheduledDeparture) {
        const firstDepMs = new Date(firstFlight.scheduledDeparture).getTime();
        const wakeAt = new Date(firstDepMs - WAKE_OFFSET_MINS * 60_000);
        if (wakeAt > now) {
          return {
            wakeAt,
            reason: `${WAKE_OFFSET_MINS}m before first flight on ${tomorrow}`,
          };
        }
      }
    } catch (err) {
      console.error('[FR24] Error querying first flight for wake time:', err);
    }
  }

  const fallback = nextGuernseyTime(5, 0);
  return {
    wakeAt: fallback,
    reason: `No tomorrow schedule found — falling back to 05:00 Guernsey`,
  };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

async function msSinceLastScrape(): Promise<number> {
  try {
    const [last] = await db
      .select({ completedAt: scraperLogs.completedAt })
      .from(scraperLogs)
      .where(eq(scraperLogs.service, 'fr24_live' as any))
      .orderBy(desc(scraperLogs.completedAt))
      .limit(1);
    if (!last?.completedAt) return Infinity;
    return Date.now() - new Date(last.completedAt).getTime();
  } catch {
    return Infinity;
  }
}

// ---------------------------------------------------------------------------
// Registration propagation — after FR24 writes a registration to any flight,
// chain it forward/backward through the day's schedule so adjacent flights
// operated by the same aircraft also get the registration.
// ---------------------------------------------------------------------------

async function propagateRegistration(
  registration: string,
  aircraftType: string | null,
  anchorFlightId: number,
): Promise<number> {
  const [anchor] = await db
    .select({
      id: flights.id,
      departureAirport: flights.departureAirport,
      arrivalAirport: flights.arrivalAirport,
      scheduledDeparture: flights.scheduledDeparture,
      scheduledArrival: flights.scheduledArrival,
      flightDate: flights.flightDate,
    })
    .from(flights)
    .where(eq(flights.id, anchorFlightId));

  if (!anchor) return 0;

  const unregistered = await db
    .select({
      id: flights.id,
      departureAirport: flights.departureAirport,
      arrivalAirport: flights.arrivalAirport,
      scheduledDeparture: flights.scheduledDeparture,
      scheduledArrival: flights.scheduledArrival,
    })
    .from(flights)
    .where(
      and(
        eq(flights.airlineCode, 'GR'),
        eq(flights.flightDate, anchor.flightDate),
        isNull(flights.aircraftRegistration),
      ),
    )
    .orderBy(asc(flights.scheduledDeparture));

  if (unregistered.length === 0) return 0;

  const matched: number[] = [];

  // Walk forward: anchor arrives at X → find next flight departing from X
  let currentArrival = anchor.arrivalAirport;
  let currentArrivalTime = anchor.scheduledArrival;
  for (const f of unregistered) {
    if (
      f.departureAirport === currentArrival &&
      f.scheduledDeparture >= currentArrivalTime
    ) {
      matched.push(f.id);
      currentArrival = f.arrivalAirport;
      currentArrivalTime = f.scheduledArrival;
    }
  }

  // Walk backward: anchor departs from Y → find previous flight arriving at Y
  let currentDeparture = anchor.departureAirport;
  let currentDepartureTime = anchor.scheduledDeparture;
  for (let i = unregistered.length - 1; i >= 0; i--) {
    const f = unregistered[i];
    if (
      f.arrivalAirport === currentDeparture &&
      f.scheduledArrival <= currentDepartureTime
    ) {
      matched.push(f.id);
      currentDeparture = f.departureAirport;
      currentDepartureTime = f.scheduledDeparture;
    }
  }

  if (matched.length === 0) return 0;

  const updateSet: Record<string, unknown> = {
    aircraftRegistration: registration,
    updatedAt: new Date(),
  };
  if (aircraftType) updateSet.aircraftType = aircraftType;

  for (const flightId of matched) {
    await db
      .update(flights)
      .set(updateSet)
      .where(and(eq(flights.id, flightId), isNull(flights.aircraftRegistration)));
  }

  return matched.length;
}

async function propagateRegistrationsForToday(): Promise<void> {
  const today = guernseyDateStr();

  const anchors = await db
    .select({
      id: flights.id,
      aircraftRegistration: flights.aircraftRegistration,
      aircraftType: flights.aircraftType,
    })
    .from(flights)
    .where(
      and(
        eq(flights.airlineCode, 'GR'),
        eq(flights.flightDate, today),
        sql`${flights.aircraftRegistration} IS NOT NULL`,
      ),
    )
    .orderBy(asc(flights.scheduledDeparture));

  if (anchors.length === 0) return;

  const seen = new Set<string>();
  let totalPropagated = 0;

  for (const a of anchors) {
    if (seen.has(a.aircraftRegistration!)) continue;
    seen.add(a.aircraftRegistration!);
    const count = await propagateRegistration(
      a.aircraftRegistration!,
      a.aircraftType,
      a.id,
    );
    totalPropagated += count;
  }

  if (totalPropagated > 0) {
    console.log(`[FR24] Propagated registrations to ${totalPropagated} additional flight(s)`);
  }
}

async function runScrape(label: string): Promise<void> {
  const result = await scrapeOnce();
  if (!result.success) {
    console.error(`[FR24] ${label} failed: ${result.error}`);
  } else {
    console.log(`[FR24] ${label} complete — ${result.count} flights upserted`);
    // After a successful scrape, propagate any registrations FR24 wrote
    await propagateRegistrationsForToday();
  }
}

async function scheduleNextScrape(): Promise<void> {
  const { sleep, reason } = await shouldSleep();

  if (sleep) {
    await logSchedulerEvent('sleep', reason);

    const { wakeAt, reason: wakeReason } = await computeWakeTime();
    const sleepMs = Math.max(0, wakeAt.getTime() - Date.now());

    await logSchedulerEvent('sleep', `Sleeping for ${Math.round(sleepMs / 60_000)}m. ${wakeReason}`);
    console.log(`[FR24] Setting wake timeout: will fire in ${Math.round(sleepMs / 1000)}s at ${wakeAt.toISOString()}`);

    timers.wakeTimeout = setTimeout(async () => {
      try {
        timers.wakeTimeout = null;
        await logSchedulerEvent('wake', `Waking up — ${wakeReason}`);
        await runScrape('Post-sleep scrape');
        await scheduleNextScrape();
      } catch (err) {
        console.error('[FR24] Error in wake timeout callback:', err);
        timers.wakeTimeout = null;
        try {
          await scheduleNextScrape();
        } catch (err2) {
          console.error('[FR24] Fatal: Failed to reschedule after wake error:', err2);
          timers.wakeTimeout = setTimeout(() => {
            timers.wakeTimeout = null;
            scheduleNextScrape().catch(e => console.error('[FR24] Fatal retry failed:', e));
          }, 5 * 60 * 1000);
        }
      }
    }, sleepMs);

    return;
  }

  const { ms, jitterMs, reason: intervalReason } = await computeNextInterval();
  const totalMs = ms + jitterMs;

  console.log(
    `[FR24] Next scrape in ${Math.round(ms / 1000)}s + ${Math.round(jitterMs / 1000)}s jitter = ${Math.round(totalMs / 1000)}s. Reason: ${intervalReason}`,
  );

  if (timers.scrapeTimeout) {
    clearTimeout(timers.scrapeTimeout);
    timers.scrapeTimeout = null;
  }

  timers.scrapeTimeout = setTimeout(async () => {
    timers.scrapeTimeout = null;

    if (!checkCircuitBreaker()) {
      console.log('[FR24] Circuit breaker open, skipping scrape and rescheduling');
      await scheduleNextScrape();
      return;
    }

    try {
      await runScrape('Scheduled scrape');
      recordSuccess();
    } catch (err) {
      console.error('[FR24] Error in scheduled scrape:', err);
      recordFailure();
    }
    await scheduleNextScrape();
  }, totalMs);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log('[FR24] Scraper service starting...');
  console.log(`[FR24] Config — cutoff: ${CUTOFF_HOUR}:00 GY, wake offset: ${WAKE_OFFSET_MINS}m`);
  console.log(`[FR24] Intervals — high: ${INTERVAL_HIGH_MS / 1000}s, medium: ${INTERVAL_MEDIUM_MS / 1000}s, low: ${INTERVAL_LOW_MS / 1000}s, idle: ${INTERVAL_IDLE_MS / 1000}s`);

  const currentHour = guernseyHour();
  const earlyMorningCutoff = 5;
  const isInSleepWindow = currentHour >= CUTOFF_HOUR || currentHour < earlyMorningCutoff;

  if (isInSleepWindow) {
    console.log(`[FR24] Startup during sleep window (Guernsey hour: ${currentHour}) — going straight to sleep state`);
    await scheduleNextScrape();
  } else {
    const elapsed = await msSinceLastScrape();
    const { ms: nextMs } = await computeNextInterval();

    if (elapsed === Infinity) {
      console.log('[FR24] No previous scrape found — running immediately');
      await runScrape('Initial scrape');
    } else if (elapsed < nextMs) {
      const waitMs = nextMs - elapsed;
      console.log(
        `[FR24] Last scrape was ${Math.round(elapsed / 1000)}s ago — ` +
        `within current interval (${Math.round(nextMs / 1000)}s). ` +
        `Resuming in ~${Math.round(waitMs / 1000)}s`,
      );
      await new Promise(r => setTimeout(r, waitMs));
      await runScrape('Resume scrape');
    } else {
      console.log(
        `[FR24] Last scrape was ${Math.round(elapsed / 1000)}s ago — running immediately`,
      );
      await runScrape('Initial scrape');
    }

    await scheduleNextScrape();
  }
}

process.on('SIGTERM', () => {
  console.log('[FR24] SIGTERM received, cleaning up...');
  clearAllTimers();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[FR24] SIGINT received, cleaning up...');
  clearAllTimers();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[FR24] Uncaught exception:', err);
  clearAllTimers();
  process.exit(1);
});

main().catch(err => {
  console.error('[FR24] Fatal startup error:', err);
  clearAllTimers();
  process.exit(1);
});
