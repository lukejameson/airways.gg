import { Hono } from 'hono';
import { getFlightBoard } from '../lib/queries/flightBoard';
import { AirportWeatherParamsSchema } from '../types';

const airports = new Hono();

airports.get('/airports/:code/weather', async (c) => {
  try {
    const paramsResult = AirportWeatherParamsSchema.safeParse(c.req.param());
    if (!paramsResult.success) {
      return c.json({ error: 'Invalid airport code' }, 400);
    }
    const { code } = paramsResult.data;
    const upperCode = code.toUpperCase();
    const result = await getFlightBoard();
    const weather = result.weatherMap[upperCode];
    if (!weather || weather.length === 0) {
      return c.json({ error: 'No weather data found for airport' }, 404);
    }
    const now = new Date();
    const past = weather.filter(w => new Date(w.timestamp).getTime() <= now.getTime());
    const currentWeather = past.length > 0
      ? past.reduce((a, b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b)
      : weather.reduce((a, b) => {
          const aDiff = Math.abs(new Date(a.timestamp).getTime() - now.getTime());
          const bDiff = Math.abs(new Date(b.timestamp).getTime() - now.getTime());
          return aDiff <= bDiff ? a : b;
        });
    return c.json(currentWeather);
  } catch (err) {
    console.error('Error in /airports/:code/weather:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default airports;
