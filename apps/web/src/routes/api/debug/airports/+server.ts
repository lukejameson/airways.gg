import type { RequestHandler } from './$types';
import { db, airports } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, asc, or } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const iata = url.searchParams.get('iata');
    if (iata) conditions.push(eq(airports.iataCode, iata.toUpperCase()));

    const icao = url.searchParams.get('icao');
    if (icao) conditions.push(eq(airports.icaoCode, icao.toUpperCase()));

    const rows = conditions.length > 0
      ? await db.select().from(airports).where(or(...conditions)).orderBy(asc(airports.iataCode)).limit(limit).offset(offset)
      : await db.select().from(airports).orderBy(asc(airports.iataCode)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/airports]', err);
    return debugError('Query failed', 500);
  }
};
