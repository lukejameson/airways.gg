-- Debug function to see what's in the database
CREATE OR REPLACE FUNCTION debug_delay_stats(
    _start_date timestamp,
    _end_date timestamp
)
RETURNS TABLE(
    table_name text,
    total_records bigint,
    records_with_scheduled_time bigint,
    records_with_actual_time bigint,
    records_with_both_times bigint,
    records_in_date_range bigint
)
LANGUAGE SQL
AS $BODY$
    SELECT 'arrivals' as table_name,
           COUNT(*) as total_records,
           COUNT(scheduled_time) as records_with_scheduled_time,
           COUNT(actual_time) as records_with_actual_time,
           COUNT(CASE WHEN scheduled_time IS NOT NULL AND actual_time IS NOT NULL THEN 1 END) as records_with_both_times,
           COUNT(CASE WHEN DATE(scheduled_time) >= DATE(_start_date) AND DATE(scheduled_time) <= DATE(_end_date) THEN 1 END) as records_in_date_range
    FROM arrivals

    UNION ALL

    SELECT 'departures' as table_name,
           COUNT(*) as total_records,
           COUNT(scheduled_time) as records_with_scheduled_time,
           COUNT(actual_time) as records_with_actual_time,
           COUNT(CASE WHEN scheduled_time IS NOT NULL AND actual_time IS NOT NULL THEN 1 END) as records_with_both_times,
           COUNT(CASE WHEN DATE(scheduled_time) >= DATE(_start_date) AND DATE(scheduled_time) <= DATE(_end_date) THEN 1 END) as records_in_date_range
    FROM departures
$BODY$;



SELECT * from  debug_delay_stats('2025-07-01', '2025-07-10')
