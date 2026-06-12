import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { debugResponse, debugError, validateSqlQuery } from '$lib/server/debug-helpers';
import { sql } from 'drizzle-orm';

/**
 * POST /api/debug/sql
 * Body: { "sql": "SELECT * FROM flights LIMIT 10" }
 *
 * Only SELECT, EXPLAIN, SHOW, DESCRIBE, and WITH (CTE) are allowed.
 * All other statements are rejected with 403.
 * Queries have a 30-second timeout via statement_timeout.
 */
export const POST: RequestHandler = async ({ request }) => {
  const t0 = performance.now();
  try {
    const body = await request.json() as { sql?: string };
    const query = body.sql?.trim();

    if (!query) return debugError('Missing "sql" field in request body', 400);

    // Validate query (SELECT-only, no dangerous keywords)
    const validation = validateSqlQuery(query);
    if (!validation.valid) {
      return debugError(validation.error, 403);
    }

    // Get the underlying pg pool for raw SQL execution
    const d = getDb();

    // Set session-level timeout for this query only, then reset
    await d.execute(sql`SET SESSION statement_timeout = '30s'`);

    let result;
    try {
      result = await d.execute(sql`${sql.raw(query)}`);
    } finally {
      await d.execute(sql`RESET statement_timeout`);
    }

    const queryMs = performance.now() - t0;

    // Log query for audit
    const truncated = query.length > 200 ? query.substring(0, 200) + '...' : query;
    console.log(`[debug/sql] ${queryMs}ms | rows=${result.rows.length} | ${truncated}`);

    return debugResponse(result.rows, queryMs);
  } catch (err) {
    const queryMs = performance.now() - t0;
    const message = err instanceof Error ? err.message : 'Query failed';
    console.error(`[debug/sql] ERROR ${queryMs}ms | ${message}`);
    return debugError(message, 500);
  }
};
