import type { RequestHandler } from './$types';
import { db, historicalWeather } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const airportCode = url.searchParams.get('airport');
    if (airportCode) conditions.push(eq(historicalWeather.airportCode, airportCode.toUpperCase()));

    const from = url.searchParams.get('from');
    if (from) conditions.push(gte(historicalWeather.timestamp, new Date(from)));
    const to = url.searchParams.get('to');
    if (to) conditions.push(lte(historicalWeather.timestamp, new Date(to)));

    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = conditions.length > 0
      ? await db.select().from(historicalWeather).where(and(...conditions)).orderBy(sortOrder(historicalWeather.timestamp)).limit(limit).offset(offset)
      : await db.select().from(historicalWeather).orderBy(sortOrder(historicalWeather.timestamp)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/historical-weather]', err);
    return debugError('Query failed', 500);
  }
};
