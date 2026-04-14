-- Reverse migration 0012's -1 hour adjustment on historical BST-period data.
--
-- Migration 0012 subtracted 1 hour from all BST-period flights, assuming
-- timestamps were stored in BST and needed converting to UTC. However, with
-- all services now running in TZ=Europe/London, pg's symmetric local-time
-- serialisation means data should be stored in BST wall-clock time. This
-- migration adds 1 hour back to restore correct BST values.
--
-- Only affects BST-period dates (where London offset != UTC).

-- 1. Restore scheduled times (0012 subtracted 1 hour from these)
UPDATE flights
SET
  scheduled_departure = scheduled_departure + INTERVAL '1 hour',
  scheduled_arrival   = scheduled_arrival   + INTERVAL '1 hour',
  updated_at          = NOW()
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- 2. Restore actual times (0012 may have affected these via re-scraping)
UPDATE flights
SET
  actual_departure = CASE WHEN actual_departure IS NOT NULL THEN actual_departure + INTERVAL '1 hour' ELSE actual_departure END,
  actual_arrival   = CASE WHEN actual_arrival IS NOT NULL THEN actual_arrival + INTERVAL '1 hour' ELSE actual_arrival END,
  updated_at       = NOW()
WHERE
  (actual_departure IS NOT NULL OR actual_arrival IS NOT NULL)
  AND (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- 3. Restore flight_status_history for guernsey_airport (0012 subtracted 1hr)
UPDATE flight_status_history
SET status_timestamp = status_timestamp + INTERVAL '1 hour'
WHERE
  source = 'guernsey_airport'
  AND (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- 4. Restore EstimatedBlockOff / EstimatedBlockOn (0012 subtracted 1hr)
UPDATE flight_times ft
SET time_value = ft.time_value + INTERVAL '1 hour'
FROM flights f
WHERE ft.flight_id = f.id
  AND ft.time_type IN ('EstimatedBlockOff', 'EstimatedBlockOn')
  AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
