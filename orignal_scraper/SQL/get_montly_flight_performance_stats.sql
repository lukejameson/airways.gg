CREATE OR REPLACE FUNCTION get_monthly_flight_performance_stats(
    _start_date timestamp,
    _end_date timestamp,
    _airline text DEFAULT NULL,
    _location text DEFAULT NULL,
    _flight_type text DEFAULT NULL
)
RETURNS TABLE(
    year integer,
    month integer,
    month_name text,
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
    WITH months AS (
        SELECT
            EXTRACT(YEAR FROM month_start)::integer as year,
            EXTRACT(MONTH FROM month_start)::integer as month,
            TO_CHAR(month_start, 'Month') as month_name,
            month_start,
            (month_start + INTERVAL '1 month' - INTERVAL '1 day')::timestamp as month_end
        FROM generate_series(
            DATE_TRUNC('month', _start_date),
            DATE_TRUNC('month', _end_date),
            INTERVAL '1 month'
        ) as month_start
    ),
    flight_data AS (
        SELECT
            EXTRACT(YEAR FROM scheduled_time)::integer as year,
            EXTRACT(MONTH FROM scheduled_time)::integer as month,
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
    monthly_stats AS (
        SELECT
            m.year,
            m.month,
            m.month_name,
            COUNT(fd.delay_minutes) as total_flights,
            COUNT(CASE WHEN fd.delay_minutes IS NOT NULL AND fd.delay_minutes BETWEEN -1 AND 1 THEN 1 END) as on_time_flights,
            COUNT(CASE WHEN fd.delay_minutes IS NOT NULL AND fd.delay_minutes < -1 THEN 1 END) as early_flights,
            COUNT(CASE WHEN fd.delay_minutes IS NOT NULL AND fd.delay_minutes > 1 THEN 1 END) as delayed_flights,
            AVG(CASE WHEN fd.delay_minutes > 0 THEN fd.delay_minutes ELSE NULL END) as avg_delay_minutes,
            MAX(CASE WHEN fd.delay_minutes > 0 THEN fd.delay_minutes ELSE 0 END) as max_delay_minutes,
            COUNT(CASE WHEN fd.delay_minutes IS NULL THEN 1 END) as flights_with_no_actual_time,
            COUNT(CASE WHEN fd.delay_minutes > 5 AND fd.delay_minutes <= 10 THEN 1 END) as late_5_minutes_count,
            COUNT(CASE WHEN fd.delay_minutes > 10 AND fd.delay_minutes <= 15 THEN 1 END) as late_10_minutes_count,
            COUNT(CASE WHEN fd.delay_minutes > 15 AND fd.delay_minutes <= 30 THEN 1 END) as late_15_minutes_count,
            COUNT(CASE WHEN fd.delay_minutes > 30 THEN 1 END) as late_30_minutes_count
        FROM months m
        LEFT JOIN flight_data fd ON m.year = fd.year AND m.month = fd.month
        GROUP BY m.year, m.month, m.month_name
        ORDER BY m.year, m.month
    )
    SELECT
        ms.year,
        ms.month,
        TRIM(ms.month_name) as month_name,
        COALESCE(_airline, 'All Airlines') as airline,
        COALESCE(_location, 'All Locations') as location,
        COALESCE(_flight_type, 'All') as flight_type,
        ms.total_flights,
        ms.on_time_flights,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.on_time_flights::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as on_time_percentage,
        ms.early_flights,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.early_flights::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as early_percentage,
        ms.delayed_flights,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.delayed_flights::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as delayed_percentage,
        COALESCE(ROUND(ms.avg_delay_minutes, 2), 0) as avg_delay_minutes,
        COALESCE(ms.max_delay_minutes, 0) as max_delay_minutes,
        ms.flights_with_no_actual_time,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.flights_with_no_actual_time::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as no_actual_time_percentage,
        ms.late_5_minutes_count,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.late_5_minutes_count::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_5_minutes_percentage,
        ms.late_10_minutes_count,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.late_10_minutes_count::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_10_minutes_percentage,
        ms.late_15_minutes_count,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.late_15_minutes_count::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_15_minutes_percentage,
        ms.late_30_minutes_count,
        CASE
            WHEN ms.total_flights > 0
            THEN ROUND((ms.late_30_minutes_count::numeric / ms.total_flights::numeric) * 100, 2)
            ELSE 0
        END as late_30_minutes_percentage
    FROM monthly_stats ms
$BODY$;


SELECT * FROM get_monthly_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp
);
