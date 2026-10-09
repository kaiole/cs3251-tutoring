/** Same-origin JSON client for the browser. Never talks to Supabase directly. */
import type { NoteManifest } from '../notes';
import type { SessionInfo } from '../types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0, 'network', "Couldn't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'error', body?.error?.message ?? 'Something went wrong.');
  }
  return body as T;
}

export type SessionState = SessionInfo & { unavailable?: boolean };

let sessionPromise: Promise<SessionState> | null = null;
/** One /api/session request per page, shared by every island. */
export function getSession(): Promise<SessionState> {
  sessionPromise ??= api<SessionInfo>('/api/session').catch(
    (): SessionState => ({ signedIn: false, role: null, unavailable: true }),
  );
  return sessionPromise;
}

let manifestPromise: Promise<NoteManifest | null> | null = null;
export function getManifest(): Promise<NoteManifest | null> {
  manifestPromise ??= fetch('/notes-manifest.json', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<NoteManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** Current, safe link for a saved source: manifest only, never the stored path. */
export function resolveSourceLink(
  manifest: NoteManifest | null,
  noteId: string,
  heading: string | null,
): { url: string; title: string; headingFound: boolean } | null {
  const note = manifest?.notes[noteId];
  if (!note) return null;
  const headingFound = heading !== null && note.headings.includes(heading);
  return { url: headingFound ? `${note.url}#${heading}` : note.url, title: note.title, headingFound };
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
