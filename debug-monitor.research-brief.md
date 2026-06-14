# Research Brief: Health Monitor Service (debug-monitor)

**Date:** 2026-06-14
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Build a 24/7 health monitoring service (`apps/health-monitor`) that runs SQL-based integrity checks against the airways.gg database every hour, sends the aggregated results through DeepSeek V4 Flash every 2 hours for cross-signal correlation, and reports findings as a structured Telegram summary.

## Context

airways.gg is a flight tracking platform for Guernsey Airport (GCI). It runs 6 services (guernsey-scraper, fr24-scraper, adsb-service, position-service, weather-service, notification-service) plus a SvelteKit web app, all backed by PostgreSQL. The database has 12 tables covering flights, flight_times, flight_notes, status_history, scraper_logs, weather_data, aircraft_positions, push_subscriptions, notification_watermark, airports, daylight, and historical_weather.

The app already has 15 debug API endpoints (`/api/debug/*`) that expose read-only database queries, a `@airways/telegram` package with debounced `sendAlert()` (5-min cooldown per message key), and all services follow a consistent pattern: `loadEnv` → `main()` → `setInterval`/`setTimeout` loop → error handler with telegram alerts.

Currently no service monitors cross-cutting health — each service only alerts on its own failures. A guernsey-scraper outage combined with a weather gap and position gap (all caused by a shared DB or network issue) would produce 3 separate alerts with no correlation.

## Alternatives Considered

### Option A: Direct DB Service with Two-Tier Checks (Recommended)

- **Description:** New `apps/health-monitor` service connecting directly to PostgreSQL (same `@airways/database` package as all other services). Tier 1 runs 14+ parameterized SQL checks every hour. Tier 2 feeds check results + sample rows to DeepSeek V4 Flash every 2 hours for cross-signal correlation. Findings from both tiers aggregate into one structured Telegram message per cycle (silent when healthy).
- **Pros:** Matches existing service architecture exactly; no new infrastructure; full access to aggregate queries not available via debug API; same env/config pattern as other services.
- **Cons:** Another long-running container; direct DB access means careful read-only query design.
- **Best for:** Production monitoring with minimal overhead and maximum query flexibility.

### Option B: HTTP Consumer Calling Debug API

- **Description:** Service hits existing `/api/debug/*` endpoints via HTTP instead of direct DB.
- **Pros:** No DB connection management; reuses existing debug endpoints.
- **Cons:** Debug API lacks aggregate queries (e.g., "count scraper failures in last 6 hours by service"); would need new debug endpoints anyway; adds HTTP auth and latency; debug API isn't designed for internal service consumption.
- **Best for:** Quick prototyping before committing to Option A.

### Option C: DB-Only Without LLM

- **Description:** Only static SQL checks, no LLM tier.
- **Pros:** Zero API costs; simpler codebase.
- **Cons:** Can't detect multi-signal patterns (e.g., "3 scrapers + weather + position all failed within the same 10-minute window → possible network outage"); misses the primary value of the LLM tier.
- **Best for:** If LLM API access becomes unavailable or cost becomes a concern (though at $0.28/month it's negligible).

## Recommendation

**Option A — Direct DB with two-tier checks.** The LLM tier is the differentiator: static SQL checks alone would only tell you "weather service last ran 127 minutes ago" and "FR24 scraper had 4 failures in 6 hours" as separate facts. The LLM cross-references them and spots that both problems started at the same time, pointing to a shared root cause (e.g., network partition). At $0.28/month for the LLM API, there is no cost argument against it.

All services already use `@airways/database` and `@airways/telegram` — the health monitor is just another consumer of these packages, following the same patterns. No new infrastructure or architectural decisions needed.

## Key Findings

- **Existing debug endpoints** cover all tables but return raw rows with pagination — they lack the aggregate queries needed for health checks. Direct DB access is the right approach.
- **`@airways/telegram` sendAlert** already debounces by `service:message_prefix` with a 5-min cooldown. The health monitor should use a distinct service key (`health-monitor`) to avoid collision with existing service alerts. The structured summary format (one message per cycle) fits naturally — the debounce key can be the cycle timestamp or a rolling hash of findings.
- **DeepSeek V4 Flash pricing** (official): $0.14/M input tokens (cache miss), $0.28/M output tokens. At an estimated 2,000–4,000 input tokens and 400–800 output tokens per LLM check, 12 checks/day costs ~$0.0094/day or ~$0.28/month. Cache hits on the system prompt portion drop this further to negligible.
- **Service pattern** across all existing services is consistent: `loadEnv({ serviceName, startDir: __dirname })` → `main()` with `setInterval`/`setTimeout` loops → `process.on('uncaughtException')` → `sendAlert('service-name', 'critical', ...)`. The health monitor can follow this exactly, with the addition of a cron-style scheduler for the two tiers.
- **Guernsey timezone** (`Europe/London`) is already handled by `@airways/common` via `GY_TZ`, `guernseyHour`, etc. — the monitor can log in Guernsey local time for consistency.
- **Scraper intervals** are defined in `@airways/common/config.ts` (`INTERVALS`), making staleness thresholds configurable and referenceable.

## Open Questions

- Should the health monitor also check the web app's health (HTTP 200 on `/` or `/api/health/timezone`), or stay DB-only?
- Should failing static checks automatically trigger an immediate LLM check (bypassing the 2-hour schedule), or always wait for the next cycle?
- What's the exact Telegram chat to send to — the same `TELEGRAM_CHAT_ID` used by other services, or a separate ops channel?
- Should the monitor expose its own health endpoint (e.g., for Uptime Robot to ping)?

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| DB load from hourly aggregate queries | low | All checks use indexed columns; each check is a single query; total query time < 2s expected |
| LLM hallucinates false correlations | medium | System prompt instructs it to be conservative and flag uncertain findings as "low confidence"; static checks remain the source of truth for alerting |
| Telegram rate limiting | low | Already handled by sendAlert debouncing; structured summary is one message per cycle |
| Monitor itself crashes silently | medium | Add an Uptime Robot heartbeat ping; or have the notification service watchdog the monitor's `scraper_logs` entry (if we log monitor cycles there) |
| Token estimate is wrong for real data | low | Even 10× the estimate is $2.80/month — still negligible; add token usage logging to track actuals |

## Implementation Hints

1. **Scaffold `apps/health-monitor/`** — copy the `guernsey-scraper` package.json/tsconfig.json pattern, depend on `@airways/common`, `@airways/database`, `@airways/telegram`.
2. **Health check module** (`src/checks.ts`) — one exported function per check category, each returning `{ name, passed, value, threshold, samples? }[]`.
3. **LLM module** (`src/llm.ts`) — formats check results as the prompt, calls DeepSeek API, parses the correlated-issues JSON response.
4. **Scheduler** (`src/index.ts`) — `setInterval` for Tier 1 (hourly), check if current hour % 2 === 0 for Tier 2. Both tiers feed into a single `report()` function that builds the Telegram message.
5. **Telegram formatting** — use the existing `sendAlert` function with a cycle-key debounce. For structured summaries, a single Markdown message with sections per category, emoji indicators (✅/⚠️/🔴), and LLM correlation findings at the top.
6. **Docker** — add to `docker-compose.prod.yml` alongside other services. Needs same `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, plus `DEEPSEEK_API_KEY`.

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
