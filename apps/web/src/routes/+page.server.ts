import type { PageServerLoad } from './$types';
import { db, flights, delayPredictions, weatherData, scraperLogs } from '$lib/server/db';
import { and, gte, lte, inArray, or, eq, desc, count, not, sql } from 'drizzle-orm';

// Guernsey local timezone
const GY_TZ = 'Europe/London';

/** Convert Date to YYYY-MM-DD in Guernsey local time */
function toGuernseyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(d);
}

/** Add N days to a date string (YYYY-MM-DD) */
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/** Count all flights for a given date string (YYYY-MM-DD) */
async function countFlightsForDate(dateStr: string): Promise<number> {
  try {
    const [result] = await db
      .select({ value: count() })
      .from(flights)
      .where(eq(flights.flightDate, dateStr));
    return result?.value ?? 0;
  } catch {
    return 0;
  }
}

/** Get all active (non-terminal) flights for a given date */
async function getActiveFlightsForDate(dateStr: string) {
  const TERMINAL_STATUSES = ['Completed', 'Landed', 'Cancelled'];
  try {
    return await db
      .select()
      .from(flights)
      .where(
        and(
          eq(flights.flightDate, dateStr),
          eq(flights.canceled, false),
          not(inArray(flights.status, TERMINAL_STATUSES))
        )
      );
  } catch {
    return [];
  }
}

export const load: PageServerLoad = async ({ url }) => {
  const now = new Date();
  const todayStr = toGuernseyDateStr(now);
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  // Parse ?date= parameter
  const dateParam = url.searchParams.get('date');
  let displayDateStr = todayStr;
  let autoAdvanced = false;

  if (dateParam && (dateParam === todayStr || dateParam === tomorrowStr)) {
    // Valid explicit date
    displayDateStr = dateParam;
  } else if (!dateParam) {
    // No explicit date — check for auto-advance
    const todayFlightCount = await countFlightsForDate(todayStr);
    
    if (todayFlightCount > 0) {
      // Today has flights — check if all are terminal
      const activeFlightsToday = await getActiveFlightsForDate(todayStr);
      
      if (activeFlightsToday.length === 0) {
        // All flights are terminal — check if tomorrow has flights
        const tomorrowFlightCount = await countFlightsForDate(tomorrowStr);
        if (tomorrowFlightCount > 0) {
          displayDateStr = tomorrowStr;
          autoAdvanced = true;
        }
      }
    }
  }

  try {
    // Query flights by flightDate instead of timestamp ranges
    const displayFlights = await db
      .select()
      .from(flights)
      .where(eq(flights.flightDate, displayDateStr))
      .orderBy(flights.scheduledDeparture);

    // Predictions
    const predMap = new Map<number, typeof import('$lib/server/db').delayPredictions.$inferSelect>();
    if (displayFlights.length > 0) {
      const flightIds = displayFlights.map(f => f.id);
      const predictions = await db
        .select()
        .from(delayPredictions)
        .where(and(inArray(delayPredictions.flightId, flightIds), gte(delayPredictions.expiresAt, now)))
        .orderBy(delayPredictions.createdAt);
      for (const p of predictions) predMap.set(p.flightId, p);
    }

    const flightsWithPredictions = displayFlights.map(f => ({
      ...f,
      prediction: predMap.get(f.id) ?? null,
    }));

    // Collect all unique airports across display flights
    const airportCodes = [...new Set(
      displayFlights.flatMap(f => [f.departureAirport, f.arrivalAirport])
    )];

    // Fetch weather for display date + 2 days ahead (for forecasts)
    const weatherStartDate = new Date(displayDateStr + 'T00:00:00Z');
    const weatherEndDate = new Date(weatherStartDate);
    weatherEndDate.setUTCDate(weatherEndDate.getUTCDate() + 2);
    
    let weatherMap: Record<string, typeof weatherData.$inferSelect[]> = {};
    if (airportCodes.length > 0) {
      const rows = await db
        .select()
        .from(weatherData)
        .where(
          and(
            inArray(weatherData.airportCode, airportCodes),
            gte(weatherData.timestamp, weatherStartDate),
            lte(weatherData.timestamp, weatherEndDate),
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
      displayDate: displayDateStr,             // YYYY-MM-DD for display
      todayStr,                                // Today's date
      tomorrowStr,                             // Tomorrow's date
      autoAdvanced,                            // Whether we auto-advanced to tomorrow
    };
  } catch (err) {
    console.error('Error loading flights:', err);
    return { 
      flights: [], 
      weather: null, 
      weatherMap: {},
      displayDate: displayDateStr,
      todayStr,
      tomorrowStr,
      autoAdvanced,
    };
  }
};
