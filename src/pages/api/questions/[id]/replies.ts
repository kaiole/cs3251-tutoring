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
import { addReply } from '../../../../lib/server/questions';
import { getViewer } from '../../../../lib/server/viewer';
import { createReplySchema } from '../../../../lib/validation';

export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) => {
  try {
    const viewer = await getViewer(locals.supabase);
    if (!viewer) return unauthorized();
    if (!isUuid(params.id)) return notFound();

    const parsed = createReplySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return errorResponse(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid reply.');
    }
    const result = await addReply(locals.supabase, params.id, parsed.data);
    return result.ok ? json(result.value, 201) : dbErrorResponse(result.error, 'add reply');
  } catch (err) {
    return handleRouteError(err, 'add reply');
  }
};
