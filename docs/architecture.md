# Technical design

Status: design, implemented and tested locally (not deployed). §9 records where implementation refined it. Paid plans are still undecided.

## 1. Architecture and decisions

| Responsibility | Choice | Rationale |
| --- | --- | --- |
| Publishing and routing | Astro + Starlight | Markdown publishing, navigation, search, typography, and code highlighting without building a documentation system. |
| Interactive features | React + TypeScript islands | A shared composer and thread/inbox components without making every note a client-rendered application. |
| Authentication | Supabase Auth with its supported SSR integration | Managed invite-only accounts and email login instead of custom authentication. |
| Private data | Supabase Postgres | Relational conversations, transactions, and row-level security (RLS). |
| Email | Resend | SMTP delivery for Supabase Auth and API delivery for application notifications. |
| Hosting | Netlify with Astro's adapter | Static pages, on-demand routes, Git deployments, and a scheduled email worker in one deployment. |
| Source control | GitHub | Code and local Markdown publishing; organization ownership is optional. |

Netlify is the technical default, **not an assumption of unlimited free hosting**. Its production-deploy pricing and organization/private-repository restrictions are launch decisions; see [Implementation and launch plan](implementation.md).

Use one application/repository. No separate Express server, CMS, Redis, message-broker service, ORM, or real-time subscription layer is needed initially. Use SQL migrations and generated Supabase types. Prefer Starlight styles and a small amount of custom CSS over another design system.

Alternatives considered:

- **Next.js:** viable, but less of the notes experience is supplied by default. Reconsider if the product becomes primarily an interactive application.
- **A static site plus public comment/GitHub discussion integration:** simpler publishing, but does not match private invited-student conversations and the unified queue.
- **A fully managed notes tool:** appropriate for content alone, but this design deliberately includes a custom quote-to-question workflow and lifecycle. Do not rebuild the publishing features it already makes sense to borrow.

## 2. Runtime boundaries

```text
Local Markdown → GitHub → Netlify build → public HTML + assets + note index
                                             ↓
Browser → public notes (no database dependency)
Browser → Astro authenticated routes → Supabase Auth + user-scoped Postgres access
                                          ↓ same database transaction
                                  private notification outbox
                                          ↓ scheduled worker
                                        Resend
```

- Pre-render public notes and public search. A deployment must not query production conversations to build pages.
- Render `/questions/*` and authentication/API routes on demand. Do not prerender private data or pass it into static React hydration props.
- React components on public pages discover the current session through a private, non-cacheable endpoint after load. The public HTML is identical for visitors regardless of identity.
- Private HTML, session/auth responses, and APIs use `Cache-Control: private, no-store`. Exclude private routes from Pagefind, sitemaps, feeds, and build-time previews; add `noindex` as defense in depth, not as access control.
- Disable shared caching for any response carrying authentication cookies. Do not enable global caching of on-demand pages.
- A database outage disables Q&A, not reading the already-built notes.

Use Starlight component overrides to mount shared question controls around ordinary `.md` pages. Use custom Astro routes for the inbox and threads, sharing site styling without putting them in the public content collection. Verify this static/dynamic integration before building the complete UI.

## 3. Content identity and source snapshots

Store teaching notes under `src/content/docs/notes/`. A proposed frontmatter shape is:

```yaml
---
title: References and pointers
noteId: cpp-references-pointers
topic: C++ fundamentals
description: How references and pointers differ.
---
```

`noteId` is a manually chosen immutable identifier, independent of the filename, title, and URL. Extend Starlight's schema and fail builds on duplicate/missing note IDs. Landing pages need not be question-capable notes.

Generate a public manifest from published notes: note ID → current title, URL, topic, and heading anchors. Each page also carries its build/revision identifier for attribution. Do not put account or conversation data in this manifest.

A contextual question stores:

- Stable note ID, original note title, original relative path, optional heading anchor, and observed build/revision identifier.
- Optional excerpt text, excerpt kind (`text` or `code`), and optional code language.

The observed metadata describes what was open in the student's browser, not necessarily the latest deployed revision. Treat it as bounded, untrusted input; excerpts are not proof that the tutor wrote a passage. Reject unsafe URLs/HTML. For unfamiliar or removed note IDs, retain the question with an unavailable source rather than losing the draft.

Use the current manifest to produce a safe source link. Missing heading → current note; missing note → unavailable source. Never depend on historical slugs or exact text matches for question ownership. No database mirror of full note content is necessary.

## 4. Logical data model

UUIDs identify private records; use `timestamptz` for server-generated timestamps. The exact SQL belongs in implementation migrations.

| Entity | Principal fields and invariants |
| --- | --- |
| Supabase `auth.users` | Managed identities. Never expose a directory of users or email addresses to clients. |
| `tutoring_pairs` | `id`, `tutor_id`, `student_id`, `active`, `created_at`. Tutor and student differ; initially one active relationship per student. Membership changes are administrative only. |
| `questions` | `id`, `pair_id`, `author_id`, `body_md`, derived `title`, `status`, `next_session`, nullable note/context snapshot, `request_id`, `request_hash`, `created_at`, `last_activity_at`, `version`. Student authors only; immutable original content and ownership. |
| `replies` | `id`, `question_id`, `author_id`, `body_md`, `request_id`, `request_hash`, `created_at`. Append-only for participants. |
| `notification_jobs` | `id`, event type/ID, question ID, recipient user ID, state, attempt count, next attempt time, lease token/expiry, provider message ID, first attempt time, frozen send payload, sanitized last error. Private worker-only table. |

Indexes support pair membership, `(pair_id, status, last_activity_at)`, question source note, replies by question/time, and pending jobs by retry time. Enforce uniqueness of `(author_id, request_id)` for each submission kind and `(event_type, event_id, recipient_id)` for jobs.

Constraints and trusted database logic enforce body/excerpt limits, valid lifecycle values, immutable identity/context fields, and `resolved` implying `next_session = false`. An authenticated role is not permission to update every column.

### Mutation semantics

- A create request carries a client-generated submission UUID. A retry with the same actor, key, and canonical payload returns the original record; a changed payload with that key returns a conflict.
- Creating a question/reply and its notification job is one database transaction. Do not call the email API inside that transaction.
- Appending a reply atomically reopens its question when necessary and advances activity/version. Database locking prevents interleaved operations from partially applying lifecycle changes.
- Status/flag updates include an expected question version. Reject stale updates and refresh rather than resolving a question over an unseen new reply.
- Neither questions nor replies can be moved between tutoring pairs or reassigned to another author by client requests.

## 5. Authentication and authorization

### Account lifecycle

1. The tutor provisions/invites the two accounts administratively and creates the tutoring-pair record. Do not give the student access to a Supabase, Netlify, or GitHub administrative organization.
2. Disable public signups and anonymous sign-ins in Supabase. Passwordless sign-in explicitly uses `shouldCreateUser: false`; omitting it can create accounts.
3. Configure verified-domain custom SMTP through Resend for invitations and login emails. Supabase's default development sender is not a production delivery solution.
4. Use the supported cookie-based Supabase SSR integration. Verify identity server-side; do not authorize from an unverified cookie, client-supplied user ID, or `getSession()` result alone.
5. Allow only intended login callback destinations, validate the callback type, and validate any same-origin return path. Redact token-bearing URLs from application logs.
6. Check active membership on each private operation. Deactivating a pair must block subsequent reads/writes and pending email delivery even if an authentication token has not expired.

Invitation acceptance with signups disabled, repeat magic-link login, cookie refresh, and expired/reused links are explicit technical-validation tests. Adapt official examples: do not copy their public signup flows into this product.

### Access matrix

| Operation | Public / unrelated account | Active student in pair | Active tutor in pair |
| --- | --- | --- | --- |
| Read published notes | Allow | Allow | Allow |
| Read pair's questions and replies | Deny | Allow | Allow |
| Create a question in pair | Deny | Allow as self | Not exposed in v1 |
| Reply or change lifecycle state | Deny | Allow as self / participant | Allow as self / participant |
| Change author, pair, original body, or snapshot | Deny | Deny | Deny through normal UI |
| Modify memberships or notification jobs | Deny | Deny | Administrative/worker path only |

### Enforcement

- User-facing queries use a user-scoped Supabase client, not an administrative key that bypasses RLS.
- Apply RLS, least-privilege grants, and constraints to every exposed table. Scope reply access through the owning question and active pair. No public read policies for tutoring data.
- Enforce immutable columns with column privileges and/or trusted triggers, not only an API field allowlist. Test direct Supabase Data API access as well as application routes.
- Database-controlled notification creation derives the recipient from the pair. Clients cannot choose recipients, inject email bodies, or insert jobs. Put the outbox in an unexposed schema and restrict any worker functions.
- If a privileged database trigger/function is needed, pin its search path, limit execution grants, and review it separately. It must not provide a generic privilege-bypass endpoint.
- Administrative credentials are restricted to provisioning and the notification worker. They never appear in public environment variables, client bundles, or public build artifacts.

## 6. API surface and input safety

Proposed same-origin endpoints; exact route filenames can change without changing the product:

| Endpoint | Responsibility |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `/auth/callback` | Managed login/callback/logout, with validated redirects and generic login-request responses. |
| `GET /api/session` | Minimal current identity/participation information for static-page controls. |
| `GET /api/questions`, `GET /api/questions/[id]` | Authorized, bounded inbox/thread reads; paginate replies. |
| `POST /api/questions` | Validate and idempotently create a student question. |
| `POST /api/questions/[id]/replies` | Validate and idempotently append a reply. |
| `PATCH /api/questions/[id]` | Version-checked status/next-session update only. |

Validate request size, types, body limits, ownership, and source paths. Validate same-origin requests/CSRF protection for cookie-authenticated mutations; GET requests must not perform normal application writes. Treat authentication callbacks as a dedicated verified-token flow.

Apply rate limits to login and write endpoints. Email-generating database operations also need per-actor limits so direct Data API requests cannot bypass application limits and flood the tutor. Initial write limit: 10 new questions/replies per minute per actor; make it configurable and enforce it atomically at the database boundary. Keep operational counters private. Authentication uses provider limits plus endpoint abuse protection.

Render question/reply Markdown with a restricted renderer (for example, `react-markdown` + GFM + sanitization). Do not execute MDX or raw HTML from students. Disallow unsafe link protocols and remote embedded images; render code as text, never execute it. Quote snapshots are escaped text. Use an appropriate CSP and security headers.

Return `401` for unauthenticated API requests, non-disclosing `404` for inaccessible thread IDs, validation errors for invalid input, `409` for stale/conflicting writes, and `429` for rate limits. Never log question bodies, selected text, cookies, auth tokens, or email payloads.

## 7. Email delivery

Authentication emails are sent by Supabase through Resend SMTP. Application notifications are separate jobs sent through the Resend API; both consume the email account's delivery allowance.

### Application notifications

1. A database-controlled transaction inserts a job with the saved question/reply. The event's other participant is the only recipient; no self-notifications or notifications for status/flag changes.
2. A Netlify Scheduled Function runs every five minutes, claims a small batch with expiring leases, and checks that the pair is still active and the thread still exists.
3. Resolve the recipient's verified account email server-side. Freeze a minimal payload on first attempt: generic subject/event wording plus a canonical production thread link. Do not include the question title, body, code, or quote. The link does not bypass login.
4. Send using a stable Resend idempotency key based on the job ID. Retries reuse the exact payload and key.
5. Persist provider acceptance, or retry transient failures with backoff. Cap attempts and record permanent failure for tutor inspection. An expired lease can be reclaimed after a worker crash.

Netlify currently documents a 30-second scheduled-function limit. Bound batch sizes and network timeouts accordingly. Schedules run on published deploys, not automatically on previews. Do not assume exactly-once scheduling or provider delivery.

Resend idempotency expires after 24 hours. Stop automatic retries of an ambiguous send before 24 hours from its first attempt; require operator reconciliation before retrying later. Provider acceptance is not proof of inbox delivery. This design reduces duplicates but does not promise exactly-once email.

A provider outage must not lose or roll back a saved question. The on-site inbox is authoritative. A database/outbox failure, by contrast, fails the save transaction and retains the browser draft. The worker needs a visible failed/pending-job check in the operational runbook, not a new public dashboard.

## 8. Deployment and secrets

- Keep local/test, preview, and production environments separate. Preview builds use synthetic data and cannot access production records or send production email. Untrusted pull requests receive no privileged credentials.
- Scope runtime secrets to the components that need them. Public Supabase project coordinates/publishable keys are not authorization; RLS remains required. Resend and Supabase administrative secrets are private.
- Maintain reviewed SQL migrations in Git. Check them against a disposable/local database before production; do not rely on undocumented dashboard schema edits.
- Configure the site's canonical URL and email sender through environment configuration. Keep sending-domain DNS setup separate from website DNS so existing mail delivery is not accidentally replaced.
- Keep business logic separate from the Netlify worker wrapper and Astro adapter, allowing a hosting change if pricing or limits make the default unsuitable.

## 9. Implementation refinements

Decisions made while implementing locally; they tighten, not change, the design above.

- **Writes only through RPCs.** `anon`/`authenticated` have no INSERT/UPDATE/DELETE privilege on any table. `create_question`, `add_reply`, and `set_question_state` are `SECURITY DEFINER` functions with an empty `search_path` that derive the actor from `auth.uid()`, re-check active membership, enforce idempotency/limits/versions, and write the outbox row in the same transaction. Reads use RLS plus column grants (idempotency columns are not readable). Triggers still guard immutable columns and reply authorship, and a composite foreign key ties a question's author to the pair's student. `auto_expose_new_tables = false`: every exposed object needs an explicit grant.
- **Errors at the database boundary** use PostgREST `PTxxx` codes (`PT401`, `PT403`, `PT404`, `PT409`, `PT429`), so direct Data API callers get the same statuses as application routes. Missing and inaccessible questions are indistinguishable.
- **Write limit** counts the actor's questions + replies in the last minute under a per-actor advisory lock (configurable in `private.app_config`). An identical idempotent retry returns the original record even while rate limited.
- **No browser Supabase client.** All Supabase calls happen in Astro server routes with the user's session, so auth cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production. The session is validated with `auth.getUser()` on every request.
- **Email links** use Supabase token-hash templates that land on `/auth/confirm`, which requires a click (a same-origin POST), so link scanners cannot consume one-time tokens. Magic links use PKCE and must be opened in the browser that requested them; invitations are not browser-bound. Invited accounts accept once before magic-link login works. In Supabase config, `[auth.email] enable_signup` is the email *provider* switch and stays on; `[auth] enable_signup = false` is what blocks signups (verified by tests). The login endpoint pads responses to a constant minimum duration and always returns the same message.
- **CSRF:** unsafe methods require `Origin` equal to the site origin (and `Sec-Fetch-Site: same-origin` when sent); JSON APIs also require `Content-Type: application/json` and cap bodies at 64 KiB.
- **CSP:** Astro emits per-page hash-based `script-src` (plus `'wasm-unsafe-eval'` for Pagefind); Starlight's `is:inline` scripts are allowed by reviewed hashes in `csp-hashes.json`, and a build integration fails the build if any static page has an unlisted inline script. `style-src` allows inline because Expressive Code and Starlight emit `style` attributes. Headers add `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin`, and COOP. Private responses use `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`.
- **Message rendering:** GFM; raw HTML is shown as literal text (so `std::vector<int>` typed outside backticks survives); links only `http`/`https`/`mailto` with `rel="noopener noreferrer nofollow ugc"`; images render as alt text and never load.
- **Code highlighting** uses Expressive Code's built-in Shiki with the stock `github-dark`/`github-light` themes, at build time only. Expressive Code raises any token below its default contrast floor against the site's gray code background. Code blocks are the only place the site uses hue.
- **Notification worker:** the outbox lives in the unexposed `private` schema; two `service_role`-only RPCs claim (lease, revocation skip, generic frozen payload, 23 h automatic-retry cutoff) and finish jobs. Business logic is `src/lib/notifications/worker.ts`; `netlify/functions/notify.mts` is a thin wrapper. The default transport only logs job keys; real delivery requires `NOTIFY_TRANSPORT=resend`.

## Official references

Consult current documentation and pin compatible versions during implementation:

- [Starlight features](https://starlight.astro.build/), [custom pages](https://starlight.astro.build/guides/pages/), and [frontmatter/schema extensions](https://starlight.astro.build/reference/frontmatter/).
- [Astro's Netlify adapter](https://docs.astro.build/en/guides/integrations-guide/netlify/).
- [Supabase Astro SSR quickstart](https://supabase.com/docs/guides/auth/quickstarts/astrojs), [signup configuration](https://supabase.com/docs/guides/auth/general-configuration), [passwordless login](https://supabase.com/docs/guides/auth/auth-email-passwordless), and [production SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
