-- Fix +1 hour BST offset in timestamps.
-- Root cause: pg driver serialised Date objects using local time methods.
-- When the FR24 scraper ran with TZ=Europe/London, PostgreSQL's
-- `timestamp WITHOUT time zone` columns silently discarded the +01:00 offset,
-- storing BST wall-clock time instead of UTC.
--
-- Only rows on BST-period dates are affected (dates where London offset != 0).

-- 1. Fix actual_departure and actual_arrival on BST-period flights
UPDATE flights
SET
  actual_departure = CASE WHEN actual_departure IS NOT NULL THEN actual_departure - INTERVAL '1 hour' ELSE actual_departure END,
  actual_arrival   = CASE WHEN actual_arrival IS NOT NULL THEN actual_arrival - INTERVAL '1 hour' ELSE actual_arrival END,
  updated_at       = NOW()
WHERE
  (actual_departure IS NOT NULL OR actual_arrival IS NOT NULL)
  AND (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- 2. Fix scheduled times for recent flights (post-migration-0012)
UPDATE flights
SET
  scheduled_departure = scheduled_departure - INTERVAL '1 hour',
  scheduled_arrival   = scheduled_arrival   - INTERVAL '1 hour',
  updated_at          = NOW()
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  AND flight_date >= '2026-04-01';
--> statement-breakpoint

-- 3. Fix ActualBlockOff / ActualBlockOn in flight_times
UPDATE flight_times ft
SET time_value = ft.time_value - INTERVAL '1 hour'
FROM flights f
WHERE ft.flight_id = f.id
  AND ft.time_type IN ('ActualBlockOff', 'ActualBlockOn')
  AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- 4. Fix EstimatedBlockOff / EstimatedBlockOn for recent flights
UPDATE flight_times ft
SET time_value = ft.time_value - INTERVAL '1 hour'
FROM flights f
WHERE ft.flight_id = f.id
  AND ft.time_type IN ('EstimatedBlockOff', 'EstimatedBlockOn')
  AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  AND f.flight_date >= '2026-04-01';
--> statement-breakpoint

-- 5. Deduplicate fr24 status_history rows before correction
DELETE FROM flight_status_history fsh
USING flight_status_history fsh2
WHERE fsh.source = 'fr24'
  AND (fsh.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (fsh.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  AND fsh2.flight_code = fsh.flight_code
  AND fsh2.flight_date = fsh.flight_date
  AND fsh2.source = fsh.source
  AND fsh2.status_timestamp = fsh.status_timestamp - INTERVAL '1 hour'
  AND fsh.id > fsh2.id;
--> statement-breakpoint

-- 6. Fix fr24 status_history timestamps
UPDATE flight_status_history
SET status_timestamp = status_timestamp - INTERVAL '1 hour'
WHERE source = 'fr24'
  AND (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  AND NOT EXISTS (
    SELECT 1 FROM flight_status_history fsh2
    WHERE fsh2.flight_code = flight_status_history.flight_code
      AND fsh2.flight_date = flight_status_history.flight_date
      AND fsh2.source = flight_status_history.source
      AND fsh2.status_timestamp = flight_status_history.status_timestamp - INTERVAL '1 hour'
      AND fsh2.id != flight_status_history.id
  );
