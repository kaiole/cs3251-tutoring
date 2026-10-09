# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project state

Implemented and tested locally against a local Supabase stack (Docker). **Not deployed**: nothing is provisioned on Netlify, Supabase cloud or Resend, and no domain or budget is approved, so do not provision paid services. Commit only when asked.

Public site of the tutor's Markdown notes (CS3251, C++) plus a private question workspace for one tutor and one invited student. Non-goals: LMS, public boards, CMS, uploads, realtime chat, AI answers, persistent highlights.

Commands (Node ≥ 22.12, npm; Supabase CLI is a dev dependency):

- `npm run db:start` / `db:reset` / `db:types`: local Supabase; reset re-applies `supabase/migrations`; regenerate `src/lib/database.types.ts` after schema changes.
- `npm run dev`: Astro dev server on :4321 (CSP is not applied in dev; check it with `npm run build`).
- `npm run clean`: clears Astro's content cache. Needed after changing Markdown/code-block rendering config (e.g. `expressiveCode` in `astro.config.mjs`).
- `npm run check` (types + noteId check), `npm run build` (fails on CSP or noteId problems).
- `npm test` (unit), `npm run test:db` (pgTAP), `npm run test:integration` (real local Data API), `npm run test:all`.
- `npm run accounts -- invite|pair|revoke|list …`: tutor's admin CLI (secret key; local only).

## Architecture

Astro + Starlight with React islands, Supabase Auth + Postgres (RLS), Resend (email), Netlify (hosting + scheduled worker). One app; no separate server, CMS, ORM, Redis or realtime layer.

- **Public/private split.** Notes are pre-rendered and build without the production DB. `/questions/*` and `/api/*` render on demand with `Cache-Control: private, no-store` and are excluded from search/sitemaps. React controls learn the session from `GET /api/session` after load. A DB outage disables Q&A only.
- **Stable note identity.** Each note has an immutable manual `noteId` in frontmatter; builds fail on missing/duplicate IDs. A public manifest maps noteId → title/URL/topic/headings. Questions store a snapshot (noteId, original title/path, heading anchor, build revision, excerpt text/kind/language), resolve to current notes via the manifest, and degrade to "Source note unavailable." Excerpts are user-supplied, never verified quotations, and never overwritten.
- **Mutation semantics.** A client-generated submission UUID makes creates idempotent (same payload → original record, changed payload → 409). Replies atomically reopen resolved questions. Status/flag updates carry an expected `version` (stale → 409). Rate limit is 10 writes/min/actor, enforced in the DB. Posted messages are immutable; corrections are follow-up replies.
- **Notification outbox.** A question/reply and its `notification_jobs` row commit in one transaction; email is never sent inside it. `netlify/functions/notify.mts` (every 5 min) claims leased batches, re-checks the pair is active, freezes a generic payload (no question content) and sends via Resend with a job-based idempotency key. Only new questions/replies notify. The on-site inbox is authoritative; email failure never loses a question. Keep business logic in `src/lib/notifications/`, separate from the Netlify wrapper.

## Security invariants

- Clients have **no table write grants**. All writes go through the `SECURITY DEFINER` RPCs in `supabase/migrations/*_rpc.sql` (empty `search_path`, actor from `auth.uid()`). New tables/functions need explicit grants (`auto_expose_new_tables = false`), RLS, and pgTAP tests asserting denied reads **and** writes. Tests must cover direct Data API access, not just app routes.
- Immutable fields (author, pair, body, snapshot) are protected by column privileges/triggers; `resolved ⇒ next_session = false` is a constraint.
- Accounts are provisioned by the tutor; signups and anonymous sign-in are disabled; passwordless login uses `shouldCreateUser: false`.
- The browser never talks to Supabase; auth cookies are httpOnly. User-facing queries use a user-scoped client. Only `netlify/functions/notify.mts` and `scripts/admin` use the secret key.
- Student content goes through a restricted Markdown renderer (no MDX/raw HTML, no remote images, safe link protocols).
- Never log bodies, excerpts, emails, tokens, cookies, or Postgres error details (they can echo rows); log SQLSTATE/codes only.
- Inline framework scripts must be hash-allowed via `csp-hashes.json` (`integrations/csp-check.mjs` fails the build otherwise).
