import type { RequestHandler } from './$types';
import { db, airportDaylight } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const airportCode = url.searchParams.get('airport');
    if (airportCode) conditions.push(eq(airportDaylight.airportCode, airportCode.toUpperCase()));

    const dateFrom = url.searchParams.get('from');
    if (dateFrom) conditions.push(gte(airportDaylight.date, dateFrom));
    const dateTo = url.searchParams.get('to');
    if (dateTo) conditions.push(lte(airportDaylight.date, dateTo));

    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = conditions.length > 0
      ? await db.select().from(airportDaylight).where(and(...conditions)).orderBy(sortOrder(airportDaylight.date)).limit(limit).offset(offset)
      : await db.select().from(airportDaylight).orderBy(sortOrder(airportDaylight.date)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/daylight]', err);
    return debugError('Query failed', 500);
  }
};
