/**
 * Validate a post-login destination. Only same-origin paths inside the site are allowed; anything
 * else (absolute URLs, protocol-relative "//", backslash tricks, control characters) falls back.
 */
export const DEFAULT_AFTER_LOGIN = '/questions';

const ALLOWED_PREFIXES = ['/questions', '/notes/'];

export function safeNextPath(next: unknown, fallback = DEFAULT_AFTER_LOGIN): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 500) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  const base = 'https://internal.invalid';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  const path = url.pathname;
  if (path !== '/questions' && !ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return fallback;
  return path + url.search + url.hash;
}
