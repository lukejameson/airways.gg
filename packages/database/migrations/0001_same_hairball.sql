CREATE TABLE "aircraft_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_id" integer,
	"fr24_id" varchar(50),
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"altitude_ft" integer,
	"ground_speed_kts" integer,
	"heading" integer,
	"vertical_speed_fpm" integer,
	"callsign" varchar(20),
	"registration" varchar(20),
	"aircraft_type" varchar(10),
	"origin_iata" varchar(5),
	"dest_iata" varchar(5),
	"eta" timestamp,
	"on_ground" boolean DEFAULT false NOT NULL,
	"position_timestamp" timestamp NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aircraft_positions" ADD CONSTRAINT "aircraft_positions_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aircraft_positions_flight_id_idx" ON "aircraft_positions" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX "aircraft_positions_fetched_at_idx" ON "aircraft_positions" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "aircraft_positions_flight_timestamp_idx" ON "aircraft_positions" USING btree ("flight_id","position_timestamp");