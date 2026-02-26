import { db, flights, aircraftPositions, airports } from '@delays/database';
import { and, gte, lte, or, eq, desc, isNotNull, not, inArray } from 'drizzle-orm';

const FR24_BASE = 'https://fr24api.flightradar24.com';

interface Fr24Position {
  fr24_id: string;
  flight: string | null;
  callsign: string | null;
  lat: number;
  lon: number;
  track: number;
  alt: number;
  gspeed: number;
  vspeed: number;
  squawk: string;
  timestamp: string;
  source: string;
  hex: string | null;
  type: string | null;
  reg: string | null;
  painted_as: string | null;
  operating_as: string | null;
  orig_iata: string | null;
  orig_icao: string | null;
  dest_iata: string | null;
  dest_icao: string | null;
  eta: string | null;
}

interface Fr24Response {
  data: Fr24Position[];
}

interface FlightToPoll {
  id: number;
  flightNumber: string;
  status: string | null;
  scheduledDeparture: Date;
  actualDeparture: Date | null;
  aircraftRegistration: string | null;
  priority: 'high' | 'medium' | 'low';
}

// ── Poll interval configuration ────────────────────────────────────────────
// Env var POSITION_INTERVAL_LIVE_SECS overrides the default (180 = 3 minutes).
// Credits used: 8 per returned flight on the /live/flight-positions/full endpoint.
// At 3-minute intervals with ~3 simultaneous Aurigny flights the estimated
// monthly spend is ~22,000 credits — well within the 30,000/month plan.
const LIVE_POLL_INTERVAL = parseInt(process.env.POSITION_INTERVAL_LIVE_SECS ?? '300', 10) * 1000;

// Historical inference — re-run each poll cycle so new completed flights are picked up promptly
const INFER_INTERVAL = 5 * 60 * 1000; // 5 minutes (same as before)

// Track last poll/infer times per flight id
const lastLivePollTimes = new Map<number, number>();
const lastInferTimes = new Map<string, number>(); // keyed by registration

async function fetchPositions(flightNumbers: string[]): Promise<Fr24Position[]> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) throw new Error('FR24_API_TOKEN not set');

  const results: Fr24Position[] = [];
  for (let i = 0; i < flightNumbers.length; i += 15) {
    const batch = flightNumbers.slice(i, i + 15).join(',');
    const url = `${FR24_BASE}/api/live/flight-positions/full?flights=${encodeURIComponent(batch)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Accept-Version': 'v1',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`FR24 API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as Fr24Response;
    results.push(...(json.data ?? []));

    // Respect 10 req/min rate limit
    if (i + 15 < flightNumbers.length) {
      await new Promise(r => setTimeout(r, 6000));
    }
  }
  return results;
}

/** Convert GPBOT → G-PBOT, GORAI → G-ORAI etc. (UK regs stored without hyphen) */
function normaliseReg(reg: string): string {
  // Already has a hyphen
  if (reg.includes('-')) return reg;
  // UK format: single letter + hyphen + 4 letters e.g. G-PBOT
  if (/^[A-Z][A-Z]{4}$/.test(reg)) {
    return `${reg[0]}-${reg.slice(1)}`;
  }
  return reg;
}

/**
 * Returns true if a flight is in a terminal status (no further movement expected).
 * Terminal statuses are never polled against FR24.
 */
function isTerminal(status: string | null): boolean {
  const s = status?.toLowerCase() ?? '';
  return s.includes('completed') || s.includes('landed') || s.includes('cancelled') || s.includes('canceled');
}

/**
 * Determines whether a flight should be polled against the FR24 live API.
 *
 * Previously this was a strict `status === 'airborne'` check, which caused a
 * significant gap: Aurigny's schedule scraper updates status every 3–15 minutes,
 * so a flight could be airborne for 15+ minutes before FR24 was ever queried.
 *
 * New logic — poll FR24 if ANY of the following are true:
 *   1. status === 'Airborne'  (confirmed by Aurigny scraper or back-written by us)
 *   2. status === 'Taxiing'   (back-written by us when FR24 shows ground movement)
 *   3. actualDeparture is set AND the flight is not in a terminal status
 *      (Aurigny writes ActualBlockOff before it writes status='Airborne', so this
 *       catches the gap between pushback and the scraper's next status update)
 *
 * Terminal flights (Completed/Landed/Cancelled) are always excluded.
 * Flights that haven't departed yet and have no actualDeparture are excluded.
 */
function shouldPollFR24(flight: Pick<FlightToPoll, 'status' | 'actualDeparture'>): boolean {
  if (isTerminal(flight.status)) return false;
  const s = flight.status?.toLowerCase() ?? '';
  if (s === 'airborne' || s === 'taxiing') return true;
  if (flight.actualDeparture != null) return true;
  return false;
}

/**
 * Derives the most accurate flight status from a live FR24 position response.
 *
 * FR24 gives us real-time altitude, ground speed, and vertical speed — enough
 * to distinguish between taxiing, climbing, cruising, and descending.
 * These are only written when they represent a meaningful step forward from
 * the current DB status; terminal statuses (Landed/Completed/Cancelled) are
 * never overwritten by FR24 data.
 *
 * Returns null if no status update is warranted.
 */
function deriveStatusFromFR24(
  pos: { alt: number; gspeed: number; vspeed: number },
  onGround: boolean,
  currentStatus: string | null,
): string | null {
  if (isTerminal(currentStatus)) return null;
  const current = currentStatus?.toLowerCase() ?? '';

  if (!onGround) {
    // Aircraft is airborne — already the most we can say from position data
    if (current !== 'airborne') return 'Airborne';
    return null;
  }

  // Aircraft is on the ground
  if (pos.gspeed > 5) {
    // Moving on the ground — taxiing out (before departure) or vacating runway (after landing).
    // Only write Taxiing if the flight isn't already Airborne (i.e. we haven't seen it fly yet).
    // Once a flight has been Airborne, ground movement means it's landing — let Aurigny handle that.
    if (current !== 'airborne' && current !== 'taxiing') return 'Taxiing';
    return null;
  }

  // Stationary on the ground — don't overwrite anything; Aurigny will write Landed/Completed.
  return null;
}

// Airport coordinates cache — populated from DB on first use
let airportCoordsCache: Map<string, [number, number]> | null = null;

async function getAirportCoords(iataCodes: string[]): Promise<Map<string, [number, number]>> {
  if (!airportCoordsCache) {
    // Load all airport coords from DB once
    const rows = await db
      .select({ iataCode: airports.iataCode, icaoCode: airports.icaoCode, latitude: airports.latitude, longitude: airports.longitude })
      .from(airports);
    airportCoordsCache = new Map();
    for (const row of rows) {
      if (row.latitude != null && row.longitude != null) {
        airportCoordsCache.set(row.iataCode, [row.latitude, row.longitude]);
        if (row.icaoCode) airportCoordsCache.set(row.icaoCode, [row.latitude, row.longitude]);
      }
    }
    console.log(`[Position] Loaded ${airportCoordsCache.size} airport coordinate entries from DB`);
  }
  const result = new Map<string, [number, number]>();
  for (const code of iataCodes) {
    const coords = airportCoordsCache.get(code);
    if (coords) result.set(code, coords);
  }
  return result;
}

/**
 * Use our own flights table to infer where each grounded aircraft currently is.
 * For each unique registration, find the most recently completed (or landed/airborne)
 * flight ordered by actual_arrival desc, then scheduled_departure desc.
 * This is the same data Aurigny's "Where's my plane?" popup uses.
 * Returns a map of registration → { airportCode, flightNumber, arrivedAt }
 */
async function inferPositionsFromOwnDb(
  registrations: string[],
): Promise<Map<string, { airportCode: string; flightNumber: string; arrivedAt: Date }>> {
  if (registrations.length === 0) return new Map();

  const result = new Map<string, { airportCode: string; flightNumber: string; arrivedAt: Date }>();

  // Fetch all today's + yesterday's flights for these registrations that have completed/landed
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const recentFlights = await db
    .select({
      registration: flights.aircraftRegistration,
      flightNumber:  flights.flightNumber,
      arrivalAirport: flights.arrivalAirport,
      actualArrival:  flights.actualArrival,
      scheduledArrival: flights.scheduledArrival,
      status: flights.status,
    })
    .from(flights)
    .where(
      and(
        isNotNull(flights.aircraftRegistration),
        gte(flights.scheduledDeparture, yesterday),
        // Only flights that have actually completed or are airborne
        not(eq(flights.status, 'Scheduled')),
      ),
    )
    .orderBy(desc(flights.actualArrival), desc(flights.scheduledArrival));

  // Group by registration and take the most recent completed/landed flight
  for (const f of recentFlights) {
    const reg = f.registration!;
    if (result.has(reg)) continue; // already have the most recent

    const status = f.status?.toLowerCase() ?? '';
    const isCompleted = status.includes('completed') || status.includes('landed');
    const isAirborneStatus = status.includes('airborne');

    if (!isCompleted && !isAirborneStatus) continue;

    // For an airborne flight the plane isn't at the arrival airport yet — skip
    if (isAirborneStatus) continue;

    const arrivedAt = f.actualArrival ?? f.scheduledArrival;
    result.set(reg, {
      airportCode:  f.arrivalAirport,
      flightNumber: f.flightNumber,
      arrivedAt,
    });
  }

  return result;
}

export async function pollPositions(): Promise<number> {
  const now = new Date();
  const nowMs = now.getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysFlights = await db
    .select({
      id: flights.id,
      flightNumber: flights.flightNumber,
      status: flights.status,
      scheduledDeparture: flights.scheduledDeparture,
      actualDeparture: flights.actualDeparture,
      aircraftRegistration: flights.aircraftRegistration,
    })
    .from(flights)
    .where(
      or(
        and(gte(flights.scheduledDeparture, today), lte(flights.scheduledDeparture, tomorrow)),
        and(gte(flights.scheduledArrival, today), lte(flights.scheduledArrival, tomorrow)),
      ),
    );

  if (todaysFlights.length === 0) {
    console.log('[Position] No flights today');
    return 60 * 1000;
  }

  // ── Track 1: LIVE polling ──────────────────────────────────────────────────
  // Poll FR24 for any flight that is confirmed airborne (status='Airborne') OR
  // has an actualDeparture recorded (departed but Aurigny hasn't yet updated
  // the status field). This closes the lag window between actual takeoff and
  // the scraper's next status update cycle.
  const liveFlights = todaysFlights.filter(f => shouldPollFR24(f));
  const liveNeedingPoll = liveFlights.filter(f => {
    const lastPoll = lastLivePollTimes.get(f.id) ?? 0;
    return nowMs - lastPoll >= LIVE_POLL_INTERVAL;
  });

  let liveSaved = 0;
  if (liveNeedingPoll.length > 0) {
    const confirmedAirborne = liveNeedingPoll.filter(f => f.status?.toLowerCase() === 'airborne').length;
    const impliedAirborne   = liveNeedingPoll.length - confirmedAirborne;
    console.log(
      `[Position] Live polling ${liveNeedingPoll.length} flight(s) ` +
      `(${confirmedAirborne} status=Airborne, ${impliedAirborne} implied via actualDeparture)`,
    );
    const positions = await fetchPositions(liveNeedingPoll.map(f => f.flightNumber));
    console.log(`[Position] Received ${positions.length} live position(s)`);

    for (const flight of liveNeedingPoll) {
      lastLivePollTimes.set(flight.id, nowMs);
    }

    const flightIdByNumber = new Map(liveNeedingPoll.map(f => [f.flightNumber, f.id]));
    // Secondary lookup by registration — FR24 sometimes returns null for flight number
    const flightIdByReg = new Map(
      liveNeedingPoll
        .filter(f => f.aircraftRegistration)
        .map(f => [normaliseReg(f.aircraftRegistration!), f.id])
    );
    // Map id → flight for status back-write
    const flightById = new Map(liveNeedingPoll.map(f => [f.id, f]));

    for (const pos of positions) {
      // Try flight number first, fall back to registration
      const flightId = flightIdByNumber.get(pos.flight ?? '')
        ?? (pos.reg ? flightIdByReg.get(normaliseReg(pos.reg)) : undefined)
        ?? (pos.callsign ? flightIdByNumber.get(pos.callsign) : undefined);

      if (!flightId) {
        console.warn(`[Position] Could not match FR24 position to a flight — flight="${pos.flight}" reg="${pos.reg}" callsign="${pos.callsign}"`);
        continue;
      }
      const onGround = pos.alt < 100 && pos.gspeed < 50;
      try {
        await db.insert(aircraftPositions).values({
          flightId,
          fr24Id: pos.fr24_id,
          lat: pos.lat, lon: pos.lon,
          altitudeFt: pos.alt, groundSpeedKts: pos.gspeed,
          heading: pos.track, verticalSpeedFpm: pos.vspeed,
          callsign: pos.callsign ?? undefined,
          registration: pos.reg ?? undefined,
          aircraftType: pos.type ?? undefined,
          originIata: pos.orig_iata ?? undefined,
          destIata: pos.dest_iata ?? undefined,
          eta: pos.eta ? new Date(pos.eta) : undefined,
          onGround, positionTimestamp: new Date(pos.timestamp), fetchedAt: now,
        }).onConflictDoUpdate({
          target: [aircraftPositions.flightId, aircraftPositions.positionTimestamp],
          set: {
            lat: pos.lat, lon: pos.lon,
            altitudeFt: pos.alt, groundSpeedKts: pos.gspeed,
            heading: pos.track, verticalSpeedFpm: pos.vspeed,
            onGround, fetchedAt: now,
            eta: pos.eta ? new Date(pos.eta) : undefined,
          },
        });
        liveSaved++;
      } catch (err) {
        console.error(`[Position] Failed to save live position for ${pos.flight}:`, err);
      }

      // ── Status back-write ──────────────────────────────────────────────────
      // Derive the best available status from the FR24 position data and write
      // it to flights.status if it represents a meaningful state change.
      // This makes the Aurigny scraper's update lag irrelevant during the active
      // flight window — the position service becomes the live source of truth.
      const matchedFlight = flightById.get(flightId);
      if (matchedFlight) {
        const derivedStatus = deriveStatusFromFR24(pos, onGround, matchedFlight.status);
        if (derivedStatus !== null) {
          try {
            await db
              .update(flights)
              .set({ status: derivedStatus, updatedAt: now })
              .where(eq(flights.id, flightId));
            console.log(
              `[Position] Status back-write: ${matchedFlight.flightNumber} (id=${flightId}) ` +
              `${matchedFlight.status} → ${derivedStatus} ` +
              `(alt=${pos.alt}ft, speed=${pos.gspeed}kts, vspeed=${pos.vspeed}fpm)`,
            );
          } catch (err) {
            console.error(`[Position] Failed status back-write for flight ${matchedFlight.flightNumber}:`, err);
          }
        }
      }
    }
  }

  // ── Track 2: INFERRED positions — non-live flights, once per 5 min per aircraft ──
  const groundedFlights = todaysFlights.filter(f => !shouldPollFR24(f));

  // Get unique registrations that haven't been inferred recently
  const regsNeedingInfer = [...new Set(
    groundedFlights
      .map(f => f.aircraftRegistration)
      .filter((r): r is string => !!r)
      .filter(r => {
        const lastInfer = lastInferTimes.get(r) ?? 0;
        return nowMs - lastInfer >= INFER_INTERVAL;
      })
  )];

  let inferSaved = 0;
  if (regsNeedingInfer.length > 0) {
    console.log(`[Position] Inferring location for ${regsNeedingInfer.length} unique aircraft`);

    // ── Primary: use our own flights table (same data as Aurigny's "Where's my plane?") ──
    const ownDbMap = await inferPositionsFromOwnDb(regsNeedingInfer);
    console.log(`[Position] Own-DB inferred ${ownDbMap.size}/${regsNeedingInfer.length} aircraft`);

    // Mark all queried registrations as done
    for (const reg of regsNeedingInfer) {
      lastInferTimes.set(reg, nowMs);
      lastInferTimes.set(reg.replace('-', ''), nowMs);
    }

    // Collect all airport codes we need coords for
    const allAirportCodes = new Set<string>();
    for (const flight of groundedFlights) {
      if (!flight.aircraftRegistration) continue;
      const reg = flight.aircraftRegistration;
      const ownDb = ownDbMap.get(reg);
      if (ownDb) allAirportCodes.add(ownDb.airportCode);
    }
    const coordsMap = await getAirportCoords([...allAirportCodes]);

    // Apply inferred position to every grounded flight using that registration
    for (const flight of groundedFlights) {
      if (!flight.aircraftRegistration) continue;
      const reg = flight.aircraftRegistration;

      // Only use own-DB for grounded flights (no FR24 fallback)
      const ownDb = ownDbMap.get(reg);
      if (!ownDb) continue;

      const airportCode = ownDb.airportCode;
      const flightNumber = ownDb.flightNumber;
      const arrivedAt = ownDb.arrivedAt;
      console.log(`[Position] Own-DB: ${reg} → ${airportCode} (last flight ${flightNumber})`);

      const coords = coordsMap.get(airportCode);
      if (!coords) {
        console.warn(`[Position] No coordinates for airport ${airportCode} — skipping inferred position for ${flight.flightNumber}`);
        continue;
      }

      try {
        await db.insert(aircraftPositions).values({
          flightId: flight.id,
          fr24Id: `INFERRED_${flightNumber}_${arrivedAt.getTime()}`,
          lat: coords[0], lon: coords[1],
          altitudeFt: 0, groundSpeedKts: 0, heading: 0, verticalSpeedFpm: 0,
          registration: reg,
          destIata: airportCode,
          onGround: true,
          positionTimestamp: now,
          fetchedAt: now,
        }).onConflictDoUpdate({
          target: [aircraftPositions.flightId, aircraftPositions.positionTimestamp],
          set: {
            fr24Id: `INFERRED_${flightNumber}_${arrivedAt.getTime()}`,
            lat: coords[0], lon: coords[1],
            destIata: airportCode,
            onGround: true,
            fetchedAt: now,
          },
        });
        inferSaved++;
      } catch (err) {
        console.error(`[Position] Failed to save inferred position for ${flight.flightNumber}:`, err);
      }
    }
    console.log(`[Position] Saved ${inferSaved} inferred positions`);
  }

  console.log(`[Position] Cycle complete — ${liveSaved} live, ${inferSaved} inferred`);

  return LIVE_POLL_INTERVAL;
}
