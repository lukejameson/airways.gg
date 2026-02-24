import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
