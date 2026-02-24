import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const domain = env.DOMAIN || 'delays.gg';
  return {
    theme: locals.theme || 'light',
    siteUrl: `https://${domain}`,
  };
};