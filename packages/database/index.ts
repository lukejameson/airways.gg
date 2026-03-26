import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Re-export schema types and table objects — safe to import anywhere
export * from './schema';

// Export inferred types for all tables
export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;

export type Session = typeof schema.sessions.$inferSelect;
export type NewSession = typeof schema.sessions.$inferInsert;

export type Flight = typeof schema.flights.$inferSelect;
export type NewFlight = typeof schema.flights.$inferInsert;

export type FlightTime = typeof schema.flightTimes.$inferSelect;
export type NewFlightTime = typeof schema.flightTimes.$inferInsert;

export type FlightNote = typeof schema.flightNotes.$inferSelect;
export type NewFlightNote = typeof schema.flightNotes.$inferInsert;

export type FlightStatusHistory = typeof schema.flightStatusHistory.$inferSelect;
export type NewFlightStatusHistory = typeof schema.flightStatusHistory.$inferInsert;

export type WeatherDatum = typeof schema.weatherData.$inferSelect;
export type NewWeatherDatum = typeof schema.weatherData.$inferInsert;

export type AirportDaylight = typeof schema.airportDaylight.$inferSelect;
export type NewAirportDaylight = typeof schema.airportDaylight.$inferInsert;

export type Airport = typeof schema.airports.$inferSelect;
export type NewAirport = typeof schema.airports.$inferInsert;

export type ScraperLog = typeof schema.scraperLogs.$inferSelect;
export type NewScraperLog = typeof schema.scraperLogs.$inferInsert;

export type AircraftPosition = typeof schema.aircraftPositions.$inferSelect;
export type NewAircraftPosition = typeof schema.aircraftPositions.$inferInsert;

export type PushSubscription = typeof schema.pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof schema.pushSubscriptions.$inferInsert;

export type HistoricalWeather = typeof schema.historicalWeather.$inferSelect;
export type NewHistoricalWeather = typeof schema.historicalWeather.$inferInsert;

export type NotificationWatermark = typeof schema.notificationWatermark.$inferSelect;
export type NewNotificationWatermark = typeof schema.notificationWatermark.$inferInsert;
export { canUpgradeStatus, isTerminalStatus } from './statusPriority';
export { ROUTE_FLIGHT_MINUTES, LOCATION_TO_IATA, routeFlightMinutes, locationToIata } from './constants';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbClient | null = null;

export function getDb(): DbClient {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(
    new Pool({
      connectionString: url,
      // Keep pool small per-service so 6 services don't exhaust PostgreSQL's
      // default max_connections (typically 100). Each service gets up to 5
      // connections; peak total = 30, leaving headroom for admin tools.
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
    { schema },
  );
  return _db;
}

// Proxy-based `db` export — lazily initialises the pool on first use.
// Only import this from server-side code (*.server.ts / Node scrapers).
export const db: DbClient = new Proxy({} as DbClient, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
  apply(_t, _this, args) {
    return (getDb() as unknown as (...a: unknown[]) => unknown)(...args);
  },
});
