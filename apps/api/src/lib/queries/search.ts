import { getDb, flights } from '../db';
import { or, ilike, gte, lte, and, eq, SQL } from 'drizzle-orm';
import type { SearchResult } from '../../types';

export async function searchFlights(params: {
  q?: string;
  date?: string;
  from?: string;
  to?: string;
}): Promise<SearchResult> {
  const { q = '', date: dateParam = '', from: fromParam = '', to: toParam = '' } = params;
  
  if (!q && !dateParam && !fromParam && !toParam) {
    return { results: [], query: '', date: '', from: '', to: '' };
  }

  try {
    const db = getDb();
    const conditions: SQL<unknown>[] = [];

    if (q) {
      conditions.push(
        or(
          ilike(flights.flightNumber, `%${q}%`),
          ilike(flights.airlineCode, `%${q}%`),
          ilike(flights.departureAirport, `%${q}%`),
          ilike(flights.arrivalAirport, `%${q}%`),
        ) as SQL<unknown>,
      );
    }

    if (fromParam) conditions.push(eq(flights.departureAirport, fromParam) as SQL<unknown>);
    if (toParam) conditions.push(eq(flights.arrivalAirport, toParam) as SQL<unknown>);

    if (dateParam) {
      const date = new Date(dateParam);
      if (!isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        conditions.push(
          and(
            gte(flights.scheduledDeparture, date),
            lte(flights.scheduledDeparture, nextDay),
          ) as SQL<unknown>,
        );
      }
    }

    const results = await db
      .select()
      .from(flights)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(flights.scheduledDeparture)
      .limit(100);

    return { results, query: q, date: dateParam, from: fromParam, to: toParam };
  } catch (err) {
    console.error('Search error:', err);
    return { results: [], query: q, date: dateParam, from: fromParam, to: toParam };
  }
}
