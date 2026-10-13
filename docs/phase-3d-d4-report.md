# Phase 3D-D4 preparation: isolated authenticated MCQ persistence

**Superseded operational setup:** the product now uses ONE existing hosted Supabase project and an isolated local database. Do not follow the second-project creation/launcher instructions below. See `docs/platform-milestone-1.md` for the current incremental plan and gates. The D4 preparation, SQL/tests and verification below remain a record of locally tested work; they do not establish real hosted saves.

Status: **local implementation and tests only; staging is not configured or verified**. No hosted connection, schema inspection, migration, import, approval, deployment or activation was performed. Existing v1 credentials, routes, history, UI, migrations and drafts remain intact. No expanded lesson is advertised as saved learning.

## Staging readiness and exact setup

Inspection found `.env.local` with the existing Supabase URL/publishable-key settings, but no `.env.staging.local`, staging environment identity, restricted writer configuration or linked staging metadata. The existing project is **unclassified**, not permission to reuse it. Only variable names/presence and the nonsecret project identity were inspected; secrets were not printed and neither project was contacted. `npm run staging:check` currently exits with a safe “Staging is not ready” error.

Complete these steps first:

1. In the Supabase Dashboard, create a **new project** named **LinguaTrack Staging**. Use a distinct project reference and database password. Keep the password in your password manager. Do not clone production learner data, reuse the existing project, or link/push migrations yet. Project creation and URL/publishable-key retrieval follow the [official Next.js setup guide](https://supabase.com/docs/guides/auth/quickstarts/nextjs).
2. Under **Authentication → URL Configuration**, set **Site URL** to `http://localhost:3200` and add **Redirect URLs** `http://localhost:3200/auth/callback`. If using `127.0.0.1`, separately add `http://127.0.0.1:3200/auth/callback` and consistently use that origin. Preserve email confirmation; use two test email addresses you control for the later isolation test. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
3. Copy the template without replacing an existing file:

   ```bash
   cd /Users/sp/Documents/git/linguatrack
   test ! -e .env.staging.local && cp .env.staging.example .env.staging.local
   ```

   Edit **only** the ignored `.env.staging.local`:

   ```dotenv
   LINGUATRACK_RUNTIME_ENV=staging
   LINGUATRACK_STAGING_PROJECT_REF=<new-project-ref>
   LINGUATRACK_PROTECTED_PROJECT_REF=<existing-project-ref-from-.env.local-URL>
   NEXT_PUBLIC_SUPABASE_URL=https://<new-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<new-project-publishable-key>
   LINGUATRACK_V2_HISTORY_ENABLED=false
   LINGUATRACK_V2_MCQ_ENABLED=false
   LINGUATRACK_STAGING_WRITER_DATABASE_URL=
   LINGUATRACK_STAGING_DATABASE_CA=
   ```

   References must be distinct 20-character project identifiers. Use the new project's **publishable key**, never a service-role/secret key. Do not paste credentials into chat, Git, screenshots or shell command arguments. Leave writer credentials empty and both feature flags false until the authorized setup below.

4. With Node.js 22+, run `npm run staging:check`. This parses the separate file, checks that its protected identity matches the existing app and that its target differs, and validates writer configuration only when enabled. It makes **no network/database connection** and cannot certify credentials, deployed migrations, authenticated saves or readiness for publication.
5. Provide the **new project reference only** and explicit authorization for a read-only staging preflight. Before any hosted migration, agree on the staged migration/grant review and backup/restore scope below. Project creation/configuration is not migration authorization. No authorization has been supplied yet.

After those gates, a later authorized setup must inspect the actual staging schema, migration ledger, PostgreSQL/extensions, `auth` integration, exposed schemas, grants, role memberships, RLS, existing v1 catalog and channel state. The local fixture is not proof of deployed compatibility. An empty staging project must still have all prerequisite migrations applied in order through the reviewed migration workflow, never by a reset:

1. `20261011000100_learning.sql`
2. `20261011000200_curriculum_v1.sql`
3. `20261011000300_reset_learning.sql`
4. `20261012000100_curriculum_registry.sql`
5. `20261013000100_learning_v2_lifecycle.sql`
6. **New:** `20261013000200_staging_v2_mcq.sql`

No hosted migration runner was added. Do not use `supabase db push` against the existing project. Applying these files does not create reviews, test accounts, a usable v2 lesson or enabled staging permissions.

## Authorized staging provisioning — still pending

This is a checklist for review, **not permission or an executed script**:

- Verify backups/restore scope using `docs/backups.md`: auth identities, managed schemas/objects, v1 private catalog and personal data, D2 registry/artifacts/media/reviews, D3 public history/private bindings, D4 receipts/environment/cohort permissions, and custom roles/grants. Keep credentials/backups outside Git. Verify an isolated restore before enabling writes; record target references, timestamps, row counts, grants/RLS and test receipts. Do not perform a restore drill in the existing learner database.
- Review a separate SQL login `linguatrack_staging_app` with `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Grant only membership in the migration-created `linguatrack_staging_writer` group and database CONNECT if required. Do not assign registry importer/reviewer, table mutation, private-key SELECT, schema CREATE, admin or service-role privileges. Set its password through a secure operator workflow, not a committed script or command line. Revoke unintended pre-existing/default privileges if inspection finds any. Verify this exact custom role can connect through the chosen provider connection mode before enabling the API.
- Put its direct SQL connection in `LINGUATRACK_STAGING_WRITER_DATABASE_URL`: `postgresql://linguatrack_staging_app:<URL-encoded-password>@db.<new-ref>.supabase.co:5432/postgres`. If direct connectivity is unavailable, use the **Dashboard Connect session-pooler host**, username `linguatrack_staging_app.<new-ref>`, port `5432`. Transaction-pooler port `6543`, admin usernames, a different target and URL SSL override parameters are rejected. [Supabase PostgreSQL connection options](https://supabase.com/docs/guides/database/connecting-to-postgres).
- TLS certificate verification is mandatory. If the environment requires an explicit provider CA, set `LINGUATRACK_STAGING_DATABASE_CA` to the staging CA PEM using literal `\n` escapes. Do not set `rejectUnauthorized=false`, `sslmode=no-verify`, or work around certificate failures. Restart the staging process after changing its configuration. [node-postgres TLS options](https://node-postgres.com/features/ssl).
- Independently assign authenticated registry importer and reviewer principals. Obtain the four required scopes — translation, coverage, grading, compatibility — bound to the exact candidate hash. Author-written manifest review names confer no authority. Prepare/register/review/stage a **new unused sealed candidate** using the D2 contracts through a separately reviewed hosted operator adapter; the current registry CLI supports embedded local databases only. Do not improvise admin inserts or fabricate review approvals to make a lesson work.
- Resolve all candidate locale exceptions and candidate-target compatibility proposals; retain ancestor mappings, old grading bindings and old versions. Drafts **1.1.0–1.8.0 remain immutable, inactive and unapproved**. In particular, 1.3.0's 55 locale exceptions and 237 pending mappings are not automatically approved. There is currently **no real eligible candidate**.
- Verify the selected practice block's exact lesson/block/exercise revisions and supported MCQ runtime. D4 accepts `exercise_set`/`quiz` delivery with MCQ-only leaves; chapter assessment delivery and all other graders are blocked. Registry/media/capability validation remains mandatory before staging.
- After explicit staging-write approval, an operator may configure the private singleton `learning_staging_environment` for the verified **new project reference**, with `environment='staging'`. This migration deliberately inserts no row. Assign `learning_staging_permissions` to the two staging learner UUIDs, exact approved release hash, lesson revision and delivery revision; enable `allow_new` and `allow_finish` only for this allowlisted experiment. The server resolves authority from these bindings, never arbitrary browser release selection. Permission changes must be recorded in the operator run log; a full audited D5 activation workflow is not supplied here.
- Create/confirm two staging accounts at `http://localhost:3200/account` **after** the reviewed auth/profile prerequisites exist. Capture their UUIDs for the allowlist. Do not use existing account passwords or copy production history. Enable history reads only after D3 verification; enable `LINGUATRACK_V2_MCQ_ENABLED=true` only after marker/cohort/content/grant checks. Rerun `npm run staging:check`, then `npm run staging:dev`.

The launcher uses the separate env file, `127.0.0.1:3200` and `.next-staging`, preserving the main app's `.env.local` and build output. It does not migrate, provision accounts/roles, import content or enable a channel. Supabase cookies are project-specific; use separate browser profiles for the two-account test to avoid ambiguous session switching.

## Local implementation

### Private staging SQL boundary

The additive migration adds three RLS-protected **unexposed `private`** relations:

| Relation                       | Purpose                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `learning_staging_environment` | Explicit staging identity and disabled-by-default operational permission; no seeded enabled environment.                        |
| `learning_staging_permissions` | Owner + exact release/lesson/delivery allowlist, with separate new-attempt and existing-attempt permission.                     |
| `learning_v2_mcq_receipts`     | Immutable original submission and safe acknowledgement, tied to D3 response/owner/generation/release by cascading composite FK. |

The writer group has schema USAGE and only two private function entry points: `staging_mcq_context` and `commit_staging_mcq`. Neither is exposed through PostgREST or executable by anonymous/authenticated browser or registry roles. It has no direct table/key SELECT or learning mutation grants. Functions derive writer authority from `session_user` membership; a registry principal cannot impersonate a writer with caller-written claims. The server derives learner ownership from verified Supabase `getUser()`, not an input UUID.

Context checks owner/profile lock and shared reset generation **before receipt replay**, pins existing attempts, requires exact cohort authority and an inactive sealed registered release, rechecks authenticated hash-bound reviews/compatibility, and verifies exact graph/delivery/MCQ grading capabilities. Newly started attempts are limited to 100 per learner/hour. A committed identical retry returns its original receipt without regrading or rewriting timestamps; changed UUID payloads, foreign owners and stale reset generations fail.

The transaction atomically writes D3 immutable attempt, public answer snapshot, private grading binding, grade and bilingual feedback, mistake for an incorrect answer, final practice aggregate when every required question has a committed grade, and immutable receipts. SQL independently checks the Node exact-set grade against the original private binding. Scores are recognition practice results: **no assessment pass, lesson completion or CEFR proficiency is awarded**. Existing v1 APIs retain their original 1.0.0 lazy attempt creation and 80% pass semantics.

Existing D3 reset cascades the new receipt rows with the response; no reset contract or historical migration changed. Shared profile locks serialize reset/save ordering. Already-finalized attempts require a new attempt UUID for another answer. Saved history remains available through D3's owner-scoped combined history/export once explicitly enabled in staging.

### Server endpoint and transaction adapter

`POST /api/learning/v2/answer` is **default-off/staging-only**. The strict public contract contains schema/release/version, attempt/response UUIDs, generation, exact lesson/delivery/exercise references and chosen option IDs. It refuses client score, feedback, grading or owner fields. Origin/body validation precedes verified auth; required `X-Learner-ID` is a **reject-only** account-switch hint and never grants ownership.

The server-only `pg` adapter verifies the separate target/restricted username/TLS, begins a transaction, uses the restricted group, obtains private context, computes the exact-set grade and persists it. It returns `{mode:'persistent', saved:true, ...}` **only after COMMIT succeeds**. Safe feedback contains this submitted question's bilingual explanation/correct answer, never bulk rules or unanswered keys. Database/auth failures return sanitized errors with no successful acknowledgement; retries retain their original IDs. No secret connection or raw SQL error is logged. Browser bundles import only submission/receipt/outbox contracts.

This is **not** an authenticated preview endpoint, an active-release API or a production learner route. Previews remain unpersisted. No UI adapter calls this new endpoint yet: adding it to the main Learn/Practice/Review player waits for an eligible reviewed candidate and verified staging setup. D5 production delivery and activation remain separate.

### Durable outbox

`mcq-outbox.ts` stores immutable submissions at `linguatrack:pending:v2:<project-ref>:<owner-id>`. It never touches v1 queue keys. Queue before sending, keep stable UUIDs/hash/version/generation and retry after refresh/sign-in in the original account. Before every dispatch verify active identity; send the reject-only expected-owner hint. Remove only a schema-validated, exact owner/project/submission committed receipt. Network/auth/SQL/conflict/invalid-ack/storage failures retain the answer or raise a visible error; no fallback claims persistence. `onCommitted` delivers each successful acknowledgement even if a later batch item fails.

Reset cleanup requires an authenticated owner snapshot with the current generation. A generic 409 is not a signal to discard a queue. The future UI must keep unsent text on screen when storage is unavailable and distinguish **queued**, **saving**, **saved** and **retry required**; shared-device browser storage is not encryption. Feedback can be reloaded from database history rather than browser-only state. This library is not wired into the live or preview player yet.

## Exact files in this change

New:

- `supabase/migrations/20261013000200_staging_v2_mcq.sql`
- `src/app/api/learning/v2/answer/route.ts`
- `src/lib/learning/v2/mcq-contracts.ts`
- `src/lib/learning/v2/mcq-writer.ts`
- `src/lib/learning/v2/mcq-outbox.ts`
- `src/lib/learning/v2/staging-environment.ts`
- `src/lib/learning/v2/staging-database.ts`
- `scripts/learning/staging.ts`
- `.env.staging.example`
- `tests/learning-d4/fixtures.ts`
- `tests/learning-d4/database.test.ts`
- `tests/learning-d4/grading.test.ts`
- `tests/learning-d4/api.test.ts`
- `tests/learning-d4/outbox.test.ts`
- `tests/learning-d4/transaction.test.ts`
- `docs/phase-3d-d4-report.md`

Updated: `.env.example` (default-off MCQ flag), `.gitignore`/`eslint.config.mjs`/`tsconfig.json` (separate ignored staging output/template handling), `package.json`/`package-lock.json` (free `pg` driver/types and three commands), `scripts/serve-e2e.mjs`/`scripts/serve-preview-e2e.mjs` (force new writer off during regressions). Other pre-existing uncommitted files belong to earlier phases and were preserved.

## Commands and verification

Node.js 22+:

```bash
npm run staging:check           # configuration only; expected refusal until separate env exists
npm run staging:dev             # separately configured dev origin; not a migration runner
npm run test:learning:d4         # disposable embedded PostgreSQL + adapter/queue/API tests
npm run lint
NEXT_DIST_DIR=.next-e2e npm run typecheck
npm test
npm run content:check
npm run curriculum:v2:schemas:check
npm run test:e2e                # isolated production build + browser regressions
npm run test:e2e:preview -- study-navigation.spec.ts home-study-entry.spec.ts
```

Local SQL tests inspect the disposable database and five-migration ledger before adding D4. They use temporary synthetic sealed 9.0.0/9.1.0 content, test-only assigned independent reviewers and simulated auth identities; no real draft is sealed, reviewed, staged or served. Reopening file-backed PostgreSQL verifies local history/receipt durability. A two-question fixture verifies that new starts can be withdrawn while a previously started, reviewed attempt finishes. The Node `pg` driver's COMMIT acknowledgement is independently tested with a mock, including commit failure/rollback. PGlite auth/roles and serial ordering are **not** live Supabase authentication, multi-connection races, cross-device browser persistence or a hosted restore drill.

Verification results are recorded after final checks below. Dependency inspection found five pre-existing high-severity dev-toolchain audit entries in the unchanged Next/ESLint/fast-glob/micromatch/braces chain; no new `pg` advisory was reported. No forced framework/dependency migration was performed in this scoped change.

## Learner URLs and remaining gates

Current usable main-site **v1** paths remain:

- `http://localhost:3000/` — Dashboard
- `http://localhost:3000/courses` — My Courses
- `http://localhost:3000/courses/a1` — A1
- `http://localhost:3000/courses/a1/chapters/first-conversations` — Chapter 1
- `http://localhost:3000/courses/a1/chapters/first-conversations/lessons/introductions`
- `http://localhost:3000/courses/a1/chapters/first-conversations/lessons/am-is-are`
- `http://localhost:3000/courses/a1/chapters/first-conversations/lessons/chapter-check`

Staging **planned**, after configuration/provisioning: `http://localhost:3200/`, `http://localhost:3200/account`, and staging-only POST `http://localhost:3200/api/learning/v2/answer`. There is currently **no saved v2 learner lesson URL**. The development picker remains `http://localhost:3000/dev/a1`; its expanded lessons remain explicitly unsaved. Audio-pending scripts are not listening assessments, and speaking/writing remain ungraded self-practice.

Required exit checks before claiming real D4 persistence:

1. Separate target identity + explicit preflight/migration/provisioning authorization + verified backup/restore plan.
2. Eligible unused sealed candidate, authenticated independent review decisions, fully resolved candidate mappings/locales, exact capability/media preflight and inactive stage import.
3. Two real confirmed staging accounts; narrow writer/cohort permissions; read-only history/export verified before enabling MCQ writes.
4. Staging learner delivery adapter that reuses green/cream Learn/Practice/Review, loads only public approved exact content, calls the durable outbox/writer and restores saved feedback. No promotion of draft preview payloads.
5. Real authenticated SQL COMMIT + independent history/export check, then browser refresh, sign-out/sign-in, second account/device, guessed IDs/RPCs, expired cookies, offline retry/lost ACK/conflicting retries, old v1 offline **first** answer, simultaneous reset/save connections and safe cohort withdrawal/drain. Retain old scores/versions.
6. Separate completion/resume/study-session writer and navigation ordering integration, as designed in D3, before promising the complete “Save Progress → Next Lesson” flow. MCQ correctness does not imply completion/proficiency. D4 preparation only writes MCQ practice history.
7. D5 controlled activation/rollback audit, route/channel epoch and backup restore drill with a separately authorized canary. D2 channels remain disabled; no real activation/rollback was claimed.

**Stop at these gates.** No staging project or real approved candidate is available; authenticated staging saves and the main-site expanded curriculum cannot honestly be claimed yet.

## Final verification results

| Check                                                                                                      | Result                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4 tests                                                                                                   | **20 passed across 5 test files**: real embedded SQL writes/reopen, repeated attempts and exact retry replay, two-owner isolation, blocked private access, reviewer/cohort checks, invalid/forged grades, atomic failure rollback, reset ordering, in-flight finish after new-start withdrawal; queue/HTTP/COMMIT barriers and all 14 existing pronoun answer mappings. |
| Complete unit/integration suite                                                                            | **209 passed across 38 files**, including existing v1, D1–D3, content/schema, history/export/reset, grading-security and preview regressions.                                                                                                                                                                                                                           |
| ESLint and strict TypeScript                                                                               | Passed. Isolated `.next-e2e` route generation preserved the running main app's build output.                                                                                                                                                                                                                                                                            |
| Production build and browser tests                                                                         | Production build passed via the browser-suite server wrapper; **26 desktop/mobile cases passed**, including v1 persistence/retry/reset mocks, accessibility, hidden grading keys and disabled preview/v2 APIs. Browser persistence mocks are not actual hosted commits.                                                                                                 |
| Development preview/navigation                                                                             | **6 desktop/mobile cases passed**; existing Learn/Practice/Review, chapter/lesson links, audio-pending labels, accessibility and unsaved behavior preserved.                                                                                                                                                                                                            |
| v1 content and generated v2 JSON schemas                                                                   | Both checks passed; outputs unchanged.                                                                                                                                                                                                                                                                                                                                  |
| Immutable file verification                                                                                | **188 pre-existing content, authoring, schema, draft and migration files remained byte-identical**. The new migration is separate.                                                                                                                                                                                                                                      |
| Staging configuration check                                                                                | Expected safe refusal because no `.env.staging.local` exists; no connection or secret output.                                                                                                                                                                                                                                                                           |
| Real staging authentication, concurrent races, refresh/device persistence, restore and activation/rollback | **Not run; blocked by the setup/authorization/review gates above.**                                                                                                                                                                                                                                                                                                     |
