# Research Brief: Flight Detail Page Time Display Bugs

**Date:** 2026-06-13
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Fix three bugs causing incorrect/inconsistent departure times on the flight detail page (`/flights/[id]`). Flight GR308 (id=42485) shows `16:45` instead of the correct estimated departure time, and different sections of the same page display different times.

## Context

The airways.gg flight detail page renders time data from two sources: the `flights` table (`scheduled_departure`) and the `flight_times` table (`EstimatedBlockOff`). All timestamps are stored as UTC in PostgreSQL (`TIMESTAMP WITHOUT TZ` with `pg.types.setTypeParser(1114, ...)` enforcing UTC parsing, and `SET TIME ZONE 'UTC'` on every pool connection). The Guernsey timezone is Europe/London (BST in summer, UTC+1).

The shared `formatGuernseyTime` utility in `$lib/time.ts` correctly converts UTC → BST for display. However, `FlightTimeline.svelte` has its own local `formatTime` function that omits the timezone parameter, creating a 1-hour discrepancy during BST relative to the rest of the page.

The estimated time for flight 42485 is wrong at the data ingestion level — the guernsey scraper extracts `16:00` (check-in opening time) from status messages instead of `18:30` (the actual ETD), because `parseHHMM` greedily matches the first time in a message.

## Alternatives Considered

### Option A: Fix all three bugs in one pass

- **Description:** Fix the timezone bug in FlightTimeline, show estimated times in Flight Details when available, and fix the guernsey scraper's time extraction to prefer "New ETD" / "Delayed To" times over "Check In Open" times.
- **Pros:** Addresses root cause end-to-end; no follow-up work needed; consistent time display everywhere.
- **Cons:** Touches three separate layers (display, data flow, scraper); needs scraper redeploy.
- **Best for:** Complete fix with no regressions.

### Option B: Fix only display bugs, ignore scraper data bug

- **Description:** Fix FlightTimeline timezone and Flight Details estimated-time display. Leave the scraper's incorrect ETD extraction as-is, accepting that some flights will show stale/wrong estimates.
- **Pros:** Smaller scope; no scraper changes or redeploys; fixes the user-visible inconsistency.
- **Cons:** GR308 (and any similarly affected flight) will still show the wrong estimated time — just consistently wrong everywhere. Root data problem remains.
- **Best for:** Quick turnaround, if the data bug is rare.

### Option C: Fix scraper only, ignore display inconsistency

- **Description:** Fix the guernsey scraper's time extraction so the correct ETD writes to flight_times. Leave display bugs as-is.
- **Pros:** Fixes the data at source; display bugs are cosmetic only (1-hour off during BST).
- **Cons:** The timezone inconsistency between FlightTimeline and Flight Details persists; users still see two different times on the same page.
- **Best for:** Minimal change set when display team is unavailable.

## Recommendation

**Option A** — fix all three bugs. The display bugs (timezone inconsistency and missing estimate in details) are straightforward, low-risk changes to two Svelte components. The scraper fix requires adding logic to `extractEstimatedTime` to prefer "New ETD"/"Delayed To" times over "Check In Open/Closes" times, but the change is localized and the logic is already in place for other message patterns.

The display fixes alone (Option B) would make the inconsistency go away but the wrong ETD would still be shown. The scraper fix alone (Option C) wouldn't fix what the user originally reported (two different times on the same page).

## Key Findings

- **FlightTimeline.svelte line ~42:** `toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })` — missing `timeZone: 'Europe/London'`. Compare with `$lib/time.ts:formatGuernseyTime` which has it.
- **+page.svelte Flight Details section:** Uses `flight.scheduledDeparture` directly. The `estimatedDeparture` is computed in `+page.server.ts` and available in page data but never rendered in the details section.
- **guernsey-scraper `extractEstimatedTime`:** Scans newest-first and returns the first matching message. For "Flight Delayed - Check In Open 16:00 Closes 19:00", `parseHHMM` returns `16:00` (first match). The correct ETD (`18:30`) is in an older "New ETD 18:30" message.
- **`parseHHMM`** successfully handles both `HH:MM` and `HHMM` formats (via regex fallback), which means the "1600" and "1830" in messages without colons would also be parseable.
- **The `delay_minutes` column is 0** for flight 42485 because the estimated time (15:00 UTC) is earlier than the scheduled time (15:45 UTC), producing a negative delay that gets ignored. With the correct ETD (17:30 UTC), the delay would be +105 minutes.

## Open Questions

- Should the Flight Details section show both scheduled and estimated times, or replace scheduled with estimated when an estimate exists?
- Should the scraper fix include a one-shot migration to correct already-affected `flight_times` rows?
- Are there other status message patterns that could confuse `parseHHMM` (e.g., "boarding expected HH:MM" where HH:MM is a gate number)?

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scraper time extraction change breaks other message patterns | medium | Add targeted tests for `extractEstimatedTime` with the known message formats from production data |
| FlightTimeline timezone fix changes display for all flights (not just BST period) | low | The fix adds timezone where it's missing — during GMT (winter), UTC = GMT, so no visible change |
| Estimated time in Flight Details may confuse users who expect "scheduled" to mean the published schedule | low | Add a label like "Estimated (best available)" when showing an estimate |

## Implementation Hints

1. **FlightTimeline fix** — one-line change: add `timeZone: 'Europe/London'` to the `toLocaleTimeString` call. Import `GY_TZ` from `$lib/time` or use the string literal.
2. **Flight Details fix** — in `+page.svelte`, use `estimatedDeparture ?? flight.scheduledDeparture` instead of `flight.scheduledDeparture`. Same for arrival.
3. **Scraper fix** — in `extractEstimatedTime`, when multiple times exist in a message, prefer times after "New ETD", "Delayed To", or "Approx" keywords over times after "Check In Open" / "Check In Closes". Alternatively, skip messages that contain "Check In" when a prior message has "New ETD".
4. **Test coverage** — add tests for `extractEstimatedTime` with the exact GR308 status message sequence as fixtures.

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
