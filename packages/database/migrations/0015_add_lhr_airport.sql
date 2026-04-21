-- Migration 0015: Add London Heathrow (LHR) airport record and fix LONDONHEA data
--
-- Background:
--   Before locationToIata mapped 'London Heathrow', the fallback produced
--   'LONDONHEA' (first 10 chars of "London Heathrow", uppercased, spaces stripped).
--   This was stored as the iata_code in airports and as departure_airport /
--   arrival_airport in flights. This migration:
--     1. Inserts the correct LHR record (or updates it if already present)
--     2. Repoints all flights from LONDONHEA → LHR
--     3. Removes the bogus LONDONHEA airport record

-- ============================================================
-- 1. Insert / upsert the real LHR record
-- ============================================================
INSERT INTO airports (iata_code, icao_code, name, city, country, latitude, longitude, elevation_ft, updated_at)
VALUES ('LHR', 'EGLL', 'London Heathrow', 'London', 'United Kingdom', 51.4775, -0.4614, 83, NOW())
ON CONFLICT (iata_code) DO UPDATE SET
  icao_code    = EXCLUDED.icao_code,
  name         = EXCLUDED.name,
  city         = EXCLUDED.city,
  country      = EXCLUDED.country,
  latitude     = EXCLUDED.latitude,
  longitude    = EXCLUDED.longitude,
  elevation_ft = EXCLUDED.elevation_ft,
  updated_at   = NOW();
--> statement-breakpoint

-- ============================================================
-- 2. Repoint flights: departure_airport LONDONHEA → LHR
-- ============================================================
UPDATE flights
SET departure_airport = 'LHR', updated_at = NOW()
WHERE departure_airport = 'LONDONHEA';
--> statement-breakpoint

-- ============================================================
-- 3. Repoint flights: arrival_airport LONDONHEA → LHR
-- ============================================================
UPDATE flights
SET arrival_airport = 'LHR', updated_at = NOW()
WHERE arrival_airport = 'LONDONHEA';
--> statement-breakpoint

-- ============================================================
-- 4. Remove the bogus LONDONHEA airport record if it exists
-- ============================================================
DELETE FROM airports WHERE iata_code = 'LONDONHEA';
