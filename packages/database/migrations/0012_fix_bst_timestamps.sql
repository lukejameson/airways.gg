UPDATE flights
SET
  scheduled_departure = scheduled_departure - INTERVAL '1 hour',
  scheduled_arrival = scheduled_arrival - INTERVAL '1 hour',
  updated_at = NOW()
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint
DELETE FROM flight_status_history fsh
USING flight_status_history fsh2
WHERE
  fsh.source = 'guernsey_airport'
  AND (fsh.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (fsh.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC'
  AND fsh2.flight_code = fsh.flight_code
  AND fsh2.flight_date = fsh.flight_date
  AND fsh2.source = fsh.source
  AND fsh2.status_timestamp = fsh.status_timestamp - INTERVAL '1 hour'
  AND fsh.id > fsh2.id;
--> statement-breakpoint
UPDATE flight_status_history
SET
  status_timestamp = status_timestamp - INTERVAL '1 hour'
WHERE
  source = 'guernsey_airport'
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
--> statement-breakpoint
UPDATE flight_times ft
SET
  time_value = ft.time_value - INTERVAL '1 hour'
FROM flights f
WHERE
  ft.flight_id = f.id
  AND ft.time_type IN ('EstimatedBlockOff', 'EstimatedBlockOn')
  AND (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (f.flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
