import { describe, it, expect } from 'vitest';
import { debugResponse, debugError, parsePagination, validateSqlQuery, validateDebugToken } from './server/debug-helpers';

// ============================================================================
// debugResponse
// ============================================================================
describe('debugResponse', () => {
  it('should return 200 with rows, count, and queryMs', async () => {
    const rows = [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }];
    const res = debugResponse(rows, 42.7);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.rows).toEqual(rows);
    expect(body.count).toBe(2);
    expect(body.queryMs).toBe(43); // Math.round(42.7)
  });

  it('should return count=0 and queryMs=0 for empty array with zero ms', async () => {
    const res = debugResponse([], 0);
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.queryMs).toBe(0);
  });

  it('should round queryMs to nearest integer', async () => {
    const res = debugResponse([], 12.3);
    const body = await res.json();
    expect(body.queryMs).toBe(12);
  });
});

// ============================================================================
// debugError
// ============================================================================
describe('debugError', () => {
  it('should return default 400 with error message', async () => {
    const res = debugError('Something went wrong');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Something went wrong');
  });

  it('should return custom status code', async () => {
    const res = debugError('Not found', 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('should return 401 for auth errors', async () => {
    const res = debugError('Unauthorized', 401);
    expect(res.status).toBe(401);
  });

  it('should return 403 for forbidden errors', async () => {
    const res = debugError('Forbidden', 403);
    expect(res.status).toBe(403);
  });

  it('should return 500 for server errors', async () => {
    const res = debugError('Internal error', 500);
    expect(res.status).toBe(500);
  });

  it('should set no-store cache header', () => {
    const res = debugError('test');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('should set JSON content type', () => {
    const res = debugError('test');
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('should handle empty error message', async () => {
    const res = debugError('');
    const body = await res.json();
    expect(body.error).toBe('');
  });
});

// ============================================================================
// parsePagination — edge cases beyond existing tests
// ============================================================================
describe('parsePagination — extended edge cases', () => {
  it('should handle float limit by truncating via parseInt', () => {
    const params = new URLSearchParams('limit=50.7');
    expect(parsePagination(params).limit).toBe(50);
  });

  it('should reject overly large limit with custom max', () => {
    const params = new URLSearchParams('limit=9999');
    expect(parsePagination(params, { maxLimit: 500 }).limit).toBe(500);
  });

  it('should accept limit equal to max', () => {
    const params = new URLSearchParams('limit=1000');
    expect(parsePagination(params).limit).toBe(1000);
  });

  it('should handle limit just above max', () => {
    const params = new URLSearchParams('limit=1001');
    expect(parsePagination(params).limit).toBe(1000);
  });

  it('should handle offset as float', () => {
    const params = new URLSearchParams('offset=10.9');
    expect(parsePagination(params).offset).toBe(10);
  });

  it('should handle empty string params gracefully', () => {
    const params = new URLSearchParams('limit=&offset=');
    const { limit, offset } = parsePagination(params);
    expect(limit).toBe(100);
    expect(offset).toBe(0);
  });

  it('should handle whitespace-only params', () => {
    const params = new URLSearchParams();
    params.set('limit', '  ');
    expect(parsePagination(params).limit).toBe(100);
  });
});

// ============================================================================
// validateSqlQuery — critical bypass cases from code review
// ============================================================================
describe('validateSqlQuery — bypass and edge cases', () => {
  // ── Critical: COPY and DO bypasses ──
  it('should reject COPY statement (caught by first-token check)', () => {
    const result = validateSqlQuery("COPY flights TO '/tmp/dump.csv'");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('COPY');
  });

  it('should reject DO block (caught by first-token check, not keyword scanner)', () => {
    // DO is not in ALLOWED_COMMANDS, so it fails before the keyword scanner runs
    const result = validateSqlQuery("DO $$ BEGIN DELETE FROM flights; END $$");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('DO');
  });

  it('should reject DO block with INSERT (caught by first-token check)', () => {
    const result = validateSqlQuery("DO $$ BEGIN INSERT INTO flights DEFAULT VALUES; END $$");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('DO');
  });

  // ── String literal edge cases ──
  it('should handle quoted keywords (currently rejects — known limitation)', () => {
    // Known: SELECT 'INSERT INTO flights' is legit SELECT but INSERT appears
    // in the uppercased string. The current implementation rejects it.
    const result = validateSqlQuery("SELECT 'INSERT INTO flights' AS msg");
    // Document current behavior: keyword scanner catches it in the literal
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('INSERT');
  });

  it('should reject dollar-quoted DELETE', () => {
    const result = validateSqlQuery("SELECT $$DELETE FROM flights$$ AS msg");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('DELETE');
  });

  // ── Leading whitespace ──
  it('should handle leading whitespace by trimming (currently rejects — known limitation)', () => {
    // Current behavior: empty string split by whitespace yields '' as first token,
    // which is not in ALLOWED_COMMANDS. Code could be improved by trimming first.
    const leadingSpace = validateSqlQuery('   SELECT * FROM flights');
    expect(leadingSpace.valid).toBe(false);

    const leadingNewline = validateSqlQuery('\nSELECT * FROM flights');
    expect(leadingNewline.valid).toBe(false);

    const leadingTab = validateSqlQuery('\tSELECT * FROM flights');
    expect(leadingTab.valid).toBe(false);
  });

  // ── Trailing content ──
  it('should reject SELECT with trailing INSERT', () => {
    const result = validateSqlQuery("SELECT * FROM flights; INSERT INTO flights VALUES (1)");
    expect(result.valid).toBe(false);
  });

  // ── Case sensitivity ──
  it('should reject lowercase insert', () => {
    const result = validateSqlQuery('insert into flights values (1)');
    expect(result.valid).toBe(false);
  });

  it('should reject MiXeD cAsE delete', () => {
    const result = validateSqlQuery('DeLeTe FROM flights');
    expect(result.valid).toBe(false);
  });

  // ── EXPLAIN variants ──
  it('should allow EXPLAIN ANALYZE', () => {
    expect(validateSqlQuery('EXPLAIN ANALYZE SELECT * FROM flights')).toEqual({ valid: true });
  });

  it('should allow EXPLAIN (FORMAT JSON)', () => {
    expect(validateSqlQuery('EXPLAIN (FORMAT JSON) SELECT * FROM flights')).toEqual({ valid: true });
  });

  // ── WITH / CTE variants ──
  it('should allow WITH RECURSIVE', () => {
    expect(validateSqlQuery('WITH RECURSIVE cte AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM cte WHERE n < 10) SELECT * FROM cte')).toEqual({ valid: true });
  });

  it('should allow WITH with multiple CTEs', () => {
    expect(validateSqlQuery('WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b')).toEqual({ valid: true });
  });

  // ── SHOW variants ──
  it('should allow SHOW ALL', () => {
    expect(validateSqlQuery('SHOW ALL')).toEqual({ valid: true });
  });

  it('should allow SHOW search_path', () => {
    expect(validateSqlQuery('SHOW search_path')).toEqual({ valid: true });
  });

  // ── Rejected: SET (can alter session state) ──
  it('should reject SET statement', () => {
    const result = validateSqlQuery('SET statement_timeout = 1000');
    expect(result.valid).toBe(false);
  });

  // ── Rejected: VACUUM, REINDEX, ANALYZE ──
  it('should reject VACUUM', () => {
    const result = validateSqlQuery('VACUUM flights');
    expect(result.valid).toBe(false);
  });

  it('should reject REINDEX', () => {
    const result = validateSqlQuery('REINDEX TABLE flights');
    expect(result.valid).toBe(false);
  });

  // ── Null/undefined (runtime type errors) ──
  it('should throw on null input', () => {
    // @ts-expect-error testing runtime null
    expect(() => validateSqlQuery(null)).toThrow();
  });

  it('should throw on undefined input', () => {
    // @ts-expect-error testing runtime undefined
    expect(() => validateSqlQuery(undefined)).toThrow();
  });

  // ── Complex queries ──
  it('should allow SELECT with subquery', () => {
    expect(validateSqlQuery(
      'SELECT * FROM (SELECT flight_number, MAX(delay_minutes) FROM flights GROUP BY flight_number) AS sub WHERE flight_number LIKE \'GR%\'',
    )).toEqual({ valid: true });
  });

  it('should allow SELECT with window function', () => {
    expect(validateSqlQuery(
      'SELECT flight_number, delay_minutes, RANK() OVER (PARTITION BY flight_date ORDER BY delay_minutes DESC) FROM flights',
    )).toEqual({ valid: true });
  });

  it('should allow SELECT with UNION', () => {
    expect(validateSqlQuery(
      'SELECT flight_number FROM flights WHERE flight_date = \'2026-01-01\' UNION SELECT flight_number FROM flights WHERE flight_date = \'2026-01-02\'',
    )).toEqual({ valid: true });
  });
});

// ============================================================================
// validateDebugToken — extended edge cases
// ============================================================================
describe('validateDebugToken — extended edge cases', () => {
  const token = 'secret-debug-token';

  it('should return false when expectedToken is an empty string', () => {
    expect(validateDebugToken('Bearer some-token', '')).toBe(false);
  });

  it('should return false when authHeader is an empty string', () => {
    expect(validateDebugToken('', token)).toBe(false);
  });

  it('should return false when both are empty strings', () => {
    expect(validateDebugToken('', '')).toBe(false);
  });

  it('should return false for Bearer with lowercase b', () => {
    expect(validateDebugToken('bearer secret-debug-token', token)).toBe(false);
  });

  it('should return false for token with extra text after', () => {
    expect(validateDebugToken('Bearer secret-debug-token extra', token)).toBe(false);
  });

  it('should return true for token containing hyphens', () => {
    const hyphenToken = 'my-token-with-hyphens-123';
    expect(validateDebugToken(`Bearer ${hyphenToken}`, hyphenToken)).toBe(true);
  });

  it('should return true for long tokens', () => {
    const longToken = 'a'.repeat(200);
    expect(validateDebugToken(`Bearer ${longToken}`, longToken)).toBe(true);
  });
});
