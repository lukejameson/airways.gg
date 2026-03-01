import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';
import { db, airports } from '$lib/server/db';

export const load: LayoutServerLoad = async (_) => {
  const domain = env.DOMAIN || 'airways.gg';
  
  const airportRows = await db
    .select({
      iataCode: airports.iataCode,
      icaoCode: airports.icaoCode,
      name: airports.name,
      displayName: airports.displayName,
      city: airports.city,
      latitude: airports.latitude,
      longitude: airports.longitude,
    })
    .from(airports);

  const airportsMap = Object.fromEntries(
    airportRows.map(a => [a.iataCode, a])
  );

  return {
    siteUrl: `https://${domain}`,
    buyMeACoffeeUrl: publicEnv.PUBLIC_BUY_ME_A_COFFEE_URL || null,
    umamiWebsiteId: publicEnv.PUBLIC_UMAMI_WEBSITE_ID || null,
    umamiUrl: publicEnv.PUBLIC_UMAMI_URL || null,
    airports: airportsMap,
  };
};