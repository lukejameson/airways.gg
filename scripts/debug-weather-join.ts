import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '.env') });

import { getDb } from '@airways/database';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Sample scheduled_departure values
  const flights = await db.execute(sql`
    SELECT scheduled_departure, DATE_TRUNC('hour', scheduled_departure) AS truncated,
           scheduled_departure AT TIME ZONE 'Europe/London' AS london
    FROM flights
    WHERE flight_date >= CURRENT_DATE - INTERVAL '90 days'
      AND scheduled_departure IS NOT NULL
    LIMIT 3
  `);
  console.log('Sample flights:', JSON.stringify(flights.rows, null, 2));

  // Sample historical_weather timestamps
  const wx = await db.execute(sql`
    SELECT timestamp, airport_code
    FROM historical_weather
    WHERE airport_code = 'GCI'
    LIMIT 3
  `);
  console.log('Sample GCI weather:', JSON.stringify(wx.rows, null, 2));

  // Try matching with explicit cast
  const matched = await db.execute(sql`
    SELECT COUNT(f.id) AS matched
    FROM flights f
    JOIN historical_weather hw
      ON hw.airport_code = 'GCI'
      AND hw.timestamp = f.scheduled_departure
    WHERE f.flight_number ILIKE 'GR%'
      AND f.flight_date >= CURRENT_DATE - INTERVAL '90 days'
    LIMIT 5
  `);
  console.log('Exact match count:', (matched.rows[0] as Record<string, unknown>).matched);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
