// Runtime migration runner — uses drizzle-orm/migrator (a production dependency).
// This replaces `npx drizzle-kit migrate` in the Docker CMD so that drizzle-kit
// (a devDependency) is not required in the production image.
//
// Usage: node /app/packages/database/migrate.js
// Requires: DATABASE_URL environment variable

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] ERROR: DATABASE_URL is not set');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, 'migrations');

console.log('[migrate] Connecting to database...');
const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

console.log(`[migrate] Running migrations from ${migrationsFolder}...`);
try {
  await migrate(db, { migrationsFolder });
  console.log('[migrate] Migrations complete');
} catch (err) {
  console.error('[migrate] Migration failed:', err);
  await pool.end();
  process.exit(1);
}

await pool.end();
