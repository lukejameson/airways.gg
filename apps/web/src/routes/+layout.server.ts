import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';
import { db, airports } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
  const domain = env.DOMAIN || 'delays.gg';
  
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
    buyMeACoffeeUrl: env.PUBLIC_BUY_ME_A_COFFEE_URL || null,
    umamiWebsiteId: env.PUBLIC_UMAMI_WEBSITE_ID || null,
    umamiUrl: env.PUBLIC_UMAMI_URL || null,
    airports: airportsMap,
  };
};