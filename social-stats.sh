#!/bin/bash
CONTAINER=${1:-<container>}
USER=${2:-<username>}

run() {
  docker exec -it "$CONTAINER" psql -U "$USER" -d airwaysgg -c "$1"
}

echo "===== DELAY RECORDS ====="
run "
SELECT flight_number, flight_date, departure_airport, arrival_airport, delay_minutes,
       ROUND(delay_minutes / 60.0, 1) AS delay_hours
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
  AND delay_minutes IS NOT NULL
ORDER BY delay_minutes DESC
LIMIT 10;
"

echo "===== BUSIEST DAYS ====="
run "
SELECT flight_date, COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled,
       COUNT(*) FILTER (WHERE status = 'Landed') AS landed
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY flight_date
ORDER BY flights DESC
LIMIT 10;
"

echo "===== WORST DAYS (most cancellations) ====="
run "
SELECT flight_date,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled,
       COUNT(*) AS total_flights,
       ROUND(100.0 * COUNT(*) FILTER (WHERE canceled = true) / COUNT(*), 1) AS cancel_pct
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY flight_date
HAVING COUNT(*) FILTER (WHERE canceled = true) > 0
ORDER BY cancelled DESC
LIMIT 10;
"

echo "===== WORST ROUTES (avg delay) ====="
run "
SELECT departure_airport || '-' || arrival_airport AS route,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins,
       MAX(delay_minutes) AS max_delay_mins,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY route
ORDER BY avg_delay_mins DESC NULLS LAST;
"

echo "===== AIRCRAFT USAGE ====="
run "
SELECT aircraft_registration, aircraft_type,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
  AND aircraft_registration IS NOT NULL
GROUP BY aircraft_registration, aircraft_type
ORDER BY flights DESC;
"

echo "===== DELAY DISTRIBUTION ====="
run "
SELECT
  COUNT(*) FILTER (WHERE delay_minutes <= 0)          AS on_time,
  COUNT(*) FILTER (WHERE delay_minutes BETWEEN 1 AND 15)  AS delay_1_15,
  COUNT(*) FILTER (WHERE delay_minutes BETWEEN 16 AND 30) AS delay_16_30,
  COUNT(*) FILTER (WHERE delay_minutes BETWEEN 31 AND 60) AS delay_31_60,
  COUNT(*) FILTER (WHERE delay_minutes BETWEEN 61 AND 120) AS delay_1_2h,
  COUNT(*) FILTER (WHERE delay_minutes > 120)         AS delay_over_2h
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
  AND delay_minutes IS NOT NULL;
"

echo "===== DAY OF WEEK BREAKDOWN ====="
run "
SELECT TO_CHAR(flight_date, 'Day') AS day_of_week,
       EXTRACT(DOW FROM flight_date) AS dow_num,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY day_of_week, dow_num
ORDER BY dow_num;
"

echo "===== MOST DELAYED FLIGHT NUMBERS ====="
run "
SELECT flight_number,
       COUNT(*) AS operated,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE delay_minutes > 0) / COUNT(*), 1) AS delay_pct,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins,
       MAX(delay_minutes) AS worst_delay_mins
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
  AND delay_minutes IS NOT NULL
GROUP BY flight_number
HAVING COUNT(*) >= 5
ORDER BY delay_pct DESC
LIMIT 15;
"

echo "===== DELAYS BY WIND SPEED (GCI) ====="
run "
WITH flight_weather AS (
  SELECT f.flight_date,
         f.delay_minutes,
         f.canceled,
         w.wind_speed,
         CASE
           WHEN w.wind_speed < 20  THEN '0-20 kn (light)'
           WHEN w.wind_speed < 30  THEN '20-30 kn (moderate)'
           WHEN w.wind_speed < 40  THEN '30-40 kn (strong)'
           ELSE '40+ kn (severe)'
         END AS wind_band
  FROM flights f
  JOIN historical_weather w
    ON w.airport_code = 'GCI'
    AND w.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
  WHERE f.flight_date >= CURRENT_DATE - INTERVAL '3 months'
    AND f.departure_airport = 'GCI'
    AND f.delay_minutes IS NOT NULL
)
SELECT wind_band,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE delay_minutes > 0) / COUNT(*), 1) AS delay_pct,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled
FROM flight_weather
GROUP BY wind_band
ORDER BY MIN(wind_speed);
"

echo "===== DELAYS BY VISIBILITY (GCI) ====="
run "
WITH flight_weather AS (
  SELECT f.delay_minutes,
         f.canceled,
         w.visibility,
         CASE
           WHEN w.visibility < 1   THEN '<1 km (fog)'
           WHEN w.visibility < 3   THEN '1-3 km (mist)'
           WHEN w.visibility < 5   THEN '3-5 km (haze)'
           WHEN w.visibility < 10  THEN '5-10 km (moderate)'
           ELSE '10+ km (clear)'
         END AS vis_band
  FROM flights f
  JOIN historical_weather w
    ON w.airport_code = 'GCI'
    AND w.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
  WHERE f.flight_date >= CURRENT_DATE - INTERVAL '3 months'
    AND f.departure_airport = 'GCI'
    AND f.delay_minutes IS NOT NULL
    AND w.visibility IS NOT NULL
)
SELECT vis_band,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE delay_minutes > 0) / COUNT(*), 1) AS delay_pct,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled
FROM flight_weather
GROUP BY vis_band
ORDER BY MIN(visibility);
"

echo "===== WORST WEATHER DAYS (combined score) ====="
run "
WITH day_weather AS (
  SELECT DATE(timestamp) AS d,
         ROUND(AVG(wind_speed)::numeric, 1) AS avg_wind,
         ROUND(MIN(visibility)::numeric, 1) AS min_vis,
         ROUND(SUM(precipitation)::numeric, 1) AS total_precip,
         MAX(weather_code) AS worst_code
  FROM historical_weather
  WHERE airport_code = 'GCI'
    AND timestamp >= CURRENT_DATE - INTERVAL '3 months'
  GROUP BY DATE(timestamp)
),
day_flights AS (
  SELECT flight_date,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE canceled = true) AS cancelled,
         COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
         ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay
  FROM flights
  WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months'
  GROUP BY flight_date
)
SELECT df.flight_date,
       df.total AS flights,
       df.cancelled,
       df.delayed,
       df.avg_delay,
       dw.avg_wind AS wind_kn,
       dw.min_vis AS min_vis_km,
       dw.total_precip AS precip_mm
FROM day_flights df
JOIN day_weather dw ON dw.d = df.flight_date
WHERE df.cancelled > 0 OR df.delayed > df.total * 0.5
ORDER BY df.cancelled DESC, df.delayed DESC
LIMIT 15;
"

echo "===== PRECIPITATION VS DELAY RATE ====="
run "
WITH flight_weather AS (
  SELECT f.delay_minutes,
         f.canceled,
         w.precipitation,
         CASE
           WHEN w.precipitation = 0    THEN 'None'
           WHEN w.precipitation < 1    THEN 'Light (<1mm)'
           WHEN w.precipitation < 5    THEN 'Moderate (1-5mm)'
           ELSE 'Heavy (5mm+)'
         END AS precip_band
  FROM flights f
  JOIN historical_weather w
    ON w.airport_code = 'GCI'
    AND w.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
  WHERE f.flight_date >= CURRENT_DATE - INTERVAL '3 months'
    AND f.departure_airport = 'GCI'
    AND f.delay_minutes IS NOT NULL
    AND w.precipitation IS NOT NULL
)
SELECT precip_band,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE delay_minutes > 0) / COUNT(*), 1) AS delay_pct,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled
FROM flight_weather
GROUP BY precip_band
ORDER BY MIN(precipitation);
"

echo "===== WEATHER CODE BREAKDOWN ====="
run "
WITH flight_weather AS (
  SELECT f.delay_minutes,
         f.canceled,
         CASE w.weather_code
           WHEN 0 THEN 'Clear sky'
           WHEN 1 THEN 'Mainly clear'
           WHEN 2 THEN 'Partly cloudy'
           WHEN 3 THEN 'Overcast'
           WHEN 45 THEN 'Fog'
           WHEN 48 THEN 'Icy fog'
           WHEN 51 THEN 'Light drizzle'
           WHEN 53 THEN 'Moderate drizzle'
           WHEN 55 THEN 'Dense drizzle'
           WHEN 61 THEN 'Slight rain'
           WHEN 63 THEN 'Moderate rain'
           WHEN 65 THEN 'Heavy rain'
           WHEN 71 THEN 'Slight snow'
           WHEN 73 THEN 'Moderate snow'
           WHEN 75 THEN 'Heavy snow'
           WHEN 80 THEN 'Slight showers'
           WHEN 81 THEN 'Moderate showers'
           WHEN 82 THEN 'Violent showers'
           WHEN 95 THEN 'Thunderstorm'
           ELSE 'Other (' || w.weather_code || ')'
         END AS condition
  FROM flights f
  JOIN historical_weather w
    ON w.airport_code = 'GCI'
    AND w.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
  WHERE f.flight_date >= CURRENT_DATE - INTERVAL '3 months'
    AND f.departure_airport = 'GCI'
    AND f.delay_minutes IS NOT NULL
)
SELECT condition,
       COUNT(*) AS flights,
       COUNT(*) FILTER (WHERE delay_minutes > 0) AS delayed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE delay_minutes > 0) / COUNT(*), 1) AS delay_pct,
       ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0)) AS avg_delay_mins,
       COUNT(*) FILTER (WHERE canceled = true) AS cancelled
FROM flight_weather
GROUP BY condition
ORDER BY delay_pct DESC NULLS LAST;
"
