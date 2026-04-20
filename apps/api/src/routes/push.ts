import { Hono } from 'hono';
import { getDb, apnsSubscriptions } from '../lib/db';
import { eq, and } from 'drizzle-orm';
import { ApnsSubscribeSchema, ApnsUnsubscribeSchema, ApnsCheckQuerySchema } from '../types';

const push = new Hono();

push.post('/apns', async (c) => {
  const bodyResult = ApnsSubscribeSchema.safeParse(await c.req.json());
  if (!bodyResult.success) {
    return c.json({ error: 'Invalid request body', details: bodyResult.error.flatten() }, 400);
  }
  const { deviceToken, flightId, flightCode, flightDate } = bodyResult.data;
  const db = getDb();
  try {
    await db.insert(apnsSubscriptions).values({
      deviceToken,
      flightId,
      flightCode,
      flightDate,
    }).onConflictDoUpdate({
      target: [apnsSubscriptions.deviceToken, apnsSubscriptions.flightId],
      set: {
        flightCode,
        flightDate,
        lastNotifiedAt: new Date(),
      },
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error('Error subscribing to APNs:', err);
    return c.json({ error: 'Failed to subscribe' }, 500);
  }
});

push.delete('/apns', async (c) => {
  const bodyResult = ApnsUnsubscribeSchema.safeParse(await c.req.json());
  if (!bodyResult.success) {
    return c.json({ error: 'Invalid request body', details: bodyResult.error.flatten() }, 400);
  }
  const { deviceToken, flightId } = bodyResult.data;
  const db = getDb();
  try {
    await db.delete(apnsSubscriptions).where(
      and(
        eq(apnsSubscriptions.deviceToken, deviceToken),
        eq(apnsSubscriptions.flightId, flightId)
      )
    );
    return c.json({ ok: true });
  } catch (err) {
    console.error('Error unsubscribing from APNs:', err);
    return c.json({ error: 'Failed to unsubscribe' }, 500);
  }
});

push.get('/apns/check/:flightId', async (c) => {
  const flightIdStr = c.req.param('flightId');
  const flightId = parseInt(flightIdStr, 10);
  if (isNaN(flightId)) {
    return c.json({ error: 'Invalid flight ID' }, 400);
  }
  const queryResult = ApnsCheckQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return c.json({ error: 'Invalid query parameters', details: queryResult.error.flatten() }, 400);
  }
  const { token } = queryResult.data;
  const db = getDb();
  try {
    const [sub] = await db.select().from(apnsSubscriptions).where(
      and(
        eq(apnsSubscriptions.flightId, flightId),
        eq(apnsSubscriptions.deviceToken, token)
      )
    ).limit(1);
    return c.json({ subscribed: !!sub });
  } catch (err) {
    console.error('Error checking APNs subscription:', err);
    return c.json({ error: 'Failed to check subscription' }, 500);
  }
});

export default push;
