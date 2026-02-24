CREATE OR REPLACE FUNCTION read_arrivals_date(_start_date timestamp, _end_date timestamp)
RETURNS TABLE(
    airline text,
    location text,
    code text,
    scheduledtime timestamp,
    actualtime timestamp
)
LANGUAGE SQL
AS $BODY$
    SELECT
        airline,
        location,
        code,
        scheduled_time as scheduledtime,
        actual_time as actualtime
    FROM
        public.arrivals
    WHERE
        DATE(scheduled_time) >= DATE(_start_date)
        AND DATE(scheduled_time) <= DATE(_end_date)
$BODY$;
