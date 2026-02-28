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
    // Pre-compress all JS/CSS assets (threshold: 1B = compress everything).
    // adapter-node serves .br/.gz automatically when Accept-Encoding matches.
    compression({ algorithm: 'gzip', ext: '.gz', threshold: 1 }),
    compression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1 }),
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
      output: {
        // Keep Leaflet in its own named lazy chunk — it's already dynamically
        // imported and this prevents it from leaking into eagerly-loaded bundles.
        manualChunks(id) {
          if (id.includes('leaflet')) return 'leaflet';
        },
      },
    },
  },
  ssr: {
    external: ['@airways/database', 'pg', 'drizzle-orm', 'drizzle-orm/node-postgres'],
    noExternal: [],
  },
});
