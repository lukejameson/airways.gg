import { env } from '$env/dynamic/public';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return {
    formspreeUrl: env.PUBLIC_FORMSPREE_URL || null,
  };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const formspreeUrl = env.PUBLIC_FORMSPREE_URL;
    if (!formspreeUrl) {
      return fail(500, { error: 'Contact form is not configured.' });
    }

    const data = await request.formData();
    const name = data.get('name')?.toString().trim();
    const email = data.get('email')?.toString().trim();
    const type = data.get('type')?.toString();
    const message = data.get('message')?.toString().trim();

    if (!name || !email || !type || !message) {
      return fail(400, { error: 'All fields are required.' });
    }

    const validTypes = ['general', 'feature', 'bug'];
    if (!validTypes.includes(type)) {
      return fail(400, { error: 'Invalid enquiry type.' });
    }

    const res = await fetch(formspreeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, email, _replyto: email, type, message }),
    });

    if (!res.ok) {
      return fail(500, { error: 'Failed to send message. Please try again.' });
    }

    return { success: true };
  },
};
