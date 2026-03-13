import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
  const range = url.searchParams.get('range') ?? '90';
  const activeAirline = url.searchParams.get('airline') ?? '';
  const activeRoute = url.searchParams.get('route') ?? '';
  const activeDirection = url.searchParams.get('direction') ?? '';
  const activeDow = url.searchParams.get('dow') ?? '';
  const activeSeason = url.searchParams.get('season') ?? '';
  const activeMonth = url.searchParams.get('month') ?? '';
  const activeYear = url.searchParams.get('year') ?? '';
  const thresholdParam = parseInt(url.searchParams.get('threshold') ?? '15', 10);
  const threshold = [0, 15, 30].includes(thresholdParam) ? thresholdParam : 15;
  const routeParts = activeRoute ? activeRoute.split('-') : [];
  const routeDep = routeParts[0] ?? '';
  const routeArr = routeParts.slice(1).join('-');
  const minFlightsPerRoute = range === '30' ? 2 : range === '90' ? 3 : 5;

  // Get available years, airlines, and routes for filters
  const [yearsResult, airlinesResult, routesResult] = await Promise.all([
    db.execute(sql`SELECT DISTINCT EXTRACT(YEAR FROM flight_date)::int as year FROM flights WHERE flight_date IS NOT NULL ORDER BY year DESC`),
    db.execute(sql`SELECT DISTINCT UPPER(SUBSTRING(flight_number FROM 1 FOR 2)) as code FROM flights WHERE flight_number IS NOT NULL AND flight_number ~ '^[A-Za-z]{2}' ORDER BY code`),
    db.execute(sql`
      SELECT DISTINCT
        f.departure_airport,
        f.arrival_airport,
        f.departure_airport || '-' || f.arrival_airport AS route_key
      FROM flights f
      WHERE f.departure_airport != f.arrival_airport AND f.departure_airport IS NOT NULL AND f.arrival_airport IS NOT NULL
      ORDER BY f.departure_airport, f.arrival_airport
    `)
  ]);
  const availableYears = (yearsResult.rows as { year: number }[]).map(r => r.year);
  const availableAirlines = (airlinesResult.rows as { code: string }[]).map(r => r.code);
  const availableRoutes = (routesResult.rows as { departure_airport: string; arrival_airport: string; route_key: string }[]).map(r => ({
    departure: r.departure_airport,
    arrival: r.arrival_airport,
    key: r.route_key,
  }));

  const airlineFilter = activeAirline
    ? sql`(UPPER(SUBSTRING(f.flight_number FROM 1 FOR 2)) = ${activeAirline})`
    : sql`(f.flight_number ILIKE 'GR%' OR f.flight_number ILIKE 'BA%')`;

  const dateFilter =
    range === '30'
      ? sql`AND f.flight_date >= CURRENT_DATE - INTERVAL '30 days'`
      : range === '90'
        ? sql`AND f.flight_date >= CURRENT_DATE - INTERVAL '90 days'`
        : sql``;

  // Subquery (alias f2) computes the set of regular routes for this period.
  const routeMinFilter = sql`AND (f.departure_airport, f.arrival_airport) IN (
    SELECT f2.departure_airport, f2.arrival_airport FROM flights f2
    WHERE (f2.flight_number ILIKE 'GR%' OR f2.flight_number ILIKE 'BA%')
      AND f2.departure_airport != f2.arrival_airport
      ${range === '30' ? sql`AND f2.flight_date >= CURRENT_DATE - INTERVAL '30 days'` : range === '90' ? sql`AND f2.flight_date >= CURRENT_DATE - INTERVAL '90 days'` : sql``}
    GROUP BY f2.departure_airport, f2.arrival_airport
    HAVING COUNT(*) >= ${minFlightsPerRoute}
  )`;

  const routeFilter = routeDep && routeArr
    ? sql`AND f.departure_airport = ${routeDep} AND f.arrival_airport = ${routeArr}`
    : sql``;

  const directionFilter = activeDirection === 'dep'
    ? sql`AND f.departure_airport = 'GCI'`
    : activeDirection === 'arr'
    ? sql`AND f.arrival_airport = 'GCI'`
    : sql``;

  const dowNum = parseInt(activeDow, 10);
  const dowFilter = activeDow !== '' && !isNaN(dowNum) && dowNum >= 0 && dowNum <= 6
    ? sql`AND EXTRACT(DOW FROM f.flight_date::date) = ${dowNum}`
    : sql``;

  const monthNum = parseInt(activeMonth, 10);
  let periodFilter = sql``;
  if (activeMonth !== '' && !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
    periodFilter = sql`AND EXTRACT(MONTH FROM f.flight_date::date) = ${monthNum}`;
  } else if (activeSeason === 'summer') {
    periodFilter = sql`AND EXTRACT(MONTH FROM f.flight_date::date) IN (6, 7, 8)`;
  } else if (activeSeason === 'winter') {
    periodFilter = sql`AND EXTRACT(MONTH FROM f.flight_date::date) IN (12, 1, 2)`;
  } else if (activeSeason === 'spring') {
    periodFilter = sql`AND EXTRACT(MONTH FROM f.flight_date::date) IN (3, 4, 5)`;
  } else if (activeSeason === 'autumn') {
    periodFilter = sql`AND EXTRACT(MONTH FROM f.flight_date::date) IN (9, 10, 11)`;
  }
  const yearNum = parseInt(activeYear, 10);
  const yearFilter = activeYear !== '' && !isNaN(yearNum) && yearNum >= 2000 && yearNum <= 2100
    ? sql`AND EXTRACT(YEAR FROM f.flight_date::date) = ${yearNum}`
    : sql``;

  const sinceClause = sql`${airlineFilter} ${dateFilter} ${routeMinFilter} ${routeFilter} ${directionFilter} ${dowFilter} ${periodFilter} ${yearFilter}`;
  const routesSince  = sql`${airlineFilter} ${dateFilter} ${routeMinFilter} ${directionFilter} ${dowFilter} ${periodFilter} ${yearFilter}`;
  const wxDateFilter =
    range === '30'
      ? sql`AND f.flight_date >= CURRENT_DATE - INTERVAL '30 days'`
      : range === '90'
        ? sql`AND f.flight_date >= CURRENT_DATE - INTERVAL '90 days'`
        : sql``;
  const wxFilter = sql`${airlineFilter} ${wxDateFilter} ${routeMinFilter} ${routeFilter} ${directionFilter} ${dowFilter} ${periodFilter} ${yearFilter}`;

  const [
    heroStats,
    delayDistribution,
    dayOfWeek,
    departureHour,
    busiestDays,
    worstDays,
    worstRoutes,
    flightNumbers,
    aircraftUsage,
    topDelays,
    dailyOtp,
    monthlyBreakdown,
    windDelays,
    visibilityDelays,
    precipDelays,
    weatherCodeDelays,
    crosswindDelays,
    worstWeatherDays,
    delayImpact,
    worstDelayDays,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) AS total_flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS total_cancelled,
        COUNT(*) FILTER (WHERE NOT f.canceled) AS operated,
        COUNT(*) FILTER (WHERE NOT f.canceled AND f.delay_minutes IS NOT NULL) AS with_outcome,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes IS NOT NULL AND f.delay_minutes <= ${threshold} THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay_mins,
        MIN(f.flight_date) AS earliest_date,
        MAX(f.flight_date) AS latest_date
      FROM flights f
      WHERE ${sinceClause}
    `),
    db.execute(sql`
      SELECT
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes IS NOT NULL AND f.delay_minutes <= 0 THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes BETWEEN 1 AND 15 THEN 1 ELSE 0 END) AS d1_15,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes BETWEEN 16 AND 30 THEN 1 ELSE 0 END) AS d16_30,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS d31_60,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes BETWEEN 61 AND 120 THEN 1 ELSE 0 END) AS d1_2h,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > 120 THEN 1 ELSE 0 END) AS d2hplus,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        COUNT(*) FILTER (WHERE NOT f.canceled AND f.delay_minutes IS NULL) AS no_outcome
      FROM flights f
      WHERE ${sinceClause}
    `),

    db.execute(sql`
      SELECT
        EXTRACT(DOW FROM f.flight_date::date)::int AS dow,
        TO_CHAR(f.flight_date::date, 'Day') AS day_name,
        COUNT(*) AS flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1, 2
      ORDER BY 1
    `),

    db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM f.scheduled_departure)::int AS hour,
        COUNT(*) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      WHERE ${sinceClause} AND f.scheduled_departure IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `),

    db.execute(sql`
      SELECT
        f.flight_date::text,
        COUNT(*) AS flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN NOT f.canceled AND f.status ILIKE '%land%' THEN 1 ELSE 0 END) AS landed
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1
      ORDER BY flights DESC
      LIMIT 10
    `),

    db.execute(sql`
      SELECT
        f.flight_date::text,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        COUNT(*) AS total_flights,
        ROUND(SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1
      HAVING SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) > 0
      ORDER BY cancelled DESC
      LIMIT 10
    `),

    db.execute(sql`
      SELECT
        f.departure_airport || '-' || f.arrival_airport AS route,
        f.departure_airport,
        f.arrival_airport,
        COUNT(*) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay,
        MAX(CASE WHEN NOT f.canceled THEN f.delay_minutes END) AS max_delay,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(*) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct,
        ROUND((
          COALESCE(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
            / NULLIF(COUNT(*) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 0) * 0.5
          +
          SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0) * 0.5
        ), 1) AS reliability_score
      FROM flights f
      WHERE ${routesSince}
      GROUP BY 1, 2, 3
      ORDER BY avg_delay DESC NULLS LAST
    `),

    db.execute(sql`
      SELECT
        f.flight_number,
        COUNT(*) AS operated,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(*) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay,
        MAX(CASE WHEN NOT f.canceled THEN f.delay_minutes END) AS worst_delay
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1
      HAVING COUNT(*) >= 2
      ORDER BY delay_pct DESC NULLS LAST
      LIMIT 20
    `),

    db.execute(sql`
      SELECT
        f.aircraft_registration,
        f.aircraft_type,
        COUNT(*) AS flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      WHERE ${sinceClause} AND f.aircraft_registration IS NOT NULL
      GROUP BY 1, 2
      ORDER BY flights DESC
    `),

    db.execute(sql`
      SELECT
        f.id,
        f.flight_number,
        f.flight_date::text,
        f.departure_airport,
        f.arrival_airport,
        f.delay_minutes
      FROM flights f
      WHERE ${sinceClause} AND f.delay_minutes IS NOT NULL AND NOT f.canceled
      ORDER BY f.delay_minutes DESC
      LIMIT 10
    `),

    db.execute(sql`
      SELECT
        f.flight_date::text,
        COUNT(*) AS flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        COUNT(*) FILTER (WHERE NOT f.canceled AND f.delay_minutes IS NOT NULL) AS with_outcome,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes IS NOT NULL AND f.delay_minutes <= ${threshold} THEN 1 ELSE 0 END) AS on_time,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes IS NOT NULL AND f.delay_minutes <= ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(*) FILTER (WHERE NOT f.canceled AND f.delay_minutes IS NOT NULL), 0), 1) AS otp_pct,
        ROUND(SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1
      ORDER BY 1
    `),

    db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', f.flight_date::date), 'Mon YYYY') AS month,
        DATE_TRUNC('month', f.flight_date::date)::text AS month_sort,
        COUNT(*) AS flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 1) AS cancel_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1, 2
      ORDER BY 2
    `),

    db.execute(sql`
      SELECT
        CASE
          WHEN hw.wind_speed < 20 THEN '0–20 kn (light)'
          WHEN hw.wind_speed < 30 THEN '20–30 kn (moderate)'
          WHEN hw.wind_speed < 40 THEN '30–40 kn (strong)'
          ELSE '40+ kn (severe)'
        END AS wind_band,
        MIN(hw.wind_speed) AS band_min,
        COUNT(f.id) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(f.id) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      JOIN historical_weather hw
        ON hw.airport_code = 'GCI'
        AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
      WHERE f.flight_date IS NOT NULL AND ${wxFilter}
      GROUP BY 1
      ORDER BY MIN(hw.wind_speed)
    `),

    db.execute(sql`
      SELECT
        CASE
          WHEN hw.visibility < 1 THEN '<1 km (fog)'
          WHEN hw.visibility < 3 THEN '1–3 km (mist)'
          WHEN hw.visibility < 5 THEN '3–5 km (haze)'
          ELSE '5+ km (good)'
        END AS vis_band,
        MIN(hw.visibility) AS band_min,
        COUNT(f.id) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(f.id) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      JOIN historical_weather hw
        ON hw.airport_code = 'GCI'
        AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
      WHERE f.flight_date IS NOT NULL AND ${wxFilter}
      GROUP BY 1
      ORDER BY MIN(hw.visibility)
    `),

    db.execute(sql`
      SELECT
        CASE
          WHEN hw.precipitation = 0 THEN 'None (0 mm)'
          WHEN hw.precipitation < 1 THEN 'Light (<1 mm)'
          WHEN hw.precipitation < 5 THEN 'Moderate (1–5 mm)'
          ELSE 'Heavy (5+ mm)'
        END AS precip_band,
        MIN(hw.precipitation) AS band_min,
        COUNT(f.id) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(f.id) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      JOIN historical_weather hw
        ON hw.airport_code = 'GCI'
        AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
      WHERE f.flight_date IS NOT NULL AND ${wxFilter}
      GROUP BY 1
      ORDER BY MIN(hw.precipitation)
    `),

    db.execute(sql`
      SELECT
        hw.weather_code,
        COUNT(f.id) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(f.id) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      JOIN historical_weather hw
        ON hw.airport_code = 'GCI'
        AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
      WHERE f.flight_date IS NOT NULL AND ${wxFilter}
      GROUP BY 1
      ORDER BY delay_pct DESC NULLS LAST
    `),

    db.execute(sql`
      SELECT
        CASE
          WHEN xw < 15 THEN '0–15 kn'
          WHEN xw < 28 THEN '15–28 kn'
          WHEN xw < 35 THEN '28–35 kn (>wet limit)'
          ELSE '35+ kn (>dry limit)'
        END AS xw_band,
        MIN(xw) AS band_min,
        COUNT(f.id) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END)::numeric * 100
          / NULLIF(COUNT(f.id) - SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END), 0), 1) AS delay_pct,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay
      FROM flights f
      JOIN (
        SELECT *, ROUND((wind_speed * ABS(SIN(RADIANS(wind_direction - 96))))::numeric, 1) AS xw
        FROM historical_weather
        WHERE wind_direction > 0
      ) hw ON hw.airport_code = 'GCI' AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
      WHERE f.flight_date IS NOT NULL AND ${wxFilter}
      GROUP BY 1
      ORDER BY MIN(xw)
    `),

    db.execute(sql`
      SELECT
        f.flight_date::text,
        COUNT(f.id) AS flights,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN 1 ELSE 0 END) AS delayed,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > ${threshold} THEN f.delay_minutes END), 0) AS avg_delay,
        ROUND(AVG(hw.wind_speed)::numeric, 1) AS wind_kn,
        ROUND(AVG(hw.wind_direction)::numeric, 0)::integer AS wind_dir,
        ROUND(SUM(hw.precipitation)::numeric, 1) AS precip_mm,
        ROUND(AVG(hw.visibility)::numeric, 1) AS vis_km
      FROM flights f
      JOIN historical_weather hw
        ON hw.airport_code = 'GCI'
        AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
      WHERE f.flight_date IS NOT NULL AND ${wxFilter}
      GROUP BY 1
      ORDER BY cancelled DESC, delayed DESC
      LIMIT 10
    `),

    db.execute(sql`
      SELECT
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > 5 THEN f.delay_minutes ELSE 0 END) AS total_delay_mins,
        COUNT(*) FILTER (WHERE f.delay_minutes > 5 AND NOT f.canceled) AS flights_delayed_gt5,
        SUM(CASE WHEN f.delay_minutes > 5 AND NOT f.canceled THEN f.delay_minutes ELSE 0 END) AS total_delay_mins_gt5,
        COUNT(*) FILTER (WHERE NOT f.canceled) AS operated,
        COUNT(*) AS total,
        SUM(CASE WHEN f.canceled THEN 1 ELSE 0 END) AS cancelled,
        ROUND(AVG(f.delay_minutes) FILTER (WHERE f.delay_minutes > 5 AND NOT f.canceled), 1) AS avg_delay_when_delayed,
        ROUND(
          SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > 5 THEN f.delay_minutes ELSE 0 END)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE NOT f.canceled), 0), 1
        ) AS avg_delay_all_operated,
        SUM(CASE WHEN f.delay_minutes > 5 AND NOT f.canceled THEN
          f.delay_minutes * CASE WHEN f.departure_airport = 'ACI' OR f.arrival_airport = 'ACI' THEN 15 ELSE 50 END
        ELSE 0 END) AS pax_weighted_delay_mins
      FROM flights f
      WHERE ${sinceClause}
    `),

    db.execute(sql`
      SELECT
        f.flight_date::text,
        COUNT(*) AS flights,
        SUM(CASE WHEN NOT f.canceled AND f.delay_minutes > 5 THEN f.delay_minutes ELSE 0 END) AS total_delay_mins,
        ROUND(AVG(CASE WHEN NOT f.canceled AND f.delay_minutes > 5 THEN f.delay_minutes END), 0) AS avg_delay,
        SUM(CASE WHEN f.delay_minutes > 5 AND NOT f.canceled THEN
          f.delay_minutes * CASE WHEN f.departure_airport = 'ACI' OR f.arrival_airport = 'ACI' THEN 15 ELSE 50 END
        ELSE 0 END) AS pax_weighted_delay_mins
      FROM flights f
      WHERE ${sinceClause}
      GROUP BY 1
      ORDER BY total_delay_mins DESC
      LIMIT 10
    `),
  ]).catch((e) => {
    console.error('Stats queries failed:', e);
    error(503, 'Statistics temporarily unavailable');
  });

  const wxFlightCount = (windDelays.rows as { flights: unknown }[]).reduce(
    (s, r) => s + Number(r.flights),
    0,
  );

  return {
    range,
    activeAirline,
    activeRoute,
    activeDirection,
    activeDow,
    activeSeason,
    activeMonth,
    activeYear,
    threshold,
    availableYears,
    availableAirlines,
    availableRoutes,
    heroStats: heroStats.rows[0] as Record<string, unknown>,
    delayDistribution: delayDistribution.rows[0] as Record<string, unknown>,
    dayOfWeek: dayOfWeek.rows as Record<string, unknown>[],
    departureHour: departureHour.rows as Record<string, unknown>[],
    busiestDays: busiestDays.rows as Record<string, unknown>[],
    worstDays: worstDays.rows as Record<string, unknown>[],
    worstRoutes: worstRoutes.rows as Record<string, unknown>[],
    flightNumbers: flightNumbers.rows as Record<string, unknown>[],
    aircraftUsage: aircraftUsage.rows as Record<string, unknown>[],
    topDelays: topDelays.rows as Record<string, unknown>[],
    dailyOtp: dailyOtp.rows as Record<string, unknown>[],
    monthlyBreakdown: monthlyBreakdown.rows as Record<string, unknown>[],
    windDelays: windDelays.rows as Record<string, unknown>[],
    visibilityDelays: visibilityDelays.rows as Record<string, unknown>[],
    precipDelays: precipDelays.rows as Record<string, unknown>[],
    weatherCodeDelays: weatherCodeDelays.rows as Record<string, unknown>[],
    crosswindDelays: crosswindDelays.rows as Record<string, unknown>[],
    worstWeatherDays: worstWeatherDays.rows as Record<string, unknown>[],
    wxFlightCount,
    delayImpact: delayImpact.rows[0] as Record<string, unknown>,
    worstDelayDays: worstDelayDays.rows as Record<string, unknown>[],
  };
};
