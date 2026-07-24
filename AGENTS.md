# AGENTS.md

<!--
  Canonical, tool-agnostic agent instructions for this repository.
  Read by Codex, Cursor, Copilot, Gemini CLI and others natively.
  Claude Code imports this via the one-line CLAUDE.md pointer.
  Tool-specific mechanics (subagent wiring, models) live in the
  tool's own directory (e.g. .claude/) as thin wrappers.
-->

## Project overview

Tips 13 ("Tipsklubben Miniputterne") — a web app for a small friend
group playing a weekly football prediction game based on the Danish
"Tips 13 lørdag" coupon. Each round has 13 matches; members pick 1/X/2
before a deadline, and a "Fedt" score (0 = bold picks, 100 = safe picks)
breaks leaderboard ties. Admins create seasons/rounds and enter matches
and results, manually or auto-resolved via football-data.org.

Stack: Next.js 14 (App Router) + TypeScript, Supabase (PostgreSQL +
Google OAuth), Prisma ORM, Tailwind CSS, Vitest. Hosted on Vercel.

Layout:

- `src/app/` — pages and API routes (`rounds/`, `leaderboard/`, `fedt/`,
  `profile/`, `admin/`, `api/`)
- `src/components/` — reusable UI components
- `src/lib/` — core logic and clients: `fedt.ts` (scoring), `auth.ts`,
  `prisma.ts`, `football-api.ts`, `supabase-browser.ts` /
  `supabase-server.ts`
- `src/types/` — shared TypeScript types
- `prisma/schema.prisma` — database schema; `prisma/seed.ts` — seed data
- `prisma/migrations/` — Prisma Migrate migrations

## Core commands

- `npm run dev` — dev server at http://localhost:3000
- `npm test` — run all unit tests (Vitest; tests live next to source,
  e.g. `src/lib/fedt.test.ts`)
- `npx vitest run src/lib/fedt.test.ts` — run a single test file
- `npm run build` — runs tests, then `next build`; use as the final
  verification gate (local only; no database)
- `npm run lint` — ESLint via Next.js
- `npm run db:migrate` — Prisma Migrate dev workflow (creates a migration
  from schema changes and applies it to the dev DB)
- `npm run db:deploy` — applies pending migrations to the database (prod
  runs this automatically via `vercel-build`)
- `npm run db:seed` / `db:studio` — seed data, data browser
- `npx prisma generate` — regenerate the Prisma client after schema
  changes (also runs on `postinstall`)

## Orchestration protocol

When you (the agent) are acting as the **main / orchestrating session**,
follow this protocol. Role definitions for delegated workers live in
`.agents/roles/` and are tool-agnostic.

### Hard rules

1. **Never write or edit code directly in the orchestrating session.**
   All implementation is delegated to a worker following
   `.agents/roles/implementer.md`. All test authoring is delegated to a
   worker following `.agents/roles/test-writer.md`.
2. **Decompose before dispatching.** Break requests into independently
   verifiable tasks. Every task brief must include:
   - Goal (one sentence)
   - Files in scope (explicit paths — workers must not roam)
   - Acceptance criteria (how completion will be verified)
   - Constraints (patterns to follow, things NOT to touch)
3. **Parallelize independent tasks** (disjoint file sets); sequence
   tasks that share files.
4. **Review everything.** After implementation, dispatch a worker
   following `.agents/roles/code-reviewer.md` on the diff. Do not report
   success until the reviewer has no blocking findings AND the test
   suite passes.
5. **Escalate, don't grind.** If a worker fails the same task twice,
   do not retry a third time with the same brief. Rewrite the brief with
   more context, hand the worker a precise step-by-step patch plan, or
   surface the blocker to the user.
6. **Keep orchestrator context clean.** Delegate high-volume codebase
   research to a read-only research worker; require conclusions, not
   raw file dumps.

### Dispatch guide

| Task type                                  | Role file                        |
|--------------------------------------------|----------------------------------|
| Writing/modifying production code          | .agents/roles/implementer.md     |
| Writing/modifying tests                    | .agents/roles/test-writer.md     |
| Reviewing a diff before completion         | .agents/roles/code-reviewer.md   |
| Codebase research                          | tool's built-in research agent   |

### The orchestrator handles directly

- Architecture and design decisions
- Task decomposition, sequencing, and writing briefs
- Clarifying ambiguous requests with the user
- Final verification: running the test suite / build before declaring done
- Git operations (commits only when the user asks)

### Reporting format

On completion, report: files changed (one-line summary each), how it
was verified (tests run, reviewer verdict), and non-blocking follow-ups
the reviewer flagged.

## Boundaries

- **Never touch:** `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`,
  and the generated Prisma client — regenerate, don't edit.
- **Secrets:** never read, print, or commit `.env*` files. Refer to
  environment variables by name only (`DATABASE_URL`, `DIRECT_URL`,
  `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_*`,
  `FOOTBALL_DATA_API_KEY`, `NEXT_PUBLIC_APP_URL`).
- **Database:** schema changes go through `prisma/schema.prisma` and get a
  migration via `npm run db:migrate`; never edit an existing migration in
  `prisma/migrations/` — add a new one. Do not run `db:migrate`,
  `db:deploy`, `db:seed`, or `vercel-build` unless the user asks; they
  connect to live databases. Use plain `npm run build` as the local
  verification gate (database-free). See `docs/prisma-migrate-rollout.md`
  for the one-time production baseline and rollout procedure.
- **Dependencies:** don't add new npm packages without asking; the
  project deliberately keeps a small dependency footprint.
- **Design references:** `design_handoff_tips13_redesign/` and
  `Design implementation planning.zip` are read-only input material,
  not part of the app.
- **Git:** commit or push only when the user asks (see orchestration
  protocol above).
