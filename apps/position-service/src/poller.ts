import { db, flights, aircraftPositions } from '@delays/database';
import { and, gte, lte, or, eq, desc, isNotNull, not } from 'drizzle-orm';

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

interface Fr24FlightSummary {
  fr24_id: string;
  flight: string | null;
  callsign: string | null;
  reg: string | null;
  type: string | null;
  orig_icao: string | null;
  orig_iata: string | null;
  dest_icao: string | null;
  dest_iata: string | null;
  datetime_takeoff: string | null;
  datetime_landed: string | null;
  flight_ended: boolean;
  first_seen: string | null;
  last_seen: string | null;
}

interface Fr24Response {
  data: Fr24Position[];
}

interface Fr24SummaryResponse {
  data: Fr24FlightSummary[];
}

interface FlightToPoll {
  id: number;
  flightNumber: string;
  status: string | null;
  scheduledDeparture: Date;
  aircraftRegistration: string | null;
  priority: 'high' | 'medium' | 'low';
}

interface InferredPosition {
  flightId: number;
  lat: number | null;
  lon: number | null;
  airportCode: string;
  airportName: string;
  lastFlightNumber: string;
  lastFlightOrigin: string;
  lastFlightDestination: string;
  landedAt: Date;
  inferred: true;
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

/** FR24 datetime format: YYYY-MM-DDTHH:MM:SS (no Z, no ms) */
function fr24Date(d: Date): string {
  return d.toISOString().split('.')[0];
}

async function fetchInferredPositionsBatched(registrations: string[]): Promise<Map<string, InferredPosition>> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) return new Map();

  const results = new Map<string, InferredPosition>();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Batch up to 15 registrations per request (FR24 limit)
  for (let i = 0; i < registrations.length; i += 15) {
    const batch = registrations.slice(i, i + 15);
    // Normalise all registrations to FR24 format (e.g. GPBOT → G-PBOT)
    const normalisedBatch = batch.map(normaliseReg);
    const regsParam = normalisedBatch.join(',');
    const url = `${FR24_BASE}/api/flight-summary/full?registrations=${encodeURIComponent(regsParam)}&flight_datetime_from=${fr24Date(sevenDaysAgo)}&flight_datetime_to=${fr24Date(now)}`;

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Accept-Version': 'v1',
        },
      });

      if (!res.ok) {
        console.log(`[Position] Historical lookup failed for batch: ${res.status}`);
        // If rate limited (429), wait and continue
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 10000));
        }
        continue;
      }

      const json = (await res.json()) as Fr24SummaryResponse;
      const flightData = json.data ?? [];

      // Group by registration and find most recent completed flight for each
      const flightsByReg = new Map<string, Fr24FlightSummary[]>();
      for (const flight of flightData) {
        if (!flight.reg) continue;
        if (!flightsByReg.has(flight.reg)) {
          flightsByReg.set(flight.reg, []);
        }
        flightsByReg.get(flight.reg)!.push(flight);
      }

      // Process each registration
      for (const [reg, flights] of flightsByReg as Map<string, Fr24FlightSummary[]>) {
        const completedFlights = flights
          .filter(f => f.flight_ended && f.datetime_landed)
          .sort((a, b) => new Date(b.datetime_landed!).getTime() - new Date(a.datetime_landed!).getTime());

        if (completedFlights.length === 0) continue;

        const lastFlight = completedFlights[0];
        const destination = lastFlight.dest_iata || lastFlight.dest_icao || 'Unknown';
        const origin = lastFlight.orig_iata || lastFlight.orig_icao || 'Unknown';

        // Store under both the normalised and raw form so the lookup works
        // regardless of whether the DB has GPBOT or G-PBOT
        const rawReg = reg.replace('-', '');
        const inferred: InferredPosition = {
          flightId: 0,
          lat: null,
          lon: null,
          airportCode: destination,
          airportName: destination,
          lastFlightNumber: lastFlight.flight || 'Unknown',
          lastFlightOrigin: origin,
          lastFlightDestination: destination,
          landedAt: new Date(lastFlight.datetime_landed!),
          inferred: true,
        };

        results.set(reg, inferred);     // G-PBOT
        results.set(rawReg, inferred);  // GPBOT (as stored in DB)
        console.log(`[Position] Inferred ${reg} location: ${destination} (last flight ${lastFlight.flight} from ${origin})`);
      }

      // Rate limit: 6 second delay between batches (10 req/min max)
      if (i + 15 < registrations.length) {
        await new Promise(r => setTimeout(r, 6000));
      }
    } catch (err) {
      console.error(`[Position] Error fetching historical data for batch:`, err);
    }
  }

  return results;
}

function isAirborne(status: string | null): boolean {
  return status?.toLowerCase() === 'airborne';
}

// Airport coordinates lookup
const AIRPORT_COORDS: Record<string, [number, number]> = {
  GCI: [49.4348, -2.5986],
  JER: [49.2079, -2.1955],
  LGW: [51.1481, -0.1903],
  LCY: [51.5048,  0.0495],
  MAN: [53.3537, -2.2750],
  BRS: [51.3827, -2.7191],
  BHX: [52.4539, -1.7480],
  SOU: [50.9503, -1.3568],
  ACI: [49.7061, -2.2147],
  CDG: [49.0097,  2.5478],
  EMA: [52.8311, -1.3280],
  DUB: [53.4213, -6.2700],
  EDI: [55.9500, -3.3725],
  EGJB: [49.4348, -2.5986], // GCI ICAO
  EGJJ: [49.2079, -2.1955], // JER ICAO
  EGKK: [51.1481, -0.1903], // LGW ICAO
  EGLC: [51.5048,  0.0495], // LCY ICAO
  EGCC: [53.3537, -2.2750], // MAN ICAO
  EGGD: [51.3827, -2.7191], // BRS ICAO
  EGBB: [52.4539, -1.7480], // BHX ICAO
  EGHI: [50.9503, -1.3568], // SOU ICAO
  LFPG: [49.0097,  2.5478], // CDG ICAO
};

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

    // ── Fallback: only ask FR24 for registrations not resolved from our own DB ──
    const needsFr24 = regsNeedingInfer.filter(r => !ownDbMap.has(r));
    const fr24Map = needsFr24.length > 0
      ? await fetchInferredPositionsBatched(needsFr24)
      : new Map<string, InferredPosition>();

    // Mark all queried registrations as done
    for (const reg of regsNeedingInfer) {
      lastInferTimes.set(reg, nowMs);
      lastInferTimes.set(reg.replace('-', ''), nowMs);
    }

    // Apply inferred position to every grounded flight using that registration
    for (const flight of groundedFlights) {
      if (!flight.aircraftRegistration) continue;
      const reg = flight.aircraftRegistration;

      // Try own-DB first, then FR24
      const ownDb = ownDbMap.get(reg);
      const fr24 = fr24Map.get(reg);

      let airportCode: string;
      let flightNumber: string;
      let arrivedAt: Date;
      let originIata: string | undefined;

      if (ownDb) {
        airportCode  = ownDb.airportCode;
        flightNumber = ownDb.flightNumber;
        arrivedAt    = ownDb.arrivedAt;
        console.log(`[Position] Own-DB: ${reg} → ${airportCode} (last flight ${flightNumber})`);
      } else if (fr24) {
        airportCode  = fr24.airportCode;
        flightNumber = fr24.lastFlightNumber;
        arrivedAt    = fr24.landedAt;
        originIata   = fr24.lastFlightOrigin;
      } else {
        continue;
      }

      const coords = AIRPORT_COORDS[airportCode];
      try {
        await db.insert(aircraftPositions).values({
          flightId: flight.id,
          fr24Id: `INFERRED_${flightNumber}_${arrivedAt.getTime()}`,
          lat: coords?.[0] ?? null, lon: coords?.[1] ?? null,
          altitudeFt: 0, groundSpeedKts: 0, heading: 0, verticalSpeedFpm: 0,
          registration: reg,
          originIata,
          destIata: airportCode,
          onGround: true,
          positionTimestamp: now,
          fetchedAt: now,
        }).onConflictDoUpdate({
          target: [aircraftPositions.flightId, aircraftPositions.positionTimestamp],
          set: {
            fr24Id: `INFERRED_${flightNumber}_${arrivedAt.getTime()}`,
            lat: coords?.[0] ?? null, lon: coords?.[1] ?? null,
            originIata,
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
