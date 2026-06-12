import type { RequestHandler } from './$types';
import { db, scraperLogs } from '$lib/server/db';
import { debugResponse, debugError, parsePagination } from '$lib/server/debug-helpers';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const { limit, offset } = parsePagination(url.searchParams);
    const conditions = [];

    const service = url.searchParams.get('service');
    if (service) conditions.push(eq(scraperLogs.service, service));

    const statusParam = url.searchParams.get('status');
    if (statusParam) conditions.push(eq(scraperLogs.status, statusParam));

    const from = url.searchParams.get('from');
    if (from) conditions.push(gte(scraperLogs.startedAt, new Date(from)));
    const to = url.searchParams.get('to');
    if (to) conditions.push(lte(scraperLogs.startedAt, new Date(to)));

    const sortOrder = url.searchParams.get('order') === 'asc' ? asc : desc;

    const rows = conditions.length > 0
      ? await db.select().from(scraperLogs).where(and(...conditions)).orderBy(sortOrder(scraperLogs.startedAt)).limit(limit).offset(offset)
      : await db.select().from(scraperLogs).orderBy(sortOrder(scraperLogs.startedAt)).limit(limit).offset(offset);

    return debugResponse(rows, performance.now() - t0);
  } catch (err) {
    console.error('[debug/scrapers]', err);
    return debugError('Query failed', 500);
  }
};
