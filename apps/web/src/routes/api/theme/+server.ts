import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { theme } = await request.json();

  if (theme !== 'light' && theme !== 'dark') {
    return json({ error: 'Invalid theme' }, { status: 400 });
  }

  cookies.set('theme', theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    sameSite: 'lax',
  });

  return json({ theme });
};
