CREATE TABLE IF NOT EXISTS "historical_weather" (
	"id" serial PRIMARY KEY NOT NULL,
	"airport_code" varchar(10) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"temperature" real,
	"wind_speed" real,
	"wind_direction" integer,
	"visibility" real,
	"cloud_cover" integer,
	"precipitation" real,
	"pressure" real,
	"weather_code" integer,
	"source" varchar(50) DEFAULT 'open_meteo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "historical_weather_unique_idx" ON "historical_weather" USING btree ("airport_code","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "historical_weather_airport_idx" ON "historical_weather" USING btree ("airport_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "historical_weather_timestamp_idx" ON "historical_weather" USING btree ("timestamp");
