import type { RequestHandler } from './$types';
import { db, aircraftPositions } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const flightId = url.searchParams.get('flight_id');
    if (flightId) conditions.push(eq(aircraftPositions.flightId, parseInt(flightId, 10)));

    const from = url.searchParams.get('from');
    if (from) conditions.push(gte(aircraftPositions.positionTimestamp, new Date(from)));
    const to = url.searchParams.get('to');
    if (to) conditions.push(lte(aircraftPositions.positionTimestamp, new Date(to)));

    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = conditions.length > 0
      ? await db.select().from(aircraftPositions).where(and(...conditions)).orderBy(sortOrder(aircraftPositions.positionTimestamp)).limit(limit).offset(offset)
      : await db.select().from(aircraftPositions).orderBy(sortOrder(aircraftPositions.positionTimestamp)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/positions]', err);
    return debugError('Query failed', 500);
  }
};
