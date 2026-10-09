# CS3251 Tutoring

A public collection of Markdown teaching notes with a private question workspace for a tutor and an invited student.

**Core workflow:** read → capture confusion → discuss asynchronously or during tutoring → resolve.

The goal is to showcase the tutor's teaching and initiative while making limited tutoring time more effective. The software supports that goal; technical novelty is not a goal.

## Project status

Implemented and tested **locally** against a local Supabase stack; **not deployed**. No hosting, cloud database, email provider, or domain has been provisioned (Phase 0 budget gate). See [implementation status](docs/implementation.md#6-implementation-status).

UI mockups: [CS3251 Tutoring UI (Claude Design)](https://claude.ai/artifact/522KJSdQcG1eJtbh7osKJv).

## Local development

Requires Node ≥ 22.12, npm, and Docker.

```bash
npm install
npm run db:start                     # local Supabase (Postgres, Auth, Mailpit at http://127.0.0.1:54324)
cp .env.example .env                 # then fill keys from: npx supabase status -o env
npm run accounts -- invite tutor@example.test
npm run accounts -- invite student@example.test
npm run accounts -- pair tutor@example.test student@example.test
npm run dev                          # http://localhost:4321
```

Accept each invitation from Mailpit (invited accounts must accept once before magic-link sign-in works). Open emailed links in the same browser that requested them.

Checks: `npm run check`, `npm run build`, `npm run test:all` (unit, pgTAP database policies, and direct Data API attacks against the local stack).

### Writing notes

Add Markdown under `src/content/docs/notes/<topic>/`. Every note needs a unique, permanent `noteId` in its frontmatter; the build fails on a missing or duplicate ID. A new topic directory also needs a sidebar group in `astro.config.mjs`.

## Design documents

Read these in order:

1. [Product scope](docs/product.md) — users, requirements, boundaries, and success criteria.
2. [User experience](docs/experience.md) — pages, question capture, quoting, and lifecycle rules.
3. [Technical design](docs/architecture.md) — stack, data model, authorization, publishing, and email delivery.
4. [Implementation and launch plan](docs/implementation.md) — build sequence, acceptance tests, operations, and outstanding decisions.

The product document records agreed requirements. More detailed UX and technical choices are proposed implementation defaults, not features already built or tested.

## Recommended stack

- Astro + Starlight for Git-backed Markdown publishing.
- React + TypeScript for interactive question features.
- Supabase Auth + Postgres for invited accounts and private conversations.
- Resend for authentication email delivery and question/reply notifications.
- Netlify for the public site, server endpoints, and scheduled notification delivery.
- GitHub for source code and teaching notes; optionally under a dedicated organization.

The [course homepage](https://vuse-cs3251.github.io/) is a reference, not permission to republish course materials.
