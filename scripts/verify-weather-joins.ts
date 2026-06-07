import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '.env') });

import { getDb } from '@airways/database';
import { count, sql } from 'drizzle-orm';
import { flights } from '@airways/database/schema';

async function main() {
  const db = getDb();

  const [base] = await db.select({ c: count() }).from(flights)
    .where(sql`(flight_number ILIKE 'GR%' OR flight_number ILIKE 'BA%') AND flight_date >= CURRENT_DATE - INTERVAL '90 days'`);
  console.log('Base flight count (90d, GR+BA):', base.c);

  const wx = await db.execute(sql`
    SELECT COUNT(f.id) AS matched
    FROM flights f
    JOIN historical_weather hw
      ON hw.airport_code = 'GCI'
      AND hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)
    WHERE (f.flight_number ILIKE 'GR%' OR f.flight_number ILIKE 'BA%')
      AND f.flight_date >= CURRENT_DATE - INTERVAL '90 days'
      AND f.scheduled_departure IS NOT NULL
  `);
  console.log('Weather-matched count:', (wx.rows[0] as Record<string, unknown>).matched);

  // Check table sizes
  const hw = await db.execute(sql`SELECT COUNT(*) as c FROM historical_weather`);
  console.log('historical_weather total rows:', (hw.rows[0] as Record<string, unknown>).c);
  const wd = await db.execute(sql`SELECT COUNT(*) as c FROM weather_data`);
  console.log('weather_data total rows:', (wd.rows[0] as Record<string, unknown>).c);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
