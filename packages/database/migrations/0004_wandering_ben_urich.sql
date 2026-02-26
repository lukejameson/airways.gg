CREATE TABLE IF NOT EXISTS "airport_daylight" (
	"id" serial PRIMARY KEY NOT NULL,
	"airport_code" varchar(10) NOT NULL,
	"date" date NOT NULL,
	"sunrise" timestamp NOT NULL,
	"sunset" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "airport_daylight_unique_idx" ON "airport_daylight" USING btree ("airport_code","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airport_daylight_airport_idx" ON "airport_daylight" USING btree ("airport_code");