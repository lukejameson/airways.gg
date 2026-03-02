import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
  const flightId = parseInt(params.flightId, 10);
  if (isNaN(flightId)) throw error(400, 'Invalid flightId');

  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) throw error(400, 'Missing endpoint');

  const db = getDb();
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.flightId, flightId), eq(pushSubscriptions.endpoint, endpoint)))
    .limit(1);

  return json({ subscribed: rows.length > 0 });
};
