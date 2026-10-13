# Phase 3D-D3: local storage and lifecycle foundation

D3 is implemented locally. D4–D7 are not implemented. No hosted database was inspected or migrated, no production credentials were used, no release/channel was activated, and no actual learner record was changed. The existing v1 learner UI, authentication, submission API, outbox, reset response contract and export version 1 remain intact. The new read interfaces default **off**.

This is the storage prerequisite for a real v2 learning platform, not a claim that expanded A1 lessons now save progress on the main website. Existing authenticated v1 learning remains the usable saved-learning path. V2 previews remain unsaved and separate.

## Repository inspection and implementation plan

The publishing plan, D1/D2 reports and v2 proposal were checked against the current repository, including:

| Area                        | Inspected paths / conclusion                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live routes and design      | `src/app/page.tsx`, `src/app/courses/`, `src/components/layout/`, `src/components/dashboard/`, `src/components/lessons/lesson-player.tsx`: green/cream shell and stable v1 routes; no v2 production adapter yet.                                     |
| Authentication and learning | `src/lib/supabase/`, `src/lib/learning/`, `src/components/progress/session-provider.tsx`, `src/app/api/learning/`: authenticated v1 database grading, persisted snapshots, owner-scoped durable outbox and generation-safe reset.                    |
| Migrations/configuration    | All four existing migration files, `supabase/config.toml`: local PostgreSQL 17 target, only public/graphql schemas exposed, REST row limit 1,000, D2 private registry disabled/inactive. These files do not prove deployed state.                    |
| Versioned content           | `src/lib/curriculum/v2/`, `src/lib/curriculum/catalog/`, `src/lib/curriculum/staging/`: exact references, hashes, immutable revisions, approval gates and D1 read-only reports.                                                                      |
| Authoring and previews      | `content-authoring/`, `.curriculum-drafts/1.1.0`–`1.8.0`, `src/lib/curriculum/*preview/`, `src/components/preview/`: all eight packages remain drafts. Preview renderers/grading are development-only; they are not production persistence adapters. |
| Tests and operations        | SQL/PGlite, API, outbox, progress/reset, registry, package, preview/browser suites, `docs/backups.md`: reusable local fixtures exist, but no verified hosted/staging auth or backup restore evidence exists.                                         |

Implementation order: inspect the isolated schema and migration ledger; add separate exact-versioned storage; add owner-only read/export projection; extend reset using the existing owner lock/generation; test lifecycle/security/durability; document future routes and stop before staging/publication.

## Additive migration

`supabase/migrations/20261013000100_learning_v2_lifecycle.sql` requires the existing v1/reset and D2 registry prerequisites. It changes no original migration or immutable package. Installation is transactional and itself deletes no learning records. **Do not apply it to hosted Supabase as part of this task.**

| New public relation                                 | Stored responsibility                                                                                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learning_v2_attempts`                              | Immutable owner/generation, exact staged release hash/version, lesson and delivery revisions, required leaf exercises, mode, runtime version and start timestamp.                                                          |
| `learning_v2_responses`                             | One immutable answer per exercise revision per attempt; request hash, original typed answer, public prompt/options snapshot, recognition/assistance context and receipt timestamp. Retrying practice uses another attempt. |
| `learning_v2_grades`                                | Append-only decisions, points/bounds, correctness or pending review, bilingual feedback and supersession link. Unanswered exercise keys are not projected.                                                                 |
| `learning_v2_attempt_results`                       | Append-only totals and result corrections; finalization requires all committed current grades. Practice has no pass/assessment policy. Original scores remain unchanged.                                                   |
| `learning_v2_completion_events`                     | Exact-release lesson completion and its source. Self-report and assessment provenance are distinct. Compatibility carry remains disabled/read-only; pending mappings cannot create completion.                             |
| `learning_v2_mistakes`, `learning_v2_review_events` | Incorrect grade references and append-only review actions, with owner/generation/release composite FKs.                                                                                                                    |
| `learning_v2_resume`                                | Exact lesson/block/exercise refs and Learn/Practice/Review step, session sequence, increasing navigation order and server acceptance time.                                                                                 |
| `learning_v2_study_sessions`                        | Generation-scoped activity; updates preserve identity/start time, increase sequence and bound each heartbeat increment to 30 seconds.                                                                                      |

Private relations under the existing unexposed `private` schema: `learning_v2_bindings`, `learning_v2_receipts`, `learning_v2_grade_audit`, `learning_navigation_events`. They retain exact binding/request hashes and database-principal provenance, and are excluded from learner exports. No writer or human reviewer authority is granted. Test corrections are administrator-inserted synthetic decisions, not real editorial/human grading approval.

All exposed tables have owner SELECT RLS and revoked direct browser INSERT/UPDATE/DELETE/TRUNCATE. Anonymous access is denied. Registry importer/reviewer roles cannot access learning tables/functions. New privileged helpers have schema-qualified objects, empty search paths and revoked PUBLIC execution. Composite FKs prevent cross-owner, generation, release and parent substitution; profile-locking triggers reject stale-generation inserts/updates. Immutable history updates and truncation are rejected; reset and auth-user cascade deletion are supported deletion paths.

Exact membership checks bind attempts to staged releases, public lesson/delivery revisions and required exercises. Private bindings must match stored registry hashes. MCQ choices/cardinality and prompt/options snapshots are checked; feedback uses a strict safe field set. Assessment grading/finalization, comprehension evidence, speaking uploads, compatibility carry and automatic writing grading are disabled. Other deterministic response families have structural storage checks, but their complete runtime validators/graders are **not enabled or certified by D3**.

## Read-only combined history and export

`public.learning_history_v2()` obtains the authenticated owner from `auth.uid()` and the shared profile lock. It returns a consistent version-2 envelope containing the unchanged version-1 export plus current-generation v2 collections and the most recent known navigation event. No v1 rows are copied into v2, mapped to new revisions, regraded or rewritten. Original scores, answers, explanations and timestamps remain explicit.

Aggregation happens in PostgreSQL in one owner snapshot, avoiding silent PostgREST 1,000-row truncation. A test exports 1,002 attempts. A failed/oversized request is an error, never a truncated successful export. Very large histories will need bounded cursor paging/streaming before a broad rollout; D3 does not claim unbounded-scale export performance. `complete=true` refers to the defined learner-history collections, not an auth/Storage/database backup. Operational receipts and private keys are not exported; no uploads exist in this phase.

New interfaces:

- `src/lib/learning/v2/contracts.ts`: strict Zod contracts/types, owner/generation checks, safe feedback and history-reference validation.
- `history.ts`: completion counts and practice evidence separated; `demonstratedCefr` is always null, and original history is not modified.
- `server.ts`: server-only authenticated reader with an explicit disabled-by-default gate.
- `preflight.ts`: read-only local prerequisite inspection of functions, columns, RLS/policies and migration ledger before migration execution in tests. It does not authorize a hosted operation.
- `GET /api/learning/history/v2` and `GET /api/learning/export/v2`: private/no-store, verified owner only, validated snapshots, no preview fallback on error. The old `/api/learning/export` and its parser remain unchanged.

`.env.example` adds `LINGUATRACK_V2_HISTORY_ENABLED=false`. Keep it false on the existing app/hosted environment. Set it true only after reviewed installation in a specifically authorized isolated target. This flag only enables reads: it enables no v2 delivery, submissions, publishing or activation. Current routes return 404 before credential/database access; POST returns 405. A v2 answer endpoint does not exist.

## Reset, navigation and deletion

The forward migration extends the existing `reset_learning(uuid,text,integer)` entry point, retaining its signature, v1 snapshot response and receipt semantics. It validates either an original v1 catalog version or a registered staged version. Under the same owner profile lock, it deletes that owner's v1/v2 personal rows (including cascading private receipts, grading audit and navigation), advances generation once, and retains the reset receipt. Replaying the same reset returns current state without deleting new progress. Other owners and curriculum/registry rows remain intact. Old-generation answers cannot resurrect deleted history. Deleting an auth user cascades their personal v2 data without touching another owner or the curriculum.

A private monotonic navigation ledger serializes actual accepted position changes across versions. Existing v1 positions are labelled `legacy_baseline`; their timestamps are not retrospectively claimed as precise navigation evidence. Profile position changes record v1 navigation; repeated same-position heartbeats and quiz feedback do not steal v2 resume. V2 accepted navigation records exact refs and step. The existing v1 resume/profile and RPC behavior are retained.

Important D4 prerequisite: old v1 requests do not distinguish an intentional revisit to the identical position from a heartbeat, or provide a global expected navigation epoch. D3 cannot infer this missing intent. D4 needs an explicit navigation-versus-heartbeat protocol and expected-ledger-order CAS for v2 clients, with visible stale-tab handling. It must continue accepting legacy v1 submissions independently. D3 supplies the owner lock, event order and sequence guards, not a fully deployed cross-device navigation protocol.

No Storage objects, upload access, account-deletion UI or deletion jobs were added. Future upload phases must revoke access and queue retryable cleanup within the same generation lifecycle before they are enabled.

## Main production learner route design

Retain the existing route hierarchy and green/cream shell. A1–C1 use the same parameterized course/chapter/lesson routes; no development URL becomes a learner route.

| Learner destination                                                 | Existing or proposed behavior                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                 | Dashboard: resume only committed state; future resume includes pinned release and step.                                                       |
| `/courses`                                                          | My Courses: CEFR A1–C1 and honest published/partial/planned availability.                                                                     |
| `/courses/[courseSlug]`                                             | Level/chapter picker; include only approved production route bindings, with separate activity availability.                                   |
| `/courses/[courseSlug]/chapters/[chapterSlug]`                      | Chapter and lesson list; stable IDs/slugs, previous/next order from the pinned release.                                                       |
| `/courses/[courseSlug]/chapters/[chapterSlug]/lessons/[lessonSlug]` | Existing v1 player remains unchanged. D4/D5 add a separate published-v2 adapter with Learn → Practice → Review → Save Progress → Next Lesson. |
| `/review`, `/progress`                                              | D4/D5 connect combined history after installation; preserve versioned scores and distinguish completion from proficiency.                     |
| `/account`                                                          | Existing sign-in/account flow. No new authentication system.                                                                                  |

New v2 attempts must pin an exact approved release hash, never mutable `latest`. Historical retries/resume carry their original attempt/release refs, e.g. `?attempt=<uuid>` with server-owned release resolution. A normal slug selects only an approved activated route binding. Unsupported/unpublished content remains unavailable with an honest notice; no fallback to a draft under the same slug. Reused v1 routes continue serving v1 until an explicitly reviewed route assignment authorizes otherwise.

Availability is per activity: released teaching/MCQ lessons are studyable; listening without verified audio is audio-pending with checks disabled; speaking/writing self-practice is explicitly ungraded; unpublished content is not unlocked. Neither participation, MCQs nor completion certify CEFR proficiency.

The production presentation can reuse safe bilingual teaching components and the green/cream styling. It must use a separate persistence adapter and server-projected approved content, not the development grading endpoint/hook. Pending answers show saving/pending/error; **Saved to account** appears only after a matching committed transaction receipt. A durable owner-scoped v2 outbox is D4 work. Before enabling v2 writes, the v2-aware Review/Progress views and combined-export control must be connected; the legacy export stays available under an explicit v1 label. Rollback must retain combined reads and reset coverage. Completion is its own committed action with source/policy validation. Next Lesson cannot imply a save that failed.

### Exact current learner URLs

These are current **v1 main-site** routes, not development previews. Saved behavior requires sign-in and the existing functioning Phase 2 database; this task has not verified the hosted database.

- Dashboard: http://localhost:3000/
- My Courses: http://localhost:3000/courses
- A1: http://localhost:3000/courses/a1
- Chapter 1: http://localhost:3000/courses/a1/chapters/first-conversations
- Greetings: http://localhost:3000/courses/a1/chapters/first-conversations/lessons/introductions
- Be verb: http://localhost:3000/courses/a1/chapters/first-conversations/lessons/am-is-are
- Chapter quiz: http://localhost:3000/courses/a1/chapters/first-conversations/lessons/chapter-check
- Review / Progress / Account: http://localhost:3000/review, http://localhost:3000/progress, http://localhost:3000/account

The subject-pronouns main-site route and Chapters 2–6 are **not published/available as saved v2 learning**. No new saved v2 learner URL is unlocked by D3. Their development-only URLs are documented separately in `docs/a1-start-learning.md` and remain unsaved.

## Gates and independently testable remaining phases

| Phase                      | Next implementation and required gate                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3 complete locally        | Storage, owner-only read/export and generation-safe reset. Keep read flag off until authorized installation.                                                                                                                                                                                                                                                                                                                              |
| D4 isolated staging        | Obtain an explicitly designated disposable staging project (never infer it from existing credentials), two test accounts, reviewed least-privilege writer/reviewer provisioning and authorization for its migrations. Inspect its actual schema/ledger/grants/catalog first; agree and verify backup/restore scope. Install forward support there, deploy read-only support first, then enable only hash-allowlisted MCQ test writes.     |
| D4 persistence exit        | Implement origin/body/owner/ref validation, exact private MCQ grader, canonical request hash, one transactional response/grade/mistake/receipt write, durable retry/outbox and saved feedback. Test browser refresh, sign-out/sign-in, two accounts/devices, expiry, offline first-v1-answer drain, lost acknowledgement, conflicting retries, reset races, global navigation CAS and restore. Production flags remain off.               |
| D5 publication preparation | Produce a new unused immutable candidate, preserving drafts 1.1.0–1.8.0. Resolve actual translation, grading, coverage and compatibility reviews against its hash. D2 authenticated approval gates remain mandatory; no author-written approval is trusted. Verify all reachable production capabilities/media. Do not auto-approve the 55 locale exceptions or 237 mappings in 1.3.0.                                                    |
| D5 controlled activation   | Separate explicit authorization after verified backup/restore and staging evidence. Implement narrow activation permissions/CAS epoch, audited route/cohort bindings and start-versus-finish acceptance. Existing v1 endpoint/outbox remains pinned to 1.0.0; old offline first answers may create their original attempts. Canary only the reviewed supported lesson.                                                                    |
| D5 rollback/recovery       | Disable new starts and restore the previous audited route/channel epoch, retaining pinned graders/artifacts/attempts and v2-aware read/reset/export. Allow safe in-flight completion unless a security withdrawal explicitly blocks it. Never down-migrate/reset history or revert to a v1-only build that hides new records. D2 channels cannot currently activate, so D3 does not pretend to have exercised a real activation rollback. |
| D6/D7                      | Other deterministic graders, comprehension/assessment delivery, assigned human grading, writing submissions and private audio uploads each require their own reviewed capability and lifecycle tests. No automatic writing/speaking grading or AI integration is introduced here.                                                                                                                                                         |

**Stop here:** no staging target/authorization or verified restore evidence was supplied. No actual content candidate has received the required authenticated editorial approvals. D4 staging and D5 publication remain gates; this task does not cross them.

## Commands, new files and verification

Node.js 22+:

```bash
npm run test:learning:v2
npm run lint
npm run typecheck
npm test
npm run content:check
npm run curriculum:v2:schemas:check
npm run test:e2e
npm run test:e2e:preview -- study-navigation.spec.ts home-study-entry.spec.ts
```

The local database tests create disposable PGlite instances, inspect their initial state, apply the four existing migrations, seed v1 history through its actual RPCs, inspect schema/ledger before D3, apply D3, and exercise an unrelated synthetic 9.0.0 sealed fixture with test-only authenticated review sessions. They never approve/import any real draft or connect to a hosted project. Reopening the database tests actual local storage durability. SQL role/JWT-claim switching is an auth simulation; it is **not** proof of real Supabase sign-in or browser/staging persistence. Single-instance serialization/order tests are not a genuine multi-connection hosted race test.

New files: the D3 migration; `src/lib/learning/v2/{contracts,history,preflight,server}.ts`; the two new read-only route handlers; `tests/learning-v2/fixtures.ts`, `tests/learning-v2/database.test.ts`, `tests/learning-v2/api.test.ts`; `tests/e2e/v2-history-disabled.spec.ts`; this report.

Updated files: `.env.example`, `package.json` (one test command), `src/lib/supabase/database.types.ts` (one read RPC), and the two browser-test server scripts (explicitly disable the history read flag in test environments). Existing migrations, curriculum JSON, schemas, immutable drafts, preview behavior, learner UI and learning APIs are unchanged.

Verification results are recorded below after the final run. Required future evidence includes real staging cookie/token auth, REST isolation, concurrent connections, durable browser v2 retry and actual activation/rollback/restore. D3 does not label these deferred D4/D5 gates as passed.

## Final verification results

| Check                                            | Result                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint / strict TypeScript                       | Passed. Type generation used `NEXT_DIST_DIR=.next-e2e` to keep the running app's output separate.                                                                               |
| Full unit/integration suite                      | 189 tests across 33 files passed, including 15 D3 tests.                                                                                                                        |
| Production build and browser regressions         | Build passed through `scripts/serve-e2e.mjs`; all 26 desktop/mobile cases passed, including saving/retry/reset mocks, accessibility, preview refusal and disabled D3 endpoints. |
| Development preview/navigation                   | All 6 desktop/mobile regression cases passed; unsaved behavior and grading boundaries retained.                                                                                 |
| v1 generated content / v2 generated JSON schemas | Passed and unchanged.                                                                                                                                                           |
| Protected-file integrity                         | All 187 pre-existing content, source-authoring, schema, immutable draft and migration files remained byte-identical.                                                            |
| Current main-site routes                         | All ten documented v1 learner URLs returned HTTP 200 on the already-running localhost:3000 app; requests contained no account cookies and did not verify hosted persistence.    |

D3 database cases cover forward compatibility, exact references and snapshot preservation, restart durability, simulated sign-out/in and two-owner RLS, denied client mutations/private reads, stale generations, immutable history, safe feedback, audited corrections, complete >1,000-row export, known navigation recency, both reset ordering cases/replay, unknown-version reset refusal, registered-v2 reset, auth-user cascade deletion, retained curriculum and original v1 lazy offline creation/80% pass behavior. API tests verify default-off gates, verified ownership, no-store export, no false success on errors, complete snapshots and private-key leakage rejection.

Development preview follow-up: all 6 desktop/mobile navigation and dashboard-entry tests passed.
