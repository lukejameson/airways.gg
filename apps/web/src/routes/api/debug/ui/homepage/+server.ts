import type { RequestHandler } from './$types';
import { db, flights, weatherData, airportDaylight, flightTimes, guernseyTodayStr, guernseyTomorrowStr } from '$lib/server/db';
import { debugResponse, debugError } from '$lib/server/debug-helpers';
import { and, gte, lte, inArray, or, eq, asc } from 'drizzle-orm';

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

/**
 * Mirrors the homepage load function's data — flight list, weather, daylight for a given date.
 * Query params: date (YYYY-MM-DD, defaults to today Guernsey time)
 */
export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const now = new Date();
    const todayStr = guernseyTodayStr(now);
    const tomorrowStr = guernseyTomorrowStr(now);

    const dateParam = url.searchParams.get('date');
    const displayDateStr = dateParam && (dateParam === todayStr || dateParam === tomorrowStr)
      ? dateParam
      : todayStr;

    const displayFlights = await db
      .select(FLIGHT_COLUMNS)
      .from(flights)
      .where(eq(flights.flightDate, displayDateStr))
      .orderBy(flights.scheduledDeparture);

    const flightIds = displayFlights.map(f => f.id);
    const airportCodes = [...new Set(
      displayFlights.flatMap(f => [f.departureAirport, f.arrivalAirport])
    )];

    const weatherStartDate = new Date(displayDateStr + 'T00:00:00Z');
    const weatherEndDate = new Date(weatherStartDate);
    weatherEndDate.setUTCDate(weatherEndDate.getUTCDate() + 2);

    const [estimatedTimesRows, weatherRows, daylightRows] = await Promise.all([
      flightIds.length > 0
        ? db.select({ flightId: flightTimes.flightId, timeType: flightTimes.timeType, timeValue: flightTimes.timeValue })
            .from(flightTimes)
            .where(and(
              inArray(flightTimes.flightId, flightIds),
              inArray(flightTimes.timeType, ['EstimatedBlockOff', 'EstimatedBlockOn']),
            ))
        : Promise.resolve([]),
      airportCodes.length > 0
        ? db.select({
            airportCode: weatherData.airportCode, timestamp: weatherData.timestamp,
            temperature: weatherData.temperature, windSpeed: weatherData.windSpeed,
            windDirection: weatherData.windDirection, weatherCode: weatherData.weatherCode,
          })
          .from(weatherData)
          .where(and(
            inArray(weatherData.airportCode, airportCodes),
            gte(weatherData.timestamp, weatherStartDate),
            lte(weatherData.timestamp, weatherEndDate),
          ))
          .orderBy(weatherData.timestamp)
        : Promise.resolve([]),
      airportCodes.length > 0
        ? db.select({
            airportCode: airportDaylight.airportCode, date: airportDaylight.date,
            sunrise: airportDaylight.sunrise, sunset: airportDaylight.sunset,
          })
          .from(airportDaylight)
          .where(and(
            inArray(airportDaylight.airportCode, airportCodes),
            or(eq(airportDaylight.date, todayStr), eq(airportDaylight.date, tomorrowStr)),
          ))
          .orderBy(asc(airportDaylight.date))
        : Promise.resolve([]),
    ]);

    // Build estimated times map
    const estimatedTimesMap = new Map<number, { estimatedDeparture?: string; estimatedArrival?: string }>();
    for (const t of estimatedTimesRows) {
      const existing = estimatedTimesMap.get(t.flightId) ?? {};
      if (t.timeType === 'EstimatedBlockOff') existing.estimatedDeparture = t.timeValue.toISOString();
      else if (t.timeType === 'EstimatedBlockOn') existing.estimatedArrival = t.timeValue.toISOString();
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

    // Build weather map
    const weatherMap: Record<string, typeof weatherRows> = {};
    for (const row of weatherRows) {
      if (!weatherMap[row.airportCode]) weatherMap[row.airportCode] = [];
      weatherMap[row.airportCode].push(row);
    }

    // Build daylight map
    const daylightMap: Record<string, typeof daylightRows> = {};
    for (const row of daylightRows) {
      if (!daylightMap[row.airportCode]) daylightMap[row.airportCode] = [];
      daylightMap[row.airportCode].push(row);
    }

    const data = {
      flights: flightsForDisplay,
      weatherMap,
      daylightMap,
      displayDate: displayDateStr,
      todayStr,
      tomorrowStr,
    };

    return debugResponse([data], performance.now() - t0);
  } catch (err) {
    console.error('[debug/ui/homepage]', err);
    return debugError('Query failed', 500);
  }
};
