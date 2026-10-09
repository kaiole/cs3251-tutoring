import type { AstroCookies } from 'astro';
import { safeNextPath } from './redirect';

/** Remembers where to go after the emailed sign-in link is confirmed (same browser only). */
const COOKIE = 'login_next';

export function rememberNext(cookies: AstroCookies, next: unknown, secure: boolean): void {
  cookies.set(COOKIE, safeNextPath(next), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 15 * 60,
  });
}

export function takeNext(cookies: AstroCookies): string {
  const value = safeNextPath(cookies.get(COOKIE)?.value);
  cookies.delete(COOKIE, { path: '/api/auth' });
  return value;
}
