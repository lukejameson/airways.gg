# Research Brief: Debug API for airways.gg

**Date:** 2026-06-07
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Build a secure, JSON-based debug API at `/api/debug/*` that exposes all airways.gg data — raw tables, UI-parity queries, scraper internals, and a guarded raw SQL endpoint — for agent-driven debugging of data issues.

## Context

airways.gg is a SvelteKit monorepo with a PostgreSQL database managed by Drizzle ORM. There are 14 tables spanning flights, weather, aircraft positions, scraper logs, airports, daylight data, push subscriptions, and notification watermarks. Data reaches the UI exclusively through `+page.server.ts` load functions — there is no programmatic API.

No authentication system exists today. The `hooks.server.ts` file does no token or session validation, and `app.d.ts` declares `Locals` as intentionally empty. This means the debug API will introduce the first auth mechanism in the codebase.

The web app (`apps/web`) has existing API routes under `/api/health/timezone` and `/api/push/*` demonstrating the `+server.ts` pattern. The stats page (`routes/stats/lib/queries.ts`) has well-structured, reusable query functions that the debug API can import directly.

## Alternatives Considered

### Option A: Hybrid — table endpoints + mirrored UI data + raw SQL (Selected)

- **Description:** Individual `+server.ts` files per table under `/api/debug/` with query-param filtering, sorting, and pagination. Mirrored UI endpoints that re-import the existing stats query functions and load-function logic. A `POST /api/debug/sql` endpoint with a SELECT-only guard. Auth via Bearer token checked in `hooks.server.ts` for the `/api/debug/*` path prefix.
- **Pros:** Full coverage. Structured endpoints for safety, raw SQL for flexibility. Minimal new logic — table endpoints are simple Drizzle queries, stats endpoints reuse existing functions. Token auth is a concise addition to hooks.
- **Cons:** ~15 endpoint files to create. Raw SQL endpoint needs a guard. Some risk of drift if load functions change without mirror updates.
- **Best for:** Maximum debugging power with safety rails.

### Option B: Generic SQL endpoint only

- **Description:** Single `POST /api/debug/query` with read-only SQL execution. No structured endpoints.
- **Pros:** One file. Infinite flexibility.
- **Cons:** No discoverability. Harder to build agent tooling around. Raw SQL always carries risk.
- **Best for:** When you know SQL and don't want to maintain structured endpoints.

### Option C: Mirror-only (UI parity only)

- **Description:** Only expose the exact data shapes the load functions return. No raw table access.
- **Pros:** Guaranteed parity. Fewer endpoints. No risk of exposing sensitive fields.
- **Cons:** Can't answer ad-hoc operational questions about scraper logs, positions, or tables the UI doesn't consume.
- **Best for:** Lightweight approach when you only need to verify what users see.

### Option D: Read-only database proxy (PostgREST or custom)

- **Description:** Separate service exposing PostgreSQL over HTTP with auto-discovered schemas.
- **Pros:** Schema-driven, auto-documenting, no code per table.
- **Cons:** Adds infrastructure dependency. Overkill for an internal debug tool. Requires ops work.
- **Best for:** Public-facing APIs.

## Recommendation

**Option A — Hybrid with raw SQL backup.** Structure the API as three endpoint groups under a `/api/debug/` route group:

1. **Table endpoints** (`/api/debug/flights`, `/api/debug/weather`, etc.) — `GET` with optional query params for filtering (date, status, airport codes), sorting (by field, direction), and pagination (limit/offset). Default to limit=100, cap at 1000. Return JSON with `{ rows, count, queryMs }`.

2. **UI mirror endpoints** (`/api/debug/ui/homepage`, `/api/debug/ui/flight/[id]`, `/api/debug/ui/search`, `/api/debug/ui/stats`) — import and invoke the existing query functions from `stats/lib/queries.ts` and the load-function data-fetching logic from `+page.server.ts`. Accept the same query params the pages accept. Return the exact data shapes the UI receives.

3. **Raw SQL endpoint** (`POST /api/debug/sql`) — Accept `{ sql: string }` body. Guard against non-SELECT statements by checking the first token. Execute via `db.execute()` and return `{ rows, rowCount, queryMs }`. This endpoint requires the token and logs every query to stdout for audit.

**Auth:** Add a `DEBUG_API_TOKEN` environment variable. In `hooks.server.ts`, check `event.url.pathname.startsWith('/api/debug/')` and validate `Authorization: Bearer <token>` against the env var. Return 401 with `{ error: 'Unauthorized' }` on mismatch. This is the first auth mechanism in the codebase — keep it simple and scoped to the debug prefix.

**Rationale:** This gives the agent full access to all 14 tables with safe, structured endpoints, while keeping the raw SQL escape hatch for complex joins and aggregations. Reusing existing query functions avoids duplicating logic. The auth pattern is minimal and doesn't interfere with the public routes.

## Key Findings

- **14 database tables** available: flights, flight_times, flight_notes, flight_status_history, weather_data, historical_weather, airport_daylight, airports, scraper_logs, aircraft_positions, push_subscriptions, notification_watermark, users, sessions.
- **No existing auth** — `hooks.server.ts` is a pass-through with only cache-control logic. `app.d.ts` confirms `Locals` is intentionally empty.
- **Existing query functions** in `apps/web/src/routes/stats/lib/queries.ts` are well-structured and importable: `getHeroStats`, `getDelayDistribution`, `getDayOfWeekDistribution`, `getHourDistribution`, `getRouteStats`, `getFlightNumberStats`, `getAircraftStats`, `getTopDelays`, `getDailyOtpStats`, `getMonthlyBreakdown`, plus 7 weather-correlation query functions.
- **Database pool is lazily initialized** via a Proxy (`packages/database/index.ts`). Any server-side import of `db` can share the same pool. The `getDb()` function creates pools with max 5 connections per service.
- **The `users` and `sessions` tables contain sensitive data** (password_hash, session tokens). The debug API should either exclude these tables or redact sensitive columns.
- **Existing API routes use the `+server.ts` pattern** (RequestHandler exports) — the debug API should follow the same convention.
- **Type safety:** All table types are exported from `@airways/database` as `Flight`, `WeatherDatum`, `AircraftPosition`, etc. The debug endpoints can use these types for response typing.

## Open Questions

- Should `users` and `sessions` tables be exposed at all, or excluded from the debug API? They contain password hashes and session tokens.
- Should there be rate limiting on the debug endpoints (e.g., max 60 requests/minute)? Not urgent for a single-agent use case but worth considering.
- Should the raw SQL endpoint log queries to a separate audit table or just stdout?

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Raw SQL endpoint allows writes | High | Guard checks first token — only SELECT, EXPLAIN, SHOW, DESCRIBE allowed. Reject everything else with 403. |
| Token leaked in logs or git | Medium | Token from `$env/dynamic/private` (never client-side). Document in README. Add `.env` to `.gitignore` (already done). |
| Sensitive fields exposed (password_hash, tokens) | High | Exclude `users` and `sessions` tables from debug API, or redact sensitive columns. Recommend exclusion. |
| Query perf impact on production DB | Low | Limit clause on all table endpoints (default 100, max 1000). Raw SQL endpoint timeout at 30s. Pool already limited to 5 connections per service. |
| Stats query function API changes break mirrors | Low | Mirrors import the same functions — TypeScript compilation catches signature changes. Only risk is if the function return type changes subtly. |

## Implementation Hints

1. **Auth first** — add the Bearer token check to `hooks.server.ts` before building any endpoints. This gates everything behind a single check.

2. **Start with one table endpoint** as a template (e.g., `/api/debug/flights/+server.ts`) to establish the pattern: token validation (already in hooks), query param parsing, Drizzle query building, JSON response with metadata. Then replicate for remaining tables.

3. **Build UI mirrors by extracting load logic** — the homepage and flight detail load functions have inline data fetching. Consider extracting these into reusable functions in `$lib/server/` so both the page loads and debug endpoints can call them.

4. **Raw SQL endpoint last** — it's the highest-risk piece. Build it after the structured endpoints are proven.

5. **Add `DEBUG_API_TOKEN` to `.env.example`** with a comment.

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
