import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the monorepo root .env before Vite/SvelteKit snapshot process.env into
// $env/dynamic/private. Without this, PUBLIC_BUY_ME_A_COFFEE_URL and other vars
// defined in the root .env are invisible to layout server loads in dev.
config({ path: resolve(process.cwd(), '../../.env') });

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    rollupOptions: {
      // Treat the database workspace package and Node-only deps as external.
      // They will be resolved at runtime by Node, not bundled by Vite.
      external: (id: string) =>
        id === '@delays/database' ||
        id.startsWith('@delays/database/') ||
        id === 'pg' ||
        id.startsWith('drizzle-orm'),
    },
  },
  ssr: {
    external: ['@delays/database', 'pg', 'drizzle-orm', 'drizzle-orm/node-postgres'],
    noExternal: [],
  },
});
