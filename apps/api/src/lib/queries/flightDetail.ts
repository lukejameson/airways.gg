import { getDb, flights, flightStatusHistory, weatherData, aircraftPositions, flightTimes, airportDaylight } from '../db';
import { eq, desc, and, lte, gte, inArray, isNotNull, asc } from 'drizzle-orm';
import type { FlightDetailResult } from '../../types';

export async function getFlightDetail(id: number): Promise<FlightDetailResult | null> {
  const db = getDb();
  
  const [flight] = await db.select().from(flights).where(eq(flights.id, id)).limit(1);
  if (!flight) return null;

  const flightTime = flight.scheduledDeparture;
  const windowStart = new Date(flightTime.getTime() - 90 * 60000);
  const windowEnd = new Date(Math.max(flightTime.getTime() + 90 * 60000, Date.now()));
  const airports = [...new Set([flight.departureAirport, flight.arrivalAirport])];

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
        canceled: flights.canceled,
        aircraftType: flights.aircraftType,
        delayMinutes: flights.delayMinutes,
        flightDate: flights.flightDate,
      })
      .from(flights)
      .where(and(
        eq(flights.aircraftRegistration, flight.aircraftRegistration),
        gte(flights.scheduledDeparture, rotationStart),
        isNotNull(flights.aircraftRegistration),
      ))
      .orderBy(asc(flights.scheduledDeparture))
    : [];

  const depDate = flight.scheduledDeparture.toISOString().split('T')[0];
  const arrDate = flight.scheduledArrival.toISOString().split('T')[0];

  const [rawStatusHistory, weatherRows, positionRows, times, daylightRows] = await Promise.all([
    db.select().from(flightStatusHistory)
      .where(eq(flightStatusHistory.flightId, id))
      .orderBy(desc(flightStatusHistory.statusTimestamp)),
    db.select().from(weatherData)
      .where(and(
        inArray(weatherData.airportCode, airports),
        gte(weatherData.timestamp, windowStart),
        lte(weatherData.timestamp, windowEnd),
      ))
      .orderBy(desc(weatherData.timestamp)),
    db.select().from(aircraftPositions)
      .where(eq(aircraftPositions.flightId, id))
      .orderBy(desc(aircraftPositions.positionTimestamp))
      .limit(1),
    db.select().from(flightTimes)
      .where(eq(flightTimes.flightId, id)),
    db.select().from(airportDaylight)
      .where(and(
        inArray(airportDaylight.airportCode, airports),
        inArray(airportDaylight.date, [depDate, arrDate]),
      )),
  ]);

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

  const daylightMap: Record<string, typeof airportDaylight.$inferSelect[]> = {};
  for (const row of daylightRows) {
    if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
    daylightMap[row.airportCode].push(row);
  }

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
}
