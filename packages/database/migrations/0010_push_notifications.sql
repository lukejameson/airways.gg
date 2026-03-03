CREATE TABLE IF NOT EXISTS "notification_watermark" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_processed_id" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"subscription" jsonb NOT NULL,
	"flight_id" integer NOT NULL,
	"flight_code" varchar(20) NOT NULL,
	"flight_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_notified_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_flight_idx" ON "push_subscriptions" USING btree ("endpoint","flight_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_flight_id_idx" ON "push_subscriptions" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_flight_date_idx" ON "push_subscriptions" USING btree ("flight_date");
