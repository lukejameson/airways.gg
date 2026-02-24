import { defineConfig } from 'drizzle-kit';

// DATABASE_URL is injected by dotenv-cli before this process starts (see package.json scripts)
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Run db scripts from the repo root: npm run db:push');
}

export default defineConfig({
  schema: './schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
