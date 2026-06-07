import type { RequestHandler } from './$types';
import { localToUtc } from '@airways/database';

/**
 * Health check: verifies the timezone offset detection used by localToUtc
 * produces correct UTC values for Europe/London during the current season.
 *
 * Expected:
 *   BST (summer): localToUtc('2026-06-15', 10, 30) → 2026-06-15T09:30:00.000Z
 *   GMT (winter): localToUtc('2026-01-15', 10, 30) → 2026-01-15T10:30:00.000Z
 */
export const GET: RequestHandler = async () => {
  const bstTest = localToUtc('2026-06-15', 10, 30);
  const bstOk = bstTest.toISOString() === '2026-06-15T09:30:00.000Z';

  const gmtTest = localToUtc('2026-01-15', 10, 30);
  const gmtOk = gmtTest.toISOString() === '2026-01-15T10:30:00.000Z';

  const ok = bstOk && gmtOk;

  return new Response(JSON.stringify({
    status: ok ? 'ok' : 'degraded',
    bst: { test: '2026-06-15T10:30 Europe/London', expected: '2026-06-15T09:30:00.000Z', actual: bstTest.toISOString(), pass: bstOk },
    gmt: { test: '2026-01-15T10:30 Europe/London', expected: '2026-01-15T10:30:00.000Z', actual: gmtTest.toISOString(), pass: gmtOk },
    checkedAt: new Date().toISOString(),
  }), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
