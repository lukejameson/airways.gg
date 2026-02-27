import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, status }) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[client error] ${status}: ${message}`);

  return {
    message: status === 404 ? 'Not found' : 'An unexpected error occurred',
  };
};
