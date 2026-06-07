-- Migration 0014: Convert BST wall-clock timestamps to true UTC
--
-- Background:
--   All services previously ran with TZ=Europe/London. With `timestamp without
--   time zone` columns, the pg driver serialised Date objects in process-local
--   time, so BST-period values were stored as BST wall-clock (e.g. "10:30" for
--   a flight at 10:30 BST = 09:30 UTC).
--
--   Migration 0013 additionally applied a +1 hour adjustment to actual_departure
--   and actual_arrival for BST-period flights, even though those values had
--   never been adjusted by 0012. This left actual times 1 hour too high.
--
--   All services now run with TZ=UTC. This migration converts stored values
--   to true UTC so the data is consistent with the new TZ=UTC service config:
--
--   scheduled_departure/arrival  BST wall-clock → UTC  =  -1 hour
--   actual_departure/arrival     BST wall-clock + 0013's extra +1h → UTC  =  -2 hours
--   flight_times.time_value      BST wall-clock → UTC  =  -1 hour
--   flight_status_history        BST wall-clock → UTC  =  -1 hour
--   airport_daylight             BST wall-clock → UTC  =  -1 hour
--   weather_data                 BST wall-clock → UTC  =  -1 hour
--   historical_weather           BST wall-clock → UTC  =  -1 hour
--   aircraft_positions           BST wall-clock → UTC  =  -1 hour
--
-- BST-period predicate (reused throughout):
--   (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
--     != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
--
-- NOTE: If diagnostic shows actual_departure is only 1 hour ahead (not 2),
-- change the actual_departure/actual_arrival adjustment from -2h to -1h.

-- ============================================================
-- 1. flights: scheduled times  (-1 hour for BST dates)
-- ============================================================
UPDATE flights
SET
  scheduled_departure = scheduled_departure - INTERVAL '1 hour',
  scheduled_arrival   = scheduled_arrival   - INTERVAL '1 hour',
  updated_at          = NOW()
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 2. flights: actual times  (-1 hour for BST dates)
--    Diagnostic confirms actual times are in BST wall-clock format
--    (same as scheduled times), so the same -1h offset applies.
--    The April 2-4 data corrupted by 0013 (+1h on top of wall-clock)
--    cannot be fixed without re-scraping — it will remain ~1h off.
-- ============================================================
UPDATE flights
SET
  actual_departure = CASE
    WHEN actual_departure IS NOT NULL THEN actual_departure - INTERVAL '1 hour'
    ELSE actual_departure
  END,
  actual_arrival = CASE
    WHEN actual_arrival IS NOT NULL THEN actual_arrival - INTERVAL '1 hour'
    ELSE actual_arrival
  END,
  updated_at = NOW()
WHERE
  (actual_departure IS NOT NULL OR actual_arrival IS NOT NULL)
  AND (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 3. flight_times: estimated departure/arrival times  (-1 hour)
--    Dedup first to avoid violating the (flight_id, time_type)
--    unique constraint when shifting creates a duplicate.
-- ============================================================
DELETE FROM flight_times ft1
USING flight_times ft2
WHERE
  ft1.flight_id = ft2.flight_id
  AND ft1.time_type = ft2.time_type
  AND ft1.id > ft2.id
  AND ft2.time_value = ft1.time_value - INTERVAL '1 hour'
  AND EXISTS (
    SELECT 1 FROM flights f
    WHERE f.id = ft1.flight_id
      AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
          != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  );
--> statement-breakpoint

UPDATE flight_times ft
SET time_value = ft.time_value - INTERVAL '1 hour'
FROM flights f
WHERE
  ft.flight_id = f.id
  AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 4. flight_status_history  (-1 hour for BST dates)
--    Dedup first to avoid violating the
--    (flight_code, flight_date, status_timestamp, source) unique constraint.
-- ============================================================
DELETE FROM flight_status_history fsh1
USING flight_status_history fsh2
WHERE
  fsh1.flight_code = fsh2.flight_code
  AND fsh1.flight_date = fsh2.flight_date
  AND fsh1.source = fsh2.source
  AND fsh1.status_message = fsh2.status_message
  AND fsh1.id > fsh2.id
  AND fsh2.status_timestamp = fsh1.status_timestamp - INTERVAL '1 hour'
  AND (fsh1.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (fsh1.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

UPDATE flight_status_history
SET status_timestamp = status_timestamp - INTERVAL '1 hour'
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 5. airport_daylight: sunrise / sunset  (-1 hour for BST dates)
-- ============================================================
UPDATE airport_daylight
SET
  sunrise = sunrise - INTERVAL '1 hour',
  sunset  = sunset  - INTERVAL '1 hour'
WHERE
  (date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 6. weather_data  (-1 hour for BST-period timestamps)
--    Use ::date::text to get "YYYY-MM-DD" without time component.
--    Dedup first due to unique(airport_code, timestamp).
-- ============================================================
DELETE FROM weather_data w1
USING weather_data w2
WHERE
  w1.airport_code = w2.airport_code
  AND w1.id > w2.id
  AND w2.timestamp = w1.timestamp - INTERVAL '1 hour'
  AND (w1.timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (w1.timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

UPDATE weather_data
SET timestamp = timestamp - INTERVAL '1 hour'
WHERE
  (timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 7. historical_weather  (-1 hour for BST-period timestamps)
--    Dedup first due to unique(airport_code, timestamp).
-- ============================================================
DELETE FROM historical_weather h1
USING historical_weather h2
WHERE
  h1.airport_code = h2.airport_code
  AND h1.id > h2.id
  AND h2.timestamp = h1.timestamp - INTERVAL '1 hour'
  AND (h1.timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (h1.timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

UPDATE historical_weather
SET timestamp = timestamp - INTERVAL '1 hour'
WHERE
  (timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 8. aircraft_positions  (-1 hour for BST-period timestamps)
--    Dedup first due to unique(flight_id, position_timestamp).
-- ============================================================
DELETE FROM aircraft_positions p1
USING aircraft_positions p2
WHERE
  p1.flight_id = p2.flight_id
  AND p1.id > p2.id
  AND p2.position_timestamp = p1.position_timestamp - INTERVAL '1 hour'
  AND (p1.position_timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (p1.position_timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

UPDATE aircraft_positions
SET
  position_timestamp = position_timestamp - INTERVAL '1 hour',
  eta = CASE
    WHEN eta IS NOT NULL THEN eta - INTERVAL '1 hour'
    ELSE eta
  END
WHERE
  (position_timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (position_timestamp::date::text || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
