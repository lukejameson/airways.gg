import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Login is not yet implemented — return 404 so the route doesn't exist publicly.
export const load: PageServerLoad = () => {
	throw error(404, 'Not found');
};
