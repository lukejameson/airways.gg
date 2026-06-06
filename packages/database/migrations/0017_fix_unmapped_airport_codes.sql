-- Fix flights stored with unmapped location names (before LOCATION_TO_IATA had entries for Zurich, Leeds, Groningen)
-- These flights have raw location text as airport codes instead of proper IATA codes.

-- 1. Fix departure_airport
UPDATE flights SET departure_airport = 'ZRH' WHERE departure_airport = 'ZURICH';
UPDATE flights SET departure_airport = 'LBA' WHERE departure_airport = 'LEEDS/BRAD';
UPDATE flights SET departure_airport = 'GRQ' WHERE departure_airport = 'GRONINGEN';

-- 2. Fix arrival_airport
UPDATE flights SET arrival_airport = 'ZRH' WHERE arrival_airport = 'ZURICH';
UPDATE flights SET arrival_airport = 'LBA' WHERE arrival_airport = 'LEEDS/BRAD';
UPDATE flights SET arrival_airport = 'GRQ' WHERE arrival_airport = 'GRONINGEN';

-- 3. Fix unique_id (format: {flightNumber}_{flightDate}_{departureAirport}_{arrivalAirport})
-- Rebuild unique_id for any flight where departure or arrival was corrected
UPDATE flights SET unique_id = flight_number || '_' || flight_date::text || '_' || departure_airport || '_' || arrival_airport
WHERE departure_airport IN ('ZRH', 'LBA', 'GRQ')
   OR arrival_airport IN ('ZRH', 'LBA', 'GRQ');
