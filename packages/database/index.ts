import { drizzle } from 'drizzle-orm/node-postgres';
import pg, { Pool } from 'pg';
import * as schema from './schema';

// Force TIMESTAMP WITHOUT TZ (oid 1114) to always be read as UTC regardless of
// the Node.js process timezone. Without this, pg uses the process TZ to interpret
// the raw value, so a dev machine running BST reads the same stored instant as
// 1 hour earlier than a UTC Docker container — causing systematic display drift.
pg.types.setTypeParser(1114, (val: string) => new Date(val + 'Z'));

// Re-export schema types and table objects — safe to import anywhere
export * from './schema';
export { canUpgradeStatus, isTerminalStatus } from './statusPriority';
export { ROUTE_FLIGHT_MINUTES, LOCATION_TO_IATA, routeFlightMinutes, locationToIata } from './constants';
export { GY_TZ, localToUtc, guernseyTodayStr, guernseyTomorrowStr, guernseyHour, nextGuernseyTime, checkTimezoneOffset } from './time';
export type { TimezoneCheckResult } from './time';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbClient | null = null;

export function getDb(): DbClient {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Keep pool small per-service so 6 services don't exhaust PostgreSQL's
  // default max_connections (typically 100). Each service gets up to 5
  // connections; peak total = 30, leaving headroom for admin tools.
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // Enforce UTC session timezone on every connection so that TIMESTAMP WITHOUT TZ
  // values written by pg are stored as UTC wall-clock, consistent with TZ=UTC containers.
  pool.on('connect', (client) => { client.query("SET TIME ZONE 'UTC'").catch(() => {}); });
  _db = drizzle(pool, { schema });
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
