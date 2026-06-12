import type { RequestHandler } from './$types';
import { db, flights } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, desc, asc, ilike } from 'drizzle-orm';

/**
 * GET /api/debug/flights
 * Query params: date, status, departure_airport, arrival_airport, flight_number,
 *   airline_code, canceled, aircraft_registration, sort, order, limit, offset
 */
export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();

  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    // Date filter — matches flight_date
    const dateParam = url.searchParams.get('date');
    if (dateParam) {
      conditions.push(eq(flights.flightDate, dateParam));
    }

    // Date range filter
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    if (dateFrom) conditions.push(gte(flights.flightDate, dateFrom));
    if (dateTo) conditions.push(lte(flights.flightDate, dateTo));

    // Status filter
    const statusParam = url.searchParams.get('status');
    if (statusParam) {
      conditions.push(eq(flights.status, statusParam));
    }

    // Airport filters
    const depAirport = url.searchParams.get('departure_airport');
    if (depAirport) conditions.push(eq(flights.departureAirport, depAirport.toUpperCase()));
    const arrAirport = url.searchParams.get('arrival_airport');
    if (arrAirport) conditions.push(eq(flights.arrivalAirport, arrAirport.toUpperCase()));

    // Flight number — partial match
    const flightNumber = url.searchParams.get('flight_number');
    if (flightNumber) conditions.push(ilike(flights.flightNumber, `%${flightNumber}%`));

    // Airline code
    const airlineCode = url.searchParams.get('airline_code');
    if (airlineCode) conditions.push(eq(flights.airlineCode, airlineCode.toUpperCase()));

    // Canceled flag
    const canceledParam = url.searchParams.get('canceled');
    if (canceledParam !== null) {
      conditions.push(eq(flights.canceled, canceledParam === 'true'));
    }

    // Aircraft registration
    const reg = url.searchParams.get('aircraft_registration');
    if (reg) conditions.push(eq(flights.aircraftRegistration, reg.toUpperCase()));

    // Sorting
    const sortField = url.searchParams.get('sort') ?? 'scheduled_departure';
    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    // Map sort field names to Drizzle columns
    const sortColumns: Record<string, typeof flights.scheduledDeparture> = {
      scheduled_departure: flights.scheduledDeparture,
      scheduled_arrival: flights.scheduledArrival,
      actual_departure: flights.actualDeparture,
      actual_arrival: flights.actualArrival,
      delay_minutes: flights.delayMinutes,
      flight_date: flights.flightDate,
      created_at: flights.createdAt,
      updated_at: flights.updatedAt,
    };
    const sortCol = sortColumns[sortField] ?? flights.scheduledDeparture;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = conditions.length > 0
      ? await db.select().from(flights).where(whereClause).orderBy(sortOrder(sortCol)).limit(limit).offset(offset)
      : await db.select().from(flights).orderBy(sortOrder(sortCol)).limit(limit).offset(offset);

    const queryMs = performance.now() - t0;
    return debugResponse(rows, queryMs);
  } catch (err) {
    console.error('[debug/flights]', err);
    return debugError('Query failed', 500);
  }
};
