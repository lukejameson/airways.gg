import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const domain = env.DOMAIN || 'delays.gg';
  return {
    theme: locals.theme || 'light',
    siteUrl: `https://${domain}`,
    // Read via dynamic/private because the .env lives at monorepo root and is
    // loaded by hooks.server.ts (dotenv) — Vite never sees it as PUBLIC_ vars.
    buyMeACoffeeUrl: env.PUBLIC_BUY_ME_A_COFFEE_URL || null,
    umamiWebsiteId: env.PUBLIC_UMAMI_WEBSITE_ID || null,
    umamiUrl: env.PUBLIC_UMAMI_URL || null,
  };
};