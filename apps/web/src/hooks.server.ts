import type { Handle, HandleServerError } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  return response;
};

export const handleError: HandleServerError = ({ error, event, status }) => {
  // Log server-side errors with context (avoids leaking stack traces to the client)
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[server error] ${status} on ${event.url.pathname}: ${message}`);

  // Return a safe, generic message to the client
  return {
    message: status === 404 ? 'Not found' : 'An unexpected error occurred',
  };
};