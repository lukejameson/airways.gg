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
  aircraftRegistration: string | null;
  priority: 'high' | 'medium' | 'low';
}

// Live polling — only for airborne flights
const LIVE_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Historical inference — re-run each poll cycle so new completed flights are picked up promptly
const INFER_INTERVAL = 5 * 60 * 1000; // 5 minutes (same as poll interval)

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

function isAirborne(status: string | null): boolean {
  return status?.toLowerCase() === 'airborne';
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

  // ── Track 1: LIVE polling — airborne flights only ──────────────────────────
  const airborneFlights = todaysFlights.filter(f => isAirborne(f.status));
  const airborneNeedingPoll = airborneFlights.filter(f => {
    const lastPoll = lastLivePollTimes.get(f.id) ?? 0;
    return nowMs - lastPoll >= LIVE_POLL_INTERVAL;
  });

  let liveSaved = 0;
  if (airborneNeedingPoll.length > 0) {
    console.log(`[Position] Live polling ${airborneNeedingPoll.length} airborne flights`);
    const positions = await fetchPositions(airborneNeedingPoll.map(f => f.flightNumber));
    console.log(`[Position] Received ${positions.length} live position(s)`);

    for (const flight of airborneNeedingPoll) {
      lastLivePollTimes.set(flight.id, nowMs);
    }

    const flightIdByNumber = new Map(airborneNeedingPoll.map(f => [f.flightNumber, f.id]));
    // Secondary lookup by registration — FR24 sometimes returns null for flight number
    const flightIdByReg = new Map(
      airborneNeedingPoll
        .filter(f => f.aircraftRegistration)
        .map(f => [normaliseReg(f.aircraftRegistration!), f.id])
    );

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
    }
  }

  // ── Track 2: INFERRED positions — non-airborne flights, once per 6h per aircraft ──
  const groundedFlights = todaysFlights.filter(f => !isAirborne(f.status));

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

  // Next run: either when an airborne flight needs repoll, or 5 min (to catch new airborne flights)
  return LIVE_POLL_INTERVAL;
}
