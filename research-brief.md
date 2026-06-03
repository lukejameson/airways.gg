# Research Brief: Scheduled Departure Times Off by 1 Hour

**Date:** 2026-06-03
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Fix a systemic 1-hour offset in all flight scheduled departure/arrival times displayed on airways.gg, where times appear 1 hour later than they should (e.g., GR634 shows scheduled departure 10:15 but should be 09:15).

## Context

Every flight on the flight board and detail pages shows scheduled times that are 1 hour ahead of reality. For GR634 (GCI→EDI, 2026-06-03), the status timeline on airport.gg shows "Door and Gate Closed at 09:19" and FR24 estimates departure at 09:25, yet the `scheduledDeparture` field displays as 10:15 BST.

The project uses `timestamp without time zone` columns in PostgreSQL for all time fields. All services run in Docker containers with `TZ=UTC`. Migration `0014_fix_utc_timestamps.sql` converted historical data from BST wall-clock format to true UTC by subtracting 1 hour for summer dates.

### How Times Flow Through the System

1. **Guernsey scraper** fetches `flight_time` (e.g., "09:15") from airport.gg API/HTML
2. Calls `localToUtc(dateStr, hh, mm)` which uses **Luxon** `DateTime.fromFormat` with `zone: 'Europe/London'` to convert BST→UTC
3. **pg driver** stores the JavaScript Date in the `timestamp without time zone` column (formatted as UTC wall-clock because `TZ=UTC` and `SET TIME ZONE 'UTC'`)
4. **Web app** reads the value back via a custom type parser that appends `"Z"` to force UTC interpretation: `pg.types.setTypeParser(1114, (val: string) => new Date(val + 'Z'))`
5. **FlightCard component** displays using `formatGuernseyTime()` which uses native `Intl.DateTimeFormat` with `timeZone: 'Europe/London'` to convert UTC→BST for display

### Critical Finding

The `formatGuernseyTime()` function uses **native `Intl`** for display (step 5), while `localToUtc()` uses **Luxon** for conversion (step 2). If Luxon's `DateTime.fromFormat` with `zone` parameter fails to resolve `Europe/London` correctly — falling back to UTC — the data would be stored 1 hour ahead in UTC but displayed correctly back as BST+1 by the native Intl display layer. This asymmetry would produce exactly the observed 1-hour offset during BST.

## Alternatives Considered

### Option A: Luxon timezone resolution failure on Alpine (Likely Root Cause)

- **Description:** The `node:20-alpine` Docker base image may lack full IANA timezone data that Luxon's `DateTime.fromFormat` with `zone: 'Europe/London'` requires. The guernsey-scraper Dockerfile does not install `tzdata` (the fr24-scraper does). While Node.js 20 bundles full ICU, there are known edge cases where Luxon's zone handling differs from native `Intl` on minimal containers. Luxon issue #1198 documents `DateTime.fromFormat` ignoring the `zone` parameter and using system timezone instead. If the system TZ is UTC (as configured), `localToUtc` would treat "09:15" as UTC instead of BST, storing 09:15 UTC instead of 08:15 UTC. The native `Intl.DisplayFormat` used for display resolves `Europe/London` correctly, converting 09:15 UTC → 10:15 BST.
- **Pros:** Explains why ALL flights are affected, only during BST; explains the asymmetry between write (Luxon) and read (native Intl)
- **Cons:** Luxon 3.4.0 should have fixed issue #1198; needs verification in Docker environment
- **Best for:** If confirmed, the fix is straightforward (install tzdata in affected Dockerfiles, or use native Date arithmetic instead of Luxon)

### Option B: Migration 0014 applied incorrectly

- **Description:** Migration 0014 subtracts 1 hour from scheduled times for BST-period dates. If the migration was applied to data that was already in true UTC (from the new TZ=UTC scrapers), it would subtract an extra hour. However, this would make times 1 hour EARLIER, not LATER, so it doesn't match the symptom direction. Could still contribute if applied partially or at the wrong time.
- **Pros:** Would affect historical data
- **Cons:** Doesn't explain NEW flights scraped after migration; produces wrong direction of error
- **Best for:** Unlikely to be the cause, but worth ruling out

### Option C: Source data change in airport.gg API

- **Description:** airport.gg's API might have changed to return times in a different format or timezone. If they now return UTC times but the scraper still applies BST→UTC conversion via `localToUtc`, times would be double-converted. However, this would show times EARLIER not LATER (e.g., 08:15 instead of 09:15), opposite to the observed bug.
- **Pros:** Would explain sudden onset
- **Cons:** Wrong direction of error; unlikely to affect ALL flights uniformly
- **Best for:** Rule out via API inspection

### Option D: Double BST offset somewhere in the pipeline

- **Description:** A +1h offset is being applied somewhere that shouldn't be. This could be the `SET TIME ZONE 'UTC'` session setting interacting with the pg driver's Date serialization in unexpected ways. When `TZ=UTC` and `SET TIME ZONE 'UTC'`, the pg driver formats Date objects as UTC. But if `localToUtc` returns a correct UTC Date (08:15Z), and then something adds an hour before storage, we'd get 09:15 in the DB → displayed as 10:15 BST.
- **Pros:** Matches symptom direction
- **Cons:** No obvious place where a +1h is added; the code explicitly works with UTC throughout
- **Best for:** Secondary theory to investigate if Option A is ruled out

## Recommendation

Option A is the leading theory. The asymmetry between Luxon (used for writing in `localToUtc`) and native Intl (used for display in `formatGuernseyTime`) creates the perfect conditions for a 1-hour drift. If Luxon can't resolve `Europe/London` and falls back to UTC, every scheduled time stored since the TZ=UTC migration would be 1 hour ahead in UTC, displayed as BST+1 by the working native Intl layer.

**Recommended verification steps:**
1. Query the database directly: `SELECT flight_number, scheduled_departure FROM flights WHERE flight_date = '2026-06-03'` — check if raw values are 1 hour ahead of expected UTC
2. Add `tzdata` package to guernsey-scraper and web Dockerfiles, redeploy, and monitor if new scrapes produce correct times
3. Add an integration test that runs `localToUtc` inside the Docker container to verify the BST offset is applied

**If confirmed**, the fix would be:
1. Install `tzdata` in the guernsey-scraper and web Dockerfiles (`RUN apk add --no-cache tzdata`)
2. Run a one-off DB migration to fix existing incorrect data: add 1 hour to scheduled times for BST dates (reverse of what migration 0014 does, since the data was incorrectly stored as-if-UTC by the broken `localToUtc`)

## Key Findings

1. The pg driver uses a custom type parser (`pg.types.setTypeParser(1114, ...)`) that force-interprets `timestamp without time zone` values as UTC by appending `"Z"` — this is correct behavior
2. The `SET TIME ZONE 'UTC'` on every pool connection ensures writes are formatted as UTC
3. `localToUtc()` uses Luxon `DateTime.fromFormat` with `zone`, while `formatGuernseyTime()` uses native `Intl.DateTimeFormat` with `timeZone` — two different code paths for timezone handling
4. The guernsey-scraper and web Dockerfiles use `node:20-alpine` without `tzdata`; the fr24-scraper Dockerfile includes `tzdata`
5. Luxon issue #1198 documents `DateTime.fromFormat` ignoring the `zone` parameter on certain environments
6. The bug affects ALL flights, suggesting a systemic rather than data-specific issue

## Open Questions

1. Does `DateTime.fromFormat('2026-06-03 09:15', 'yyyy-MM-dd HH:mm', { zone: 'Europe/London' }).toUTC()` return 08:15Z or 09:15Z when running in the `node:20-alpine` Docker container?
2. Did this bug start exactly when migration 0014 was deployed and services switched to `TZ=UTC`?
3. Are flights during GMT (winter) also affected, or only BST (summer) flights?
4. Does the fr24-scraper (which has tzdata installed) produce correct scheduled times?

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data fix migration applies wrong offset to already-correct data | high | Run diagnostic queries first; only fix dates that are provably wrong |
| Installing tzdata doesn't fix Luxon behavior | medium | Fall back to native Date arithmetic: `new Date(Date.UTC(y, mo-1, d, hh-1, mm))` for BST months |
| The true root cause is something else entirely | medium | Add comprehensive integration tests that run `localToUtc` → store → read → `formatGuernseyTime` round-trip in Docker |

## Implementation Hints

1. Start by verifying the hypothesis: write a small script that calls `localToUtc('2026-06-03', 9, 15)` inside the Docker container and logs the result
2. Run a diagnostic SQL query to check if the raw DB values match the expected true UTC (08:15Z for a 09:15 BST flight)
3. If confirmed, the fix is two parts: (a) fix the Dockerfiles to include tzdata, (b) write a data migration to fix existing incorrect rows
4. The data migration needs to be the reverse of migration 0014: ADD 1 hour to scheduledDeparture/Arrival for BST dates — but only for data that was stored by the broken `localToUtc`
5. Consider replacing Luxon with native `Date` arithmetic in `localToUtc` for BST-aware conversion (using known DST transition dates) as a more robust alternative that doesn't depend on IANA timezone data

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
