# Research Brief: Time/Timezone Bug Root-Cause Analysis

**Date:** 2026-06-01
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Identify all root causes of flights displaying times 1 hour early or late, after months of attempted fixes across ~18 time-related commits.

## Context

airways.gg is a SvelteKit monorepo tracking Guernsey Airport (GCI) flights. The system scrapes flight data from airport.gg (HTML + API) and FlightRadar24 (puppeteer), stores it in PostgreSQL (`TIMESTAMP WITHOUT TIME ZONE` columns via Drizzle ORM), and renders a live flight board + stats page + per-flight detail page.

The codebase has a long, tortured history with timezones:

1. **Original config**: All Docker services ran `TZ=Europe/London`. The pg driver serialised `Date` objects in process-local time, so BST-period values were stored as BST wall-clock in the DB (e.g. a 10:30 BST flight stored as "10:30" in the DB, not "09:30 UTC").

2. **April 2, 2026** (commit `833a72d`): The guernsey-scraper was rewritten to properly convert Guernsey local times to UTC using `Intl.DateTimeFormat` for offset calculation. Frontend format functions were set to `timeZone: 'Europe/London'` — correct for UTC-stored values.

3. **April 23, 2026** (commit `018c9e3`): Frontend format functions were flipped to `timeZone: 'UTC'` — **breaking display**, because DB values are UTC, and displaying them as UTC yields times 1 hour behind BST.

4. **April 24, 2026** (commit `9a7c209`): Frontend flipped BACK to `timeZone: 'Europe/London'` — fixing the display.

5. **April 24, 2026** (commit `1ed2ba4`): All Dockerfiles changed from `TZ=Europe/London` to `TZ=UTC`. Migration 0014 converted existing BST wall-clock data to true UTC. `pg.types.setTypeParser(1114)` was added to force the pg driver to interpret DB timestamps as UTC.

6. **April 24, 2026** (commits `7c0e0ee`, `740f63f`): The flight detail page format functions were changed to use `timeZone: 'UTC'` again — **re-breaking the flight detail page** where it remains today.

7. **April 24, 2026** (commit `8b7e242`): The centralised `packages/database/time.ts` was created using luxon's `DateTime` for timezone handling, consolidating duplicate logic from scrapers.

**Current architecture (after all migrations):**
- DB stores all timestamps in UTC (`TIMESTAMP WITHOUT TZ`)
- `pg.types.setTypeParser(1114)` appends `Z` to force UTC interpretation
- Sessions run `SET TIME ZONE 'UTC'`
- Docker containers run `TZ=UTC`
- Scrapers use `localToUtc()` (luxon-based) to convert Guernsey local times → UTC before storing
- Migration 0014 attempted a one-time conversion of BST wall-clock → UTC

## Alternatives Considered

Not applicable — this is a diagnostic/research task, not a decision between competing approaches.

## Recommendation

There are **4 distinct bugs** that need fixing, listed by severity:

### Bug 1 (CRITICAL): Flight detail page displays in UTC instead of Guernsey local time

**File:** `apps/web/src/routes/flights/[id]/+page.svelte`  
**Lines:** 340–359

The `formatTime`, `formatDateTime`, and `shortDate` functions all use `timeZone: 'UTC'`. Since DB values are stored in UTC, this displays raw UTC times — 1 hour behind Guernsey local during BST, and user-confusing even in GMT. The FlightCard on the main board correctly uses `timeZone: 'Europe/London'`. The flight detail page should match.

**Fix:** Change `timeZone: 'UTC'` → `timeZone: 'Europe/London'` in all three format functions.

---

### Bug 2 (HIGH): Stats page departure-hour chart uses UTC hour, not Guernsey local

**File:** `apps/web/src/routes/stats/+page.server.ts`  
**Query:** `departureHour`

The SQL `EXTRACT(HOUR FROM f.scheduled_departure)::int AS hour` extracts the UTC hour. During BST, a flight at 07:00 BST (06:00 UTC) shows as hour 6, shifting the entire bar chart left by 1 hour.

**Fix:** Use `EXTRACT(HOUR FROM f.scheduled_departure AT TIME ZONE 'Europe/London')::int` instead, or apply the conversion in the application layer.

---

### Bug 3 (MEDIUM): Possible data corruption from migration ping-pong

**Migration 0014** has an explicit caveat: "The April 2-4 data corrupted by 0013 (+1h on top of wall-clock) cannot be fixed without re-scraping — it will remain ~1h off."

Additionally, the migration contained a toggle comment: "If diagnostic shows actual_departure is only 1 hour ahead (not 2), change the actual_departure/actual_arrival adjustment from -2h to -1h." It's unclear which path was ultimately taken for actual times.

**Recommendation:** Run a diagnostic query to identify flights where `actual_departure` or `actual_arrival` differ from the expected UTC value by exactly 1 or 2 hours. Any rows found should be re-derived from `flight_status_history` data (the `fixActualTimes()` function in the guernsey-scraper already has this logic).

---

### Bug 4 (MEDIUM): `correctOnTimeTimestamp` may double-correct

**File:** `apps/guernsey-scraper/src/scraper.ts`  
**Function:** `correctOnTimeTimestamp` (line ~560)

This function subtracts 1 hour from "on time" status timestamps when they are more than 1 hour after the scheduled time. This was a workaround for the old BST wall-clock issue (status timestamps stored in BST wall-clock appeared 1h later when interpreted as UTC). Now that DB values are true UTC, this correction may over-correct, making "on time" status updates appear 1 hour too early.

**Recommendation:** Remove or conditionally disable this correction. Verify with a before/after query on `flight_status_history` for "on time" messages.

---

### Bug 5 (LOW): Stats weather join may silently fail on edge cases

**File:** `apps/web/src/routes/stats/+page.server.ts`  
**Query:** windDelays, visibilityDelays, precipDelays, weatherCodeDelays, crosswindDelays

These joins use `JOIN historical_weather hw ON hw.timestamp = DATE_TRUNC('hour', f.scheduled_departure)`. After migration 0014, both sides should be UTC. However, if the migration was applied while scrapers were actively writing new data (with the old TZ=Europe/London config), some weather rows might have been missed by the migration. A diagnostic should verify that `COUNT(*)` from the weather-joined queries matches the expected flight count.

## Key Findings

1. **The root cause is an inconsistent approach to timezone management.** The project swung between three competing strategies — BST wall-clock storage, UTC storage with `Europe/London` display, and UTC storage with UTC display — without a clean state.

2. **The commit history reveals a ping-pong pattern.** The FlightCard.svelte `fmt()` toggled between Europe/London → UTC → Europe/London. The flight detail page toggled between Europe/London → UTC → Europe/London → (browser default) → UTC. Only the FlightCard landed on the correct value.

3. **The centralisation in `packages/database/time.ts` (commit `8b7e242`) was the right move**, using luxon's DST-aware `DateTime` for all timezone conversions. The scraper-side logic is now consistent and correct.

4. **The `pg.types.setTypeParser(1114)` fix is correct and necessary.** Without it, the pg driver uses the Node.js process TZ to interpret TIMESTAMP WITHOUT TZ columns — meaning a dev machine in BST reads the same DB value as 1 hour different from a UTC Docker container.

5. **Migration 0014's BST predicate `(flight_date || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/London' != ... AT TIME ZONE 'UTC'` correctly identifies BST dates** (at noon BST, the UTC equivalent is 11:00). This should have worked for the batch conversion.

6. **The `$lib/server/db.ts` re-export correctly passes through the type-parser fix** because it imports from `@airways/database` which sets up the parser at module load time.

7. **The `localToUtc` function correctly handles BST/GMT transitions** via luxon's `DateTime.fromFormat({ zone: 'Europe/London' }).toUTC()`.

## Open Questions

1. Was migration 0014 applied after or before Dockerfiles were switched to `TZ=UTC`? If after, new records written between the TZ switch and migration run are already in UTC and the migration would double-subtract.

2. Which adjustment did migration 0014 use for actual times — -1h or -2h? The migration source says "Diagnostic confirms... same -1h offset applies" but this was ambiguous.

3. Are there any remaining rows with BST wall-clock values that were missed by migration 0014 (e.g., rows inserted while the migration was running)?

4. Should the stats page display all times in Guernsey local, or should it use UTC for internal consistency and convert only for display?

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Flight detail page shows wrong times to all users | high | Fix `timeZone` in format functions — 3-line change |
| Stats departure hour chart is misleading | high | Apply `AT TIME ZONE 'Europe/London'` in SQL |
| Some historical actual_departure/arrival times are 1h off | medium | Run `fixActualTimes()` which re-derives from status history |
| `correctOnTimeTimestamp` over-corrects live data | medium | Remove or guard with a DST check |
| Migration 0014 may not have covered all rows | low | Run diagnostic to find timestamps that are 1h offset from expected |

## Implementation Hints

- **Bug 1 is a 3-line fix** in `apps/web/src/routes/flights/[id]/+page.svelte` — change `timeZone: 'UTC'` to `timeZone: 'Europe/London'` in `formatTime`, `formatDateTime`, and `shortDate`.
- **Bug 2** requires SQL changes in `apps/web/src/routes/stats/+page.server.ts` — add `AT TIME ZONE 'Europe/London'` to the `departureHour` query.
- **Bug 3** — run the `fixActualTimes()` function from `apps/guernsey-scraper/src/scraper.ts` as a one-off. It already handles both next-day corruption and unrealistic delay values.
- **Bug 4** — the `correctOnTimeTimestamp` function can be safely removed or replaced with a no-op. The underlying issue it was working around (BST wall-clock timestamps) no longer exists.
- **Consider adding a server-side time formatting utility** — a `formatGuernseyTime(date)` helper that always uses `Europe/London` timezone, to prevent future regressions.
- **After fixes**, run an end-to-end smoke test: pick a flight from a BST date, verify the detail page shows the correct Guernsey local time, verify the stats departure-hour chart aligns with actual departure times.

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
