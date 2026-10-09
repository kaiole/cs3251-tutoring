/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** User-scoped Supabase client; only set for on-demand (non-prerendered) requests. */
    supabase: import('./lib/server/supabase').Supabase;
  }
}

interface ImportMetaEnv {
  /** Commit/build identifier injected in astro.config.mjs. */
  readonly BUILD_REVISION: string;
}
