import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
  let body: { subscription: PushSubscription; flightId: number; flightCode: string; flightDate: string };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { subscription, flightId, flightCode, flightDate } = body;
  if (!subscription?.endpoint || !flightId || !flightCode || !flightDate) {
    throw error(400, 'Missing required fields');
  }

  const db = getDb();
  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: subscription.endpoint,
      subscription: subscription as unknown as Record<string, unknown>,
      flightId,
      flightCode,
      flightDate,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.endpoint, pushSubscriptions.flightId],
      set: {
        subscription: subscription as unknown as Record<string, unknown>,
        flightCode,
        flightDate,
      },
    });

  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
  let body: { endpoint: string; flightId: number };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { endpoint, flightId } = body;
  if (!endpoint || !flightId) {
    throw error(400, 'Missing required fields');
  }

  const db = getDb();
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.flightId, flightId)));

  return json({ ok: true });
};
