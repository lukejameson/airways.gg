CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."scraper_service" AS ENUM('aurigny_live', 'guernsey_historical');--> statement-breakpoint
CREATE TYPE "public"."scraper_status" AS ENUM('success', 'failure', 'retry');--> statement-breakpoint
CREATE TYPE "public"."status_source" AS ENUM('aurigny', 'guernsey_airport');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "arrivals" (
	"id" serial PRIMARY KEY NOT NULL,
	"airline" varchar(100) NOT NULL,
	"location" varchar(200) NOT NULL,
	"code" varchar(100) NOT NULL,
	"scheduled_time" timestamp NOT NULL,
	"actual_time" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delay_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_id" integer NOT NULL,
	"probability" real NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"predicted_delay_minutes" integer NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"features_used" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departures" (
	"id" serial PRIMARY KEY NOT NULL,
	"airline" varchar(100) NOT NULL,
	"location" varchar(200) NOT NULL,
	"code" varchar(100) NOT NULL,
	"scheduled_time" timestamp NOT NULL,
	"actual_time" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_delays" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_id" integer NOT NULL,
	"delay_code" varchar(20),
	"delay_code2" varchar(20),
	"minutes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_id" integer NOT NULL,
	"timestamp" timestamp NOT NULL,
	"note_type" varchar(50),
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_code" varchar(20) NOT NULL,
	"flight_date" date NOT NULL,
	"status_timestamp" timestamp NOT NULL,
	"status_message" text NOT NULL,
	"source" "status_source" NOT NULL,
	"flight_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_times" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_id" integer NOT NULL,
	"time_type" varchar(50) NOT NULL,
	"time_value" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flights" (
	"id" serial PRIMARY KEY NOT NULL,
	"unique_id" varchar(50) NOT NULL,
	"flight_number" varchar(20) NOT NULL,
	"airline_code" varchar(10) NOT NULL,
	"departure_airport" varchar(10) NOT NULL,
	"arrival_airport" varchar(10) NOT NULL,
	"scheduled_departure" timestamp NOT NULL,
	"scheduled_arrival" timestamp NOT NULL,
	"actual_departure" timestamp,
	"actual_arrival" timestamp,
	"status" varchar(50),
	"canceled" boolean DEFAULT false,
	"aircraft_registration" varchar(20),
	"aircraft_type" varchar(20),
	"delay_minutes" integer,
	"flight_date" date NOT NULL,
	"raw_xml" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flights_unique_id_unique" UNIQUE("unique_id")
);
--> statement-breakpoint
CREATE TABLE "ml_model_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"accuracy" real,
	"precision" real,
	"recall" real,
	"f1_score" real,
	"trained_at" timestamp NOT NULL,
	"training_records" integer,
	"features" jsonb,
	CONSTRAINT "ml_model_metrics_model_version_unique" UNIQUE("model_version")
);
--> statement-breakpoint
CREATE TABLE "scraper_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" "scraper_service" NOT NULL,
	"status" "scraper_status" NOT NULL,
	"records_scraped" integer DEFAULT 0,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weather_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"airport_code" varchar(10) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"temperature" real,
	"wind_speed" real,
	"wind_direction" integer,
	"precipitation" real,
	"visibility" real,
	"cloud_cover" integer,
	"pressure" real,
	"weather_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delay_predictions" ADD CONSTRAINT "delay_predictions_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_delays" ADD CONSTRAINT "flight_delays_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_notes" ADD CONSTRAINT "flight_notes_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_status_history" ADD CONSTRAINT "flight_status_history_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_times" ADD CONSTRAINT "flight_times_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arrivals_scheduled_time_idx" ON "arrivals" USING btree ("scheduled_time");--> statement-breakpoint
CREATE INDEX "arrivals_airline_idx" ON "arrivals" USING btree ("airline");--> statement-breakpoint
CREATE INDEX "arrivals_code_idx" ON "arrivals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "delay_predictions_flight_id_idx" ON "delay_predictions" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX "delay_predictions_expires_at_idx" ON "delay_predictions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "delay_predictions_created_at_idx" ON "delay_predictions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "departures_scheduled_time_idx" ON "departures" USING btree ("scheduled_time");--> statement-breakpoint
CREATE INDEX "departures_airline_idx" ON "departures" USING btree ("airline");--> statement-breakpoint
CREATE INDEX "departures_code_idx" ON "departures" USING btree ("code");--> statement-breakpoint
CREATE INDEX "flight_delays_flight_id_idx" ON "flight_delays" USING btree ("flight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_delays_unique_idx" ON "flight_delays" USING btree ("flight_id","delay_code","minutes");--> statement-breakpoint
CREATE INDEX "flight_notes_flight_id_idx" ON "flight_notes" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX "flight_status_history_code_idx" ON "flight_status_history" USING btree ("flight_code");--> statement-breakpoint
CREATE INDEX "flight_status_history_date_idx" ON "flight_status_history" USING btree ("flight_date");--> statement-breakpoint
CREATE INDEX "flight_status_history_source_idx" ON "flight_status_history" USING btree ("source");--> statement-breakpoint
CREATE INDEX "flight_status_history_flight_id_idx" ON "flight_status_history" USING btree ("flight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_status_history_unique_idx" ON "flight_status_history" USING btree ("flight_code","flight_date","status_timestamp","source");--> statement-breakpoint
CREATE INDEX "flight_times_flight_id_idx" ON "flight_times" USING btree ("flight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_times_unique_idx" ON "flight_times" USING btree ("flight_id","time_type");--> statement-breakpoint
CREATE UNIQUE INDEX "flights_unique_id_idx" ON "flights" USING btree ("unique_id");--> statement-breakpoint
CREATE INDEX "flights_flight_number_idx" ON "flights" USING btree ("flight_number");--> statement-breakpoint
CREATE INDEX "flights_flight_date_idx" ON "flights" USING btree ("flight_date");--> statement-breakpoint
CREATE INDEX "flights_scheduled_departure_idx" ON "flights" USING btree ("scheduled_departure");--> statement-breakpoint
CREATE INDEX "flights_departure_airport_idx" ON "flights" USING btree ("departure_airport");--> statement-breakpoint
CREATE INDEX "flights_arrival_airport_idx" ON "flights" USING btree ("arrival_airport");--> statement-breakpoint
CREATE INDEX "flights_status_idx" ON "flights" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flights_airline_date_idx" ON "flights" USING btree ("airline_code","flight_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ml_model_metrics_version_idx" ON "ml_model_metrics" USING btree ("model_version");--> statement-breakpoint
CREATE INDEX "ml_model_metrics_trained_at_idx" ON "ml_model_metrics" USING btree ("trained_at");--> statement-breakpoint
CREATE INDEX "scraper_logs_service_idx" ON "scraper_logs" USING btree ("service");--> statement-breakpoint
CREATE INDEX "scraper_logs_status_idx" ON "scraper_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scraper_logs_started_at_idx" ON "scraper_logs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "weather_data_airport_idx" ON "weather_data" USING btree ("airport_code");--> statement-breakpoint
CREATE INDEX "weather_data_timestamp_idx" ON "weather_data" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_data_unique_idx" ON "weather_data" USING btree ("airport_code","timestamp");