import type { APIRoute } from 'astro';
import { errorResponse, handleRouteError, json, readJson } from '../../../lib/server/http';
import { rememberNext } from '../../../lib/server/login-next';
import { loginSchema } from '../../../lib/validation';

export const prerender = false;

const GENERIC = {
  message: 'If that address belongs to an invited account, a sign-in link is on its way. It expires in 15 minutes.',
};
/** Pad every response to a similar duration so timing doesn't reveal whether an account exists. */
const MIN_DURATION_MS = 900;

export const POST: APIRoute = async ({ locals, request, cookies, url }) => {
  const started = Date.now();
  try {
    const parsed = loginSchema.safeParse(await readJson(request));
    if (!parsed.success) return errorResponse(400, 'invalid', 'Enter a valid email address.');

    // shouldCreateUser: false — never create accounts from the login form (signups are also
    // disabled in Supabase). Errors, including "no such user", get the same generic response.
    const { error } = await locals.supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      // Code only — never the address. Unknown accounts typically report otp_disabled.
      console.warn(`[auth] login request not sent: ${error.code ?? error.status ?? 'unknown'}`);
    }
    rememberNext(cookies, parsed.data.next, url.protocol === 'https:' || import.meta.env.PROD);

    const wait = MIN_DURATION_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return json(GENERIC);
  } catch (err) {
    return handleRouteError(err, 'login');
  }
};
