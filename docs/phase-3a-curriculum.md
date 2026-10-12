# Phase 3A: curriculum v2 validation and migration foundation

**Implemented as offline tooling. The application still uses v1 `1.0.0`.** No v2 release is activated, no Supabase migration is added/applied, and no learning record is imported, edited or deleted. Existing design, routes, grading, saved history and reset-generation behavior remain in the Phase 2 implementation.

The contract follows [the approved proposal](curriculum-v2-proposal.md) and [the existing architecture](curriculum-architecture.md). Schema contract edition is `2.0.0`; the deterministic bridge creates a **draft** pedagogical content version `1.1.0`. Validation success is not publication authorization, editorial approval or demonstrated proficiency.

## Files and boundaries

All new implementation modules are under `src/lib/curriculum/v2/`. They are not imported by application pages, components, routes, v1 readers or the current learning APIs.

| File               | Responsibility                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.ts`        | Bounded IDs, exact revisions/refs, CEFR/area tags, bilingual/English text, provenance, prerequisites, difficulty and coverage contracts                                         |
| `public.ts`        | Strict course, chapter, lesson, block, objective, eight exercise variants, assessment, stimulus, transcript and asset schemas; inferred public types                            |
| `private.ts`       | Strict private grading rules, policies and production rubrics; inferred private types                                                                                           |
| `package.ts`       | Separate draft/sealed manifests, compatibility mappings, complete package schema, inferred package types and JSON Schema generation registry                                    |
| `submissions.ts`   | Strict future v2 submission/response envelope types; no active API or grader                                                                                                    |
| `projection.ts`    | Explicit public collection/manifest projection; excludes private/internal inventories, hashes, grading, rubrics and compatibility metadata                                      |
| `validate.ts`      | Cross-file identity/reference checks, parent/delivery ownership, keys, policies, evidence coverage, dependency cycles, locale provenance and immutable registry conflict checks |
| `bridge.ts`        | Deterministic v1 conversion into an inactive draft with review-pending mappings and locale exceptions                                                                           |
| `compatibility.ts` | Pure completion/attempt/resume comparisons and a legacy MCQ scoring oracle for equivalence audits                                                                               |
| `history.ts`       | Read-only adapter for the existing learner export and `LearningSnapshot`; retains completion dates/version/source and reset generation                                          |
| `json.ts`          | Duplicate-key/depth/UTF-8 checks, canonical serialization, SHA-256, JSON pointers and structured diagnostics                                                                    |
| `files.ts`         | Filesystem inventory, integrity/existence checks, exclusive draft output and PCM WAV verification; trusted adapter hooks for other/managed media                                |

`scripts/curriculum/cli.ts` exposes the commands below. `tsx` is a development dependency to execute TypeScript tooling. `package.json` adds the commands and includes generated-schema drift checking in `npm run check`; `package-lock.json` records that dependency. `.gitignore` excludes `.curriculum-drafts/`.

Generated, committed JSON Schema Draft 2020-12 definitions live in `schemas/curriculum-v2/2.0.0/`:

- Shared/package definitions: `common.schema.json`, `manifest.schema.json`, `package.schema.json`, `public-entities.schema.json`, `public-manifest.schema.json`, `private-grading.schema.json`, `rubrics.schema.json`, `compatibility.schema.json`, `submissions.schema.json`, `legacy-export.schema.json`.
- Array schemas for individual public collection files: `courses.schema.json`, `chapters.schema.json`, `lessons.schema.json`, `blocks.schema.json`, `objectives.schema.json`, `exercises.schema.json`, `assessments.schema.json`, `stimuli.schema.json`, `transcripts.schema.json`, `assets.schema.json`. The transcript array schema also applies to the private transcript file.

Do not serve the full package or private schemas/artifacts as curriculum payloads. Public teaching models in the original speaking/writing practice blocks remain public; scored production models and rubric anchors exist only in private rules/rubrics. Delayed/reviewer-only transcript text belongs in private collections. The public manifest is a distinct allowlisted schema and does not contain private file hashes or the canonical v1 key-bearing file hash.

## Commands

Use the repository's existing Node.js **22+** and npm **10+** environment:

```bash
npm ci
npm run curriculum:v2:schemas:check
npm run test:curriculum:v2
```

Generate and validate a new, local bridge draft:

```bash
npm run curriculum:v2:bridge -- --out .curriculum-drafts/1.1.0
npm run curriculum:v2:validate -- .curriculum-drafts/1.1.0
npm run curriculum:v2:validate -- .curriculum-drafts/1.1.0 --json
```

The output directory must not exist. A repeat bridge command fails rather than overwriting an earlier draft. Use a new output path for another conversion. The writer rejects outputs overlapping `src/`, `public/`, `supabase/`, generated schemas and build/dependency directories, including through parent symlinks. A failed file write may leave an incomplete draft; its validator will reject it. There is no seal, activate, publish, database push or reset command in this tooling.

The source defaults to `src/content/v1/curriculum.json`; `--baseline <file>` explicitly selects another trusted legacy source. `--version <stable-semver>` can choose a later draft content version. Both source content and the existing public audio are read only. The source SHA-256 is recorded in the manifest; the source file is never reserialized in place. The checked baseline is:

```text
eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3
```

The bridge creates the full resolved file layout specified in the proposal:

```text
.curriculum-drafts/1.1.0/
  manifest.json
  public/{courses,chapters,lessons,blocks,objectives,exercises,
          assessments,stimuli,transcripts,assets}.json
  private/{grading,rubrics,transcripts}.json
  compatibility.json
  media/a1-introductions.wav
```

JSON hashes are of actual UTF-8 file bytes, not normalized text. Canonical bridge output sorts object keys by code-unit order, preserves arrays/Unicode, uses two-space indentation and a final LF. Creation time defaults to the original publication date at midnight UTC, so repeated conversions produce identical files rather than inserting today's timestamp. Metadata/entity fingerprints use that serialization. The package release digest covers the raw hash of every declared file and the manifest; registry comparisons catch changes in file bytes even when parsed content is equivalent.

Compare a candidate package with an earlier package's immutable registry snapshot:

```bash
npm run curriculum:v2:validate -- .curriculum-drafts/candidate \
  --against .curriculum-drafts/previous
```

Unchanged release/revision hashes can be reused. Changed bytes under an existing content version, entity revision, pinned grading rule or assessment policy cause a nonzero exit. Private key/explanation changes require increased exercise and grading revisions; policy changes require increased assessment and policy revisions. References to those changed revisions must be updated, with corresponding revisions for changed enclosing entities. IDs cannot change entity kind. A production registry must retain **all** historic releases/revisions; `--against` compares against one local snapshot, not a deployed registry.

Audit already saved history without connecting to Supabase:

```bash
# Download using the existing My progress → Export learning data control.
# Store the personal file in the ignored backups/ directory.
npm run curriculum:v2:compatibility -- .curriculum-drafts/1.1.0 \
  --history backups/linguatrack-learning-export.json
```

The audit accepts the current `exportVersion: 1` download, including migration 003's profile generation, or a local `LearningSnapshot` JSON. Snapshot completions are scoped to the supplied legacy baseline version because that format does not contain per-completion versions/dates; the complete learner export is preferable. Foreign owner IDs in exported personal rows are rejected. This does not authenticate local exports or establish authority to import them.

The report includes each completion's original date/version/source when present, unchanged attempt IDs, compatibility reasons and saved resume anchors. An incompatible item returns exit code 1. A structurally equivalent bridge reports `compatible: true, approved: false`: its explicit mapping is still pending review. Even an `approved` field in a local package is only declared review metadata; a future trusted publication registry must authorize it. Nothing carries completion into the database or changes reset generation. Do not put personal exports or private drafts under `public/` or commit them.

Refresh generated authoring schemas after an intentional contract change:

```bash
npm run curriculum:v2:schemas
npm run curriculum:v2:schemas:check
```

JSON Schema covers the structural unions/strict fields and numeric/string bounds. Zod refinements additionally enforce nonblank text/code-point budgets. JSON Schema alone cannot validate cross-file references, historic hashes, ownership relationships, evidence or actual media; always run the package validator too. Unsupported contract editions/capability names fail closed. Capabilities recognized by this **content contract** do not imply that the current v1 application can render/submit them.

## Validation and preservation rules

- IDs are globally unique across all defined public/private entities. Option/token/blank/section/criterion IDs have owner scope. All refs pin kind, ID and revision; duplicate refs and missing/wrong-revision references are rejected.
- Course/chapter/lesson/block ownership is reciprocal. Slugs are unique within route scope. Quiz/assessment delivery must belong to the same lesson/chapter and use the same ordered scored leaves.
- Each atomic exercise has exactly one type-compatible private rule. Containers have none. Choice keys resolve to existing options; matching keys cover left items; blanks cover exactly the declared slots and have unambiguous normalized variants; accepted orders are complete token permutations. Rules bind compatible rubric skill/point totals. Integer point divisibility and full rubric anchor scales are checked.
- Policies name every scored leaf exactly once, with explicit weights, required final responses/grades, thresholds and valid section minimums. Duplicate leaves through comprehension groups/sections fail validation. Legacy aggregation only accepts equal one-point MCQs with the existing rounding rule.
- Required prerequisites include inherited chapter gates and completion assessment dependencies. Cycles, including a chapter gated by a lesson inside itself or an assessment requiring its own delivery lesson's completion, are rejected. Existing open lessons gain no required prerequisites.
- Complete coverage requires declared coverage of all six areas, actual delivered items and appropriate comprehension/production evidence. MCQs with writing tags remain recognition; they cannot satisfy free writing or speaking evidence. CEFR awarding is fixed to `disabled`; completion is distinct from proficiency.
- The bridge retains every existing course/chapter/lesson slug and ID, eight block kinds/IDs, all five question IDs, option IDs/text/order, keys, bilingual explanations, teaching models, transcripts, audio bytes and original completion policies. It adds the proposed `a1-c1-assessment` wrapper without replacing `a1-c1-check` or `a1-c1-quiz`.
- Pass behavior remains `Math.round(correct / total * 100) >= 80` **after every question has a valid saved response**. Missing/foreign answers cannot pass. Multiple quiz gates in one legacy lesson require an explicit aggregate mapping; the bridge refuses to silently collapse them.
- English-only titles/outcomes and Burmese-only vocabulary meanings are retained as strict `{legacy, language, text, source}` values with exact manifest exceptions. Each must equal its immutable source pointer. There is no generic optional Burmese field or invented translation. Newly derived objective/action/difficulty/instruction metadata is provisional authoring material, with no editorial approvals or proficiency implication. Review it before sealing/activation.
- Package paths are bounded relative paths. Duplicate JSON keys, unknown fields, invalid UTF-8, unsafe paths, symlinks, unlisted/missing files, hash mismatches, excessive depth/bytes/entities and invalid PCM WAV metadata are rejected. Limits are in `common.ts` and follow the approved proposal.
- Media existence/integrity is checked on disk. PCM WAV has a built-in verifier; other approved formats need a trusted decoder adapter. Managed objects need a trusted storage adapter proving existence, hash, size, MIME and duration. The CLI refuses to pretend that unconfigured media adapters succeeded. No arbitrary package-provided URL is fetched.
- Compatibility compares routes, objectives, lesson/block content, media/transcripts, question options, private grading and completion policies. Adding A2 content does not invalidate unchanged A1 lessons. Changed semantics produce review/recompletion reasons; original historical records remain original.

## Tests and verification

`tests/curriculum-v2/` contains:

- `fixtures.ts`: reads the immutable v1 JSON and original audio; creates deterministic isolated bridge fixtures.
- `bridge.test.ts`: every legacy identity/route/option/key/explanation, deterministic output, completion behavior, unchanged completed/in-progress attempts/resume and A2 additions. Exhaustively compares **3,125** complete/partial/foreign-option combinations with the current v1 grader.
- `validation.test.ts`: strict public-key exclusion, unknown fields, invalid exact refs/parents, duplicate IDs, key/rule/policy errors, prerequisite cycles, false skill coverage, locale provenance and release/entity/grading/policy conflicts.
- `exercises.test.ts`: all eight content variants, matching/blank/order key consistency, comprehension nesting/support, private transcripts and rubric bindings/scales.
- `history.test.ts`: actual Phase 2 export shape, original dates/responses/generation, foreign owners, empty post-reset snapshots and strict future submission envelopes.
- `files.test.ts`: generated schema parity, actual CLI exits, package/file/media validation, missing files, symlinks, protected output and refused overwrites.

Run the full regression gate:

```bash
npm run check
npm run test:e2e
```

Existing PostgreSQL tests use an isolated PGlite instance with emulated auth; they do not contact, inspect, migrate or reset the hosted database. Existing browser tests use a separate production build and preview/mocked learning API. These verify local behavior, not deployed Supabase auth or the contents of real learner records. Phase 3A does not claim a live deployed-schema verification.

## Remaining phases and database preflight

Before **any hosted database operation**, inspect the actual deployed schema and migration history with read-only tooling. Confirm migrations 001–003, RPC signatures, immutable catalog/attempt/response protections, owner RLS and profile `learning_generation`; compare the deployed v1 private catalog with the source and take a verified backup/export. Local migration files and local tests are not evidence that the hosted migration state matches. Stop for credentials/review if that inspection or a proposed safe change cannot be completed. Do not reset or rewrite applied migrations.

The following remain deliberately unimplemented:

1. Trusted append-only release/entity/route/compatibility registries, authoritative reviewer approvals, descriptor registry, media decoders/storage adapters and atomic staging/publishing/rollback.
2. Additive v2 persistence tables/readers for typed responses, append-only grades, provenance completion events and owner/upload binding. Preserve existing tables/catalog/history/RLS and propagate generation/reset semantics to every new personal table/projection.
3. Multi-version server resolution and accepting existing pinned v1 queued answers after future activation; the current app still uses the original v1 parser/RPC.
4. Review of locale exceptions, typed objectives/difficulty metadata and genuine bilingual A1–C1 content; remaining planned courses stay partial/empty.
5. Exercise rendering/submission UIs, real comprehension assessment delivery, human-reviewed writing/speaking, private upload verification/retention and trusted proficiency calculations. No AI grading or cloud recording is introduced.
6. Activation preflight against actual deployed content/history, cross-device/reset/outbox recovery, private browser-bundle checks, rollback tests and learner-visible compatibility notices. No local validation result automatically activates a release.
