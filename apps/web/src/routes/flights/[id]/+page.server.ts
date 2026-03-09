import type { PageServerLoad } from './$types';
import { db, flights, flightStatusHistory, weatherData, aircraftPositions, flightTimes, airportDaylight } from '$lib/server/db';
import { eq, desc, and, lte, gte, inArray, isNotNull, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) throw error(404, 'Flight not found');

  try {
    const [flight] = await db.select().from(flights).where(eq(flights.id, id)).limit(1);
    if (!flight) throw error(404, 'Flight not found');

    const flightTime = flight.scheduledDeparture;
    const windowStart = new Date(flightTime.getTime() - 90 * 60000);
    const windowEnd   = new Date(Math.max(flightTime.getTime() + 90 * 60000, Date.now()));
    const airports    = [...new Set([flight.departureAirport, flight.arrivalAirport])];

    // Aircraft rotation: all flights for this registration within the last 24 hours
    // Shows the aircraft's journey throughout the day
    const rotationStart = new Date(flight.scheduledDeparture.getTime() - 24 * 60 * 60 * 1000);
    const rotationFlights = flight.aircraftRegistration
      ? await db.select({
          id: flights.id,
          flightNumber: flights.flightNumber,
          departureAirport: flights.departureAirport,
          arrivalAirport: flights.arrivalAirport,
          scheduledDeparture: flights.scheduledDeparture,
          scheduledArrival: flights.scheduledArrival,
          actualDeparture: flights.actualDeparture,
          actualArrival: flights.actualArrival,
          status: flights.status,
        })
        .from(flights)
        .where(and(
          eq(flights.aircraftRegistration, flight.aircraftRegistration),
          gte(flights.scheduledDeparture, rotationStart),
          isNotNull(flights.aircraftRegistration),
        ))
        .orderBy(asc(flights.scheduledDeparture))
      : [];

    // Get flight dates for daylight lookup
    const depDate = flight.scheduledDeparture.toISOString().split('T')[0];
    const arrDate = flight.scheduledArrival.toISOString().split('T')[0];

    const [rawStatusHistory, weatherRows, positionRows, times, daylightRows] = await Promise.all([
      db.select().from(flightStatusHistory)
        .where(eq(flightStatusHistory.flightId, id))
        .orderBy(desc(flightStatusHistory.statusTimestamp)),
      // Weather for both dep+arr airports near departure time
      db.select().from(weatherData)
        .where(and(
          inArray(weatherData.airportCode, airports),
          gte(weatherData.timestamp, windowStart),
          lte(weatherData.timestamp, windowEnd),
        ))
        .orderBy(desc(weatherData.timestamp)),
      // Latest position for this flight
      db.select().from(aircraftPositions)
        .where(eq(aircraftPositions.flightId, id))
        .orderBy(desc(aircraftPositions.positionTimestamp))
        .limit(1),
      // Estimated/actual times from API
      db.select().from(flightTimes)
        .where(eq(flightTimes.flightId, id)),
      // Daylight data for both airports
      db.select().from(airportDaylight)
        .where(and(
          inArray(airportDaylight.airportCode, airports),
          inArray(airportDaylight.date, [depDate, arrDate]),
        )),
    ]);

    // Most recent row per airport within the window
    const weatherMap: Record<string, typeof weatherData.$inferSelect> = {};
    const now = new Date();
    for (const row of weatherRows) {
      const existing = weatherMap[row.airportCode];
      const rowTs = new Date(row.timestamp).getTime();
      const nowMs = now.getTime();
      if (!existing) {
        weatherMap[row.airportCode] = row;
        continue;
      }
      const existingTs = new Date(existing.timestamp).getTime();
      const rowIsPast = rowTs <= nowMs;
      const existingIsPast = existingTs <= nowMs;
      if (rowIsPast && !existingIsPast) {
        weatherMap[row.airportCode] = row;
      } else if (rowIsPast && existingIsPast && rowTs > existingTs) {
        weatherMap[row.airportCode] = row;
      }
    }

    // Group daylight data by airport
    const daylightMap: Record<string, typeof airportDaylight.$inferSelect[]> = {};
    for (const row of daylightRows) {
      if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
      daylightMap[row.airportCode].push(row);
    }

    // Collapse consecutive identical status messages — FR24 polls every ~6 minutes
    // and records a new row each time even when the estimated time hasn't changed,
    // producing long runs of identical entries. Keep only the first occurrence of
    // each message within a consecutive run (the oldest, since list is desc).
    // The list is newest-first so we walk it and drop entries whose message matches
    // the one immediately following them (i.e. the previous chronological entry).
    const seenBySource = new Map<string, Set<string>>();
    const latestGuernseyTs = rawStatusHistory
      .find(e => e.source === 'guernsey_airport')
      ?.statusTimestamp ?? null;
    const statusHistory = rawStatusHistory.filter((entry) => {
      const key = entry.source;
      if (!seenBySource.has(key)) seenBySource.set(key, new Set());
      const seen = seenBySource.get(key)!;
      if (seen.has(entry.statusMessage)) return false;
      seen.add(entry.statusMessage);
      if (
        entry.source === 'fr24' &&
        entry.statusMessage.toLowerCase().startsWith('estimated dep') &&
        latestGuernseyTs !== null &&
        new Date(latestGuernseyTs) >= new Date(entry.statusTimestamp)
      ) return false;
      return true;
    });

    return {
      flight,
      statusHistory,
      weatherMap,
      daylightMap,
      position: positionRows[0] ?? null,
      rotationFlights,
      times,
    };
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 404) throw err;
    console.error('Error loading flight:', err);
    throw error(500, 'Failed to load flight details');
  }
};
