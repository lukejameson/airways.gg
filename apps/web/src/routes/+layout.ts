import { env } from '$env/dynamic/public';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = () => {
  return {
    umamiWebsiteId: env.PUBLIC_UMAMI_WEBSITE_ID || null,
    umamiUrl: env.PUBLIC_UMAMI_URL || null,
  };
};
