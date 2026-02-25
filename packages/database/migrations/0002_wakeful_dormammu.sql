CREATE TABLE "airports" (
	"id" serial PRIMARY KEY NOT NULL,
	"iata_code" varchar(10) NOT NULL,
	"icao_code" varchar(10),
	"name" varchar(255) NOT NULL,
	"city" varchar(100),
	"country" varchar(100),
	"latitude" real,
	"longitude" real,
	"elevation_ft" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "airports_iata_code_unique" UNIQUE("iata_code")
);
--> statement-breakpoint
CREATE INDEX "airports_iata_idx" ON "airports" USING btree ("iata_code");--> statement-breakpoint
CREATE INDEX "airports_icao_idx" ON "airports" USING btree ("icao_code");