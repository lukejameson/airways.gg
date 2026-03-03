import type { Handle, HandleServerError } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (
    event.request.method === 'GET' &&
    (response.headers.get('content-type') ?? '').includes('text/html')
  ) {
    // If the request carries the recently-viewed cookie the response is personalised,
    // so it must not be stored in a shared cache (CDN). Non-cookied visitors (first-time
    // or cleared) are safe to cache publicly.
    const personalized = event.request.headers.get('cookie')?.includes('rv=') ?? false;
    response.headers.set(
      'Cache-Control',
      personalized
        ? 'private, max-age=0'
        : 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
    );
  }
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
