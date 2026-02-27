import type { RequestHandler } from '@sveltejs/kit';
import { db, flights } from '$lib/server/db';
import { desc, gte } from 'drizzle-orm';

const SITE_URL = 'https://airways.gg';

// Cache the sitemap for 1 hour to avoid a DB query on every bot crawl
let cachedSitemap: string | null = null;
let cacheExpiry = 0;

export const GET: RequestHandler = async () => {
  const now = Date.now();

  if (!cachedSitemap || now > cacheExpiry) {
    // Fetch the most recent 500 unique flight IDs for the sitemap
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30); // Last 30 days

    const recentFlights = await db
      .select({ id: flights.id, scheduledDeparture: flights.scheduledDeparture })
      .from(flights)
      .where(gte(flights.scheduledDeparture, cutoff))
      .orderBy(desc(flights.scheduledDeparture))
      .limit(500);

    const flightUrls = recentFlights
      .map(
        f => `
  <url>
    <loc>${SITE_URL}/flights/${f.id}</loc>
    <lastmod>${f.scheduledDeparture.toISOString().split('T')[0]}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.7</priority>
  </url>`,
      )
      .join('');

    cachedSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/search</loc>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
  </url>${flightUrls}
</urlset>`;

    cacheExpiry = now + 60 * 60 * 1000; // 1 hour
  }

  return new Response(cachedSitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
