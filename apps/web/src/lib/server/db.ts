// Server-only database module — SvelteKit enforces $lib/server is never accessible client-side.
// Vite resolves @delays/database via alias in vite.config.ts → packages/database/index.ts.
// pg and drizzle-orm are marked as ssr.external so they're never bundled.

export { db, getDb } from '@delays/database';

// Named re-exports so Rollup can statically trace them (avoids `export *` tracing issues)
export {
  flights,
  flightDelays,
  flightTimes,
  flightNotes,
  flightStatusHistory,
  weatherData,
  airportDaylight,
  delayPredictions,
  scraperLogs,
  mlModelMetrics,
  aircraftPositions,
  airports,
  users,
  sessions,
  departures,
  arrivals,
  userRoleEnum,
  scraperServiceEnum,
  scraperStatusEnum,
  confidenceEnum,
  statusSourceEnum,
} from '@delays/database/schema';
