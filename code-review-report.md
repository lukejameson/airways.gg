# Code Review Report

**Target:** airways.gg monorepo
**Languages:** TypeScript (89 files), Svelte (26 files), Python (1 file)
**Date:** 2026-06-12

## Executive Summary

- Total source files: ~211
- Issues found: 17
  - Critical: 2 (both fixed)
  - High: 5 (all fixed)
  - Medium: 4
  - Low: 6

## Findings

### 🔴 Critical

#### Missing component imports — Flight detail page broken

**Severity:** critical (FIXED)
**Files:** `apps/web/src/routes/flights/[id]/+page.svelte`
**Confidence:** high

6 components used in the template but `FlightHeader`, `DelayAnalysis`, `FlightTimeline`, `FlightMap`, `RotationHistory`, and `WeatherDisplay` were never imported. `FlightHeader` caused the runtime error `ReferenceError: FlightHeader is not defined`. The other 5 would have triggered similar errors once the page scrolled to their sections.

**Remediation:** Added all 6 imports from `./components/`. Also removed a duplicate `$effect` block for `recentlyViewedFlights` (identical logic ran twice on every page visit).

---

#### `isTerminalStatus` not imported — auto-advance always fires

**Severity:** critical (FIXED)
**Files:** `apps/web/src/routes/+page.server.ts:37`, `apps/web/src/lib/server/db.ts`
**Confidence:** high

`getActiveFlightsForDate()` called `isTerminalStatus(f.status)` which was a `ReferenceError` at runtime (never imported). The `try/catch` swallowed the error and returned `[]`, causing the auto-advance logic to always conclude "all flights completed" and show tomorrow's schedule. Every page load with flights today + tomorrow would incorrectly advance.

**Remediation:** Added `isTerminalStatus` to re-exports in `$lib/server/db.ts` and to the import destructure in `+page.server.ts`.

---

### 🟠 High

#### `Completed` missing from terminal status map

**Severity:** high (FIXED)
**Files:** `packages/database/statusPriority.ts`
**Confidence:** high

The `STATUS_PRIORITY` map had `Landed:50`, `Cancelled:50`, `Diverted:50` but not `Completed`. A flight with status "Completed" would get priority 0 (default), meaning `isTerminalStatus` returned `false` — it was treated as still active. This would prevent auto-advance even when all flights are genuinely completed with that status.

**Remediation:** Added `Completed: 50` to the priority map.

---

#### `db` and `sql` used but never imported in stats page

**Severity:** high (FIXED)
**Files:** `apps/web/src/routes/stats/+page.server.ts:53-54`
**Confidence:** high

Three raw SQL queries for filter options run at the top of the stats load function using `db.execute(sql`...`)` but neither `db` nor `sql` were imported. Would throw `ReferenceError` at runtime, breaking the stats page.

**Remediation:** Added `import { db } from '$lib/server/db'` and `import { sql } from 'drizzle-orm'`.

---

#### Guernsey scraper had divergent terminal status list

**Severity:** high (FIXED)
**Files:** `apps/guernsey-scraper/src/live.ts:38`
**Confidence:** high

Had a hardcoded `TERMINAL_STATUSES = ['Landed', 'Cancelled', 'Completed']` — missing `Diverted`. Both `@airways/common` and `@airways/database` include `Diverted` in their terminal statuses. Flights diverted from GCI would never be filtered out of the scraper's active set, causing unnecessary polling.

**Remediation:** Replaced local array with `import { TERMINAL_STATUSES } from '@airways/common'`. Removed the local constant.

---

#### Client-side hardcoded terminal status checks

**Severity:** high (FIXED)
**Files:** `apps/web/src/lib/components/FlightCard.svelte:105`, `apps/web/src/routes/flights/[id]/+page.svelte:143,160`
**Confidence:** high

Both components manually checked `status.includes('landed') || status.includes('completed')` and similar patterns instead of using the shared `isTerminalStatus` or `isFlightCompleted` functions. These hardcoded patterns drift from the canonical terminal status definitions.

**Remediation:** Replaced with `isFlightCompleted(flight)` (already imported in both files).

---

### 🟡 Medium

#### `fr24-scraper` imports `isTerminalStatus` from two different packages

**Severity:** medium
**Files:** `apps/fr24-scraper/src/scraper.ts:4`, `apps/fr24-scraper/src/index.ts:1`
**Confidence:** high

`scraper.ts` imports `isTerminalStatus` from `@airways/database` (priority-based) while `index.ts` imports `isTerminalStatus` (and `TERMINAL_STATUSES`) from `@airways/common` (exact-match). These two implementations have subtly different behavior — e.g. the common version handles `diverted` prefix matching while the database version only matches exact "Diverted". Both are used in the same scraper process.

**Remediation:** Consolidate to a single import source. The common version is more robust for status matching since it handles prefixes.

---

#### Only one `+error.svelte` at root level

**Severity:** medium
**Files:** `apps/web/src/routes/+error.svelte`
**Confidence:** high

No per-route error boundaries exist. All errors fall through to the root `+error.svelte`. Routes like `/flights/[id]` and `/stats` would benefit from contextual error pages that include navigation back to relevant sections.

**Remediation:** Add `+error.svelte` to `/flights/[id]/` and `/stats/` with contextual messages and navigation.

---

#### `aurigny-mobile-scraper` — no source code

**Severity:** medium
**Files:** `apps/aurigny-mobile-scraper/`
**Confidence:** high

The directory contains only a `dist/` folder — no `src/`, no `package.json`, no `Dockerfile`. This service has no source code in version control. If the compiled output becomes stale, there's no way to rebuild it.

**Remediation:** Commit source code or remove the directory if the service is deprecated.

---

#### `weather-backfill` — only Dockerfile, no service code

**Severity:** medium
**Files:** `apps/weather-backfill/Dockerfile`
**Confidence:** high

Only a Dockerfile exists for this service — no source code at all. The Docker image would have nothing to run.

**Remediation:** Either add the backfill service implementation or remove the directory.

---

### 🟢 Low

#### Unused `not` import in homepage server

**Severity:** low (FIXED)
**Files:** `apps/web/src/routes/+page.server.ts:3`
**Confidence:** high

`not` from `drizzle-orm` was imported but never used. Build emitted a warning.

**Remediation:** Removed from import.

---

#### Pre-existing TS error in stats page

**Severity:** low
**Files:** `apps/web/src/routes/stats/+page.server.ts:193`
**Confidence:** high

`Property 'rows' does not exist on type 'WeatherBandStats[] | never[]'` — the `windDelays.rows` access fails type checking on the catch fallback type. The `windDelays` variable is typed as the union of the success and error return types, and the error type doesn't have `.rows`.

**Remediation:** Narrow the type after the `Promise.all` with explicit error handling, or cast after checking for the `.rows` property.

---

#### Svelte 5 `state_referenced_locally` warnings

**Severity:** low
**Files:** `apps/web/src/routes/+layout.svelte:11`, `apps/web/src/routes/+page.svelte:162`
**Confidence:** high

`data.airports` in layout and `data.recentlyViewed` in homepage are referenced at the top level in `<script>` which only captures the initial value. These are intentional (layout reads airports once to initialize a cache, homepage seeds recentlyViewed from SSR data) but Svelte 5 warns about the pattern.

**Remediation:** Suppress with `// svelte-ignore state_referenced_locally` with a comment explaining why, or restructure the initialization.

---

#### `FlightHeader.calculatedStatus` uses hardcoded status checks

**Severity:** low
**Files:** `apps/web/src/routes/flights/[id]/components/FlightHeader.svelte:59-62`
**Confidence:** medium

The `calculatedStatus` derivation manually checks `status.includes('landed')`, `status.includes('completed')`, etc. Like the other client components, this should use a shared function. However, this is a visual-only override and doesn't affect business logic.

**Remediation:** Replace with a call to the shared status utilities.

---

#### `FlightHeader.scheduledTime` is null for arrivals

**Severity:** low
**Files:** `apps/web/src/routes/flights/[id]/components/FlightHeader.svelte:51`
**Confidence:** medium

`scheduledTime` is derived as `isDeparture ? scheduledDeparture : null` — for arrival flights, the scheduled time passed to `DelayCounter` is always null. This may be intentional (arrivals don't show a delay counter) but should be verified.

---

#### `fr24-scraper` double-initialization of `guernseyDateStr`

**Severity:** low
**Files:** `apps/fr24-scraper/src/scraper.ts:8-9`
**Confidence:** medium

Line 7: `const guernseyDateStr = guernseyTodayStr;`
Line 9: `export { guernseyDateStr };`

And in `index.ts:1`, `guernseyDateStr` is imported from `./scraper`. But `index.ts` also imports `guernseyHour` and `guernseyTomorrowStr` directly from `@airways/common`. The `guernseyDateStr` is initialized once at module load time and may become stale for long-running scraper processes.

---

## Remediation Priority

1. **All critical and high issues already fixed** in this session.
2. Fix `fr24-scraper` dual import (medium) — consolidate to `@airways/common`.
3. Add per-route error boundaries (medium).
4. Resolve `aurigny-mobile-scraper` missing source (medium).
5. Fix `weather-backfill` missing implementation or remove (medium).
6. Address low items at leisure.

## Data Flow & Architecture Summary

| Connection | Status |
|------------|--------|
| Web → PostgreSQL (Drizzle proxy) | ✅ |
| Web → ML service (HTTP) | ✅ (compose dependency) |
| Web → Umami analytics (CORS blocked — deployment issue, not code) | ⚠️ |
| Web → Push notifications (VAPID) | ✅ |
| Scrapers → PostgreSQL | ✅ |
| Scrapers → Telegram alerts | ✅ |
| Position service → FR24 API (token) | ✅ |
| Weather service → Open-Meteo API | ✅ |
| Notification service → PostgreSQL + VAPID | ✅ |
| Page routing: /, /flights/[id], /search, /stats, /contact, /sitemap.xml | ✅ |
| Error pages per route | ⚠️ only root |

## File-by-File Breakdown

| File | Issues | Max Severity |
|------|--------|--------------|
| `apps/web/src/routes/flights/[id]/+page.svelte` | 3 (missing imports, duplicate effect, hardcoded status) | critical → fixed |
| `apps/web/src/routes/+page.server.ts` | 2 (missing import, unused import) | critical → fixed |
| `apps/web/src/lib/server/db.ts` | 1 (missing re-export) | critical → fixed |
| `packages/database/statusPriority.ts` | 1 (missing Completed) | high → fixed |
| `apps/web/src/routes/stats/+page.server.ts` | 2 (missing imports, TS error) | high → fixed |
| `apps/guernsey-scraper/src/live.ts` | 1 (divergent terminal list) | high → fixed |
| `apps/web/src/lib/components/FlightCard.svelte` | 1 (hardcoded status) | high → fixed |
| `apps/fr24-scraper/src/` | 1 (dual import) | medium |
| `apps/aurigny-mobile-scraper/` | 1 (missing source) | medium |
| `apps/weather-backfill/` | 1 (missing code) | medium |

---

*Generated by code-review skill v3.0.0*
