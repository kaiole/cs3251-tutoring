import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import type { Database } from '../database.types';

export type Supabase = ReturnType<typeof createSupabase>;

/**
 * Per-request, user-scoped Supabase client (publishable key + the user's session cookie).
 * Every query it makes is subject to RLS. The browser never talks to Supabase directly, so auth
 * cookies are httpOnly: page scripts (and any XSS) cannot read session tokens.
 */
export function createSupabase(request: Request, cookies: AstroCookies) {
  const secure = import.meta.env.PROD || new URL(request.url).protocol === 'https:';
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
    },
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(toSet) {
        // Cache-Control: private, no-store is applied to every on-demand response by middleware.
        for (const { name, value, options } of toSet) {
          cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure,
            sameSite: 'lax',
            path: '/',
          });
        }
      },
    },
  });
}
