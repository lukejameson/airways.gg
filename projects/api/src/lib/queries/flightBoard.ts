import { getDb, flights, flightTimes, weatherData, airportDaylight, scraperLogs } from '../db';
import { and, eq, gte, lte, inArray, not, inArray as notInArray, desc, asc, count, or, sql } from 'drizzle-orm';
import type { FlightBoardResult } from '../../types';

const GY_TZ = 'Europe/London';

function toGuernseyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(d);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function countFlightsForDate(dateStr: string): Promise<number> {
  try {
    const db = getDb();
    const [result] = await db
      .select({ value: count() })
      .from(flights)
      .where(eq(flights.flightDate, dateStr));
    return result?.value ?? 0;
  } catch {
    return 0;
  }
}

async function getActiveFlightsForDate(dateStr: string) {
  const TERMINAL_STATUSES = ['Landed', 'Cancelled', 'Completed'];
  try {
    const db = getDb();
    return await db
      .select()
      .from(flights)
      .where(
        and(
          eq(flights.flightDate, dateStr),
          eq(flights.canceled, false),
          notInArray(flights.status, TERMINAL_STATUSES),
          sql`LOWER(${flights.status}) NOT LIKE 'diverted%'`
        )
      );
  } catch {
    return [];
  }
}

async function fetchDisplayFlights(dateStr: string) {
  const db = getDb();
  return db
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
    .where(eq(flights.flightDate, dateStr))
    .orderBy(flights.scheduledDeparture);
}

async function fetchLastScrape() {
  const db = getDb();
  const [row] = await db
    .select({ completedAt: scraperLogs.completedAt })
    .from(scraperLogs)
    .where(eq(scraperLogs.status, 'success'))
    .orderBy(desc(scraperLogs.completedAt))
    .limit(1);
  return row;
}

export async function getFlightBoard(
  dateParam?: string,
  recentlyViewed: Array<{ id: number; flightNumber: string; departureAirport: string; arrivalAirport: string; scheduledDeparture: string; viewedAt: string }> = []
): Promise<FlightBoardResult> {
  const db = getDb();
  const now = new Date();
  const todayStr = toGuernseyDateStr(now);
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  let displayDateStr = todayStr;
  let autoAdvanced = false;

  try {
    let displayFlights: Awaited<ReturnType<typeof fetchDisplayFlights>>;
    let lastScrape: Awaited<ReturnType<typeof fetchLastScrape>>;

    if (dateParam && (dateParam === todayStr || dateParam === tomorrowStr)) {
      displayDateStr = dateParam;
      [displayFlights, lastScrape] = await Promise.all([
        fetchDisplayFlights(displayDateStr),
        fetchLastScrape(),
      ]);
    } else {
      const [todayFlightCount, activeFlightsToday, tomorrowFlightCount, lastScrapeResult] = await Promise.all([
        countFlightsForDate(todayStr),
        getActiveFlightsForDate(todayStr),
        countFlightsForDate(tomorrowStr),
        fetchLastScrape(),
      ]);

      lastScrape = lastScrapeResult;

      if (todayFlightCount > 0 && activeFlightsToday.length === 0 && tomorrowFlightCount > 0) {
        displayDateStr = tomorrowStr;
        autoAdvanced = true;
      }

      displayFlights = await fetchDisplayFlights(displayDateStr);
    }

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

    const estimatedTimesMap = new Map<number, { estimatedDeparture?: string; estimatedArrival?: string }>();
    for (const t of estimatedTimesRows as Array<{ flightId: number; timeType: string; timeValue: Date }>) {
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

    const weatherMap: Record<string, Array<{
      airportCode: string;
      timestamp: Date;
      temperature: number | null;
      windSpeed: number | null;
      windDirection: number | null;
      weatherCode: number | null;
    }>> = {};
    for (const row of weatherRows as Array<{
      airportCode: string;
      timestamp: Date;
      temperature: number | null;
      windSpeed: number | null;
      windDirection: number | null;
      weatherCode: number | null;
    }>) {
      if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = [];
      weatherMap[row.airportCode].push(row);
    }

    const daylightMap: Record<string, Array<{
      airportCode: string;
      date: string;
      sunrise: Date;
      sunset: Date;
    }>> = {};
    for (const row of daylightRows as Array<{
      airportCode: string;
      date: string;
      sunrise: Date;
      sunset: Date;
    }>) {
      if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
      daylightMap[row.airportCode].push(row);
    }

    let currentGciWeather: {
      airportCode: string;
      timestamp: Date;
      temperature: number | null;
      windSpeed: number | null;
      windDirection: number | null;
      weatherCode: number | null;
    } | null = null;

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

    return {
      flights: flightsForDisplay,
      weather: currentGciWeather,
      weatherMap,
      daylightMap,
      lastUpdated: lastScrape?.completedAt ?? null,
      displayDate: displayDateStr,
      todayStr,
      tomorrowStr,
      autoAdvanced,
      recentlyViewed,
    };
  } catch (err) {
    console.error('Error loading flights:', err);
    return {
      flights: [],
      weather: null,
      weatherMap: {},
      daylightMap: {},
      lastUpdated: null,
      displayDate: displayDateStr,
      todayStr,
      tomorrowStr,
      autoAdvanced,
      recentlyViewed,
    };
  }
}
