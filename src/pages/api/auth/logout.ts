import type { APIRoute } from 'astro';
import { handleRouteError } from '../../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  try {
    await locals.supabase.auth.signOut({ scope: 'local' });
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err, 'logout');
  }
};
