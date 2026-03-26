import { loadEnv, type AirborneEntry } from '@airways/common';
loadEnv({ serviceName: 'ADSB', startDir: __dirname, logPath: true });

import { db, flights } from '@airways/database';
import { eq, and, sql, isNull, gte, lte, asc } from 'drizzle-orm';
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
        // Don't touch terminal flights
        sql`COALESCE(${flights.status}, '') NOT IN ('Cancelled', 'Landed', 'Diverted')`,
      ),
    );
}

async function propagateRegistration(
  registration: string,
  aircraftType: string,
  anchorFlightId: number,
): Promise<void> {
  // Fetch the anchor flight to get its route and times
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

  if (!anchor) return;

  // Get all GR flights for the same day that are missing registration, ordered by departure
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

  if (unregistered.length === 0) return;

  const matched: number[] = [];

  // Walk forward: starting from anchor's arrival, find the chain of connecting flights
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

  // Walk backward: starting from anchor's departure, find the chain going back
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

  if (matched.length === 0) return;

  // Update all matched flights
  for (const flightId of matched) {
    await db
      .update(flights)
      .set({
        aircraftRegistration: registration,
        aircraftType: aircraftType,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(flights.id, flightId),
          isNull(flights.aircraftRegistration),
        ),
      );
  }

  console.log(
    `[ADSB] Propagated ${registration} to ${matched.length} flight(s): [${matched.join(', ')}]`,
  );
}

async function propagateExistingRegistrations(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Find all GR flights today that already have a registration
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

  if (anchors.length === 0) {
    console.log('[ADSB] No registered flights today to propagate from');
    return;
  }

  console.log(`[ADSB] Startup propagation: ${anchors.length} registered flight(s) today`);

  // Group by registration to avoid redundant propagation
  const seen = new Set<string>();
  for (const a of anchors) {
    if (seen.has(a.aircraftRegistration!)) continue;
    seen.add(a.aircraftRegistration!);
    await propagateRegistration(
      a.aircraftRegistration!,
      a.aircraftType ?? '',
      a.id,
    );
  }
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
    const departureIata = result.origIata ?? 'GCI';

    // If destIata is missing, try matching by callsign (flight number)
    let destIata = result.destIata;
    if (!destIata && result.callsign) {
      // Extract flight number from callsign (e.g., "GR406" or "GR 406")
      const match = result.callsign.match(/GR\s*(\d+)/i);
      if (match) {
        const flightNumber = `GR${match[1]}`;
        // Find the flight by number, scheduled to depart around now
        const [flight] = await db
          .select({
            id: flights.id,
            arrivalAirport: flights.arrivalAirport,
          })
          .from(flights)
          .where(
            and(
              eq(flights.flightNumber, flightNumber),
              eq(flights.departureAirport, departureIata),
              gte(flights.scheduledDeparture, windowStart),
              lte(flights.scheduledDeparture, windowEnd),
            ),
          )
          .limit(1);

        if (flight) {
          destIata = flight.arrivalAirport;
          console.log(
            `[ADSB] ${aircraft.registration}: matched by callsign ${result.callsign} → ` +
              `${departureIata}→${destIata}`,
          );
        }
      }
    }

    if (!destIata) {
      console.log(
        `[ADSB] ${aircraft.registration}: airborne but no destIata or matching callsign, skipping`,
      );
      continue;
    }

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
            eq(flights.arrivalAirport, destIata),
            isNull(flights.aircraftRegistration),
            gte(flights.scheduledDeparture, windowStart),
            lte(flights.scheduledDeparture, windowEnd),
          ),
        )
        .orderBy(sql`ABS(EXTRACT(EPOCH FROM (${flights.scheduledDeparture} - NOW())))`);

      const match = candidates[0];
      if (!match) {
        console.log(
          `[ADSB] ${aircraft.registration}: airborne, ${departureIata}→${destIata} — ` +
            `no matching unregistered flight`,
        );
      } else {
        await db
          .update(flights)
          .set({
            aircraftRegistration: aircraft.registration,
            aircraftType: aircraft.type,
            status: 'Airborne',
            actualDeparture: sql`COALESCE(${flights.actualDeparture}, NOW())`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(flights.id, match.id),
              sql`COALESCE(${flights.status}, '') NOT IN ('Landed', 'Cancelled', 'Diverted')`,
            ),
          );

        registrationDone.set(aircraft.icao24, nowMs + REGISTRATION_COOLDOWN_MS);
        airborneTracker.set(aircraft.icao24, {
          flightId: match.id,
          arrivalAirport: destIata as string,
          missedPolls: 0,
        });

        console.log(
          `[ADSB] ${aircraft.registration}: airborne, ${departureIata}→${destIata} → ` +
            `matched flight ${match.id}, status=Airborne`,
        );

        // Propagate this registration to adjacent flights in the day's rotation
        await propagateRegistration(aircraft.registration, aircraft.type, match.id);
      }
    } else if (tracked) {
      // Registration already written — just keep status fresh
      const entry = airborneTracker.get(aircraft.icao24)!;
      await db
        .update(flights)
        .set({
          status: 'Airborne',
          actualDeparture: sql`COALESCE(${flights.actualDeparture}, NOW())`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(flights.id, entry.flightId),
            sql`COALESCE(${flights.status}, '') NOT IN ('Landed', 'Cancelled', 'Diverted')`,
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

  // On startup, propagate any existing registrations to adjacent flights
  await propagateExistingRegistrations();

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
