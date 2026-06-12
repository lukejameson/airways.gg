import type { RequestHandler } from './$types';
import { db, pushSubscriptions } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const flightId = url.searchParams.get('flight_id');
    if (flightId) conditions.push(eq(pushSubscriptions.flightId, parseInt(flightId, 10)));

    const flightCode = url.searchParams.get('flight_code');
    if (flightCode) conditions.push(eq(pushSubscriptions.flightCode, flightCode.toUpperCase()));

    const dateFrom = url.searchParams.get('from');
    if (dateFrom) conditions.push(gte(pushSubscriptions.flightDate, dateFrom));
    const dateTo = url.searchParams.get('to');
    if (dateTo) conditions.push(lte(pushSubscriptions.flightDate, dateTo));

    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = conditions.length > 0
      ? await db.select().from(pushSubscriptions).where(and(...conditions)).orderBy(sortOrder(pushSubscriptions.createdAt)).limit(limit).offset(offset)
      : await db.select().from(pushSubscriptions).orderBy(sortOrder(pushSubscriptions.createdAt)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/push-subs]', err);
    return debugError('Query failed', 500);
  }
};
