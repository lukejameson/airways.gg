import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { config } from 'dotenv';
import { resolve } from 'path';
import compression from 'vite-plugin-compression';

// Load the monorepo root .env before Vite/SvelteKit snapshot process.env into
// $env/dynamic/private. Without this, PUBLIC_BUY_ME_A_COFFEE_URL and other vars
// defined in the root .env are invisible to layout server loads in dev.
config({ path: resolve(process.cwd(), '../../.env') });

export default defineConfig({
  plugins: [
    sveltekit(),
    // Generate pre-compressed .gz and .br files for all JS/CSS assets.
    // The server/proxy must be configured to serve these with the correct
    // Content-Encoding header (e.g. nginx gzip_static / brotli_static).
    compression({ algorithm: 'gzip', ext: '.gz' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
  build: {
    rollupOptions: {
      // Treat the database workspace package and Node-only deps as external.
      // They will be resolved at runtime by Node, not bundled by Vite.
      external: (id: string) =>
        id === '@airways/database' ||
        id.startsWith('@airways/database/') ||
        id === 'pg' ||
        id.startsWith('drizzle-orm'),
    },
  },
  ssr: {
    external: ['@airways/database', 'pg', 'drizzle-orm', 'drizzle-orm/node-postgres'],
    noExternal: [],
  },
});
