import type { PageServerLoad } from './$types';
import { db, flights, weatherData, scraperLogs, airportDaylight, flightTimes } from '$lib/server/db';
import { and, gte, lte, inArray, or, eq, desc, count, not } from 'drizzle-orm';

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
  const TERMINAL_STATUSES = ['Landed', 'Cancelled'];
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
    // Select only the columns the client actually needs — omitting rawXml, uniqueId,
    // aircraftRegistration, airlineCode, createdAt, updatedAt cuts inline payload size.
    const displayFlights = await db
      .select({
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
      .where(eq(flights.flightDate, displayDateStr))
      .orderBy(flights.scheduledDeparture);

    // Estimated times (EstimatedBlockOff for departures, EstimatedBlockOn for arrivals)
    const estimatedTimesMap = new Map<number, { estimatedDeparture?: string; estimatedArrival?: string }>();
    if (displayFlights.length > 0) {
      const flightIds = displayFlights.map(f => f.id);
      const estimatedTimes = await db
        .select({ flightId: flightTimes.flightId, timeType: flightTimes.timeType, timeValue: flightTimes.timeValue })
        .from(flightTimes)
        .where(
          and(
            inArray(flightTimes.flightId, flightIds),
            inArray(flightTimes.timeType, ['EstimatedBlockOff', 'EstimatedBlockOn'])
          )
        );
      for (const t of estimatedTimes) {
        const existing = estimatedTimesMap.get(t.flightId) ?? {};
        if (t.timeType === 'EstimatedBlockOff') {
          existing.estimatedDeparture = t.timeValue.toISOString();
        } else if (t.timeType === 'EstimatedBlockOn') {
          existing.estimatedArrival = t.timeValue.toISOString();
        }
        estimatedTimesMap.set(t.flightId, existing);
      }
    }

    const flightsForDisplay = displayFlights.map(f => ({
      ...f,
      estimatedDeparture: estimatedTimesMap.get(f.id)?.estimatedDeparture ?? null,
      estimatedArrival: estimatedTimesMap.get(f.id)?.estimatedArrival ?? null,
    }));

    // Collect all unique airports across display flights
    const airportCodes = [...new Set(
      displayFlights.flatMap(f => [f.departureAirport, f.arrivalAirport])
    )];

    // Fetch weather for display date + 2 days ahead (for forecasts).
    // Only select columns used by the client (temperature, windSpeed, windDirection, weatherCode, timestamp, airportCode).
    const weatherStartDate = new Date(displayDateStr + 'T00:00:00Z');
    const weatherEndDate = new Date(weatherStartDate);
    weatherEndDate.setUTCDate(weatherEndDate.getUTCDate() + 2);
    
    let weatherMap: Record<string, { airportCode: string; timestamp: Date; temperature: number | null; windSpeed: number | null; windDirection: number | null; weatherCode: number | null }[]> = {};
    if (airportCodes.length > 0) {
      const rows = await db
        .select({
          airportCode: weatherData.airportCode,
          timestamp: weatherData.timestamp,
          temperature: weatherData.temperature,
          windSpeed: weatherData.windSpeed,
          windDirection: weatherData.windDirection,
          weatherCode: weatherData.weatherCode,
        })
        .from(weatherData)
        .where(
          and(
            inArray(weatherData.airportCode, airportCodes),
            gte(weatherData.timestamp, weatherStartDate),
            lte(weatherData.timestamp, weatherEndDate),
          ),
        )
        .orderBy(weatherData.timestamp);

      for (const row of rows) {
        if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = [];
        weatherMap[row.airportCode].push(row);
      }
    }

    // Fetch daylight data — only sunrise/sunset/airportCode needed
    let daylightMap: Record<string, { airportCode: string; date: string; sunrise: Date; sunset: Date }[]> = {};
    if (airportCodes.length > 0) {
      const daylightRows = await db
        .select({
          airportCode: airportDaylight.airportCode,
          date: airportDaylight.date,
          sunrise: airportDaylight.sunrise,
          sunset: airportDaylight.sunset,
        })
        .from(airportDaylight)
        .where(
          and(
            inArray(airportDaylight.airportCode, airportCodes),
            or(
              eq(airportDaylight.date, todayStr),
              eq(airportDaylight.date, tomorrowStr)
            )
          ),
        );

      for (const row of daylightRows) {
        if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
        daylightMap[row.airportCode].push(row);
      }
    }

    // Current GCI weather for the header - find the record closest to now
    let currentGciWeather: { airportCode: string; timestamp: Date; temperature: number | null; windSpeed: number | null; windDirection: number | null; weatherCode: number | null } | null = null;
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
      flights: flightsForDisplay,
      weather: currentGciWeather,              // current GCI weather for the header
      weatherMap,                              // all airports for per-flight display
      daylightMap,                             // sunrise/sunset data for airports
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
      daylightMap: {},
      lastUpdated: now,
      displayDate: displayDateStr,
      todayStr,
      tomorrowStr,
      autoAdvanced,
    };
  }
};
