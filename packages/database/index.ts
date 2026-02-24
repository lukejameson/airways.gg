import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Re-export schema types and table objects — safe to import anywhere
export * from './schema';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbClient | null = null;

export function getDb(): DbClient {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(new Pool({ connectionString: url }), { schema });
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
