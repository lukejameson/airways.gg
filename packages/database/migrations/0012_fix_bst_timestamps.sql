UPDATE flights
SET
  scheduled_departure = scheduled_departure - INTERVAL '1 hour',
  scheduled_arrival = scheduled_arrival - INTERVAL '1 hour',
  updated_at = NOW()
WHERE
  (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
  != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
--> statement-breakpoint
UPDATE flight_status_history
SET
  status_timestamp = status_timestamp - INTERVAL '1 hour'
WHERE
  source = 'guernsey_airport'
  AND (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London'
      != (flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'UTC';
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
