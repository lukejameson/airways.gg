import { Hono } from 'hono';
import { getFlightBoard } from '../lib/queries/flightBoard';
import { FlightBoardQuerySchema, SearchQuerySchema, FlightDetailParamsSchema } from '../types';

const flights = new Hono();

flights.get('/flights', async (c) => {
  try {
    const queryResult = FlightBoardQuerySchema.safeParse(c.req.query());
    if (!queryResult.success) {
      return c.json({ error: 'Invalid query parameters', details: queryResult.error.flatten() }, 400);
    }
    const { date } = queryResult.data;
    const recentlyViewedParam = c.req.query('recentlyViewed');
    let recentlyViewed: Array<{ id: number; flightNumber: string; departureAirport: string; arrivalAirport: string; scheduledDeparture: string; viewedAt: string }> = [];
    if (recentlyViewedParam) {
      try {
        recentlyViewed = JSON.parse(recentlyViewedParam);
      } catch {}
    }
    const result = await getFlightBoard(date, recentlyViewed);
    return c.json(result);
  } catch (err) {
    console.error('Error in /flights:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

flights.get('/flights/search', async (c) => {
  const queryResult = SearchQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return c.json({ error: 'Invalid query parameters', details: queryResult.error.flatten() }, 400);
  }
  const { searchFlights } = await import('../lib/queries/search');
  const result = await searchFlights(queryResult.data);
  return c.json(result);
});

flights.get('/flights/:id', async (c) => {
  const paramsResult = FlightDetailParamsSchema.safeParse(c.req.param());
  if (!paramsResult.success) {
    return c.json({ error: 'Invalid flight ID' }, 400);
  }
  const { id } = paramsResult.data;
  const { getFlightDetail } = await import('../lib/queries/flightDetail');
  const result = await getFlightDetail(id);
  if (!result) {
    return c.json({ error: 'Flight not found' }, 404);
  }
  return c.json(result);
});

export default flights;
