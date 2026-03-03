import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';
import { db, airports } from '$lib/server/db';

const AIRPORTS_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface AirportCache {
  data: Record<string, {
    iataCode: string;
    icaoCode: string | null;
    name: string;
    displayName: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  }>;
  expiresAt: number;
}

let airportsCache: AirportCache | null = null;

async function getCachedAirports(): Promise<AirportCache['data']> {
  if (airportsCache && Date.now() < airportsCache.expiresAt) return airportsCache.data;
  const rows = await db
    .select({
      iataCode: airports.iataCode,
      icaoCode: airports.icaoCode,
      name: airports.name,
      city: airports.city,
      latitude: airports.latitude,
      longitude: airports.longitude,
    })
    .from(airports);
  const data = Object.fromEntries(rows.map(a => [a.iataCode, a]));
  airportsCache = { data, expiresAt: Date.now() + AIRPORTS_TTL_MS };
  return data;
}

export const load: LayoutServerLoad = async (_) => {
  const domain = env.DOMAIN || 'airways.gg';

  const airportsMap = await getCachedAirports();

  return {
    siteUrl: `https://${domain}`,
    buyMeACoffeeUrl: publicEnv.PUBLIC_BUY_ME_A_COFFEE_URL || null,
    umamiWebsiteId: publicEnv.PUBLIC_UMAMI_WEBSITE_ID || null,
    umamiUrl: publicEnv.PUBLIC_UMAMI_URL || null,
    airports: airportsMap,
  };
};
