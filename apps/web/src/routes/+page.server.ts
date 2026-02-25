import type { PageServerLoad } from './$types';
import { db, flights, delayPredictions, weatherData, scraperLogs } from '$lib/server/db';
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

    // For each airport, get weather closest to each flight's scheduled time
    // We'll fetch weather data for the full day + tomorrow (forecasts) and let the FlightCard pick the closest
    let weatherMap: Record<string, typeof weatherData.$inferSelect[]> = {};
    if (airportCodes.length > 0) {
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      const rows = await db
        .select()
        .from(weatherData)
        .where(
          and(
            inArray(weatherData.airportCode, airportCodes),
            gte(weatherData.timestamp, today),
            lte(weatherData.timestamp, dayAfter),
          ),
        )
        .orderBy(weatherData.timestamp);

      // Group by airport code
      for (const row of rows) {
        if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = [];
        weatherMap[row.airportCode].push(row);
      }
    }

    // Current GCI weather for the header - find the record closest to now
    let currentGciWeather: typeof weatherData.$inferSelect | null = null;
    if (weatherMap['GCI'] && weatherMap['GCI'].length > 0) {
      currentGciWeather = weatherMap['GCI'].reduce((closest, current) => {
        const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - now.getTime());
        const currentDiff = Math.abs(new Date(current.timestamp).getTime() - now.getTime());
        return currentDiff < closestDiff ? current : closest;
      });
    }

    // Get last successful scrape time
    const [lastScrape] = await db
      .select({ completedAt: scraperLogs.completedAt })
      .from(scraperLogs)
      .where(eq(scraperLogs.status, 'success'))
      .orderBy(desc(scraperLogs.completedAt))
      .limit(1);

    return {
      flights: flightsWithPredictions,
      weather: currentGciWeather,              // current GCI weather for the header
      weatherMap,                              // all airports for per-flight display
      lastUpdated: lastScrape?.completedAt ?? now,
    };
  } catch (err) {
    console.error('Error loading flights:', err);
    return { flights: [], weather: null, weatherMap: {} };
  }
};
