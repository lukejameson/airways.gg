docker exec -it <container> psql -U <username> -c "
SELECT
  COUNT(DISTINCT flight_date)                                           AS days_scraped,
  COUNT(*)                                                              AS total_flights,
  COUNT(*) FILTER (WHERE canceled = true)                              AS cancelled,
  COUNT(*) FILTER (WHERE status = 'Landed')                           AS landed,
  COUNT(*) FILTER (WHERE delay_minutes > 0)                           AS delayed_flights,
  ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes > 0))          AS avg_delay_mins,
  MAX(delay_minutes)                                                    AS max_delay_mins,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE delay_minutes IS NOT NULL AND delay_minutes <= 0)
    / NULLIF(COUNT(*) FILTER (WHERE delay_minutes IS NOT NULL), 0), 1
  )                                                                     AS on_time_pct,
  COUNT(DISTINCT departure_airport || '-' || arrival_airport)         AS unique_routes,
  COUNT(DISTINCT aircraft_registration)
    FILTER (WHERE aircraft_registration IS NOT NULL)                   AS unique_aircraft
FROM flights
WHERE flight_date >= CURRENT_DATE - INTERVAL '3 months';
"
