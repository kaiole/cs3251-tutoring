# CS3251 Tutoring

A public site of C++ teaching notes for CS3251, plus a private question workspace for one tutor and one invited student. Read a note, highlight a passage, ask about it, and resolve the question once it's answered.

Built with Astro, React, Supabase (Postgres + Auth) and Netlify. Runs locally; not deployed.

## Run locally

Requires Node 22.12+, npm and Docker.

```bash
npm install
npm run db:start                     # local Supabase (email inbox at http://127.0.0.1:54324)
cp .env.example .env                 # fill in keys from: npx supabase status -o env
npm run accounts -- invite tutor@example.test
npm run accounts -- invite student@example.test
npm run accounts -- pair tutor@example.test student@example.test
npm run dev                          # http://localhost:4321
```

Accept each invitation from the local inbox before signing in.

## Tests

```bash
npm run check       # types and note checks
npm run test:all    # unit, database policy, and API tests
```

## Writing notes

Add Markdown files under `src/content/docs/notes/<topic>/`. Each note needs a unique, permanent `noteId` in its frontmatter. A new topic also needs a sidebar entry in `astro.config.mjs`.
