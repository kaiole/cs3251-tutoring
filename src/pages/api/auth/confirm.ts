import type { APIRoute } from 'astro';
import { takeNext } from '../../../lib/server/login-next';

export const prerender = false;

const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{8,200}$/;
const TYPES = new Set(['email', 'invite']);

/**
 * Completes an emailed sign-in/invite link. Reached only by the button on /auth/confirm (POST), so
 * email security scanners that prefetch links cannot consume the one-time token.
 */
export const POST: APIRoute = async ({ locals, request, cookies, redirect }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect('/login?error=link', 303);
  }
  const tokenHash = form.get('token_hash');
  const type = form.get('type');
  if (typeof tokenHash !== 'string' || !TOKEN_HASH_RE.test(tokenHash) || typeof type !== 'string' || !TYPES.has(type)) {
    return redirect('/login?error=link', 303);
  }

  const { error } = await locals.supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as 'email' | 'invite',
  });
  if (error) {
    // Expired or already-used link: offer a fresh sign-in. Never log the token.
    return redirect('/login?error=link', 303);
  }
  return redirect(takeNext(cookies), 303);
};
