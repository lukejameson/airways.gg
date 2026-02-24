-- Get average delays with optional airline and location filtering
CREATE OR REPLACE FUNCTION get_delay_stats(
    _start_date timestamp,
    _end_date timestamp,
    _airline text DEFAULT NULL,
    _location text DEFAULT NULL
)
RETURNS TABLE(
    airline text,
    location text,
    avg_arrival_delay_minutes numeric,
    avg_departure_delay_minutes numeric,
    total_arrivals bigint,
    total_departures bigint
)
LANGUAGE SQL
AS $BODY$
    WITH arrival_stats AS (
        SELECT
            AVG(CASE
                WHEN actual_time IS NOT NULL AND scheduled_time IS NOT NULL AND actual_time > scheduled_time
                THEN EXTRACT(EPOCH FROM (actual_time - scheduled_time)) / 60
                ELSE 0
            END) as avg_delay_minutes,
            COUNT(*) as total_flights
        FROM arrivals
        WHERE (_airline IS NULL OR airline = _airline)
        AND (_location IS NULL OR location = _location)
        AND scheduled_time >= _start_date
        AND scheduled_time <= _end_date
        AND scheduled_time IS NOT NULL
    ),
    departure_stats AS (
        SELECT
            AVG(CASE
                WHEN actual_time IS NOT NULL AND scheduled_time IS NOT NULL AND actual_time > scheduled_time
                THEN EXTRACT(EPOCH FROM (actual_time - scheduled_time)) / 60
                ELSE 0
            END) as avg_delay_minutes,
            COUNT(*) as total_flights
        FROM departures
        WHERE (_airline IS NULL OR airline = _airline)
        AND (_location IS NULL OR location = _location)
        AND scheduled_time >= _start_date
        AND scheduled_time <= _end_date
        AND scheduled_time IS NOT NULL
    )
    SELECT
        COALESCE(_airline, 'All Airlines') as airline,
        COALESCE(_location, 'All Locations') as location,
        COALESCE(arrival_stats.avg_delay_minutes, 0) as avg_arrival_delay_minutes,
        COALESCE(departure_stats.avg_delay_minutes, 0) as avg_departure_delay_minutes,
        COALESCE(arrival_stats.total_flights, 0) as total_arrivals,
        COALESCE(departure_stats.total_flights, 0) as total_departures
    FROM arrival_stats, departure_stats
$BODY$;


select * from get_delay_stats('2025-07-01', '2025-07-15')


select * from get_airline_average_delays('Blue Islands', '2025-07-01', '2025-07-15')
