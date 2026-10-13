# Phase 3D: curriculum publishing and persistence plan

Status: **design for review; nothing deployed or activated**. Repository inspected on 2026-10-12. This document proposes future work only. No application code, curriculum, migration, account, or learning record was changed. The hosted schema and migration state have **not** been inspected; local migration files are evidence of intended behavior, not confirmation of deployed behavior.

## 1. Recommendation and boundaries

Run v1 and v2 alongside each other. Add an immutable release registry and separate v2 learning tables; retain the v1 catalog, APIs, outbox, and historical records. Start with read-only resolution and compatibility reports, then staging writes, then a small explicitly approved production rollout of the new lesson. Activation selects content for new learning activity; it never rewrites an attempt's version.

Keep the green/cream website, existing URLs, navigation, and v1 content. Reuse the Learn / Practice / Review presentation through a separate production persistence adapter when authorized. The development preview remains development-only, unsaved, and pinned to draft 1.3.0. Neither preview memory nor its grading endpoint becomes a production import mechanism.

No AI grading, cloud recording, full A1–C1 rollout, automatic CEFR assignment, or hosted operation is included in this design task.

## 2. Current repository architecture

| Area                        | Source paths                                                                                                                                             | Observed behavior and rollout implication                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 curriculum               | `src/content/v1/curriculum.json`, `src/content/public/v1/curriculum.json`, `src/lib/curriculum/schema.ts`                                                | Canonical private content and generated public content are separate. Live content version is 1.0.0. Preserve both files and all IDs/slugs.                                                                 |
| Database foundation         | `supabase/migrations/20261011000100_learning.sql`                                                                                                        | Private immutable lesson catalog; profiles, lesson progress, quiz attempts, exercise responses, mistake reviews, study sessions. Owner SELECT policies; writes through validated RPCs.                     |
| Canonical database grading  | `supabase/migrations/20261011000200_curriculum_v1.sql`                                                                                                   | Seeds three lessons and five original questions for 1.0.0. Database grading preserves all-response completion and rounded percentage with an 80% pass threshold.                                           |
| Reset protection            | `supabase/migrations/20261011000300_reset_learning.sql`                                                                                                  | Owner profile lock, shared `learning_generation`, idempotent reset receipts, and stale-generation rejection. Reset currently clears v1 personal tables only.                                               |
| v1 API / authentication     | `src/app/api/learning/`, `src/lib/learning/{canonical,server,contracts}.ts`                                                                              | Server verifies authentication; database RPC grades persistent answers. Canonical validator accepts only the bundled v1 version. Preserve that resolver independently of future active content.            |
| Durable browser queue       | `src/lib/learning/outbox.ts`, `src/components/progress/session-provider.tsx`                                                                             | Owner-scoped `linguatrack:pending:v1:<user-id>` stores exact version, attempt/question/option and generation. Answers are removed only after matching persistent acknowledgement or an acknowledged reset. |
| Progress and export         | `src/lib/learning/progress.ts`, `src/app/api/learning/export/route.ts`, `src/lib/curriculum/v2/history.ts`                                               | Completion and exercise evidence are separate. Existing export version 1 has strict parsers; its read-only compatibility adapter is not a trusted history importer.                                        |
| v2 contracts / validation   | `src/lib/curriculum/v2/{common,public,private,package,submissions,validate}.ts`, `schemas/curriculum-v2/2.0.0/`                                          | Strict public/private contracts, exact entity revisions, semantic references, supported responses, private grading and assessment policies. Contract support does not prove a production UI/grader exists. |
| v2 identity / compatibility | `src/lib/curriculum/v2/{reader,registry,compatibility,projection}.ts`, `scripts/curriculum/cli.ts`                                                       | Read-only package-chain validation, immutable identity conflicts, public projection, completion/evidence/resume decisions. No active database release registry exists yet.                                 |
| Preview                     | `src/lib/curriculum/preview/{config,contracts,server}.ts`, `src/components/preview/`, `src/app/api/dev-preview/answer/route.ts`                          | Development guard; server-only single-question grading; 14 MCQs, writing self-practice, in-memory feedback. No Supabase writes.                                                                            |
| Existing plans              | `docs/curriculum-v2-proposal.md`, `docs/phase-3a-curriculum.md`, `docs/pronouns-editorial-review.md`, `docs/phase-3c-learner-flow.md`, `docs/backups.md` | Preserve their contracts and scope; this plan adds operational gates.                                                                                                                                      |

Important constraints:

- `profiles.(content_version,last_lesson_id)` references the **v1** private catalog. A v2 resume position cannot simply be stored there.
- Existing responses and completed quiz attempts are immutable snapshots. Changed curriculum must not recalculate their scores or explanations.
- Existing reset serializes learning writes by locking the owner's profile. V2 must participate in the same generation and lock, including delayed human grading and uploads.
- Supabase local configuration exposes `public` and `graphql_public`, not `private`; it specifies PostgreSQL 17. Verify the hosted configuration separately.

### Draft readiness

The unchanged 1.3.0 package contains four lessons and 19 MCQs: the five preserved legacy questions and 14 subject-pronoun questions. The new lesson is `a1-c1-subject-pronouns@2`, slug `subject-pronouns-and-sentences`. Its writing block is self-practice, not a graded writing submission.

Local chain validation succeeded with release hash:

```text
0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029
```

It remains a **draft**: 55 legacy locale exceptions and 237 compatibility entries have pending review status; there are no editorial approval entries. Some mappings target ancestors, so review must distinguish historical mappings from mappings to the candidate being published. A1 coverage is partial; A2–C1 are planned content.

Do not change or reseal 1.1.0, 1.2.0, or 1.3.0. Create an unused content version derived from 1.3.0 for publication review (for example 1.4.0, only if still unused). Retain historical mappings and append candidate-target mappings. Resolve locale exceptions and candidate compatibility decisions with real reviewers. Metadata-only changes can reuse unchanged entity revisions; changed teaching or grading payloads require new revisions and exact updated references.

## 3. Proposed additive database design

Create new forward migrations, reviewed and tested independently. Do not edit the three existing migration files, drop tables, alter auth identities, or bulk convert saved history. Names below are proposed, not implemented SQL.

### A. Immutable registry and operational channel

Keep full registry payloads and grading in the unexposed `private` schema. Serve only explicitly projected public content through the application.

| Proposed relation                                                                                       | Identity / constraints                                                                                               | Purpose                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `private.curriculum_releases`                                                                           | Unique `(curriculum_id,content_version)`; immutable manifest, contract version, package hash, parent hash, inventory | Records source bytes and release provenance; never repurpose a version. Record legacy 1.0.0 with its v1 format and verified catalog provenance, without changing the catalog.                          |
| `private.curriculum_entities`                                                                           | Unique `(curriculum_id,kind,entity_id,revision)`; immutable canonical payload hash                                   | Preserves every ID and revision. Same identity with different bytes fails.                                                                                                                             |
| `private.release_entities`                                                                              | Release FK plus exact entity FK; unique release/ref                                                                  | Makes the permitted graph and delivery membership explicit. Same slug can resolve to different revisions only through a pinned release.                                                                |
| `private.exercise_grading_bindings`, `private.assessment_policy_bindings`, `private.curriculum_rubrics` | Exact exercise/assessment/rubric refs, immutable grading/policy revisions and hashes                                 | Server-only rules. Registry semantics allow one grading binding per exercise revision and one policy binding per assessment revision; changing a binding requires a new corresponding entity revision. |
| `private.curriculum_compatibility`                                                                      | Immutable source/target release+refs, fingerprints, completion/evidence/resume decisions                             | Retains historical mapping documents and the candidate's reviewed decisions. Never infer compatibility from equal IDs alone.                                                                           |
| `private.release_reviews`, `private.release_events`                                                     | Append-only authenticated reviewer/operator, scope, package hash, event time                                         | Approval and validation evidence. Manifest approval strings alone do not authorize publication.                                                                                                        |
| `private.curriculum_channels`, `private.curriculum_activations`                                         | Small channel pointer with monotonically increasing epoch; append-only previous/new assignments and operator         | Atomically selects a ready release and explicit route/cohort bindings. Compare-and-swap on expected epoch prevents competing activations.                                                              |

Content identity is immutable; operational readiness, drain, withdrawal, and activation are audited events/projections, not edits to a sealed manifest. Staged imports cannot become active by setting a JSON field. Readiness requires the complete verified graph, assets, private bindings, reviewer approval, application capability support, and backup/recovery gates.

Use the file-package hash produced by `reader.ts`: fingerprint the sorted list of `{path,sha256}` for **all files including the manifest**. Pass that hash explicitly to registry snapshots. `registrySnapshot()`'s default in-memory package fingerprint is a different hash domain; do not treat the two as interchangeable. Store separately named entity hashes and public-projection hashes. Pin the digest algorithm/version and test its determinism.

Keep private files outside `public/`, client imports, static deployment artifacts, public storage, and client-visible manifest inventories. Public assets may use immutable hash-addressed paths; private transcripts and later learner uploads require private access. Enforce transcript visibility/timing during delivery even where a transcript entity is structurally public.

### B. Owner-scoped v2 learning storage

Use separate `public.learning_v2_*` relations with `user_id` FK to the existing auth user, shared generation, owner RLS, authenticated SELECT only, and no direct browser INSERT/UPDATE/DELETE. Internal receipts or secret bindings remain private.

| Proposed relation                                   | Required persisted information                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `learning_v2_attempts`                              | Attempt UUID, owner, generation, release FK/hash, lesson ref, block/assessment delivery ref, mode, required leaf exercises, grading/policy/runtime versions, server start/finalization times. Mutable workflow state is separate from immutable finalized results. |
| `learning_v2_responses`                             | Response UUID, attempt+owner composite FK, exact exercise ref, canonical request hash, validated submitted response, prompt/options/stimulus snapshot, objective/evidence tags, server receipt time. Append-only; one response per leaf exercise per attempt.      |
| `learning_v2_grades`, `learning_v2_attempt_results` | Append-only automatic/human decisions, score/max score, correctness or pending status, safe bilingual feedback, provenance, policy-based aggregation and pass result. Corrections link to previous decisions; originals remain visible in history.                 |
| `learning_v2_completion_events`                     | Lesson/revision/release, generation, source (`self_reported`, `assessment_pass`, `compatibility_carry`), timestamp, supporting result or original completion and approved mapping hash. Idempotent carry events; no manufactured quiz attempts.                    |
| `learning_v2_mistakes`, `learning_v2_review_events` | Incorrect response and grade reference with owner composite FKs; append-only review actions. Later corrections do not erase the original review context.                                                                                                           |
| `learning_v2_resume`, `learning_v2_study_sessions`  | Exact version/ref/position, accepted navigation time, session/sequence/generation; bounded heartbeat accounting. Resume can change; history remains versioned.                                                                                                     |
| Later: `learning_v2_submission_assets`              | Owner/generation, immutable private object identifier/hash, verified MIME/size/duration, upload receipt, retention and processing status. No speaking upload is enabled in the initial rollout.                                                                    |

Use database checks/FKs for nonnegative scores, valid score bounds, release/ref membership, and owner-parent consistency. Index owner/time pagination, release/ref joins, and attempt uniqueness. Paginate history/export beyond the configured 1,000-row API limit; a truncated export must never be labelled complete.

Browser-visible rows contain only their learner's submissions and permitted feedback. Do not embed a complete key set, private rubric, hidden transcript, or internal grading payload inside user-readable JSON. Keep secret binding snapshots private and return a narrow feedback DTO after the applicable submission/finalization gate.

## 4. Preserve v1 progress and queued submissions

1. Leave auth accounts, six v1 personal tables, original scores, explanations, timestamps, skill labels, catalog, and RPC behavior intact. Read combined history with an explicit `schemaVersion` and original `contentVersion`; do not copy v1 attempts into v2 tables or count them twice.
2. Keep `/api/learning/answer` and the 1.0.0 canonical validator independently pinned. A new active v2 release must not change its expected version, option IDs, rounded percentage, or 80% pass rule. Version 1 requests continue through the existing database grader only.
3. Preserve `linguatrack:pending:v1:<owner>` and its strict request format. Do not rewrite entries into v2 responses. A first offline answer may have an attempt UUID but **no database attempt row yet**: accepting only pre-existing database attempts after activation would strand it. Continue accepting valid 1.0.0 submissions, including these lazily created attempts, until a separately designed retirement process. Server metrics cannot prove all browser queues have drained.
4. Completion carry requires approved mappings **and** semantic/fingerprint checks. Represent carry as a derived view first; later write a provenance-bearing completion event only when authorized. Retain the original completion even when the new lesson requires recompletion. Resume uses the mapping's same-position or restart-with-notice decision.
5. Subject-pronoun revision 2 requires recompletion/restart under its reviewed candidate semantics; question 12 changed task wording and is not equivalent evidence. The other 13 recognition questions are equivalence candidates, not approved proficiency transfers. Compatibility approval never changes a saved historical score.
6. Keep v1 profile resume unchanged. Resolve v2 resume through the new table; a combined read adapter selects the most recent accepted navigation across versions. Distinguish navigation from background answer saves and heartbeats. Define device/session ordering and stale-tab handling; per-session sequence numbers alone do not establish global cross-device order.
7. Preserve original v1 question 5's historical `writing` label, but describe its future evidence as sentence recognition, not demonstrated writing production. Grammar recognition does not become reading comprehension. Self-practice completion, MCQ accuracy, chapter assessment performance, and skill evidence are separate. CEFR awarding remains disabled.

### Reset and export are prerequisites for writes

Before any v2 write is enabled, add a forward migration extending the **existing reset entry point** to cover v1 and v2 records under the same profile lock, request receipt, and generation increment. Preserve its old signature and v1 response shape so older tabs still work. Extend version validation safely for a v2 caller; never remove the existing v1 catalog check without replacement. New reset behavior must survive application rollback.

Every v2 commit, delayed grader, compatibility carry, and asset attachment checks the same current generation inside its transaction. A reset invalidates old queues/work and cannot resurrect history. Asset cleanup uses transactional tombstones and a retryable private deletion job; inaccessible bytes awaiting cleanup must not appear as restored learning history. Explicit learner reset and account deletion remain supported exceptions to historical retention.

Keep export version 1 and its parser unchanged. Add a separately versioned export format/endpoint for combined v1/v2 history, completion provenance, grade corrections, resume, and owned upload inventory. Include no keys, credentials, or other users' records. Export is evidence and backup assistance, not authorization to import client-supplied scores. Retry/reset receipts must retain sufficient minimal information to prevent replay from deleting newly created progress.

## 5. Secure production grading and persistence

Introduce a separate authenticated v2 endpoint; do not promote `/api/dev-preview/answer`. Its initial supported scope is MCQ practice for the reviewed subject-pronoun lesson. The strict request starts from `v2/submissions.ts`: schema version, content version, attempt/response UUIDs, generation, exact delivery/exercise refs, and the typed response. Resolve curriculum identity from the route/channel, not an arbitrary client-selected curriculum or user ID.

### Trust boundary and transaction

1. Verify the learner with server-side Supabase auth, origin/content-type/body limits and rate limits. Never accept client owner, correctness, scores, grading bindings, or completion claims. Expired auth returns a recoverable error; persistence failures never fall back to an unsaved success.
2. Check an existing response receipt using verified owner, generation, response UUID and the full canonical context/response hash. An identical retry returns its stored committed result; conflicting reuse returns 409. Do not regrade a retry under today's code or active release.
3. Resolve an existing attempt's pinned release; for a new attempt, check the explicitly permitted release/delivery and its write policy. Validate graph membership, response type, option/token/blank IDs, cardinality, duplicates, prerequisites, and response limits. Pin required items and grading policies on creation.
4. Load private immutable rules in a `server-only` module and run the pinned deterministic grader. Use an isolated trusted writer connection or narrowly granted commit RPC for the resulting grade. Do **not** expose a score-accepting RPC to `authenticated` callers. Prefer a dedicated role with only the needed registry reads and commit privilege; if a server-only service credential is selected, explicit owner checks are mandatory rather than relying on RLS to constrain that connection.
5. In one database transaction, lock the profile, check generation, lock/create the owner-bound attempt, recheck immutable binding/hash and write permission, enforce idempotency, insert response/grade/mistake, update workflow aggregates, and store the acknowledgement. Internal commits validate score bounds and refs even though the grader is trusted. Use a consistent profile-before-attempt lock order; concurrent duplicates return one receipt.
6. Return success only after commit. A separate owner-scoped v2 outbox stores the exact payload before sending and removes it only after a matching response/attempt/version/generation/hash acknowledgement. Keep failures visibly pending across refresh; never resend another account's queue. Storage failure must be surfaced before promising durability. Retrying a practice answer uses a **new attempt**, preserving the previous response.

Registry import/activation privileges, grading writer privileges, and reviewer assignment privileges are separate. A publisher cannot submit learner scores; a grader cannot activate curriculum. Human grading verifies an assigned reviewer and current owner generation, and creates a new audited grade decision.

Owner RLS and narrow grants apply to every exposed personal table. Avoid views that accidentally bypass owner filtering; use security-invoker views or an explicitly owner-checked server projection. Supabase service credentials bypass RLS and must remain server-only. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

Privileged functions need explicit ownership checks, schema-qualified objects, a fixed empty `search_path`, and revoked default PUBLIC execution. Grant new functions only to their intended roles; preserve the existing v1 RPC grants. [Supabase database function guidance](https://supabase.com/docs/guides/database/functions)

### Exercise-specific behavior

| Type                            | Validation and scoring                                                                                                                                                 | Persistence / evidence                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple choice                 | Validate selection cardinality and option IDs; exact-set private rule                                                                                                  | Preserve original selected IDs/text, returned bilingual feedback and rule revision. Recognition evidence only unless a reviewed comprehension delivery establishes a different construct.                       |
| Matching                        | Validate both domains, duplicates and allowed mapping cardinality; exact-set or per-pair rule                                                                          | Store every selected pair and item-level results; integer points.                                                                                                                                               |
| Fill in the blank               | Validate exact blank IDs and text bounds; pinned `en-nfc-trim-ascii-space-casefold-v1` normalization and private variants                                              | Store original submitted text plus normalization/grader version; exact-set or per-blank points. Do not silently add fuzzy/AI matching.                                                                          |
| Sentence ordering               | Validate a complete permitted token permutation, including repeated words with distinct token IDs; exact-sequence rule                                                 | Store selected token IDs and immutable task snapshot.                                                                                                                                                           |
| Reading/listening comprehension | These are containers with referenced leaf exercises, not a new response-union variant. Validate container/item membership, stimulus/media access and transcript timing | Grade each leaf by its supported type; attach comprehension/objective context and assistance exposure. No duplicate container answer or inflated evidence count.                                                |
| Writing submission              | Validate text, limits and pinned word counter; human rubric only                                                                                                       | Persist durable submission as `pending_review`; no automatic zero/fail or proficiency. Rubric/marking notes stay private. The existing writing self-practice block remains ungraded.                            |
| Speaking recording              | Later: verify owned private asset receipt, decoded MIME/duration/size, generation and access; human rubric only                                                        | Persist pending submission and private object hash; signed access for owner/assigned reviewer. No raw audio in localStorage, public bucket, or initial implementation.                                          |
| Chapter assessment              | Pin required leaf items, integer weights, section minimums, aggregation/rounding and pass threshold                                                                    | Finalize only when required responses and grades exist. Snapshot result; human-pending is incomplete. Preserve legacy policy exactly; do not apply 80% indiscriminately to new policies. No CEFR certification. |

Practice keeps immediate feedback after a successful commit. Review reuses stored authorized feedback; no bulk answer-key fetch. Chapter assessment feedback timing must have a separate reviewed policy before assessment delivery is enabled. Previously supplied feedback may be retained for retry acknowledgement/history, but not used to expose unattempted exercises' private rules.

## 6. Publication, activation, rollback and recovery

### Publication and activation gates

1. Produce a new reviewed candidate without changing any old draft. Validate the full ancestor chain, sealed manifest, exact references, hashes, keys, translations, compatibility, media bytes, public leakage and reachable runtime capabilities. Sealed content is not necessarily ready or active.
2. Authenticate editorial/translation/grading approvals against the candidate hash. Import registry rows and assets into staging with a dry-run diff first. Same version/hash is idempotent; same version/different hash fails. Register the whole artifact without making unsupported lessons reachable.
3. Stage production assets and registry only after the staging restore/isolated-user tests and operational approval. Verify the staged inventory from the deployed runtime. Any partial import stays unready and leaves the channel unchanged.
4. Deploy dual-version readers and pinned graders before enabling new writes. Initial feature flags default off: v2 read delivery, new v2 attempts, and per-release submission acceptance. Legacy v1 acceptance remains on.
5. Activate an explicit lesson route/cohort binding with a compare-and-swap transaction on the channel epoch and an audit event. Existing courses/lesson routes continue on v1. Confirm the production renderer supports every block reachable from the selected new lesson; the preview does not cover every legacy-converted block.
6. Canary with designated test accounts, then a small opt-in cohort. Observe save acknowledgements, pending queue age, 409/401/5xx rates, grading correctness, completion provenance and owner isolation without logging private answers/tokens. Stop expansion on failure.

Separate permission to **start new attempts** from permission to **finish pinned attempts**. Normal rollback disables new attempts for the withdrawn release but permits committed/in-flight work to finish against its retained rules. New attempts never resolve through a mutable active pointer once created.

### Rollback and recovery rules

- Roll back channel/route assignments to their previous audited epoch using another CAS activation event. Keep registry rows, keys, assets and v2 learning history. No down migration, database reset, catalog replacement, or score recomputation.
- Use a previously verified **v2-aware** application build. A blind rollback to an old v1-only build can hide new history or mishandle reset; retain the forward database reset coverage and dual-version read/export support.
- Keep old lesson URLs available and pin resumed attempts to their original release. If a new learning position must restart after rollback, show a notice and retain its previous position/history.
- An emergency grading/security withdrawal can suspend affected submissions as well as new starts. Preserve pending payloads and return an explicit blocked/retry status. A repaired exercise gets a new revision/release; any necessary human-approved correction is an appended decision linked to the original, never an overwritten score.
- Do not garbage-collect grading artifacts or old catalogs while historical rendering or queued answers depend on them. V1 retirement, asset retention and account deletion require explicit later policies, not an assumed deadline after activation.

| Failure drill                                             | Required outcome                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commit succeeds, HTTP acknowledgement is lost             | Exact retry returns the saved receipt; one response/grade/mistake and no duplicate time/completion.                                                                |
| Import/deploy stops halfway                               | Candidate remains unready; old active channel and v1 API work. Retry reconciles immutable inventory.                                                               |
| Two activation operators race                             | One expected-epoch update succeeds; the other receives a conflict and re-reads.                                                                                    |
| Old browser submits 1.0.0 after v2 activation/rollback    | Original option IDs and 80% behavior succeed, including a first queued answer with no existing attempt row.                                                        |
| Reset races with queued answer or delayed reviewer/upload | Shared lock/generation orders operations; old-generation work cannot recreate cleared history. Repeated reset receipt cannot delete new progress.                  |
| Auth expiry, database outage, account switch              | No false saved state; queue retained for its owner; retries resume only after appropriate auth.                                                                    |
| Upload succeeds but submission fails, later phase         | Durable private receipt enables retry; orphan cleanup is controlled and never exposes another owner's asset.                                                       |
| Private artifact missing or corrupt                       | New work fails visibly; existing committed receipts/history remain readable. Restore the original verified artifact, not replacement rules under the same version. |

## 7. Required setup, backup and preflight

**Before any future hosted database operation**, identify the exact project/environment, obtain authorized read access, and inspect `supabase_migrations.schema_migrations`, schemas, columns, FKs, RLS policies, function signatures/grants, immutability/signup triggers, exposed schemas, and the deployed 1.0.0 catalog. Compare them with all three local migrations and canonical option/key hashes. Confirm reset generation and receipts. Record discrepancies; stop for review instead of applying assumed fixes.

Prepare an isolated local/staging Supabase environment, two distinct test accounts, and a reviewed secret-management/least-privilege writer arrangement. Never use production learner data as unredacted test fixtures. No credential values are required in this document or committed to Git. Decide candidate version, reviewer identities, first enabled lesson/cohort, rollback owner and retained artifact location before publication.

Take an encrypted, access-controlled consistent backup before the first hosted schema change and again before activation. Include auth identities, role/grant definitions, managed-schema dependencies, signup trigger, all personal tables, reset receipts, private v1 catalog, later registry/private rules, migration files, and owned storage bytes. Preserve package artifacts independently with checked hashes. Follow `docs/backups.md`; its CLI snippets alone do not prove complete auth/storage coverage.

Verify the project's actual backup retention and recovery facilities; do not assume a paid tier or PITR. Database backups do not include Storage object bytes, and custom role passwords need separate secure recovery. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

Restore into an isolated project, with original auth IDs restored before dependent learner rows. Verify row counts, catalog hashes, ownership, login, reset receipts, private key access and replayed attempt scores. Record actual restore scope, elapsed recovery time and backup age; agree operational recovery objectives from this drill. Never test restoration by overwriting the active database. A browser outbox is not part of a database backup: sync first or preserve its owner-scoped pending value before clearing browser data.

## 8. Independently testable implementation checklist

Each phase requires separate review and a recorded exit gate. No phase below has been implemented by this document.

| Phase                                           | Checklist                                                                                                                                                                                                                                         | Exit gate                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1 — read-only support**                      | Add a dual-version catalog facade and read-only combined history/compatibility reports. Preserve v1 resolver, API, export and preview behavior. Standardize file-package hash fixtures.                                                           | No new writes or visible UI changes; v1 identity/grading/outbox regression tests pass. Report pending approvals accurately.                                           |
| **D2 — inactive registry**                      | Create additive registry migration locally, then authorized staging. Add dry-run/idempotent import tooling and authenticated review records. Prepare a separately versioned sealed candidate; activation flags off.                               | Conflict/tamper/media/reference/leakage tests pass; candidate readiness and capability checks fail closed; no public activation.                                      |
| **D3 — storage and lifecycle**                  | Create v2 tables/constraints/RLS locally/staging. Add read-only history/resume adapter and new export format. Extend existing reset and account-deletion/asset cleanup behavior with shared generation.                                           | Two-user isolation, reset replay/races and complete exports pass with writes still inaccessible to browser clients.                                                   |
| **D4 — staged MCQ persistence**                 | Implement authenticated MCQ endpoint, pinned grader, restricted transactional writer, v2 outbox and feedback DTO behind staging flags. Production flags remain off.                                                                               | All 14 questions retain correct mapping; repeated attempts preserved; lost acknowledgement, offline v1 first answer, stale generation and owner injection tests pass. |
| **D5 — controlled release**                     | Complete hosted preflight and restore drill; deploy additive support and verified artifacts after authorization. Enable only reviewed subject-pronoun delivery for a canary, using existing presentation. Audit activation and rehearse rollback. | Old routes/UI/history/queues unchanged; save/review/resume across refresh and two devices verified; rollback preserves v2 records and v1 acceptance.                  |
| **D6 — additional deterministic types**         | Enable matching, blanks and ordering individually, then comprehension containers and explicit chapter assessments after their renderer, grading and access policies pass.                                                                         | Golden scoring fixtures, all-required-item aggregation, transcript timing and capability gates pass per type; no inflated skill/CEFR claims.                          |
| **D7 — human submissions, later authorization** | Design assigned-reviewer workflow and durable writing submissions; separately review private audio upload/recording, retention and recovery.                                                                                                      | Pending/corrected grading audit, asset isolation, deletion and backup drills pass. No AI grading or cloud recording is enabled by earlier phases.                     |

D1 can proceed without hosted credentials. D2/D3 start locally; any hosted execution waits for verified deployed state, target-environment access, and migration review. D5 is a separate publication decision, not implied by approval of this plan.

### Test and release gates

Extend existing tests rather than replacing them:

- `tests/curriculum-v2/`: identity preservation, option/key equivalence, immutable release/grade conflicts, exact references, candidate approvals, public leakage, deterministic file hashes and historical compatibility.
- `tests/database.test.ts`, `tests/api.test.ts`, `tests/outbox.test.ts`, `tests/progress.test.ts`, `tests/reset-progress.test.tsx`: transactional replay, trusted writer boundary, reset/export compatibility, score bounds, completion/evidence separation, queue ownership and v1 first-offline-answer drain.
- `tests/preview/`, `tests/preview-e2e/`, `tests/e2e/preview-disabled.spec.ts`: dev-only route remains unavailable in production and cannot write learning history; retain in-memory preview behavior.
- New real local/staging integration tests with **two authenticated accounts**: A cannot read or mutate B's attempts, responses, resume, completion, mistakes or assets through REST, route requests, guessed IDs or RPCs. Test anon/authenticated direct mutation denial and private-schema access denial. Test the trusted writer's explicit owner-parent/generation checks as well as RLS. Reset A and verify B is unchanged. Test assigned-reviewer scope separately before human grading.
- End-to-end production-adapter tests: two browsers/devices resume a pinned release; retain an old v1 tab with a queued answer through activation; expired auth, offline retry, reset during retry, changed response UUID payload, concurrent saves, lost acknowledgements, forward database/app rollback, and restored history/export. Preserve responsive/accessibility checks and screenshot baselines for existing routes.

Existing read-only commands (run from the repository; Node 22+):

```bash
npm run content:check
npm run curriculum:v2:schemas:check
npm run curriculum:v2:validate -- .curriculum-drafts/1.3.0 \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 --json
npm run test:curriculum:v2
npm run test:preview
npm run test:e2e:preview
```

For each future implementation phase, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`, plus its real database and end-to-end gates. Existing unit tests or package validation alone do not verify hosted RLS, credentials, activation, or recovery. Candidate commands use the candidate's actual directory and all ancestors; no publishing/import command exists yet.

## 9. Principal risks and decisions for review

| Risk                                                               | Required decision / mitigation                                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid draft mistaken for publishable release                       | Resolve pending locale/candidate mapping reviews; bind real approval to a new immutable candidate hash.                                         |
| Replacing the v1 validator strands browser queues                  | Keep independent 1.0.0 endpoint/catalog indefinitely initially, including lazy attempt creation.                                                |
| New data survives the existing reset or appears missing in exports | Extend reset/export before writes; test old clients, same generation and repeated reset receipts.                                               |
| Trusted writer bypasses owner protections                          | Choose least-privilege credentials; keep computed grades inaccessible to browser RPC callers; transactionally enforce ownership and generation. |
| Runtime lacks a schema-supported capability                        | Start with the new MCQ lesson only; validate every reachable block/type, not just manifest capability names.                                    |
| Revision or hash domains disagree                                  | Align database keys with the existing registry and distinguish package/entity/projection hashes explicitly.                                     |
| Rollback hides or corrupts v2 work                                 | Retain v2-aware reader/reset/export build, pinned graders, all artifacts and historical rows.                                                   |
| Grammar completion appears as reading/writing or CEFR proficiency  | Store construct and assistance context separately; preserve historical labels but do not award skill/CEFR automatically.                        |
| Backup misses auth, private keys or uploaded media                 | Verify coverage and perform an isolated two-user restore before hosted changes.                                                                 |

The immediate recommended implementation is **D1 only**: read-only dual-version resolution and compatibility reporting. Database rollout, v2 writes and publication remain separate reviewed steps.
