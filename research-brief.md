# Research Brief: Autumn Clock-Change Resilience Audit

**Date:** 2026-06-02
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Verify that the recent BST timezone fixes will not regress when clocks go back
(BST → GMT, last Sunday of October 2026), and identify any residual risks.

## Context

airways.gg suffered from a long-running timezone bug that caused flights to
display 1 hour early or late after the UK entered BST in late March 2026. This
was recently fixed in commits `8b7e242` through `6dc371b`. The fix centralised
all timezone handling around a clean UTC-storage model with DST-aware
conversions via luxon.

The March BST bug was caused by an architectural ping-pong between three
competing strategies:
1. BST wall-clock storage (TZ=Europe/London in Docker)
2. UTC storage with UTC display
3. UTC storage with Europe/London display

The current architecture has been fully unified into strategy 3. This audit
checks whether the autumn clock change (clocks going back, BST → GMT) could
trigger a similar regression — the "fall back" creates a 1-hour overlap that
is the mirror image of the spring-forward gap.

## Current Architecture (After All Fixes)

| Layer | Mechanism | DST-Aware? |
|-------|-----------|------------|
| **DB Storage** | UTC in `TIMESTAMP WITHOUT TIME ZONE` | N/A (no timezone in values) |
| **pg driver** | `setTypeParser(1114)` appends `Z` → forces UTC interpretation | N/A |
| **DB connections** | `SET TIME ZONE 'UTC'` on every connect | N/A |
| **Docker** | `TZ=UTC` in all Dockerfiles | N/A |
| **Guernsey→UTC** | `localToUtc()` via luxon `DateTime.fromFormat({ zone: 'Europe/London' }).toUTC()` | ✅ DST-aware |
| **UTC→display** | `formatGuernseyTime()` via `toLocaleTimeString({ timeZone: 'Europe/London' })` | ✅ DST-aware |
| **Date strings** | `guernseyTodayStr()` via luxon `DateTime.fromJSDate({ zone: 'Europe/London' }).toFormat('yyyy-MM-dd')` | ✅ DST-aware |
| **Stats SQL** | `EXTRACT(HOUR FROM ... AT TIME ZONE 'Europe/London')` | ✅ DST-aware |
| **FR24 TZ guard** | Fails fast if `getTimezoneOffset() !== 0` | N/A |
| **Weather TAF** | All date construction uses `Date.UTC()` | N/A |
| **SunCalc** | Uses UTC noon as anchor, no local-time dependency | N/A |

## Alternatives Considered

### Option A: Do nothing (Recommended)

The current architecture is robust against the autumn clock change. Every
timezone-sensitive operation goes through a DST-aware path. The same bug
pattern cannot recur because the three-competing-strategies root cause has
been eliminated.

### Option B: Add an explicit DST transition test

Add a test that simulates the autumn transition by running `localToUtc()` and
`formatGuernseyTime()` on a date that spans the change, verifying correct
behaviour across the boundary.

## Recommendation

**No changes are needed to prevent the autumn clock-change regression.** The
architecture is sound. The BST bug was caused by inconsistent timezone
handling across the stack — not by any inherent fragility around the DST
boundary itself. With all timezone paths now unified through a single
DST-aware pipeline, the autumn transition is a non-event for the application.

The recommended course of action:
1. Add the optional regression test (Option B) for defense-in-depth
2. Fix the three residual issues identified below (none are clock-change
   related, but all improve overall time correctness)

## Key Findings

1. **The autumn clock change cannot cause the same bug.** The BST bug was
   architectural (three competing strategies), not temporal (the transition
   itself). The unified architecture handles both spring-forward and
   fall-back correctly.

2. **`localToUtc()` handles the ambiguous hour correctly.** Luxon's
   `DateTime.fromFormat({ zone: 'Europe/London' })` uses IANA timezone data
   and correctly distinguishes BST from GMT. For the overlapping 01:00-02:00
   hour on the fall-back day, luxon's default behaviour (earlier occurrence =
   BST) is reasonable. No flights operate during this window, so the ambiguity
   is academic.

3. **All scrapers sleep during the transition window.** Both the
   guernsey-scraper and fr24-scraper hard-stop at 23:00 Guernsey local and
   wake at ~05:00. The DST transition happens at 02:00 BST → 01:00 GMT, while
   the scrapers are sleeping. No live data is ingested during the ambiguous
   hour.

4. **The `pg.types.setTypeParser(1114)` fix is critical and correct.**
   Without it, a UTC Docker container would interpret the same DB value
   differently than a BST dev machine. This fix ensures consistent
   interpretation regardless of environment.

5. **Three residual time-related issues were identified:**

   - **Residual 1 (LOW):** `scrapeDayFlights` in guernsey-scraper uses
     `new Date().toISOString().split('T')[0]` for the `defaultFlightDate`
     in `parseFlightHtml`. This is UTC-based and will produce a UTC date.
     All flight date comparisons use `guernseyTodayStr()` which is
     Guernsey-local. For ~1 hour around Guernsey midnight (23:00-00:00 UTC
     during BST), the UTC date and Guernsey date could differ. In practice
     this is unlikely to matter because the scraper sleeps during this window,
     but it's a fragile pattern.

   - **Residual 2 (LOW):** `fr24-scraper/src/scraper.ts` line 447 and 539
     use `new Date()` (UTC) for comparing actual times. The comparison
     `parsedTime <= now` is correct since both sides are UTC, but the comment
     could be misleading — it should clarify that `now` is UTC, not local.

   - **Residual 3 (LOW):** `apps/guernsey-scraper/src/scraper.ts` line 1011
     computes `endDateStr` as `new Date().toISOString().split('T')[0]` for
     historical backfill. This is a UTC date string, but it's compared against
     `flight_date` which stores Guernsey local dates. A backfill run near
     Guernsey midnight could miss or include an extra day. This only affects
     historical backfill, not live scraping.

## Open Questions

1. Should `flight_date` be documented explicitly as "Guernsey local calendar
   date" in the database schema to prevent future confusion?

2. Should the scraper add a 30-minute buffer around the sleep window to ensure
   it never operates during the DST transition (2 AM local)?

3. Is there value in adding a `test/timezone.test.ts` that exercises
   `localToUtc()` and `formatGuernseyTime()` across BST/GMT boundaries?

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Autumn clock change causes time display regressions | low | No mitigation needed — architecture is DST-agnostic |
| Dev machine in non-UTC timezone interprets DB values differently | low | Already mitigated by `pg.types.setTypeParser(1114)` |
| Flight date mismatch near midnight boundary (Residual 1) | low | Accept as-is — scraper sleeps during this window |
| Historical backfill off-by-one day (Residual 3) | low | Document that backfill should use Guernsey-local date |

## Implementation Hints

- **Defense-in-depth test:** Create `packages/database/time.test.ts` with
  test cases for `localToUtc()` across the BST/GMT boundary:
  - October 25 10:00 → 10:00 UTC (GMT)
  - October 24 10:00 → 09:00 UTC (BST)
  - March 30 10:00 → 09:00 UTC (BST, day after spring-forward)
  - March 29 10:00 → 10:00 UTC (GMT, day before spring-forward)

- **Residual 1 fix:** In `parseFlightHtml`, use `guernseyTodayStr()` instead
  of `date.toISOString().split('T')[0]` for the `defaultFlightDate`:
  ```ts
  // Before (line ~130 in scraper.ts):
  const defaultFlightDate = date.toISOString().split('T')[0];
  // After:
  const defaultFlightDate = guernseyTodayStr(date);
  ```

- **Residual 3 fix:** Same approach for the historical backfill default date.

- **Monitor around October 25, 2026:** Set a calendar reminder to check the
  app's display on the Sunday of the clock change. Verify that flights
  scheduled for 07:00 show as 07:00 Guernsey local, not 06:00 or 08:00.

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
