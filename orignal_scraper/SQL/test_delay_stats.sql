-- Test function to return hardcoded values
CREATE OR REPLACE FUNCTION test_delay_stats()
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
    SELECT
        'Test Airline'::text as airline,
        'Test Location'::text as location,
        15.5::numeric as avg_arrival_delay_minutes,
        22.3::numeric as avg_departure_delay_minutes,
        100::bigint as total_arrivals,
        150::bigint as total_departures
$BODY$;
