import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

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
