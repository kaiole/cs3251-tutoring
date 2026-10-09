import type { APIRoute } from 'astro';
import { isUuid } from '../../../../lib/server/cursor';
import {
  dbErrorResponse,
  errorResponse,
  handleRouteError,
  json,
  notFound,
  readJson,
  unauthorized,
} from '../../../../lib/server/http';
import { getThread, setQuestionState } from '../../../../lib/server/questions';
import { getViewer } from '../../../../lib/server/viewer';
import { updateStateSchema } from '../../../../lib/validation';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params, url }) => {
  try {
    const viewer = await getViewer(locals.supabase);
    if (!viewer) return unauthorized();
    if (!isUuid(params.id)) return notFound();

    const result = await getThread(locals.supabase, viewer.userId, params.id, url.searchParams.get('cursor'));
    if (!result.ok) return dbErrorResponse(result.error, 'read thread');
    return result.value ? json(result.value) : notFound();
  } catch (err) {
    return handleRouteError(err, 'read thread');
  }
};

/** Version-checked status / next-session change only. */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  try {
    const viewer = await getViewer(locals.supabase);
    if (!viewer) return unauthorized();
    if (!isUuid(params.id)) return notFound();

    const parsed = updateStateSchema.safeParse(await readJson(request));
    if (!parsed.success) return errorResponse(400, 'invalid', 'Invalid update.');

    const result = await setQuestionState(locals.supabase, params.id, parsed.data.expectedVersion, parsed.data.action);
    return result.ok ? json(result.value) : dbErrorResponse(result.error, 'update question');
  } catch (err) {
    return handleRouteError(err, 'update question');
  }
};
