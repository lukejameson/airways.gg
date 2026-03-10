#!/bin/bash
CONTAINER=${1:-<container>}
USER=${2:-<username>}

run() {
  docker exec -it "$CONTAINER" psql -U "$USER" -c "$1"
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
