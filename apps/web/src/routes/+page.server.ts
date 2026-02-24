import type { PageServerLoad } from './$types';
import { db, flights, delayPredictions, weatherData } from '$lib/server/db';
import { and, gte, lte, inArray, or, eq, desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const now = new Date();

  try {
    const todaysFlights = await db
      .select()
      .from(flights)
      .where(
        or(
          and(gte(flights.scheduledDeparture, today), lte(flights.scheduledDeparture, tomorrow)),
          and(gte(flights.scheduledArrival, today), lte(flights.scheduledArrival, tomorrow)),
        ),
      )
      .orderBy(flights.scheduledDeparture);

    // Predictions
    const predMap = new Map<number, typeof import('$lib/server/db').delayPredictions.$inferSelect>();
    if (todaysFlights.length > 0) {
      const flightIds = todaysFlights.map(f => f.id);
      const predictions = await db
        .select()
        .from(delayPredictions)
        .where(and(inArray(delayPredictions.flightId, flightIds), gte(delayPredictions.expiresAt, now)))
        .orderBy(delayPredictions.createdAt);
      for (const p of predictions) predMap.set(p.flightId, p);
    }

    const flightsWithPredictions = todaysFlights.map(f => ({
      ...f,
      prediction: predMap.get(f.id) ?? null,
    }));

    // Collect all unique airports across today's flights
    const airportCodes = [...new Set(
      todaysFlights.flatMap(f => [f.departureAirport, f.arrivalAirport])
    )];

    // For each airport get the single most recent weather row at or before now.
    // Use a lateral-style approach: one query filtered to the relevant airports,
    // then pick the latest per airport in JS (avoids complex SQL for this scale).
    let weatherMap: Record<string, typeof weatherData.$inferSelect> = {};
    if (airportCodes.length > 0) {
      const rows = await db
        .select()
        .from(weatherData)
        .where(
          and(
            inArray(weatherData.airportCode, airportCodes),
            lte(weatherData.timestamp, now),
            gte(weatherData.timestamp, new Date(now.getTime() - 2 * 60 * 60 * 1000)), // within last 2h
          ),
        )
        .orderBy(desc(weatherData.timestamp));

      // Keep only the most recent row per airport
      for (const row of rows) {
        if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = row;
      }
    }

    return {
      flights: flightsWithPredictions,
      weather: weatherMap['GCI'] ?? null,   // current GCI weather for the header
      weatherMap,                            // all airports for per-flight display
    };
  } catch (err) {
    console.error('Error loading flights:', err);
    return { flights: [], weather: null, weatherMap: {} };
  }
};
