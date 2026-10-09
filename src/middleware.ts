import { defineMiddleware } from 'astro:middleware';
import { createSupabase } from './lib/server/supabase';
import { errorResponse } from './lib/server/http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Headers for every on-demand response. Static pages get the same baseline from public/_headers.
 * script-src/style-src come from Astro's per-page CSP <meta> (hash-based); this header adds the
 * directives a <meta> policy cannot express (frame-ancestors) and tightens the rest.
 */
const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
const PAGE_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

function withHeaders(response: Response, headers: Record<string, string>): Response {
  // Some responses (e.g. Response.redirect) have immutable headers; copy when needed.
  let out = response;
  try {
    for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  } catch {
    out = new Response(response.body, response);
    for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  }
  return out;
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Pre-rendered notes are built without request data or database access.
  if (context.isPrerendered) return next();

  const { request, url } = context;
  const isApi = url.pathname.startsWith('/api/');

  // CSRF: cookie-authenticated mutations must come from this origin. (Astro's checkOrigin covers
  // form posts; this also covers JSON and any other content type.)
  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    if (origin !== url.origin || (fetchSite !== null && fetchSite !== 'same-origin')) {
      return withHeaders(errorResponse(403, 'cross_origin', 'Cross-origin request rejected.'), {
        ...BASE_HEADERS,
        'Content-Security-Policy': API_CSP,
      });
    }
  }

  context.locals.supabase = createSupabase(request, context.cookies);

  const response = await next();
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    'Content-Security-Policy': isApi ? API_CSP : PAGE_CSP,
  };
  // Note: /auth/confirm carries a one-time token in its URL. 'same-origin' (above) keeps it out of
  // cross-origin Referer headers; 'no-referrer' would make browsers send `Origin: null` on the
  // confirmation form POST, which the CSRF check rightly rejects.
  if (import.meta.env.PROD) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return withHeaders(response, headers);
});
