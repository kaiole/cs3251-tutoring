# Implementation and launch plan

Status: Phases 1–4 are implemented and tested **locally** (see §6). Nothing has been provisioned or deployed; Phase 0's budget and hosting decisions remain open.

Build the complete tutoring loop before adding polish or portfolio demonstrations. Each phase ends with a demonstrable result, not just a collection of components.

## 1. Build sequence

### Phase 0 — Confirm constraints and prove integrations

- Choose repository ownership/visibility, domain, monthly budget, and production service plans. Do not purchase or provision paid resources without approval.
- Pin compatible supported versions of Astro, Starlight, its React/hosting integrations, Supabase SSR, and the Node runtime. Use one package manager and commit its lockfile.
- Initialize Git and basic checks when implementation begins; this design task does not initialize the repository.
- Prove one ordinary `.md` note can remain static while a custom `/questions` page and API route run on demand through the selected hosting adapter.
- Prove a Starlight override can mount selection/composer controls without per-note MDX imports.
- In a non-production environment, verify invited-account acceptance with signups disabled, repeat magic-link login, logout, callback validation, and session refresh.
- Verify the proposed hosting plan supports repository ownership, deployment cadence, scheduled jobs, and environment-secret isolation.

**Exit:** a minimal technical spike proves the risky integrations. If hosting cost is unsuitable, change the adapter/worker wrapper now, not the product requirements.

### Phase 1 — Public notes foundation

- Establish Starlight navigation, a plain notes-list home page, and custom domain configuration.
- Add a small amount of original teaching content with C++ code examples.
- Add stable note IDs, frontmatter validation, duplicate-ID checks, and a public note/heading manifest.
- Set up Git-triggered publication and checks for content links, type errors, and production builds.
- Exclude drafts appropriately and document that GitHub visibility is separate from site publication.

**Exit:** a local Markdown change can be previewed, pushed, and published without accessing the private database.

### Phase 2 — Private general-question workflow

- Add reviewed migrations for accounts' tutoring relationships, questions, replies, access policies, immutable fields, lifecycle/version rules, submission deduplication, and private notification jobs.
- Add DB authorization tests before connecting real student data.
- Build login, the session-aware header, general-question composer, inbox, thread, replies, and next-session/resolved controls.
- Use sanitized Markdown rendering and tab-scoped draft recovery.
- Save notification jobs transactionally, initially using a disabled/test delivery worker.

**Exit:** the student can ask a general question and the tutor can reply, flag, and resolve it; unrelated accounts cannot access it even through the database API.

### Phase 3 — Contextual question capture

- Add “Ask about this note” and reuse the general composer.
- Implement selection capture, quotation preview, code whitespace preservation, and source attachment removal.
- Add keyboard/touch fallbacks and recoverable validation states.
- Verify source resolution after file moves, heading changes, and note deletion.

**Exit:** a selected C++ example becomes a private question with a durable excerpt and useful source link, without requiring permanent annotations.

### Phase 4 — Reliable notifications

- Verify a sending domain/subdomain and configure Resend SMTP in Supabase for authentication emails.
- Implement the scheduled notification worker with bounded batches, leases, idempotency, backoff, and failed-job inspection.
- Verify recipients are derived from active relationships, never supplied by the browser.
- Test provider failures, duplicate execution, revoked access, and preview isolation.
- Explain in the UI that email is a notification channel, not a guarantee of immediate tutor response.

**Exit:** both participants receive the relevant alerts, while failed email delivery cannot lose or duplicate a saved question.

### Phase 5 — Launch and learn

- Complete the acceptance checks below with synthetic tutor/student/stranger accounts.
- Review mobile/keyboard behavior, content readability, and production cache/search output.
- Complete operational setup, privacy notice, retention decision, and backup/restore rehearsal.
- Invite the real student only after permission tests pass.
- Walk through lecture capture and session preparation together. Review the workflow after a few sessions before expanding scope.

**Exit:** the real teaching workflow is usable end to end; no demo or advanced annotation work blocks it.

## 2. Acceptance and security test matrix

Suggested tools: Vitest for pure behavior, SQL/pgTAP for database policies/invariants, and Playwright for browser workflows. Use local/disposable Supabase with synthetic identities and a fake email adapter in CI. Real-provider smoke tests are separate and deliberate.

| Test | Expected result | Requirements |
| --- | --- | --- |
| Publish and search a Markdown note | Appears under its topic with readable code; public build does not require private DB access. | P1–P2 |
| Create a general question | One required body field; no topic needed; shows in the unified inbox. | P4, P6 |
| Ask from a note without a selection | Source attached; removable before submission. | P5 |
| Quote prose, multiline C++, and mixed content | Correct excerpt; meaningful whitespace intact; no code toolbar text or HTML execution. | P5 |
| Move/rename/edit/delete the source note | Saved excerpt unchanged; source links resolve or degrade safely. | P10 |
| Reply, resolve, flag, reopen | Matches the lifecycle table; stale status changes cannot hide a newly arrived reply. | P7–P8 |
| Refresh, timeout, double-submit, retry | Draft retained until confirmation; one logical submission and notification job. Changed payload with reused key conflicts. | P4–P7, P9 |
| Signed-out visitor calls private APIs/Data API | No question data, metadata, or writes allowed. | P3 |
| Invited but unrelated second student guesses IDs | Cannot list/read/reply/update another pair's data. | P3 |
| Reassign author/pair, modify a posted body/snapshot, or choose an arbitrary email recipient | Database boundary rejects unauthorized changes, including direct Data API requests. New excerpts remain user-supplied, not verified quotations. | P3, P5, P9 |
| Revoke pair while sessions/jobs exist | Subsequent private access denied; queued notifications skipped. | P3, P9 |
| Attempt signup or login as an unknown email | No account is created; application response does not reveal student membership. | P3 |
| Expired/reused login link and mid-draft session expiry | Safe reauthentication path; no wrong-account draft restoration or open redirect. | P3–P5 |
| Malicious Markdown, HTML, URL, oversized body, remote image | No scripts, unsafe navigation, image tracking, or unbounded storage. | P3, P7 |
| Cross-origin mutation and notification spam | CSRF/Origin checks reject inappropriate requests; DB write limits cannot be bypassed via Data API. | P3, P9 |
| Inspect static HTML, bundles, search, sitemap, logs, and shared caches | No student data or privileged secrets; private responses are non-cacheable. | P3 |
| Preview or untrusted-PR deployment | Cannot read production conversations or send production notifications. | P3, P9 |
| Email failure, worker crash, overlapping/repeated run | Question retained; job recoverable; stable payload/idempotency key reused; no exactly-once assumption. | P9 |
| Worker retry beyond provider deduplication window | Automatic ambiguous retries stop; operator reconciliation required. | P9 |
| Supabase or email service unavailable | Public notes still work; failed saves retain drafts; saved questions remain authoritative. | P1–P2, P4, P9 |
| Keyboard, desktop selection, mobile touch | Question capture remains possible without the floating selection action. | P4–P5 |

Security tests must assert denied reads **and denied writes**, not merely that a button is hidden. Test column mutation, newly introduced tables/functions, and administrative-key isolation whenever migrations change.

## 3. Production operations

Keep these procedures short and documented alongside the eventual application:

- **Invite/revoke:** provision account and pair with administrative tools; test access; disable the pair to revoke immediately. No shared credentials or student access to infrastructure dashboards.
- **Publish/rollback:** record the publication branch and deploy procedure. A failed build leaves the last successful deployment active. Use backward-compatible migrations so application rollback does not require blindly reversing database changes.
- **Email failure:** inspect job/provider status without exposing message content; correct credentials/quota/DNS issues; reconcile ambiguous sends before requeueing. Track failed jobs and oldest pending-job age. Check provider bounce information during smoke tests.
- **Backups:** choose automated managed backups or scheduled encrypted exports, stored outside the public repository. Rehearse restoring conversations, identities/relationships, and policies into an isolated environment. Git alone does not back up student data.
- **Deletion/retention:** record the agreed retention period; remove relevant questions, replies, queued jobs, and unneeded accounts on deletion. Explain backup expiry and that already-delivered emails cannot be recalled. Never reuse production exports as demos/test fixtures.
- **Monitoring:** use deployment/function logs and database/provider dashboards initially. Log event IDs and sanitized failures, not bodies, quotes, emails, or auth secrets. Check usage, failure queues, and access before sessions; add a scheduled reminder if needed.
- **Secrets and updates:** document where credentials live, how to rotate them, and how dependencies are updated. Test permission boundaries after auth/SSR/database dependency changes.

No custom admin dashboard, observability platform, or automatic retention subsystem is required for the first student, but their operational responsibilities cannot be omitted.

## 4. Cost and provider caveats

These are documentation snapshots, not contractual quotes. Recheck prices, terms, and quota behavior before provisioning. Domain registration is an additional cost; no budget has been approved.

| Service | Relevant current constraint | Decision |
| --- | --- | --- |
| Netlify | Credit-based Free includes 300 credits/month; each production deployment costs 15 credits, plus traffic/compute. Twenty production deploys alone consume all 300 credits. Personal is listed at $9/month with 1,000 credits. Organization-owned private repositories are listed as a Pro feature. | Do not assume frequent Markdown pushes fit Free. Confirm public/private repo ownership and cadence; approve a suitable plan or reconsider hosting. |
| Supabase | Free projects may pause after one week of inactivity and exclude automatic backups. Pro starts at $25/month and includes daily backups/no inactivity pausing. | Free is suitable for experimentation; choose an explicit availability/recovery plan before relying on it for paid tutoring. Do not assume polling prevents pausing. |
| Resend | Free transactional allowance is listed as 3,000 emails/month and 100/day. Authentication and Q&A notifications share usage if using the same account. | Likely sufficient at this scale, but test delivery and monitor quotas. Domain verification/custom SMTP are still required. |
| Scheduled notifications | Netlify scheduled functions have a 30-second runtime and only automatically run on published deploys. | Keep batches bounded and test worker execution manually in isolated environments. |

Recommended approach: keep the application stack, but treat the production hosting/database plan as a budget gate. If near-zero recurring cost is a requirement, revisit hosting before implementation rather than promising reliability from free-tier limits.

Sources:

- [Netlify credit-based plans and repository restrictions](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).
- [Supabase plans](https://supabase.com/pricing) and [SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp).
- [Resend pricing explanation](https://resend.com/docs/knowledge-base/what-is-resend-pricing).
- [Netlify scheduling limits](https://docs.netlify.com/build/functions/scheduled-functions/).

## 5. Remaining decisions

These do not block this design, but must be settled before production launch:

1. Project/display name, GitHub repository/organization, and repository visibility.
2. Domain, canonical site URL, and verified email sender/subdomain.
3. Monthly budget and accepted availability/backup tradeoffs; Netlify plan/repository compatibility.
4. First notes and navigation topics, based on actual tutoring needs rather than assuming the public course homepage supplies a syllabus.
5. Student-facing privacy notice and retention/deletion period.
6. Approval of the proposed defaults: magic-link login, immutable posted messages, and shared lifecycle controls.

Do not reopen settled v1 non-goals without a demonstrated workflow need. A later showcase can add explicitly fictional examples after the private tutoring loop is working.

## 6. Implementation status

Local only (Docker Supabase + `astro dev`/`astro build`). "Automated" names the suite that covers a matrix row; "manual" means checked once in a browser during development.

| Matrix row (§2) | Status | Evidence |
| --- | --- | --- |
| Publish and search a Markdown note | Done locally; no Git-triggered deploy yet | Build + Pagefind search checked manually under the production CSP |
| Create a general question | Done | pgTAP `authz`; manual |
| Ask from a note without a selection | Done (incl. optional pasted quote) | Manual |
| Quote prose, multiline C++, mixed content | Done | Manual (code-block whitespace verified byte-for-byte); pgTAP excerpt round-trip |
| Move/rename/edit/delete the source note | Done (manifest resolution, "Source note unavailable") | Not yet tested end to end |
| Reply, resolve, flag, reopen; stale updates | Done | pgTAP `authz`; manual stale-version banner |
| Refresh, timeout, double-submit, retry | Done | pgTAP + integration idempotency; manual draft restore and session-expiry |
| Signed-out visitor / unrelated student / reassignment / direct writes | Done | pgTAP `authz`; `tests/integration/data-api.test.ts` |
| Revoke pair while sessions/jobs exist | Done | pgTAP `authz` + `worker`; integration |
| Signup or login as an unknown email | Done | Integration; generic padded login response |
| Expired/reused login link; mid-draft expiry | Done | Manual (reused link → fresh sign-in; draft kept) |
| Malicious Markdown, HTML, URL, oversized body, remote image | Done | `tests/unit/markdown.test.tsx`, validation tests, manual |
| Cross-origin mutation and notification spam | Done | Manual curl (403); pgTAP rate limit |
| Static HTML, bundles, search, caches | Done locally | Secret scan of `dist/`; `no-store` headers; private routes absent from search/sitemap |
| Preview or untrusted-PR deployment | Not started | Requires hosting decision |
| Email failure, worker crash, overlapping runs, 24 h cutoff | Done (fake transport) | pgTAP `worker`; unit + integration worker tests. Real Resend delivery untested |
| Supabase or email unavailable | Done | Manual: notes and search work with the API down |
| Keyboard, desktop selection, mobile touch | Partial | Desktop selection manual; keyboard/touch and a mobile pass not yet done |

Still open before launch: Phase 0 decisions (§5), Netlify deploy and on-demand-page CSP check on a deploy preview (Netlify's adapter has no local preview), Resend domain + SMTP, mobile/keyboard review, backups/retention, privacy notice, and replacing the starter notes.

