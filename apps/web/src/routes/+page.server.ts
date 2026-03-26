import type { PageServerLoad } from './$types';
import { db, flights, weatherData, scraperLogs, airportDaylight, flightTimes } from '$lib/server/db';
import { and, gte, lte, inArray, or, eq, desc, asc, count, not, sql } from 'drizzle-orm';
import { guernseyDateStr, isTerminalStatus } from '@airways/common';

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
  try {
    const rows = await db
      .select()
      .from(flights)
      .where(
        and(
          eq(flights.flightDate, dateStr),
          eq(flights.canceled, false),
        )
      );
    return rows.filter(f => !isTerminalStatus(f.status));
  } catch {
    return [];
  }
}

const FLIGHT_COLUMNS = {
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
};

async function fetchDisplayFlights(dateStr: string) {
  return db
    .select(FLIGHT_COLUMNS)
    .from(flights)
    .where(eq(flights.flightDate, dateStr))
    .orderBy(flights.scheduledDeparture);
}

async function fetchLastScrape() {
  const [row] = await db
    .select({ completedAt: scraperLogs.completedAt })
    .from(scraperLogs)
    .where(eq(scraperLogs.status, 'success'))
    .orderBy(desc(scraperLogs.completedAt))
    .limit(1);
  return row;
}

type RecentFlight = { id: number; flightNumber: string; departureAirport: string; arrivalAirport: string; scheduledDeparture: string; viewedAt: string };

export const load: PageServerLoad = async ({ url, cookies }) => {
  const now = new Date();
  const todayStr = guernseyDateStr(now);
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  // Parse ?date= parameter
  const dateParam = url.searchParams.get('date');
  let displayDateStr = todayStr;
  let autoAdvanced = false;

  try {
    let displayFlights: Awaited<ReturnType<typeof fetchDisplayFlights>>;
    let lastScrape: Awaited<ReturnType<typeof fetchLastScrape>>;

    if (dateParam && (dateParam === todayStr || dateParam === tomorrowStr)) {
      // dateParam shortcut: fetch displayFlights + scraperLogs in parallel (no wave 1 needed)
      displayDateStr = dateParam;
      [displayFlights, lastScrape] = await Promise.all([
        fetchDisplayFlights(displayDateStr),
        fetchLastScrape(),
      ]);
    } else {
      // Wave 1: fire all auto-advance queries + scraperLogs in parallel
      const [todayFlightCount, activeFlightsToday, tomorrowFlightCount, lastScrapeResult] = await Promise.all([
        countFlightsForDate(todayStr),
        getActiveFlightsForDate(todayStr),
        countFlightsForDate(tomorrowStr),
        fetchLastScrape(),
      ]);
      lastScrape = lastScrapeResult;

      // Compute displayDateStr from wave 1 results (zero extra DB trips)
      if (todayFlightCount > 0 && activeFlightsToday.length === 0 && tomorrowFlightCount > 0) {
        displayDateStr = tomorrowStr;
        autoAdvanced = true;
      }

      // Wave 2: fetch display flights for determined date
      displayFlights = await fetchDisplayFlights(displayDateStr);
    }

    // Wave 3: parallel queries that depend on displayFlights
    const flightIds = displayFlights.map(f => f.id);
    const airportCodes = [...new Set(
      displayFlights.flatMap(f => [f.departureAirport, f.arrivalAirport])
    )];

    const weatherStartDate = new Date(displayDateStr + 'T00:00:00Z');
    const weatherEndDate = new Date(weatherStartDate);
    weatherEndDate.setUTCDate(weatherEndDate.getUTCDate() + 2);

    const [estimatedTimesRows, weatherRows, daylightRows] = await Promise.all([
      flightIds.length > 0
        ? db
            .select({ flightId: flightTimes.flightId, timeType: flightTimes.timeType, timeValue: flightTimes.timeValue })
            .from(flightTimes)
            .where(
              and(
                inArray(flightTimes.flightId, flightIds),
                inArray(flightTimes.timeType, ['EstimatedBlockOff', 'EstimatedBlockOn'])
              )
            )
        : Promise.resolve([]),
      airportCodes.length > 0
        ? db
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
            .orderBy(weatherData.timestamp)
        : Promise.resolve([]),
      airportCodes.length > 0
        ? db
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
            )
            .orderBy(asc(airportDaylight.date))
        : Promise.resolve([]),
    ]);

    // Build estimatedTimesMap
    const estimatedTimesMap = new Map<number, { estimatedDeparture?: string; estimatedArrival?: string }>();
    for (const t of estimatedTimesRows) {
      const existing = estimatedTimesMap.get(t.flightId) ?? {};
      if (t.timeType === 'EstimatedBlockOff') {
        existing.estimatedDeparture = t.timeValue.toISOString();
      } else if (t.timeType === 'EstimatedBlockOn') {
        existing.estimatedArrival = t.timeValue.toISOString();
      }
      estimatedTimesMap.set(t.flightId, existing);
    }

    const flightsForDisplay = displayFlights
      .map(f => ({
        ...f,
        estimatedDeparture: estimatedTimesMap.get(f.id)?.estimatedDeparture ?? null,
        estimatedArrival: estimatedTimesMap.get(f.id)?.estimatedArrival ?? null,
      }))
      .sort((a, b) => {
        const aTime = new Date(a.estimatedDeparture ?? a.scheduledDeparture).getTime();
        const bTime = new Date(b.estimatedDeparture ?? b.scheduledDeparture).getTime();
        return aTime - bTime;
      });

    // Build weatherMap
    const weatherMap: Record<string, { airportCode: string; timestamp: Date; temperature: number | null; windSpeed: number | null; windDirection: number | null; weatherCode: number | null }[]> = {};
    for (const row of weatherRows) {
      if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = [];
      weatherMap[row.airportCode].push(row);
    }

    // Build daylightMap
    const daylightMap: Record<string, { airportCode: string; date: string; sunrise: Date; sunset: Date }[]> = {};
    for (const row of daylightRows) {
      if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
      daylightMap[row.airportCode].push(row);
    }

    // Current GCI weather for the header — find the record closest to now
    let currentGciWeather: { airportCode: string; timestamp: Date; temperature: number | null; windSpeed: number | null; windDirection: number | null; weatherCode: number | null } | null = null;
    if (weatherMap['GCI'] && weatherMap['GCI'].length > 0) {
      const gciRows = weatherMap['GCI'];
      const past = gciRows.filter(w => new Date(w.timestamp).getTime() <= now.getTime());
      if (past.length > 0) {
        currentGciWeather = past.reduce((a, b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b);
      } else {
        currentGciWeather = gciRows.reduce((a, b) => {
          const aDiff = Math.abs(new Date(a.timestamp).getTime() - now.getTime());
          const bDiff = Math.abs(new Date(b.timestamp).getTime() - now.getTime());
          return aDiff <= bDiff ? a : b;
        });
      }
    }

    // Read recently-viewed from cookie so SSR can render the section without a pop-in
    let recentlyViewed: RecentFlight[] = [];
    try {
      const rv = cookies.get('rv');
      if (rv) recentlyViewed = JSON.parse(rv); // cookies.get() already decodes via decodeURIComponent
    } catch { /* malformed cookie — ignore */ }

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
      recentlyViewed,
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
      recentlyViewed: [],
    };
  }
};
