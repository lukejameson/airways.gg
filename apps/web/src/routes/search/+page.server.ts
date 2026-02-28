import type { PageServerLoad } from './$types';
import { db, flights } from '$lib/server/db';
import { or, ilike, gte, lte, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  const dateParam = url.searchParams.get('date')?.trim() ?? '';

  if (!query && !dateParam) {
    return { results: [], query: '', date: '' };
  }

  try {
    const conditions = [];

    if (query) {
      conditions.push(
        or(
          ilike(flights.flightNumber, `%${query}%`),
          ilike(flights.airlineCode, `%${query}%`),
          ilike(flights.departureAirport, `%${query}%`),
          ilike(flights.arrivalAirport, `%${query}%`),
        )!,
      );
    }

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
          )!,
        );
      }
    }

    const results = await db
      .select()
      .from(flights)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(flights.scheduledDeparture)
      .limit(50);

    return { results, query, date: dateParam };
  } catch (err) {
    console.error('Search error:', err);
    return { results: [], query, date: dateParam };
  }
};
