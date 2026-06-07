-- Migration 0016: Fix BST scheduled times stored as-if-UTC
--
-- Background:
--   localToUtc() uses Luxon DateTime.fromFormat() with zone:'Europe/London'.
--   The guernsey-scraper and web Docker images (node:20-alpine) lacked the
--   tzdata package, causing Luxon to fall back to UTC when resolving the
--   Europe/London timezone. This meant:
--
--     localToUtc('2026-06-03', 9, 15) returned 09:15Z instead of 08:15Z.
--
--   Every scheduled_departure and scheduled_arrival for BST-period flights
--   was stored 1 hour ahead of true UTC. The display layer (formatGuernseyTime)
--   uses native Intl.DateTimeFormat which resolves Europe/London correctly,
--   so it converts 09:15Z → 10:15 BST — exactly 1 hour later than the
--   intended 09:15 BST.
--
--   This migration reverses that error: ADD 1 hour to scheduled times for
--   BST dates, converting as-if-UTC values back to true UTC.
--
--   Similarly, flight_times.time_value for EstimatedBlockOff/EstimatedBlockOn
--   were also stored via localToUtc and need the same correction.
--
-- BST-period predicate:
--   (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
--     != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
--
-- NOTE: Unlike migration 0014 which SUBTRACTED 1 hour (wall-clock → UTC),
-- this migration ADDS 1 hour (as-if-UTC → true UTC).

-- ============================================================
-- 1. flights: scheduled times  (+1 hour for BST dates)
-- ============================================================
UPDATE flights
SET
  scheduled_departure = scheduled_departure + INTERVAL '1 hour',
  scheduled_arrival   = scheduled_arrival   + INTERVAL '1 hour',
  updated_at          = NOW()
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint

-- ============================================================
-- 2. flight_times: estimated times  (+1 hour for BST dates)
--    Dedup first to avoid (flight_id, time_type) unique constraint
--    violations when shifting creates a duplicate.
-- ============================================================
DELETE FROM flight_times ft1
USING flight_times ft2
WHERE
  ft1.flight_id = ft2.flight_id
  AND ft1.time_type = ft2.time_type
  AND ft1.id > ft2.id
  AND ft2.time_value = ft1.time_value + INTERVAL '1 hour'
  AND EXISTS (
    SELECT 1 FROM flights f
    WHERE f.id = ft1.flight_id
      AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
          != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  );
--> statement-breakpoint

UPDATE flight_times ft
SET time_value = ft.time_value + INTERVAL '1 hour'
FROM flights f
WHERE
  ft.flight_id = f.id
  AND ft.time_type IN ('EstimatedBlockOff', 'EstimatedBlockOn')
  AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
