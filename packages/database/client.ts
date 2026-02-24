import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type DbClient = ReturnType<typeof createDb>;

let _db: DbClient | null = null;

export function createDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({ connectionString: url });
  _db = drizzle(pool, { schema });
  return _db;
}

// Convenience singleton — lazily initialised on first use
export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return (createDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
