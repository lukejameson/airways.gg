import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  return {
    theme: locals.theme || 'light',
  };
};