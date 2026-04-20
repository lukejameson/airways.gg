import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@airways/database/schema';

export { schema };
export const { flights, flightTimes, weatherData, airportDaylight, scraperLogs, flightStatusHistory, aircraftPositions, airports, flightNotes, users, sessions, pushSubscriptions, historicalWeather, notificationWatermark, apnsSubscriptions } = schema;

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;
let _db: DbClient | null = null;

export function getDb(): DbClient {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(
    new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
    { schema },
  );
  return _db;
}
