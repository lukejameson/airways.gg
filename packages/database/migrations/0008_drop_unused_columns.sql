-- Drop unused columns that are never written to or read from in any service
ALTER TABLE "flights" DROP COLUMN IF EXISTS "raw_xml";
ALTER TABLE "weather_data" DROP COLUMN IF EXISTS "precipitation";
ALTER TABLE "airports" DROP COLUMN IF EXISTS "display_name";
