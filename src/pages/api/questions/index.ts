import type { APIRoute } from 'astro';
import { dbErrorResponse, errorResponse, handleRouteError, json, readJson, unauthorized } from '../../../lib/server/http';
import { createQuestion, listQuestions } from '../../../lib/server/questions';
import { getViewer } from '../../../lib/server/viewer';
import { createQuestionSchema, INBOX_FILTERS, NOTE_ID_RE, type InboxFilter } from '../../../lib/validation';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const viewer = await getViewer(locals.supabase);
    if (!viewer) return unauthorized();

    const filterParam = url.searchParams.get('filter') ?? 'open';
    const filter = (INBOX_FILTERS as readonly string[]).includes(filterParam) ? (filterParam as InboxFilter) : null;
    const note = url.searchParams.get('note') ?? undefined;
    if (!filter || (note !== undefined && !NOTE_ID_RE.test(note))) {
      return errorResponse(400, 'invalid', 'Unknown filter.');
    }

    const result = await listQuestions(locals.supabase, { filter, noteId: note, cursor: url.searchParams.get('cursor') });
    return result.ok ? json(result.value) : dbErrorResponse(result.error, 'list questions');
  } catch (err) {
    return handleRouteError(err, 'list questions');
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  try {
    const viewer = await getViewer(locals.supabase);
    if (!viewer) return unauthorized();

    const parsed = createQuestionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return errorResponse(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid question.');
    }
    const result = await createQuestion(locals.supabase, parsed.data);
    return result.ok ? json(result.value, 201) : dbErrorResponse(result.error, 'create question');
  } catch (err) {
    return handleRouteError(err, 'create question');
  }
};
