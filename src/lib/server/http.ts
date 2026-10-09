/** Small, dependency-free helpers for JSON API routes. */

export const MAX_JSON_BYTES = 64 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export const unauthorized = () => errorResponse(401, 'unauthenticated', 'Sign in to continue.');
// Deliberately identical for "missing" and "not yours": never confirm a record exists.
export const notFound = () =>
  errorResponse(404, 'not_found', "This question doesn't exist or you don't have access to it.");

/** Read a JSON body with a hard size cap. Rejects other content types (CSRF defense in depth). */
export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    throw new HttpError(415, 'unsupported_media_type', 'Expected application/json.');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_JSON_BYTES) {
    throw new HttpError(413, 'too_large', 'Request is too large.');
  }
  if (!request.body) throw new HttpError(400, 'invalid_json', 'Request body is required.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'too_large', 'Request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

/**
 * Map a database/PostgREST error to an HTTP response. Only the SQLSTATE is ever logged: Postgres
 * error details can echo row contents (question bodies, excerpts).
 */
export function dbErrorResponse(error: { code?: string } | null | undefined, where: string): Response {
  const code = error?.code ?? 'unknown';
  switch (code) {
    case 'PT401':
      return unauthorized();
    case 'PT403':
      return errorResponse(403, 'forbidden', "You can't do that.");
    case 'PT404':
      return notFound();
    case 'PT409':
      return errorResponse(409, 'conflict', 'This question changed. Refresh to see the latest version.');
    case 'PT429':
      return errorResponse(429, 'rate_limited', "You're sending messages quickly. Wait a minute and try again.");
    case '23514':
    case '23502':
    case '22P02':
    case '22001':
      return errorResponse(400, 'invalid', 'Some of that input is not allowed.');
    default:
      console.error(`[db] ${where} failed with SQLSTATE ${code}`);
      return errorResponse(503, 'unavailable', 'Questions are temporarily unavailable. Try again shortly.');
  }
}

export function handleRouteError(err: unknown, where: string): Response {
  if (err instanceof HttpError) return errorResponse(err.status, err.code, err.message);
  // Never log the error object itself: it may carry request data.
  console.error(`[api] ${where} failed: ${err instanceof Error ? err.name : 'unknown error'}`);
  return errorResponse(503, 'unavailable', 'Questions are temporarily unavailable. Try again shortly.');
}
