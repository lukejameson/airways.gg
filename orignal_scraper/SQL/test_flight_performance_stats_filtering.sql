-- Test the flight performance stats filtering functionality
-- This script demonstrates how to use the updated get_flight_performance_stats function
-- with the new flight type filtering capability

-- Test 1: Get all flights (no filtering)
SELECT 'All Flights' as test_name;
SELECT * FROM get_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp,
    NULL, -- airline
    NULL, -- location
    NULL  -- flight_type (all)
);

-- Test 2: Get only arrivals
SELECT 'Arrivals Only' as test_name;
SELECT * FROM get_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp,
    NULL, -- airline
    NULL, -- location
    'arrivals'  -- flight_type
);

-- Test 3: Get only departures
SELECT 'Departures Only' as test_name;
SELECT * FROM get_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp,
    NULL, -- airline
    NULL, -- location
    'departures'  -- flight_type
);

-- Test 4: Get arrivals for specific airline
SELECT 'Arrivals for Specific Airline' as test_name;
SELECT * FROM get_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp,
    'Ryanair', -- airline
    NULL, -- location
    'arrivals'  -- flight_type
);

-- Test 5: Get departures for specific location
SELECT 'Departures for Specific Location' as test_name;
SELECT * FROM get_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp,
    NULL, -- airline
    'Dublin', -- location
    'departures'  -- flight_type
);

-- Test 6: Get arrivals for specific airline and location
SELECT 'Arrivals for Specific Airline and Location' as test_name;
SELECT * FROM get_flight_performance_stats(
    '2024-01-01'::timestamp,
    '2024-12-31'::timestamp,
    'Ryanair', -- airline
    'Dublin', -- location
    'arrivals'  -- flight_type
);
