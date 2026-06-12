import type { RequestHandler } from './$types';
import { db, notificationWatermark } from '$lib/server/db';
import { debugResponse, debugError } from '$lib/server/debug-helpers';

export const GET: RequestHandler = async () => {
  const t0 = performance.now();
  try {
    const rows = await db.select().from(notificationWatermark);
    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/notification-watermark]', err);
    return debugError('Query failed', 500);
  }
};
