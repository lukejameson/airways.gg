import type { RequestHandler } from './$types';
import { db, flightTimes } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);

    const flightId = url.searchParams.get('flight_id');
    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = flightId
      ? await db.select().from(flightTimes).where(eq(flightTimes.flightId, parseInt(flightId, 10))).orderBy(sortOrder(flightTimes.timeValue)).limit(limit).offset(offset)
      : await db.select().from(flightTimes).orderBy(sortOrder(flightTimes.timeValue)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/flight-times]', err);
    return debugError('Query failed', 500);
  }
};
