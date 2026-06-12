import type { RequestHandler } from './$types';
import { db, flightStatusHistory } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const flightCode = url.searchParams.get('flight_code');
    if (flightCode) conditions.push(eq(flightStatusHistory.flightCode, flightCode.toUpperCase()));

    const flightId = url.searchParams.get('flight_id');
    if (flightId) conditions.push(eq(flightStatusHistory.flightId, parseInt(flightId, 10)));

    const date = url.searchParams.get('date');
    if (date) conditions.push(eq(flightStatusHistory.flightDate, date));

    const source = url.searchParams.get('source');
    if (source) conditions.push(eq(flightStatusHistory.source, source));

    const from = url.searchParams.get('from');
    if (from) conditions.push(gte(flightStatusHistory.statusTimestamp, new Date(from)));
    const to = url.searchParams.get('to');
    if (to) conditions.push(lte(flightStatusHistory.statusTimestamp, new Date(to)));

    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = conditions.length > 0
      ? await db.select().from(flightStatusHistory).where(and(...conditions)).orderBy(sortOrder(flightStatusHistory.statusTimestamp)).limit(limit).offset(offset)
      : await db.select().from(flightStatusHistory).orderBy(sortOrder(flightStatusHistory.statusTimestamp)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/status-history]', err);
    return debugError('Query failed', 500);
  }
};
