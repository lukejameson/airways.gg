import type { RequestHandler } from './$types';
import { db, flights } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { or, ilike, gte, lte, and, eq } from 'drizzle-orm';

/**
 * Mirrors the search page load function.
 * Query params: q (text search), date, from (departure airport), to (arrival airport)
 */
export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const dateParam = url.searchParams.get('date')?.trim() ?? '';
    const fromParam = url.searchParams.get('from')?.trim().toUpperCase() ?? '';
    const toParam = url.searchParams.get('to')?.trim().toUpperCase() ?? '';

    if (!query && !dateParam && !fromParam && !toParam) {
      return debugResponse([], performance.now() - t0);
    }

    const conditions = [];

    if (query) {
      conditions.push(or(
        ilike(flights.flightNumber, `%${query}%`),
        ilike(flights.airlineCode, `%${query}%`),
        ilike(flights.departureAirport, `%${query}%`),
        ilike(flights.arrivalAirport, `%${query}%`),
      )!);
    }

    if (fromParam) conditions.push(eq(flights.departureAirport, fromParam));
    if (toParam) conditions.push(eq(flights.arrivalAirport, toParam));

    if (dateParam) {
      const date = new Date(dateParam);
      if (!isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        conditions.push(and(
          gte(flights.scheduledDeparture, date),
          lte(flights.scheduledDeparture, nextDay),
        )!);
      }
    }

    const rows = await db
      .select()
      .from(flights)
      .where(and(...conditions))
      .orderBy(flights.scheduledDeparture)
      .limit(limit)
      .offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/ui/search]', err);
    return debugError('Query failed', 500);
  }
};
