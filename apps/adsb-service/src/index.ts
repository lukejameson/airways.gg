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
  console.log(`[ADSB] Loaded env from ${envPath}`);
} else {
  console.warn('[ADSB] Warning: .env file not found, relying on environment variables');
}

import { db, flights } from '@airways/database';
import { eq, and, sql, isNull, gte, lte } from 'drizzle-orm';
import { lookupByHex } from './lookup';
import { AURIGNY_FLEET } from './fleet';

const INTERVAL_MS = parseInt(process.env.ADSB_INTERVAL_MS ?? '60000', 10);

// How long to skip re-writing registration after a successful match (24 hours)
const REGISTRATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Missed-poll thresholds before declaring a flight landed based on direction:
// GCI-bound flights disappear from UK ADS-B coverage as they approach the Channel Islands —
// declare Landed after fewer misses.  UK-bound flights should remain visible all the way to
// touchdown, so we wait longer before giving up.
const GCI_MISSED_THRESHOLD = 3;
const UK_MISSED_THRESHOLD = 6;

// icao24 → timestamp when registration-write cooldown expires
const registrationDone = new Map<string, number>();

interface AirborneEntry {
  flightId: number;
  arrivalAirport: string;
  missedPolls: number;
}

const airborneTracker = new Map<string, AirborneEntry>();

async function markLanded(flightId: number): Promise<void> {
  // Set status=Landed; only set actualArrival if not already stored from a more accurate source
  await db
    .update(flights)
    .set({
      status: 'Landed',
      actualArrival: sql`COALESCE(${flights.actualArrival}, NOW())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(flights.id, flightId),
        // Don't touch cancelled flights
        sql`COALESCE(${flights.status}, '') != 'Cancelled'`,
      ),
    );
}

async function pollRegistrations(): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();

  // Search window: flights scheduled to depart in the last 4 hours or next 30 min
  const windowStart = new Date(nowMs - 4 * 60 * 60 * 1000);
  const windowEnd = new Date(nowMs + 30 * 60 * 1000);

  for (const aircraft of AURIGNY_FLEET) {
    const tracked = airborneTracker.has(aircraft.icao24);
    const regExpiry = registrationDone.get(aircraft.icao24);
    const regDone = regExpiry != null && nowMs < regExpiry;

    // Skip aircraft where registration is already written AND we're not tracking a live flight
    if (regDone && !tracked) continue;

    const result = await lookupByHex(aircraft.icao24);

    // Rate-limit between hex queries — generous delay since we only have a few active aircraft
    await new Promise(r => setTimeout(r, 2000));

    // ── Aircraft not visible to any ADS-B receiver ──────────────────────────
    if (!result) {
      if (tracked) {
        const entry = airborneTracker.get(aircraft.icao24)!;
        entry.missedPolls++;
        const threshold =
          entry.arrivalAirport === 'GCI' ? GCI_MISSED_THRESHOLD : UK_MISSED_THRESHOLD;

        if (entry.missedPolls >= threshold) {
          console.log(
            `[ADSB] ${aircraft.registration}: not seen for ${entry.missedPolls} polls — ` +
              `marking flight ${entry.flightId} Landed (${entry.arrivalAirport})`,
          );
          await markLanded(entry.flightId);
          airborneTracker.delete(aircraft.icao24);
        } else {
          console.log(
            `[ADSB] ${aircraft.registration}: not visible (miss ${entry.missedPolls}/${threshold})`,
          );
        }
      } else {
        console.log(`[ADSB] ${aircraft.registration}: not visible`);
      }
      continue;
    }

    // Reset missed-polls counter now that the aircraft is visible again
    if (tracked) {
      airborneTracker.get(aircraft.icao24)!.missedPolls = 0;
    }

    // ── Aircraft on the ground ───────────────────────────────────────────────
    if (result.onGround) {
      if (tracked) {
        const entry = airborneTracker.get(aircraft.icao24)!;
        console.log(
          `[ADSB] ${aircraft.registration}: on ground at ${result.origIata ?? '?'} — ` +
            `marking flight ${entry.flightId} Landed`,
        );
        await markLanded(entry.flightId);
        airborneTracker.delete(aircraft.icao24);
      } else {
        console.log(`[ADSB] ${aircraft.registration}: on ground, skipping`);
      }
      continue;
    }

    // ── Aircraft airborne ────────────────────────────────────────────────────
    if (!result.destIata) {
      console.log(`[ADSB] ${aircraft.registration}: airborne but no destIata, skipping`);
      continue;
    }

    const departureIata = result.origIata ?? 'GCI';

    if (!regDone) {
      // Find the best-matching unregistered GR flight: closest scheduled departure to now
      const candidates = await db
        .select({
          id: flights.id,
          scheduledDeparture: flights.scheduledDeparture,
        })
        .from(flights)
        .where(
          and(
            eq(flights.airlineCode, 'GR'),
            eq(flights.departureAirport, departureIata),
            eq(flights.arrivalAirport, result.destIata),
            isNull(flights.aircraftRegistration),
            gte(flights.scheduledDeparture, windowStart),
            lte(flights.scheduledDeparture, windowEnd),
          ),
        )
        .orderBy(sql`ABS(EXTRACT(EPOCH FROM (${flights.scheduledDeparture} - NOW())))`);

      const match = candidates[0];
      if (!match) {
        console.log(
          `[ADSB] ${aircraft.registration}: airborne, ${departureIata}→${result.destIata} — ` +
            `no matching unregistered flight`,
        );
      } else {
        await db
          .update(flights)
          .set({
            aircraftRegistration: aircraft.registration,
            aircraftType: aircraft.type,
            status: 'Airborne',
            updatedAt: new Date(),
          })
          .where(eq(flights.id, match.id));

        registrationDone.set(aircraft.icao24, nowMs + REGISTRATION_COOLDOWN_MS);
        airborneTracker.set(aircraft.icao24, {
          flightId: match.id,
          arrivalAirport: result.destIata,
          missedPolls: 0,
        });

        console.log(
          `[ADSB] ${aircraft.registration}: airborne, ${departureIata}→${result.destIata} → ` +
            `matched flight ${match.id}, status=Airborne`,
        );
      }
    } else if (tracked) {
      // Registration already written — just keep status fresh
      const entry = airborneTracker.get(aircraft.icao24)!;
      await db
        .update(flights)
        .set({ status: 'Airborne', updatedAt: new Date() })
        .where(
          and(
            eq(flights.id, entry.flightId),
            sql`COALESCE(${flights.status}, '') NOT IN ('Landed', 'Cancelled')`,
          ),
        );
      console.log(
        `[ADSB] ${aircraft.registration}: still airborne → refreshed status for flight ${entry.flightId}`,
      );
    }
  }
}

async function main(): Promise<void> {
  console.log('[ADSB] Registration lookup service starting (hex fleet mode)...');
  console.log(`[ADSB] Poll interval: ${INTERVAL_MS / 1000}s`);
  console.log('[ADSB] Providers: adsb.lol (primary), airplanes.live (fallback)');
  console.log(`[ADSB] Fleet: ${AURIGNY_FLEET.length} aircraft configured`);

  async function poll(): Promise<void> {
    try {
      await pollRegistrations();
    } catch (err) {
      console.error('[ADSB] Poll error:', err instanceof Error ? err.message : err);
    }
    setTimeout(poll, INTERVAL_MS);
  }

  await poll();
}

process.on('uncaughtException', (err) => {
  console.error('[ADSB] Uncaught exception:', err);
  process.exit(1);
});

main().catch(err => {
  console.error('[ADSB] Fatal error:', err);
  process.exit(1);
});
