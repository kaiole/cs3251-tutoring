# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**Implemented locally, not deployed.** Phases 1–4 run against a local Supabase stack (Docker). Nothing is provisioned on Netlify/Supabase cloud/Resend, and no domain or budget has been approved — do not provision paid services (Phase 0 budget gate). Git is initialized; commit only when asked.

Commands (Node ≥ 22.12, npm; Supabase CLI is a dev dependency):

- `npm run db:start` / `db:reset` / `db:types` — local Supabase; reset re-applies `supabase/migrations`; regenerate `src/lib/database.types.ts` after schema changes.
- `npm run dev` — Astro dev server on :4321 (CSP is not applied in dev; check it with `npm run build`).
- `npm run clean` — clears Astro's content cache. Needed after changing Markdown/code-block rendering config (e.g. `expressiveCode` in `astro.config.mjs`): cached notes otherwise keep the old highlighting.
- `npm run check` (types + noteId check), `npm run build` (fails on CSP or noteId problems).
- `npm test` (unit), `npm run test:db` (pgTAP), `npm run test:integration` (real local Data API), `npm run test:all`.
- `npm run accounts -- invite|pair|revoke|list …` — tutor's admin CLI (secret key; local only).

Security invariants to preserve when changing code:

- Clients have **no table write grants**. All writes go through the `SECURITY DEFINER` RPCs in `supabase/migrations/*_rpc.sql` (empty `search_path`, actor from `auth.uid()`). New tables/functions need explicit grants (`auto_expose_new_tables = false`), RLS, and pgTAP tests asserting denied reads **and** writes.
- The browser never talks to Supabase; auth cookies are httpOnly. Only `netlify/functions/notify.mts` and `scripts/admin` use the secret key.
- Never log bodies, excerpts, emails, tokens, or Postgres error details (they can echo rows) — log SQLSTATE/codes only.
- Inline framework scripts must be hash-allowed via `csp-hashes.json` (`integrations/csp-check.mjs` fails the build otherwise).

The design docs remain the spec. Keep them consistent with each other and with the code.

## What is being designed

A public site of the tutor's Markdown teaching notes (CS3251, C++) plus a private question workspace for one tutor and one invited student. Core loop: read → capture confusion → discuss asynchronously or in session → resolve. The software serves the tutoring workflow; technical novelty is explicitly not a goal.

Read the docs in this order (each builds on the previous):

1. `docs/product.md` — requirements P1–P10 (the *agreed* ones), non-goals, privacy boundaries. Everything else is a "proposed default."
2. `docs/experience.md` — routes, composer, highlight→ask, inbox, lifecycle table, draft/failure handling, limits.
3. `docs/architecture.md` — stack, runtime boundaries, data model, auth/RLS, API surface, email outbox.
4. `docs/implementation.md` — phases 0–5, acceptance/security test matrix (keyed to P1–P10), operations, cost caveats, open decisions.

## Architecture (big picture)

Planned stack: Astro + Starlight (Markdown publishing) with React islands, Supabase Auth + Postgres (RLS), Resend (email), Netlify (hosting + scheduled worker), GitHub. One repo/app; deliberately no separate server, CMS, ORM, Redis, or realtime layer.

Key cross-document design decisions to preserve:

- **Public/private split.** Notes are pre-rendered and must build without touching the production DB. `/questions/*` and `/api/*` render on demand with `Cache-Control: private, no-store`, excluded from search/sitemaps. Public HTML is identical for all visitors; React controls learn the session from `GET /api/session` after load. DB outage disables Q&A only.
- **Stable note identity.** Notes carry an immutable manual `noteId` in frontmatter (independent of filename/title/URL); builds fail on missing/duplicate IDs. A public manifest maps noteId → title/URL/topic/headings. Questions store a *snapshot* (noteId, original title/path, heading anchor, build revision, excerpt text/kind/language) and resolve to current notes via the manifest, degrading to "Source note unavailable." Excerpts are user-supplied, never verified quotations, and never overwritten (P10).
- **Authorization lives in the database.** RLS, column privileges/triggers for immutable fields (author, pair, body, snapshot), and `resolved ⇒ next_session = false` constraints; tests must cover direct Supabase Data API access, not just app routes. User-facing queries use a user-scoped client, never the admin key. Accounts are provisioned by the tutor; signups/anonymous sign-in disabled; passwordless login uses `shouldCreateUser: false`.
- **Mutation semantics.** Client-generated submission UUID gives idempotent creates (same payload → original record, changed payload → 409). Replies atomically reopen resolved questions. Status/flag updates carry an expected `version` (stale → 409). Rate limit (10 writes/min/actor) enforced at the DB boundary.
- **Notification outbox.** Question/reply + `notification_jobs` row are one transaction; email is never sent inside it. A Netlify Scheduled Function (every 5 min, 30 s limit) claims leased batches, re-checks pair active, freezes a generic payload (no question content) and sends via Resend with a job-based idempotency key. Stop automatic retries before Resend's 24 h idempotency expiry. The on-site inbox is authoritative; email failure never loses a question. Only new questions/replies notify; status/flag changes do not.
- **Student content safety.** Restricted Markdown renderer (no MDX/raw HTML, no remote images, safe link protocols); never log bodies, excerpts, cookies, tokens, or emails. Posted messages are immutable in v1 (corrections are follow-up replies).
- **Hosting is replaceable.** Keep business logic separate from the Netlify worker wrapper and Astro adapter; Netlify/Supabase free-tier limits are a budget gate, not an assumption.

## Conventions when editing the docs

- Maintain the status language: `product.md` = agreed requirements vs. proposed defaults; other docs = design, with implementation status recorded in `implementation.md` §6. Say "implemented and tested locally" only for what tests or manual checks actually covered; nothing is deployed.
- New or changed behavior should map to a requirement ID (P1–P10) and, if testable, a row in the acceptance matrix in `docs/implementation.md`.
- Respect settled non-goals (no LMS, public boards, CMS, uploads, realtime chat, AI answers, persistent highlights) unless a demonstrated workflow need is documented.
- Pricing/limit figures in `implementation.md` are dated snapshots with source links; recheck before relying on them.
