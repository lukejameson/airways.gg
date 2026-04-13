import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool, types } = pg;
import * as schema from './schema';

// ---------------------------------------------------------------------------
// Force pg to handle all timestamps in UTC, regardless of process timezone.
//
// Problem: pg's default Date serializer uses local-time methods (getHours etc.)
// and appends the local offset. PostgreSQL's `timestamp WITHOUT time zone`
// silently discards that offset, storing only the bare datetime. If the
// process runs in BST (UTC+1), Date(12:40 UTC) is serialized as
// "13:40:00+01:00" and PostgreSQL stores "13:40:00" — one hour wrong.
//
// Fix: override both the WRITE path (prepareValue) and READ path (type parser)
// so all timestamp handling is UTC-only.
// ---------------------------------------------------------------------------

// READ: parse "timestamp without time zone" (OID 1114) values as UTC
types.setTypeParser(1114, (str: string) => new Date(str + '+00'));

// WRITE: serialize Date objects using UTC methods
const pgUtils = require('pg/lib/utils');
const _origPrepareValue = pgUtils.prepareValue;
function utcDateString(date: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}.` +
    `${pad3(date.getUTCMilliseconds())}+00:00`
  );
}
pgUtils.prepareValue = function prepareValueUTC(val: unknown, seen?: unknown[]): unknown {
  if (val instanceof Date) return utcDateString(val);
  return _origPrepareValue(val, seen);
};

// Re-export schema types and table objects — safe to import anywhere
export * from './schema';
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
