import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Load root .env before any request handler runs.
// __filename resolves to apps/web/src/hooks.server.ts — go up 4 levels to repo root.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// hooks.server.ts lives at apps/web/src/ — 3 levels up reaches the repo root
config({ path: resolve(__dirname, '../../../.env') });

const handleTheme: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get('theme') || 'light';
  event.locals.theme = theme;
  
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace('%theme%', theme);
    },
  });
  
  return response;
};

export const handle = sequence(handleTheme);
