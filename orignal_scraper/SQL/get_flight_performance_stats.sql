CREATE OR REPLACE FUNCTION get_flight_performance_stats(
    _start_date timestamp,
    _end_date timestamp,
    _airline text DEFAULT NULL,
    _location text DEFAULT NULL,
    _flight_type text DEFAULT NULL
)
RETURNS TABLE(
    airline text,
    location text,
    flight_type text,
    total_flights bigint,
    on_time_flights bigint,
    on_time_percentage numeric,
    early_flights bigint,
    early_percentage numeric,
    delayed_flights bigint,
    delayed_percentage numeric,
    avg_delay_minutes numeric,
    max_delay_minutes numeric,
    flights_with_no_actual_time bigint,
    no_actual_time_percentage numeric,
    late_5_minutes_count bigint,
    late_5_minutes_percentage numeric,
    late_10_minutes_count bigint,
    late_10_minutes_percentage numeric,
    late_15_minutes_count bigint,
    late_15_minutes_percentage numeric,
    late_30_minutes_count bigint,
    late_30_minutes_percentage numeric
)
LANGUAGE SQL
AS $BODY$
    WITH flight_data AS (
        SELECT
            scheduled_time,
            actual_time,
            CASE
                WHEN actual_time IS NULL OR scheduled_time IS NULL THEN NULL
                ELSE EXTRACT(EPOCH FROM (actual_time - scheduled_time)) / 60
            END as delay_minutes
        FROM (
            SELECT scheduled_time, actual_time
            FROM arrivals
            WHERE (_airline IS NULL OR airline = _airline)
            AND (_location IS NULL OR location = _location)
            AND scheduled_time >= _start_date
            AND scheduled_time <= _end_date
            AND scheduled_time IS NOT NULL
            AND (_flight_type IS NULL OR _flight_type = 'arrivals')

            UNION ALL

            SELECT scheduled_time, actual_time
            FROM departures
            WHERE (_airline IS NULL OR airline = _airline)
            AND (_location IS NULL OR location = _location)
            AND scheduled_time >= _start_date
            AND scheduled_time <= _end_date
            AND scheduled_time IS NOT NULL
            AND (_flight_type IS NULL OR _flight_type = 'departures')
        ) combined_flights
    ),
    flight_stats AS (
        SELECT
            COUNT(*) as total_flights,
            COUNT(CASE WHEN delay_minutes IS NOT NULL AND delay_minutes BETWEEN -1 AND 1 THEN 1 END) as on_time_flights,
            COUNT(CASE WHEN delay_minutes IS NOT NULL AND delay_minutes < -1 THEN 1 END) as early_flights,
            COUNT(CASE WHEN delay_minutes IS NOT NULL AND delay_minutes > 1 THEN 1 END) as delayed_flights,
            AVG(CASE WHEN delay_minutes > 0 THEN delay_minutes ELSE NULL END) as avg_delay_minutes,
            MAX(CASE WHEN delay_minutes > 0 THEN delay_minutes ELSE 0 END) as max_delay_minutes,
            COUNT(CASE WHEN delay_minutes IS NULL THEN 1 END) as flights_with_no_actual_time,
            -- Exclusive buckets: each flight counted only once
            COUNT(CASE WHEN delay_minutes > 5 AND delay_minutes <= 10 THEN 1 END) as late_5_minutes_count,
            COUNT(CASE WHEN delay_minutes > 10 AND delay_minutes <= 15 THEN 1 END) as late_10_minutes_count,
            COUNT(CASE WHEN delay_minutes > 15 AND delay_minutes <= 30 THEN 1 END) as late_15_minutes_count,
            COUNT(CASE WHEN delay_minutes > 30 THEN 1 END) as late_30_minutes_count
        FROM flight_data
    )
    SELECT
        COALESCE(_airline, 'All Airlines') as airline,
        COALESCE(_location, 'All Locations') as location,
        COALESCE(_flight_type, 'All') as flight_type,
        flight_stats.total_flights,
        flight_stats.on_time_flights,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.on_time_flights::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as on_time_percentage,
        flight_stats.early_flights,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.early_flights::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as early_percentage,
        flight_stats.delayed_flights,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.delayed_flights::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as delayed_percentage,
        COALESCE(ROUND(flight_stats.avg_delay_minutes, 2), 0) as avg_delay_minutes,
        COALESCE(flight_stats.max_delay_minutes, 0) as max_delay_minutes,
        flight_stats.flights_with_no_actual_time,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.flights_with_no_actual_time::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as no_actual_time_percentage,
        flight_stats.late_5_minutes_count,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.late_5_minutes_count::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_5_minutes_percentage,
        flight_stats.late_10_minutes_count,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.late_10_minutes_count::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_10_minutes_percentage,
        flight_stats.late_15_minutes_count,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.late_15_minutes_count::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_15_minutes_percentage,
        flight_stats.late_30_minutes_count,
        CASE
            WHEN flight_stats.total_flights > 0
            THEN ROUND((flight_stats.late_30_minutes_count::numeric / flight_stats.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_30_minutes_percentage
    FROM flight_stats
$BODY$;


select * from get_flight_performance_stats('2025-07-01', '2025-07-31')
