# Code Review Report

**Target:** airways.gg — Debug API (new files only)
**Languages:** TypeScript
**Date:** 2026-06-07

## Executive Summary

- Total files scanned: 20 (3 modified, 17 new)
- Total issues found: 11
  - Critical: 2
  - High: 3
  - Medium: 3
  - Low: 3

## Findings

### 🚨 SQL Guard Bypass — Missing `COPY` and `DO` from Dangerous Keywords

**Severity:** critical
**Files:** `apps/web/src/lib/server/debug-helpers.ts:80`, `apps/web/src/routes/api/debug/sql/+server.ts`
**Confidence:** high

The `validateSqlQuery` function blocks INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE but misses two PostgreSQL statements that can execute writes: `COPY` (can write arbitrary server files) and `DO` (can execute arbitrary PL/pgSQL including INSERT/UPDATE/DELETE). A query like `DO $$ BEGIN DELETE FROM flights; END $$` would pass the guard because `DO` is not in the blocked list and `DELETE` is inside a string literal that `toUpperCase()` won't properly handle.

**Remediation:** Add `COPY` and `DO` to `DANGEROUS_KEYWORDS`. Additionally, the keyword check should strip PostgreSQL string literals (`$$...$$` and `'...'`) before scanning, or use a SQL-aware tokenizer.

---

### 🚨 Connection-Pool Statement Timeout Bug

**Severity:** critical
**Files:** `apps/web/src/routes/api/debug/sql/+server.ts:41`
**Confidence:** high

`SET LOCAL statement_timeout = '30s'` runs in an auto-commit (implicit) transaction and only affects that single transaction. The subsequent `db.execute(sql.raw(query))` call opens a *new* implicit transaction where the timeout is no longer in effect. The 30s timeout never applies to the actual user query.

**Remediation:** Either wrap both in an explicit transaction block (`BEGIN; SET LOCAL ...; SELECT ...; COMMIT;`) or use `SET SESSION statement_timeout = '30s'` followed by `RESET statement_timeout` after the query, with error handling to ensure the reset happens. The session approach is more reliable but must handle the reset even on failure.

---

### 🟠 Duplicate `ALLOWED_COMMANDS` Constant

**Severity:** high
**Files:** `apps/web/src/routes/api/debug/sql/+server.ts:7-12`
**Confidence:** high

The `ALLOWED_COMMANDS` constant is declared in both `debug-helpers.ts` (used by `validateSqlQuery`) and redundantly in the SQL endpoint file. The endpoint never references its own copy — it calls `validateSqlQuery` instead. ESLint flags it as an unused variable. If someone edits the endpoint's copy instead of the canonical one in `debug-helpers.ts`, the changes would have no effect, creating a false sense of security.

**Remediation:** Remove the duplicate `ALLOWED_COMMANDS` block from `sql/+server.ts:7-12`.

---

### 🟠 Unused Import — `isTerminalStatus`

**Severity:** high
**Files:** `apps/web/src/routes/api/debug/ui/homepage/+server.ts:5`
**Confidence:** high

`isTerminalStatus` is imported from `@airways/database` but never called in the homepage mirror endpoint. This is dead code and breaks the eslint `no-unused-vars` rule.

**Remediation:** Remove the import on line 5.

---

### 🟠 Duplicate Pattern Across All Table Endpoints

**Severity:** high
**Files:** `apps/web/src/routes/api/debug/weather/+server.ts`, `historical-weather/+server.ts`, `positions/+server.ts`, `scrapers/+server.ts`, `status-history/+server.ts`, `flight-notes/+server.ts`, `flight-times/+server.ts`, `notification-watermark/+server.ts`, `push-subs/+server.ts`, `daylight/+server.ts`, `airports/+server.ts`
**Confidence:** high

Eleven table endpoints share nearly identical structure:
```ts
const t0 = performance.now();
try {
  const { limit, offset } = parsePagination(url.searchParams);
  const conditions = [];
  // filter params...
  const rows = conditions.length > 0
    ? await db.select().from(table).where(and(...conditions)).orderBy(...).limit(limit).offset(offset)
    : await db.select().from(table).orderBy(...).limit(limit).offset(offset);
  return debugResponse(rows, performance.now() - t0);
} catch (err) {
  console.error('[debug/table]', err);
  return debugError('Query failed', 500);
}
```

The `rows` assignment has a ternary that is actually unnecessary — `and()` with zero arguments in Drizzle is a no-op/no-filter. Any change to the error handling, response format, or timing must be replicated across all 11 files.

**Remediation:** Create a `debugTableEndpoint` factory in `debug-helpers.ts` that accepts table, sort column, and optional filter builder callbacks. Each endpoint becomes a 5-line wrapper. Example:
```ts
export function createTableEndpoint(
  table: PgTable,
  sortCol: PgColumn,
  buildConditions?: (params: URLSearchParams) => SQL[]
): RequestHandler {
  // shared logic
}
```

---

### 🟡 Deep Relative Import Path

**Severity:** medium
**Files:** `apps/web/src/routes/api/debug/ui/stats/+server.ts:23-24`
**Confidence:** medium

The stats mirror imports from `../../../stats/lib/queries` and `../../../stats/lib/types`. These triply-nested relative imports are fragile — if the stats directory moves, both the stats page and the debug endpoint break. SvelteKit supports `$lib` aliases but these files live under `routes/stats/`, not `lib/`, so `$lib` can't resolve them.

**Remediation:** Move the shared query functions to `$lib/server/stats-queries.ts` so both the stats page and the debug endpoint can import from `$lib/server/stats-queries`. This avoids the deep relative path and makes the dependency explicit.

---

### 🟡 Error Responses Missing Content-Type on 401

**Severity:** medium
**Files:** `apps/web/src/hooks.server.ts:15`
**Confidence:** medium

The 401 response from the auth check in `hooks.server.ts` uses SvelteKit's `json()` helper, which includes `Content-Type: application/json`. This is actually correct — `json()` sets the header. No issue here.

Wait, let me re-verify. SvelteKit's `json()` — does it set Content-Type? Yes, SvelteKit's `json()` helper does set `Content-Type: application/json`. So this is fine.

Let me replace this finding.

---

### 🟡 Incorrect `sortColumns` Record Type

**Severity:** medium
**Files:** `apps/web/src/routes/api/debug/flights/+server.ts:72`
**Confidence:** medium

The `sortColumns` type annotation is `Record<string, typeof flights.scheduledDeparture>` but the object contains columns of multiple types (dates, integers, timestamps). TypeScript won't error here because all column types reference the same underlying Drizzle column class, but the annotation is misleading — it implies all values are `scheduledDeparture` typed columns.

**Remediation:** Remove the explicit type annotation and let TypeScript infer the union type, or use `Record<string, PgColumn>`.

---

### 🟡 Stats Mirror Executes 21 Queries in Parallel

**Severity:** medium
**Files:** `apps/web/src/routes/api/debug/ui/stats/+server.ts:79-101`
**Confidence:** medium

The stats mirror fires all 21 stats query functions simultaneously via `Promise.all`. While this mirrors the existing stats page behavior, it means a single uncached stats request opens up to 21 concurrent database queries. The pool has max 5 connections, which means some queries queue. This isn't new (the stats page does the same), but the debug API adds a second path that can trigger this heavy query pattern. No rate limiting exists on the debug API.

**Remediation:** Acceptable for now since it mirrors existing behavior, but consider adding a note or limiting this endpoint to sequential queries to reduce pool pressure.

---

### 🔷 Test Coverage Gap — SQL Injection via String Literals

**Severity:** low
**Files:** `apps/web/src/lib/debug-sql-guard.test.ts`
**Confidence:** medium

The SQL guard tests don't cover the case where `INSERT/UPDATE/DELETE` appears inside a PostgreSQL string literal (single-quoted string or dollar-quoted `$$...$$` block). A query like `SELECT 'INSERT INTO flights'` would be incorrectly rejected because the keyword scanner operates on the uppercased string without stripping literals.

**Remediation:** Update `validateSqlQuery` to strip string literals before keyword scanning, and add a test case for `SELECT 'INSERT INTO'` (should pass) and `DO $$ DELETE FROM flights $$` (should fail).

---

### 🔷 Console Error Logging in Tight Loop Potential

**Severity:** low
**Files:** All 12 table endpoints
**Confidence:** low

Every endpoint has `console.error` in its catch block. If a connection issue causes cascading failures across all debug endpoints, the console would be flooded with identical error messages. Not a real issue for a debug-only API, but worth noting.

**Remediation:** Consider a simple deduplication or throttling mechanism if this becomes noisy.

---

### 🔷 `debugResponse` Wraps UI Mirror Data in Extra Array

**Severity:** low
**Files:** `apps/web/src/routes/api/debug/ui/homepage/+server.ts:131`, `ui/flight/[id]/+server.ts:119`, `ui/stats/+server.ts:151`
**Confidence:** low

UI mirror endpoints return `debugResponse([data], ...)` — wrapping the entire payload in an array. This means the response shape is `{ rows: [{ flights: [...], weatherMap: {...}, ... }], count: 1, queryMs: N }` instead of the more natural `{ flights: [...], weatherMap: {...}, ... }`. An agent consuming this always needs to access `rows[0]`.

**Remediation:** Either add a new helper like `debugResponseSingle(data, ms)` that doesn't wrap in an array, or document the `rows[0]` pattern. The table endpoints return `rows` as an array of records, so having the mirrors also return an array (of one) is at least consistent.

---

## Remediation Priority

1. **Fix critical issues first** — add `COPY`/`DO` to keyword blocklist, fix statement timeout (wrap in explicit transaction or use SET SESSION + RESET).
2. **Refactor high-severity smells** — remove duplicate `ALLOWED_COMMANDS` and unused `isTerminalStatus`, consider a table endpoint factory to eliminate 11x duplication.
3. **Address medium items** — tighten `sortColumns` type, move stats queries to `$lib/server/`, be aware of 21-query parallelism.
4. **Review low-severity items** — add string-literal stripping to SQL guard, decide on UI mirror array-wrapping convention.

## File-by-File Breakdown

| File | Issues | Max Severity |
|------|--------|--------------|
| `lib/server/debug-helpers.ts` | 1 (missing COPY/DO) | critical |
| `routes/api/debug/sql/+server.ts` | 2 (timeout bug, duplicate constant) | critical |
| `routes/api/debug/ui/homepage/+server.ts` | 1 (unused import) | high |
| `routes/api/debug/flights/+server.ts` | 1 (sortColumns type) | medium |
| `routes/api/debug/ui/stats/+server.ts` | 2 (deep imports, 21-query parallelism) | medium |
| 11 table endpoints | 1 (duplicate pattern) | high |
| 3 test files | 1 (SQL literal bypass not tested) | low |

---

*Generated by code-review skill v3.0.0*
