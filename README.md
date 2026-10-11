# LinguaTrack Academy

English learning with Burmese explanations, built with Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui and Supabase. Phase 2 adds account-owned learning history while preserving the Phase 1 dashboard, sidebar, course pages and lesson navigation. The A1 sample chapter remains the playable curriculum; A2–C1, TOEIC and IT Business English remain planned.

## Launch locally

Use **Node.js 22+** and npm 10+. With nvm installed:

```bash
cd /Users/sp/Documents/git/linguatrack
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. Both environment variables may stay blank: the application then runs in explicitly labelled **preview mode**, where completion and quiz history reset on reload. No account, credentials or paid AI API is needed for preview. There is no fabricated saved progress. Use `npm run dev -- --port 3001` for a different port; configure the matching Supabase redirect URL before testing authentication.

For a production build:

```bash
npm run build
npm start
```

## Enable saved learning with Supabase

1. Create or use a Supabase project. In **Project Settings → API**, copy the project URL and **publishable** key into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the legacy anon key also works)
2. In **Authentication → URL Configuration**, set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to redirect URLs. Use the same host throughout registration and confirmation. Add the actual HTTPS deployment URL and its callback when deploying.
3. Enable email/password sign-in. Keep email confirmation enabled. Configure a production SMTP sender before inviting real learners; provider email limits apply. Password minimum is eight characters in the app.
4. Apply these migrations **once, in order**, in the project's SQL Editor:
   - `supabase/migrations/20261011000100_learning.sql`
   - `supabase/migrations/20261011000200_curriculum_v1.sql`
     Alternatively, use the Supabase CLI: `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`. CLI linking asks for database access; do not put those secrets in the app environment or source files.
5. Restart the development server after changing environment variables; rebuild and restart for production. Open **Your account** via the sidebar, create an account, confirm the email in the same browser, and sign in. The header and notice now identify **saved** progress. Preview activity is not imported.
6. Complete a lesson, answer part of a quiz, reload, then sign into that account in another browser/device. Verify completion, quiz continuation and **Continue learning**. Sign in with a different account to verify empty personal history.

Only the two public environment variables are required. The app uses the learner's verified auth cookies and owner-checked PostgreSQL functions; **no service-role key is used**. `.env.local` is ignored. A missing pair enables preview; a partial or broken configuration surfaces an error. Never use a Supabase secret/service-role key as a `NEXT_PUBLIC_*` variable.

### Optional local Supabase

With Docker running and the Supabase CLI installed, run `supabase start` and `supabase db reset` from this repository. **Reset destroys the local database**, so use it only for an expendable development instance. Copy the local URL and publishable/anon key shown by the CLI into `.env.local`. Local confirmation emails appear in the mail viewer at http://localhost:54324. `supabase/config.toml` configures local ports and callbacks. Stop with `supabase stop` when finished.

Hosted Supabase credentials were unavailable during implementation. The actual migrations were verified using PostgreSQL in PGlite; live hosted email delivery, cookie refresh and cross-device Supabase integration still require the setup smoke test above.

## Learning behavior

- Every **Check answer** goes to the server. Private canonical content validates lesson, quiz, question and option IDs; PostgreSQL independently calculates correctness and saves a snapshot of the prompt, options, chosen/correct answers, English/Burmese explanation and timestamp.
- The first answer creates an attempt. Every question is saved before feedback appears. The attempt is finalized when all questions are answered. New retries create new IDs; old completed attempts and responses are immutable. Partial attempts remain visible and resumable.
- Before a signed-in answer is sent, an owner-scoped pending draft is stored in this browser's localStorage. A draft is removed only after server acknowledgement. Network failures retain the exact answer and attempt ID, show an error and expose retry. Duplicate delivery is idempotent. Saving is blocked if browser storage cannot protect the answer. Pending drafts stay on this device until synced; synced history is available across devices.
- An expired session never silently discards a queued answer. Sign back into the original account and retry synchronization. Avoid clearing browser storage with pending answers. Shared-device users should sync before signing out and remove their browser data after export if needed.
- Regular lesson completion is self-reported. Quiz lesson completion requires a completed passing attempt (80% in this chapter), enforced by the database. Failing a later retry does not remove completion.
- Visible lesson sections and 30-second heartbeats save the resume position. Study time is an estimate of visible activity; each heartbeat is capped and gaps over 90 seconds add no time. It does not establish learning proficiency.
- **Review history** includes complete and partial attempts, original answer explanations, incorrect-answer filtering, reviewed-mistake status and retry/resume links. Earlier curriculum versions retain their historical snapshots.
- **My progress** separates lesson coverage from the latest scored response per unique question. Repeating a question cannot increase the evidence count. Listening/speaking/reading are not scored in this sample; its writing multiple-choice item assesses recognition, not free writing. No score certifies a CEFR level.
- Writing drafts and speaking practice checkboxes remain page-local practice tools. They are not submitted or graded in Phase 2. No recording, AI grading, streak inference or paid AI integration is included.

## Checks

```bash
npm run content:check # Public payload and immutable database seed match canonical content
npm run lint
npm run typecheck
npm test
npm run build
npm run check         # All checks above
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Unit/API/component tests cover private-key exclusion, strict submission validation, authentication outages, completion vs evidence, durable pending drafts and failed-save recovery. Database tests execute the migrations against **real PostgreSQL in PGlite**, including RLS under authenticated/anonymous roles, owner isolation across all six tables, repeated attempts, immutable snapshots, completion gating, ordered resume updates and disk close/reopen persistence. They emulate `auth.uid()`; they do not emulate or verify the hosted Supabase auth service.

Playwright covers desktop/mobile learning, navigation, preview reset, API errors, resumed persistent snapshots and automated axe accessibility checks. Browser persistent tests mock the API boundary; database persistence and security are verified separately. Playwright builds and serves a separate production instance at 127.0.0.1:3100 using `.next-e2e`, with preview environment variables, keeping the normal build directory and development server separate. Test artifacts are ignored.

## Structure and content

```text
src/app/                     Existing pages, account page, auth callback and learning APIs
src/components/              Existing modular UI, account form, synchronized session provider
src/content/v1/               Canonical bilingual curriculum; server-only answer keys
src/content/public/v1/        Generated sanitized curriculum; no quiz keys/explanations
src/lib/curriculum/           Public schemas and scoped routing helpers
src/lib/learning/             Submission contracts, server grading, outbox and progress logic
src/lib/supabase/             SSR cookies, environment configuration and typed RPC contracts
src/proxy.ts                  Auth cookie refresh for protected API/auth routes
supabase/migrations/          Schema, ownership policies, RPCs and immutable content seed
scripts/generate-content.mjs  Produces public JSON and initial curriculum seed
public/audio/                 Local sample audio; bundled fonts require no remote font fetch
tests/                        Unit, component, API, PostgreSQL and desktop/mobile browser tests
docs/                         Curriculum contract, persistence design and backup/export guidance
```

The canonical JSON is not under `public/` and is imported by the grading module marked `server-only`. Initial quiz payloads contain prompts and options only. An answered question's key and explanation are returned for learning feedback. This is formative practice, not a protected high-stakes exam.

Before the initial content release is applied, `npm run content:generate` refreshes its public JSON and seed migration. **After publication, do not edit either applied migration or reuse the same content version for changed answer keys.** Add a new versioned canonical file and a new migration; extend the generator/release selection for that version. Preserve existing catalog rows so historical responses remain reproducible. See [curriculum contract](docs/curriculum.md) and [Phase 2 persistence design](docs/phase-2-supabase.md).

## Backups and export

Learners can download their complete owner-scoped JSON history from **My progress → Export learning data**. Administrator backup and restore instructions are in [backup/export guide](docs/backups.md). User JSON is a portable history export, not a database restore format. No automatic imports or destructive resets are exposed in the app.

## Dependency note

`tw-animate-css` remains pinned to 1.3.8 for the existing Tailwind Turbopack loader. The development ESLint tree contains the upstream `braces` advisory previously identified in Phase 1; no runtime dependency is affected by that finding. Recheck `npm audit` and apply compatible updates when available rather than forcing an unrelated major downgrade.
