import type { PageServerLoad } from './$types';
import { db, flights, flightStatusHistory, flightNotes, delayPredictions, weatherData, aircraftPositions, flightTimes, airportDaylight, airports as airportsTable } from '$lib/server/db';
import { eq, desc, and, lte, gte, inArray, isNotNull, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

function shortAirportName(name: string): string {
  return name
    .replace(/\s+International\s+Airport$/i, '')
    .replace(/\s+Airport$/i, '')
    .replace(/\s+Airfield$/i, '')
    .replace(/\s+Aerodrome$/i, '')
    .trim();
}

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) throw error(404, 'Flight not found');

  try {
    const [flight] = await db.select().from(flights).where(eq(flights.id, id)).limit(1);
    if (!flight) throw error(404, 'Flight not found');

    const flightTime = flight.scheduledDeparture;
    const windowStart = new Date(flightTime.getTime() - 90 * 60000);
    const windowEnd   = new Date(flightTime.getTime() + 90 * 60000);
    const airports    = [...new Set([flight.departureAirport, flight.arrivalAirport])];

    // Aircraft rotation: all flights for this registration within the last 24 hours
    // (same data source as Aurigny's "Where's my plane?" modal)
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

    // Build short airport name map for all airports in the rotation
    const rotationIatas = [...new Set(rotationFlights.flatMap(f => [f.departureAirport, f.arrivalAirport]))];
    const rotationAirportRows = rotationIatas.length > 0
      ? await db.select({ iataCode: airportsTable.iataCode, name: airportsTable.name })
          .from(airportsTable)
          .where(inArray(airportsTable.iataCode, rotationIatas))
      : [];
    const rotationAirportNames: Record<string, string> = {};
    for (const row of rotationAirportRows) {
      rotationAirportNames[row.iataCode] = shortAirportName(row.name);
    }

    // Get flight dates for daylight lookup
    const depDate = flight.scheduledDeparture.toISOString().split('T')[0];
    const arrDate = flight.scheduledArrival.toISOString().split('T')[0];

    const [statusHistory, notes, predictions, weatherRows, positionRows, times, daylightRows] = await Promise.all([
      db.select().from(flightStatusHistory)
        .where(eq(flightStatusHistory.flightId, id))
        .orderBy(desc(flightStatusHistory.statusTimestamp)),
      db.select().from(flightNotes)
        .where(eq(flightNotes.flightId, id))
        .orderBy(desc(flightNotes.timestamp)),
      db.select().from(delayPredictions)
        .where(eq(delayPredictions.flightId, id))
        .orderBy(desc(delayPredictions.createdAt))
        .limit(1),
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
    for (const row of weatherRows) {
      if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = row;
    }

    // Group daylight data by airport
    const daylightMap: Record<string, typeof airportDaylight.$inferSelect[]> = {};
    for (const row of daylightRows) {
      if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
      daylightMap[row.airportCode].push(row);
    }

    return {
      flight,
      statusHistory,
      notes,
      prediction: predictions[0] ?? null,
      weatherMap,
      daylightMap,
      position: positionRows[0] ?? null,
      rotationFlights,
      rotationAirportNames,
      times,
    };
  } catch (err: any) {
    if (err?.status === 404) throw err;
    console.error('Error loading flight:', err);
    throw error(500, 'Failed to load flight details');
  }
};
