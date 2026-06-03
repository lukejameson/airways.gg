#!/bin/bash
# Purge last 2 days of flight data so re-scrape picks up clean values.
# Usage: bash scripts/purge-recent-flights.sh

set -e

SQL="
BEGIN;

DELETE FROM flight_times
WHERE flight_id IN (
  SELECT id FROM flights WHERE flight_date IN ('2026-06-02', '2026-06-03')
);

DELETE FROM flight_status_history
WHERE flight_id IN (
  SELECT id FROM flights WHERE flight_date IN ('2026-06-02', '2026-06-03')
);

DELETE FROM flight_notes
WHERE flight_id IN (
  SELECT id FROM flights WHERE flight_date IN ('2026-06-02', '2026-06-03')
);

DELETE FROM aircraft_positions
WHERE flight_id IN (
  SELECT id FROM flights WHERE flight_date IN ('2026-06-02', '2026-06-03')
);

DELETE FROM push_subscriptions WHERE flight_date IN ('2026-06-02', '2026-06-03');

DELETE FROM flights WHERE flight_date IN ('2026-06-02', '2026-06-03');

COMMIT;
"

echo "Purging flights for 2026-06-02 and 2026-06-03..."
echo "$SQL" | docker compose -f docker-compose.prod.yml exec -T app node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  pool.query(\`$SQL\`).then(r => { console.log('Done.'); pool.end(); }).catch(e => { console.error(e); pool.end(); process.exit(1); });
"
echo "Restart guernsey-live to re-scrape:"
echo "  docker compose -f docker-compose.prod.yml restart guernsey-live"
