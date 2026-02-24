-- Get average delays for a specific airline and location within a date range
CREATE OR REPLACE FUNCTION get_airline_location_average_delays(
    _airline text,
    _location text,
    _start_date timestamp,
    _end_date timestamp
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
                WHEN actual_time > scheduled_time
                THEN EXTRACT(EPOCH FROM (actual_time - scheduled_time)) / 60
                ELSE 0
            END) as avg_delay_minutes,
            COUNT(*) as total_flights
        FROM arrivals
        WHERE airline = _airline
        AND location = _location
        AND DATE(scheduled_time) >= DATE(_start_date)
        AND DATE(scheduled_time) <= DATE(_end_date)
        AND actual_time IS NOT NULL
        AND scheduled_time IS NOT NULL
    ),
    departure_stats AS (
        SELECT
            AVG(CASE
                WHEN actual_time > scheduled_time
                THEN EXTRACT(EPOCH FROM (actual_time - scheduled_time)) / 60
                ELSE 0
            END) as avg_delay_minutes,
            COUNT(*) as total_flights
        FROM departures
        WHERE airline = _airline
        AND location = _location
        AND DATE(scheduled_time) >= DATE(_start_date)
        AND DATE(scheduled_time) <= DATE(_end_date)
        AND actual_time IS NOT NULL
        AND scheduled_time IS NOT NULL
    )
    SELECT
        _airline as airline,
        _location as location,
        COALESCE(arrival_stats.avg_delay_minutes, 0) as avg_arrival_delay_minutes,
        COALESCE(departure_stats.avg_delay_minutes, 0) as avg_departure_delay_minutes,
        COALESCE(arrival_stats.total_flights, 0) as total_arrivals,
        COALESCE(departure_stats.total_flights, 0) as total_departures
    FROM arrival_stats, departure_stats
$BODY$;
