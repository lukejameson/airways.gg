-- Drop unused tables that have no readers or writers in any active service
DROP TABLE IF EXISTS "delay_predictions";
DROP TABLE IF EXISTS "ml_model_metrics";
DROP TABLE IF EXISTS "flight_delays";
-- Drop dependent enum types that are only used by the removed tables
DROP TYPE IF EXISTS "public"."confidence_level";
