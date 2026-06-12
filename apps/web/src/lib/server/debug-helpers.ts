/**
 * Shared helpers for /api/debug/* endpoints.
 * Server-only — never imported client-side.
 */

/**
 * Structured JSON response with metadata.
 * Every debug endpoint wraps its data in this shape.
 */
export function debugResponse(
  rows: unknown[],
  queryMs: number,
): Response {
  return new Response(
    JSON.stringify({
      rows,
      count: rows.length,
      queryMs: Math.round(queryMs),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  );
}

/**
 * Error response for client errors (bad params, auth failures).
 */
export function debugError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  );
}

/**
 * Parse and clamp pagination params from URL search params.
 * Returns { limit, offset } with enforced caps.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { defaultLimit?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const defaultLimit = defaults.defaultLimit ?? 100;
  const maxLimit = defaults.maxLimit ?? 1000;

  const rawLimit = parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Math.max(1, isNaN(rawLimit) ? defaultLimit : rawLimit),
    maxLimit,
  );
  const rawOffset = parseInt(searchParams.get('offset') ?? '', 10);
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  return { limit, offset };
}

/** SQL commands allowed by the debug SQL endpoint */
const ALLOWED_COMMANDS = new Set(['SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'WITH']);

/** Keywords that are blocked even inside otherwise-allowed statements */
const DANGEROUS_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE'];

/**
 * Validate a SQL query string for the debug endpoint.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateSqlQuery(query: string): { valid: true } | { valid: false; error: string } {
  const firstToken = query.split(/\s+/)[0]?.toUpperCase() ?? '';
  if (!ALLOWED_COMMANDS.has(firstToken)) {
    return { valid: false, error: `Statement type "${firstToken}" not allowed. Only SELECT, EXPLAIN, SHOW, DESCRIBE, and WITH are permitted.` };
  }

  const upperQuery = query.toUpperCase();
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(upperQuery)) {
      return { valid: false, error: `Dangerous keyword "${keyword}" detected in query. Only read-only statements are allowed.` };
    }
  }

  return { valid: true };
}

/**
 * Validate a Bearer token for the debug API.
 * Returns true if the Authorization header matches the expected token.
 */
export function validateDebugToken(
  authHeader: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !authHeader) return false;
  return authHeader === `Bearer ${expectedToken}`;
}
