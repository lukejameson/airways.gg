import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import 'dotenv/config';
import flights from './routes/flights';
import airports from './routes/airports';
import push from './routes/push';

const app = new Hono();

app.use('*', cors());
app.use('*', prettyJSON());

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/', flights);
app.route('/', airports);
app.route('/push', push);

const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Airways API starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
