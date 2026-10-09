/**
 * Opaque keyset-pagination cursors. Values are strictly validated before they are interpolated
 * into a PostgREST filter, so a crafted cursor cannot inject filter syntax.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Postgres timestamptz as returned by PostgREST, e.g. 2026-10-08T21:30:00.123456+00:00
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export interface Cursor {
  t: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.t, cursor.id]), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [t, id] = value;
    if (typeof t !== 'string' || typeof id !== 'string') return null;
    if (!TS_RE.test(t) || !UUID_RE.test(id)) return null;
    return { t, id };
  } catch {
    return null;
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
