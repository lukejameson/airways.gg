ALTER TABLE "airports" ADD COLUMN IF NOT EXISTS "display_name" varchar(255);--> statement-breakpoint
UPDATE "airports" SET "display_name" = TRIM(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE("name",
          '\s+International\s+Airport$', '', 'i'),
        '\s+Intl\.?\s+Airport$', '', 'i'),
      '\s+Airport$', '', 'i'),
    '\s+(Airfield|Aerodrome)$', '', 'i')
);
