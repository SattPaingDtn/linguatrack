# Phase 3D-D1: read-only catalog and history compatibility

Implemented scope: **D1 only**. The existing website, v1 loader/API, auth, grading, outbox, reset, export and development preview retain their behavior. No migrations, hosted database operations, persistence, release activation or publication were added. Draft 1.3.0 is inactive and unapproved. **Live hosted database compatibility has not been verified.**

## New interfaces

`src/lib/curriculum/catalog/server.ts` exports `loadReadOnlyCatalog(projectRoot?)` and the `ReadOnlyCatalog` type. This is a server-only, explicit-demand interface; existing routes and the public curriculum barrel do not import it. The optional filesystem root is a trusted tooling input, not a request parameter. Loading requires the unchanged private/public 1.0.0 files and all three immutable ancestor drafts. Missing or altered inputs fail closed; there is no fallback to a different version and no draft regeneration.

The returned facade provides:

| Method                                      | Input / output                                                     | Behavior                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `releases()`                                | Detached release metadata                                          | Existing v1 1.0.0 and inactive/unapproved v2 1.3.0. Includes the draft's file-package hash and algorithm. No private inventory or grading payload.                                                                                      |
| `references(release)`                       | Strict `{schemaVersion,contentVersion}` → visible exact references | V1 kinds retain `question`; v2 uses `exercise` and explicit entity revisions. Ancestor packages validate the chain but are not exposed as selectable releases.                                                                          |
| `resolve(reference)`                        | Strict versioned reference → `{reference,release,entity}`          | Exact ID/kind/version/revision lookup with explicit inactive/unapproved draft metadata. Returns detached public entities; wrong revisions, unknown versions, private rubrics and hidden transcripts fail. No slug or `latest` fallback. |
| `reportHistory(rawHistory,snapshotVersion)` | Existing v1 export or learning snapshot → compatibility DTO        | Read-only completion, assessment evidence and resume audit. The caller must specify the snapshot's original version because its completion IDs are not individually versioned. No network/auth/database call occurs.                    |

Example for trusted server/tooling code:

```ts
import { loadReadOnlyCatalog } from "@/lib/curriculum/catalog/server";

const catalog = await loadReadOnlyCatalog();
const legacyLesson = catalog.resolve({
  schemaVersion: 1,
  contentVersion: "1.0.0",
  kind: "lesson",
  id: "a1-c1-be",
});
const draftLesson = catalog.resolve({
  schemaVersion: 2,
  contentVersion: "1.3.0",
  ref: { kind: "lesson", id: "a1-c1-subject-pronouns", revision: 2 },
});
// Supply only an already authorized owner's snapshot, or their local export.
const report = catalog.reportHistory(ownerSnapshot, "1.0.0");
```

The example does not define a route or authorize access to `ownerSnapshot`. This library does not authenticate local JSON or grant permission to import history. Any future authenticated API must independently verify ownership and authorize its data source. Existing export-owner checks are retained for profile, completion, mistake and session rows; attempt DTOs in export version 1 have no owner field, so an export alone cannot establish an attempt's trusted database provenance.

## Report semantics and preservation

`catalog/report.ts` implements the internal `buildHistoryCompatibilityReport` helper and exports `HistoryCompatibilityReport` / `MappingFinding` types. It requires the v1 baseline and inactive 1.3.0 candidate; callers outside the facade are responsible for supplying validated packages. The facade itself validates and hash-pins the complete chain before using this helper.

- Each mapping reports `status`: `approved`, `pending`, `missing`, `stale` or `unsupported`, independently of `semanticallyCompatible`. `approved` is true only when the mapping's declared review flag and semantic checks agree. It is **not authenticated publication approval**. `eligibleForCarry` is always false in D1, even for a structurally compatible reviewed proposal.
- Completion reports require the explicit v1 lesson → exact 1.3.0 lesson revision mapping, source/target fingerprints and existing semantic checks. IDs alone do not establish compatibility. Proposed recompletion/archive decisions are reported without altering saved completion.
- Assessment reports audit original answers and stored aggregates against the original v1 source. They compare target assessment delivery, required items, policy and exercise grading semantics, and require each item's exact evidence mapping. Returned percentages, pass results, statuses and timestamps always remain the **saved values**, including an inconsistent score that is flagged for review rather than repaired. Repeated attempts remain separate rows in original input order.
- Resume reports check the current-target lesson mapping and, when present, the block mapping and membership in the correct source/target lesson. An earlier ancestor's `same_ids` proposal cannot override the current draft's restart decision. Resume's original version and update timestamp remain visible.
- A learning snapshot lacks completion timestamps/source; these remain `null`. Export version 1 supplies its exact completion and resume timestamps. Unknown historical versions are preserved in summaries and reported as unsupported; their grading or interpretation is not guessed.
- All current v1 quiz responses are recognition evidence, not demonstrated core-skill proficiency. Historical skill labels remain intact, including question 5's `writing` label. No reading/writing proficiency or CEFR level is assigned from MCQs; `cefrAwarding` is disabled.

Reports intentionally omit answers, prompts, options, explanations, grading keys/rubrics, private inventory, mapping prose and internal fingerprints. Source response snapshots are used for internal consistency checks and left untouched; the existing v1 history/export retains those full snapshots. No v1 attempt is copied into a v2 store, recalculated in place, or rewritten.

## Package identity and security

`src/lib/curriculum/v2/file-hash.ts` names the unchanged package algorithm as `sha256-canonical-file-inventory-v1`. It hashes canonical JSON of the lexically sorted `{path,sha256}` list for all package files **including manifest.json**. It rejects unsafe paths, malformed hashes, duplicate entries and a missing manifest, without mutating the caller's inventory. This is separate from the fingerprint of a parsed package/entity.

`reader.ts` now delegates its existing hash calculation to that helper. The output is byte-for-byte compatible with existing validated pins; package identity, preview pins, content files and schemas did not change. The existing reader passes the file hash explicitly into registry snapshots. The default semantic fingerprint in `registrySnapshot(pkg)` remains useful for existing synthetic validation tests, but must not be used as a file-release identity in D2.

| Inactive draft | Exact file-package hash                                            |
| -------------- | ------------------------------------------------------------------ |
| 1.1.0          | `d3bc6e336d3cf25ee74eb8cf7c1ce69e6a4cff9aefea9a2d99ed833d7648a668` |
| 1.2.0          | `c37cbacb93e1591f1b95d0473ac30f59895d3b9e05e50561330d58ee3297a755` |
| 1.3.0          | `0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029` |

Security boundaries:

- Catalog/report/public-entity modules have `server-only` guards. Only reference contracts/types and the non-secret digest utility are suitable for independent use; no new public API, client import or static draft artifact is added.
- V1 lookups use the existing sanitized public JSON, never the canonical answer-bearing objects. V2 lookups use the strict public projection, not package serialization.
- `public-entities.ts` excludes private transcripts and conditional (`after_submission`, `reviewer_only`) transcripts, even if they appear in the public collection. Only transcripts referenced exclusively by `always` listening stimuli are resolvable. There is no learner/reviewer context that could unlock hidden content in D1.
- Returned catalog objects and references are detached from the validated package. Reports return only explicit safe metadata. Import-graph tests reject dependencies on Supabase, learning persistence, API routes and authoring/writer modules.

## Files and validation

New production-library files:

- `src/lib/curriculum/catalog/contracts.ts`: strict release/reference contracts and immutable draft pins.
- `src/lib/curriculum/catalog/public-entities.ts`: safe entity indexing and transcript filtering.
- `src/lib/curriculum/catalog/report.ts`: read-only compatibility DTOs and audit.
- `src/lib/curriculum/catalog/server.ts`: server-only facade and fixed-input loading.
- `src/lib/curriculum/v2/file-hash.ts`: file-package hash algorithm.

Modified library file: `src/lib/curriculum/v2/reader.ts`, solely to delegate hash calculation. New tests: `tests/catalog/{fixtures.ts,catalog.test.ts,history.test.ts,security.test.ts}`. This report is the new documentation file; `docs/phase-3d-publishing-plan.md` remains the approved plan.

The 19 new tests cover all original IDs/slugs/option ordering, exact version resolution, hash domains and pins, altered/missing packages, detached public content, hidden transcripts, immutable history, repeated attempts, 80% historical scores, pending/approved/missing/stale mappings, incorrect resume anchors, changed policy/snapshot detection, unsupported versions, reset-empty history, export dates/ownership and import boundaries. Test fixtures recreate the exact draft chain only in temporary directories, so fresh checkouts can test without ignored local drafts.

Commands (Node 22+):

```bash
npx vitest run tests/catalog
npm run content:check
npm run curriculum:v2:schemas:check
npm run curriculum:v2:validate -- .curriculum-drafts/1.3.0 \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 --json
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:e2e:preview
```

Verification passed: lint, type-check, all **121 unit tests** (including 19 new D1 tests), production build, v1 generated-content check, generated v2 JSON Schema check, and unchanged 1.3.0 package-chain validation. Production browser regressions passed **16/16** and development preview regressions passed **8/8**, across desktop/mobile with accessibility, navigation, answer-state, retry, reset and security checks. The unit database suite uses local test storage, and browser persistence tests simulate authenticated responses. They do not establish hosted RLS or deployed-schema compatibility.

## Limitations and next D2 prerequisites

1. This facade is not connected to the live website. It requires trusted filesystem access to the unchanged draft chain when explicitly loaded; builds/live v1 routes do not depend on it. There is no active/latest resolver, release registry, import command, publication permission, v2 write endpoint or durable v2 history format.
2. Only v1 snapshot/export contracts are accepted as history. No real v2 attempts exist yet; implementing storage/export for them belongs to later phases. Compatibility remains an offline proposal, not a persisted carry event or hosted audit.
3. Draft 1.3.0 still has 55 pending locale exceptions, 237 pending compatibility entries and no editorial approvals. This work does not approve, translate or mutate them.
4. D2 needs a separately versioned publication candidate, exact file-hash identity, authenticated reviewer records, immutable registry constraints, capability gates, and dry-run/idempotent import tests. Preserve all historical drafts and grading bindings.
5. Before **any future hosted database operation**, obtain authorized access to the intended environment, inspect deployed schema/migration state and compare it with the repository. Review an additive migration and prepare isolated staging, two test accounts, backups and a restore drill under the approved plan. No credentials were needed or requested for D1.
6. Reset/export integration and generation-safe v2 persistence remain D3/D4 prerequisites; activation and rollback remain D5. D2–D7 have not been implemented.
