// Server-only database module — SvelteKit enforces $lib/server is never accessible client-side.
// Vite resolves @airways/database via alias in vite.config.ts → packages/database/index.ts.
// pg and drizzle-orm are marked as ssr.external so they're never bundled.

export { db, getDb } from '@airways/database';

// Named re-exports so Rollup can statically trace them (avoids `export *` tracing issues)
export {
  flights,
  flightTimes,
  flightNotes,
  flightStatusHistory,
  weatherData,
  airportDaylight,
  scraperLogs,
  aircraftPositions,
  airports,
  pushSubscriptions,
  notificationWatermark,
} from '@airways/database/schema';
