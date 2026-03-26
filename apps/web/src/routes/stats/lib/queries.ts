/**
 * Typed Drizzle query functions for stats page
 * Replaces raw SQL with type-safe query builders
 */

import { db } from '$lib/server/db';
import { flights, historicalWeather } from '@airways/database/schema';
import {
  sql,
  desc,
  isNotNull,
} from 'drizzle-orm';
import type {
  FilterConfig,
  HeroStats,
  DelayDistribution,
  DayOfWeekStats,
  HourlyStats,
  DailyStats,
  RouteStats,
  FlightNumberStats,
  AircraftStats,
  DelayRecord,
  DailyOtpStats,
  MonthlyStats,
  WeatherBandStats,
  WeatherCodeStats,
  CrosswindStats,
  WorstWeatherDay,
  DelayImpact,
  WorstDelayDay,
  FilterOptions,
} from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build airline filter SQL fragment
 */
function buildAirlineFilter(airline?: string): ReturnType<typeof sql> {
  if (airline) {
    return sql`(UPPER(SUBSTRING(${flights.flightNumber} FROM 1 FOR 2)) = ${airline})`;
  }
  return sql`(${flights.flightNumber} ILIKE 'GR%' OR ${flights.flightNumber} ILIKE 'BA%')`;
}

/**
 * Build date filter SQL fragment
 */
function buildDateFilter(range: FilterConfig['range']): ReturnType<typeof sql> {
  if (range.type === 'custom' && range.dateFrom && range.dateTo) {
    return sql`AND ${flights.flightDate} BETWEEN ${range.dateFrom} AND ${range.dateTo}`;
  }
  if (range.type === '30') {
    return sql`AND ${flights.flightDate} >= CURRENT_DATE - INTERVAL '30 days'`;
  }
  if (range.type === '90') {
    return sql`AND ${flights.flightDate} >= CURRENT_DATE - INTERVAL '90 days'`;
  }
  return sql``;
}

/**
 * Build route minimum filter SQL fragment (for regular routes)
 */
function buildRouteMinFilter(
  range: FilterConfig['range'],
  minFlightsPerRoute: number,
): ReturnType<typeof sql> {
  let routeMinDateFilter: ReturnType<typeof sql>;

  if (range.type === 'custom' && range.dateFrom && range.dateTo) {
    routeMinDateFilter = sql`AND f2.flight_date BETWEEN ${range.dateFrom} AND ${range.dateTo}`;
  } else if (range.type === '30') {
    routeMinDateFilter = sql`AND f2.flight_date >= CURRENT_DATE - INTERVAL '30 days'`;
  } else if (range.type === '90') {
    routeMinDateFilter = sql`AND f2.flight_date >= CURRENT_DATE - INTERVAL '90 days'`;
  } else {
    routeMinDateFilter = sql``;
  }

  return sql`AND (${flights.departureAirport}, ${flights.arrivalAirport}) IN (
    SELECT f2.departure_airport, f2.arrival_airport FROM flights f2
    WHERE (f2.flight_number ILIKE 'GR%' OR f2.flight_number ILIKE 'BA%')
      AND f2.departure_airport != f2.arrival_airport
      ${routeMinDateFilter}
    GROUP BY f2.departure_airport, f2.arrival_airport
    HAVING COUNT(*) >= ${minFlightsPerRoute}
  )`;
}

/**
 * Build route filter for specific routes
 */
function buildRouteFilter(
  routes: FilterConfig['routes'],
): ReturnType<typeof sql> {
  if (!routes || routes.length === 0) {
    return sql``;
  }

  const conditions = routes.map(
    (r) => sql`(${flights.departureAirport} = ${r.dep} AND ${flights.arrivalAirport} = ${r.arr})`,
  );
  return sql`AND (${sql.join(conditions, sql` OR `)})`;
}

/**
 * Build direction filter
 */
function buildDirectionFilter(direction?: string): ReturnType<typeof sql> {
  if (direction === 'dep') {
    return sql`AND ${flights.departureAirport} = 'GCI'`;
  }
  if (direction === 'arr') {
    return sql`AND ${flights.arrivalAirport} = 'GCI'`;
  }
  return sql``;
}

/**
 * Build day of week filter
 */
function buildDowFilter(dow?: number): ReturnType<typeof sql> {
  if (dow === undefined || dow === null || isNaN(dow) || dow < 0 || dow > 6) {
    return sql``;
  }
  return sql`AND EXTRACT(DOW FROM ${flights.flightDate}) = ${dow}`;
}

/**
 * Build period filter (season/month)
 */
function buildPeriodFilter(
  season?: string,
  month?: number,
): ReturnType<typeof sql> {
  if (month !== undefined && month !== null && !isNaN(month) && month >= 1 && month <= 12) {
    return sql`AND EXTRACT(MONTH FROM ${flights.flightDate}) = ${month}`;
  }

  switch (season) {
    case 'summer':
      return sql`AND EXTRACT(MONTH FROM ${flights.flightDate}) IN (6, 7, 8)`;
    case 'winter':
      return sql`AND EXTRACT(MONTH FROM ${flights.flightDate}) IN (12, 1, 2)`;
    case 'spring':
      return sql`AND EXTRACT(MONTH FROM ${flights.flightDate}) IN (3, 4, 5)`;
    case 'autumn':
      return sql`AND EXTRACT(MONTH FROM ${flights.flightDate}) IN (9, 10, 11)`;
    default:
      return sql``;
  }
}

/**
 * Build year filter
 */
function buildYearFilter(year?: number): ReturnType<typeof sql> {
  if (year === undefined || year === null || isNaN(year) || year < 2000 || year > 2100) {
    return sql``;
  }
  return sql`AND EXTRACT(YEAR FROM ${flights.flightDate}) = ${year}`;
}

/**
 * Build complete WHERE clause
 */
function buildWhereClause(filters: FilterConfig): ReturnType<typeof sql> {
  const airlineFilter = buildAirlineFilter(filters.airline);
  const dateFilter = buildDateFilter(filters.range);
  const routeMinFilter = buildRouteMinFilter(
    filters.range,
    filters.minFlightsPerRoute,
  );
  const routeFilter = buildRouteFilter(filters.routes);
  const directionFilter = buildDirectionFilter(filters.direction);
  const dowFilter = buildDowFilter(filters.dow);
  const periodFilter = buildPeriodFilter(filters.season, filters.month);
  const yearFilter = buildYearFilter(filters.year);

  return sql`${airlineFilter} ${dateFilter} ${routeMinFilter} ${routeFilter} ${directionFilter} ${dowFilter} ${periodFilter} ${yearFilter}`;
}

/**
 * Build route WHERE clause (without route-specific filter)
 */
function buildRoutesWhereClause(filters: FilterConfig): ReturnType<typeof sql> {
  const airlineFilter = buildAirlineFilter(filters.airline);
  const dateFilter = buildDateFilter(filters.range);
  const routeMinFilter = buildRouteMinFilter(
    filters.range,
    filters.minFlightsPerRoute,
  );
  const directionFilter = buildDirectionFilter(filters.direction);
  const dowFilter = buildDowFilter(filters.dow);
  const periodFilter = buildPeriodFilter(filters.season, filters.month);
  const yearFilter = buildYearFilter(filters.year);

  return sql`${airlineFilter} ${dateFilter} ${routeMinFilter} ${directionFilter} ${dowFilter} ${periodFilter} ${yearFilter}`;
}

/**
 * Build weather WHERE clause
 */
function buildWeatherWhereClause(filters: FilterConfig): ReturnType<typeof sql> {
  const airlineFilter = buildAirlineFilter(filters.airline);

  let dateFilter: ReturnType<typeof sql>;
  if (filters.range.type === 'custom' && filters.range.dateFrom && filters.range.dateTo) {
    dateFilter = sql`AND ${flights.flightDate} BETWEEN ${filters.range.dateFrom} AND ${filters.range.dateTo}`;
  } else if (filters.range.type === '30') {
    dateFilter = sql`AND ${flights.flightDate} >= CURRENT_DATE - INTERVAL '30 days'`;
  } else if (filters.range.type === '90') {
    dateFilter = sql`AND ${flights.flightDate} >= CURRENT_DATE - INTERVAL '90 days'`;
  } else {
    dateFilter = sql``;
  }

  const routeMinFilter = buildRouteMinFilter(
    filters.range,
    filters.minFlightsPerRoute,
  );
  const routeFilter = buildRouteFilter(filters.routes);
  const directionFilter = buildDirectionFilter(filters.direction);
  const dowFilter = buildDowFilter(filters.dow);
  const periodFilter = buildPeriodFilter(filters.season, filters.month);
  const yearFilter = buildYearFilter(filters.year);

  return sql`${airlineFilter} ${dateFilter} ${routeMinFilter} ${routeFilter} ${directionFilter} ${dowFilter} ${periodFilter} ${yearFilter}`;
}

// ============================================================================
// Filter Options Queries
// ============================================================================

/**
 * Get available years from flights table
 */
export async function getAvailableYears(): Promise<number[]> {
  const result = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${flights.flightDate})::int`,
    })
    .from(flights)
    .where(isNotNull(flights.flightDate))
    .groupBy(sql`EXTRACT(YEAR FROM ${flights.flightDate})`)
    .orderBy(desc(sql`EXTRACT(YEAR FROM ${flights.flightDate})`));

  return result.map((r) => r.year);
}

/**
 * Get available airlines (first 2 chars of flight number)
 */
export async function getAvailableAirlines(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT UPPER(SUBSTRING(flight_number FROM 1 FOR 2)) as code
    FROM flights
    WHERE flight_number IS NOT NULL
      AND flight_number ~ '^[A-Za-z]{2}'
    ORDER BY code
  `);

  return (result.rows as { code: string }[]).map((r) => r.code);
}

/**
 * Get available routes with flight counts
 */
export async function getAvailableRoutes(): Promise<
  Array<{ departure: string; arrival: string; key: string }>
> {
  const result = await db.execute(sql`
    SELECT
      departure_airport,
      arrival_airport,
      departure_airport || '-' || arrival_airport AS route_key,
      COUNT(*) AS flight_count
    FROM flights
    WHERE departure_airport != arrival_airport
      AND departure_airport IS NOT NULL
      AND arrival_airport IS NOT NULL
    GROUP BY departure_airport, arrival_airport
    ORDER BY flight_count DESC
  `);

  return (result.rows as { departure_airport: string; arrival_airport: string; route_key: string }[]).map(
    (r) => ({
      departure: r.departure_airport,
      arrival: r.arrival_airport,
      key: r.route_key,
    }),
  );
}

/**
 * Get all filter options in parallel
 */
export async function getFilterOptions(): Promise<FilterOptions> {
  const [years, airlines, routes] = await Promise.all([
    getAvailableYears(),
    getAvailableAirlines(),
    getAvailableRoutes(),
  ]);

  return {
    availableYears: years,
    availableAirlines: airlines,
    availableRoutes: routes,
  };
}

// ============================================================================
// Main Stats Queries
// ============================================================================

/**
 * Get hero stats - main KPIs for the dashboard
 */
export async function getHeroStats(filters: FilterConfig): Promise<HeroStats> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<HeroStats>`
    SELECT
      COUNT(*) AS total_flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS total_cancelled,
      COUNT(*) FILTER (WHERE NOT ${flights.canceled}) AS operated,
      COUNT(*) FILTER (WHERE NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL) AS with_outcome,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL AND ${flights.delayMinutes} <= ${filters.threshold} THEN 1 ELSE 0 END) AS on_time,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay_mins,
      MIN(${flights.flightDate}) AS earliest_date,
      MAX(${flights.flightDate}) AS latest_date
    FROM flights
    WHERE ${whereClause}
  `);

  return result.rows[0] as unknown as HeroStats;
}

/**
 * Get delay distribution by time buckets
 */
export async function getDelayDistribution(filters: FilterConfig): Promise<DelayDistribution> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DelayDistribution>`
    SELECT
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL AND ${flights.delayMinutes} <= 0 THEN 1 ELSE 0 END) AS on_time,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} BETWEEN 1 AND 15 THEN 1 ELSE 0 END) AS d1_15,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} BETWEEN 16 AND 30 THEN 1 ELSE 0 END) AS d16_30,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS d31_60,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} BETWEEN 61 AND 120 THEN 1 ELSE 0 END) AS d1_2h,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > 120 THEN 1 ELSE 0 END) AS d2hplus,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      COUNT(*) FILTER (WHERE NOT ${flights.canceled} AND ${flights.delayMinutes} IS NULL) AS no_outcome
    FROM flights
    WHERE ${whereClause}
  `);

  return result.rows[0] as unknown as DelayDistribution;
}

/**
 * Get day of week distribution statistics
 */
export async function getDayOfWeekDistribution(filters: FilterConfig): Promise<DayOfWeekStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DayOfWeekStats>`
    SELECT
      EXTRACT(DOW FROM ${flights.flightDate})::int AS dow,
      TO_CHAR(${flights.flightDate}, 'Day') AS day_name,
      COUNT(*) AS flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1, 2
    ORDER BY 1
  `);

  return result.rows as unknown as DayOfWeekStats[];
}

/**
 * Get hourly departure statistics
 */
export async function getHourDistribution(filters: FilterConfig): Promise<HourlyStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<HourlyStats>`
    SELECT
      EXTRACT(HOUR FROM ${flights.scheduledDeparture})::int AS hour,
      COUNT(*) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM flights
    WHERE ${whereClause} AND ${flights.scheduledDeparture} IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `);

  return result.rows as unknown as HourlyStats[];
}

/**
 * Get busiest days (most flights)
 */
export async function getBusiestDays(filters: FilterConfig, limit = 10): Promise<DailyStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DailyStats>`
    SELECT
      ${flights.flightDate}::text AS flight_date,
      COUNT(*) AS flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.status} ILIKE '%land%' THEN 1 ELSE 0 END) AS landed
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1
    ORDER BY flights DESC
    LIMIT ${limit}
  `);

  return result.rows as unknown as DailyStats[];
}

/**
 * Get worst days (most cancellations)
 */
export async function getWorstDays(filters: FilterConfig, limit = 10): Promise<DailyStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DailyStats>`
    SELECT
      ${flights.flightDate}::text AS flight_date,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      COUNT(*) AS total_flights,
      ROUND(SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1
    HAVING SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) > 0
    ORDER BY cancelled DESC
    LIMIT ${limit}
  `);

  return result.rows as unknown as DailyStats[];
}

/**
 * Get route statistics
 */
export async function getRouteStats(filters: FilterConfig): Promise<RouteStats[]> {
  const whereClause = buildRoutesWhereClause(filters);

  const result = await db.execute(sql<RouteStats>`
    SELECT
      ${flights.departureAirport} || '-' || ${flights.arrivalAirport} AS route,
      ${flights.departureAirport} AS departure_airport,
      ${flights.arrivalAirport} AS arrival_airport,
      COUNT(*) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay,
      MAX(CASE WHEN NOT ${flights.canceled} THEN ${flights.delayMinutes} END) AS max_delay,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(*) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct,
      ROUND((
        COALESCE(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(*) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 0) * 0.5
        +
        SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0) * 0.5
      ), 1) AS reliability_score
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1, 2, 3
    ORDER BY avg_delay DESC NULLS LAST
  `);

  return result.rows as unknown as RouteStats[];
}

/**
 * Get flight number statistics
 */
export async function getFlightNumberStats(
  filters: FilterConfig,
  limit = 20,
): Promise<FlightNumberStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<FlightNumberStats>`
    SELECT
      ${flights.flightNumber} AS flight_number,
      COUNT(*) AS operated,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(*) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay,
      MAX(CASE WHEN NOT ${flights.canceled} THEN ${flights.delayMinutes} END) AS worst_delay
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1
    HAVING COUNT(*) >= 2
    ORDER BY delay_pct DESC NULLS LAST
    LIMIT ${limit}
  `);

  return result.rows as unknown as FlightNumberStats[];
}

/**
 * Get aircraft usage statistics
 */
export async function getAircraftStats(filters: FilterConfig): Promise<AircraftStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<AircraftStats>`
    SELECT
      ${flights.aircraftRegistration} AS aircraft_registration,
      ${flights.aircraftType} AS aircraft_type,
      COUNT(*) AS flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM flights
    WHERE ${whereClause} AND ${flights.aircraftRegistration} IS NOT NULL
    GROUP BY 1, 2
    ORDER BY flights DESC
  `);

  return result.rows as unknown as AircraftStats[];
}

/**
 * Get top delays
 */
export async function getTopDelays(filters: FilterConfig, limit = 10): Promise<DelayRecord[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DelayRecord>`
    SELECT
      ${flights.id},
      ${flights.flightNumber} AS flight_number,
      ${flights.flightDate}::text AS flight_date,
      ${flights.departureAirport} AS departure_airport,
      ${flights.arrivalAirport} AS arrival_airport,
      ${flights.delayMinutes} AS delay_minutes
    FROM flights
    WHERE ${whereClause} AND ${flights.delayMinutes} IS NOT NULL AND NOT ${flights.canceled}
    ORDER BY ${flights.delayMinutes} DESC
    LIMIT ${limit}
  `);

  return result.rows as unknown as DelayRecord[];
}

/**
 * Get daily OTP (On-Time Performance) stats
 */
export async function getDailyOtpStats(filters: FilterConfig): Promise<DailyOtpStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DailyOtpStats>`
    SELECT
      ${flights.flightDate}::text AS flight_date,
      COUNT(*) AS flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      COUNT(*) FILTER (WHERE NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL) AS with_outcome,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL AND ${flights.delayMinutes} <= ${filters.threshold} THEN 1 ELSE 0 END) AS on_time,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL AND ${flights.delayMinutes} <= ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(*) FILTER (WHERE NOT ${flights.canceled} AND ${flights.delayMinutes} IS NOT NULL), 0), 1) AS otp_pct,
      ROUND(SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1
    ORDER BY 1
  `);

  return result.rows as unknown as DailyOtpStats[];
}

/**
 * Get monthly breakdown statistics
 */
export async function getMonthlyBreakdown(filters: FilterConfig): Promise<MonthlyStats[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<MonthlyStats>`
    SELECT
      TO_CHAR(DATE_TRUNC('month', ${flights.flightDate}), 'Mon YYYY') AS month,
      DATE_TRUNC('month', ${flights.flightDate})::text AS month_sort,
      COUNT(*) AS flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1, 2
    ORDER BY 2
  `);

  return result.rows as unknown as MonthlyStats[];
}

// ============================================================================
// Weather Statistics Queries
// ============================================================================

/**
 * Get wind delay statistics by wind speed bands
 */
export async function getWindDelayStats(filters: FilterConfig): Promise<WeatherBandStats[]> {
  const wxFilter = buildWeatherWhereClause(filters);

  const result = await db.execute(sql<WeatherBandStats>`
    SELECT
      CASE
        WHEN ${historicalWeather.windSpeed} < 20 THEN '0–20 kn (light)'
        WHEN ${historicalWeather.windSpeed} < 30 THEN '20–30 kn (moderate)'
        WHEN ${historicalWeather.windSpeed} < 40 THEN '30–40 kn (strong)'
        ELSE '40+ kn (severe)'
      END AS band,
      MIN(${historicalWeather.windSpeed}) AS band_min,
      COUNT(${flights.id}) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(${flights.id}) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM ${flights}
    JOIN ${historicalWeather}
      ON ${historicalWeather.airportCode} = 'GCI'
      AND ${historicalWeather.timestamp} = DATE_TRUNC('hour', ${flights.scheduledDeparture})
    WHERE ${flights.flightDate} IS NOT NULL AND ${wxFilter}
    GROUP BY 1
    ORDER BY MIN(${historicalWeather.windSpeed})
  `);

  return result.rows as unknown as WeatherBandStats[];
}

/**
 * Get visibility delay statistics
 */
export async function getVisibilityDelayStats(filters: FilterConfig): Promise<WeatherBandStats[]> {
  const wxFilter = buildWeatherWhereClause(filters);

  const result = await db.execute(sql<WeatherBandStats>`
    SELECT
      CASE
        WHEN ${historicalWeather.visibility} < 1 THEN '<1 km (fog)'
        WHEN ${historicalWeather.visibility} < 3 THEN '1–3 km (mist)'
        WHEN ${historicalWeather.visibility} < 5 THEN '3–5 km (haze)'
        ELSE '5+ km (good)'
      END AS band,
      MIN(${historicalWeather.visibility}) AS band_min,
      COUNT(${flights.id}) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(${flights.id}) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM ${flights}
    JOIN ${historicalWeather}
      ON ${historicalWeather.airportCode} = 'GCI'
      AND ${historicalWeather.timestamp} = DATE_TRUNC('hour', ${flights.scheduledDeparture})
    WHERE ${flights.flightDate} IS NOT NULL AND ${wxFilter}
    GROUP BY 1
    ORDER BY MIN(${historicalWeather.visibility})
  `);

  return result.rows as unknown as WeatherBandStats[];
}

/**
 * Get precipitation delay statistics
 */
export async function getPrecipitationDelayStats(filters: FilterConfig): Promise<WeatherBandStats[]> {
  const wxFilter = buildWeatherWhereClause(filters);

  const result = await db.execute(sql<WeatherBandStats>`
    SELECT
      CASE
        WHEN ${historicalWeather.precipitation} = 0 THEN 'None (0 mm)'
        WHEN ${historicalWeather.precipitation} < 1 THEN 'Light (<1 mm)'
        WHEN ${historicalWeather.precipitation} < 5 THEN 'Moderate (1–5 mm)'
        ELSE 'Heavy (5+ mm)'
      END AS band,
      MIN(${historicalWeather.precipitation}) AS band_min,
      COUNT(${flights.id}) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(${flights.id}) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM ${flights}
    JOIN ${historicalWeather}
      ON ${historicalWeather.airportCode} = 'GCI'
      AND ${historicalWeather.timestamp} = DATE_TRUNC('hour', ${flights.scheduledDeparture})
    WHERE ${flights.flightDate} IS NOT NULL AND ${wxFilter}
    GROUP BY 1
    ORDER BY MIN(${historicalWeather.precipitation})
  `);

  return result.rows as unknown as WeatherBandStats[];
}

/**
 * Get weather code delay statistics
 */
export async function getWeatherCodeDelayStats(filters: FilterConfig): Promise<WeatherCodeStats[]> {
  const wxFilter = buildWeatherWhereClause(filters);

  const result = await db.execute(sql<WeatherCodeStats>`
    SELECT
      ${historicalWeather.weatherCode} AS weather_code,
      COUNT(${flights.id}) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(${flights.id}) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM ${flights}
    JOIN ${historicalWeather}
      ON ${historicalWeather.airportCode} = 'GCI'
      AND ${historicalWeather.timestamp} = DATE_TRUNC('hour', ${flights.scheduledDeparture})
    WHERE ${flights.flightDate} IS NOT NULL AND ${wxFilter}
    GROUP BY 1
    ORDER BY delay_pct DESC NULLS LAST
  `);

  return result.rows as unknown as WeatherCodeStats[];
}

/**
 * Get crosswind delay statistics
 */
export async function getCrosswindDelayStats(filters: FilterConfig): Promise<CrosswindStats[]> {
  const wxFilter = buildWeatherWhereClause(filters);

  const result = await db.execute(sql<CrosswindStats>`
    SELECT
      CASE
        WHEN xw < 15 THEN '0–15 kn'
        WHEN xw < 28 THEN '15–28 kn'
        WHEN xw < 35 THEN '28–35 kn (>wet limit)'
        ELSE '35+ kn (>dry limit)'
      END AS xw_band,
      MIN(xw) AS band_min,
      COUNT(${flights.id}) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(${flights.id}) - SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay
    FROM ${flights}
    JOIN (
      SELECT *, ROUND((${historicalWeather.windSpeed} * ABS(SIN(RADIANS(${historicalWeather.windDirection} - 96))))::numeric, 1) AS xw
      FROM ${historicalWeather}
      WHERE ${historicalWeather.windDirection} > 0
    ) hw ON hw.airport_code = 'GCI' AND hw.timestamp = DATE_TRUNC('hour', ${flights.scheduledDeparture})
    WHERE ${flights.flightDate} IS NOT NULL AND ${wxFilter}
    GROUP BY 1
    ORDER BY MIN(xw)
  `);

  return result.rows as unknown as CrosswindStats[];
}

/**
 * Get worst weather days
 */
export async function getWorstWeatherDays(filters: FilterConfig, limit = 10): Promise<WorstWeatherDay[]> {
  const wxFilter = buildWeatherWhereClause(filters);

  const result = await db.execute(sql<WorstWeatherDay>`
    SELECT
      ${flights.flightDate}::text AS flight_date,
      COUNT(${flights.id}) AS flights,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN 1 ELSE 0 END) AS delayed,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > ${filters.threshold} THEN ${flights.delayMinutes} END), 0) AS avg_delay,
      ROUND(AVG(${historicalWeather.windSpeed})::numeric, 1) AS wind_kn,
      ROUND(AVG(${historicalWeather.windDirection})::numeric, 0)::integer AS wind_dir,
      ROUND(SUM(${historicalWeather.precipitation})::numeric, 1) AS precip_mm,
      ROUND(AVG(${historicalWeather.visibility})::numeric, 1) AS vis_km
    FROM ${flights}
    JOIN ${historicalWeather}
      ON ${historicalWeather.airportCode} = 'GCI'
      AND ${historicalWeather.timestamp} = DATE_TRUNC('hour', ${flights.scheduledDeparture})
    WHERE ${flights.flightDate} IS NOT NULL AND ${wxFilter}
    GROUP BY 1
    ORDER BY cancelled DESC, delayed DESC
    LIMIT ${limit}
  `);

  return result.rows as unknown as WorstWeatherDay[];
}

// ============================================================================
// Delay Impact Queries
// ============================================================================

/**
 * Get delay impact summary
 */
export async function getDelayImpact(filters: FilterConfig): Promise<DelayImpact> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<DelayImpact>`
    SELECT
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > 5 THEN ${flights.delayMinutes} ELSE 0 END) AS total_delay_mins,
      COUNT(*) FILTER (WHERE ${flights.delayMinutes} > 5 AND NOT ${flights.canceled}) AS flights_delayed_gt5,
      SUM(CASE WHEN ${flights.delayMinutes} > 5 AND NOT ${flights.canceled} THEN ${flights.delayMinutes} ELSE 0 END) AS total_delay_mins_gt5,
      COUNT(*) FILTER (WHERE NOT ${flights.canceled}) AS operated,
      COUNT(*) AS total,
      SUM(CASE WHEN ${flights.canceled} THEN 1 ELSE 0 END) AS cancelled,
      ROUND(AVG(${flights.delayMinutes}) FILTER (WHERE ${flights.delayMinutes} > 5 AND NOT ${flights.canceled}), 1) AS avg_delay_when_delayed,
      ROUND(
        SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > 5 THEN ${flights.delayMinutes} ELSE 0 END)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE NOT ${flights.canceled}), 0), 1
      ) AS avg_delay_all_operated,
      SUM(CASE WHEN ${flights.delayMinutes} > 5 AND NOT ${flights.canceled} THEN
        ${flights.delayMinutes} * CASE WHEN ${flights.departureAirport} = 'ACI' OR ${flights.arrivalAirport} = 'ACI' THEN 15 ELSE 50 END
      ELSE 0 END) AS pax_weighted_delay_mins
    FROM flights
    WHERE ${whereClause}
  `);

  return result.rows[0] as unknown as DelayImpact;
}

/**
 * Get worst delay days
 */
export async function getWorstDelayDays(filters: FilterConfig, limit = 10): Promise<WorstDelayDay[]> {
  const whereClause = buildWhereClause(filters);

  const result = await db.execute(sql<WorstDelayDay>`
    SELECT
      ${flights.flightDate}::text AS flight_date,
      COUNT(*) AS flights,
      SUM(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > 5 THEN ${flights.delayMinutes} ELSE 0 END) AS total_delay_mins,
      ROUND(AVG(CASE WHEN NOT ${flights.canceled} AND ${flights.delayMinutes} > 5 THEN ${flights.delayMinutes} END), 0) AS avg_delay,
      SUM(CASE WHEN ${flights.delayMinutes} > 5 AND NOT ${flights.canceled} THEN
        ${flights.delayMinutes} * CASE WHEN ${flights.departureAirport} = 'ACI' OR ${flights.arrivalAirport} = 'ACI' THEN 15 ELSE 50 END
      ELSE 0 END) AS pax_weighted_delay_mins
    FROM flights
    WHERE ${whereClause}
    GROUP BY 1
    ORDER BY total_delay_mins DESC
    LIMIT ${limit}
  `);

  return result.rows as unknown as WorstDelayDay[];
}
