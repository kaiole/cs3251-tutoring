import type { APIRoute } from 'astro';
import { handleRouteError, json } from '../../lib/server/http';
import { getViewer, toSessionInfo } from '../../lib/server/viewer';

export const prerender = false;

/** Minimal identity for static-page controls. Public HTML never contains session state. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    return json(toSessionInfo(await getViewer(locals.supabase)));
  } catch (err) {
    return handleRouteError(err, 'session');
  }
};
