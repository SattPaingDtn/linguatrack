# Phase 3D-D2: local inactive curriculum registry

Implemented **D2 only**, following the publishing plan, D1 report and v2 proposal. Nothing was applied to hosted Supabase, activated or published. No learner UI, API, accounts, progress, attempts, outbox, reset, export or preview behavior changed. **Hosted schema and migration compatibility remain unverified.**

## Architecture and additive migration

`supabase/migrations/20261012000100_curriculum_registry.sql` introduces the separate **`curriculum_private`** schema. It is not included in Supabase's exposed schemas. The three existing migrations are unchanged. The new migration creates no learner tables, changes no existing function and touches no learning record.

The registry has 17 RLS-enabled relations:

| Relations                                                          | Purpose                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidates`                                                       | Immutable sealed-candidate manifest, unique content version and exact file-package hash, registration principal/time. Registration reserves the version; changed bytes require another unused version.        |
| `reviewer_scopes`, `review_events`                                 | Administratively assigned database principals/scopes and append-only, hash-bound review decisions with idempotent request IDs. No reviewer assignment is seeded.                                              |
| `artifacts`, `artifact_files`                                      | Immutable manifest/compiled inventory and original package bytes, including JSON, private files and media. Database checks byte length, each SHA-256, manifest equality and the complete file-package digest. |
| `identities`, `entities`, `artifact_entities`, `entity_references` | Stable kind/ID identities, exact revisions, payload hashes/visibility, release membership and reference FKs. Entity revisions cannot be reused with changed payloads.                                         |
| `grading_bindings`, `policy_bindings`                              | One immutable private grading/policy binding per exact exercise/assessment revision; new bindings require increasing grading/policy revisions. Rubric/item references participate in the reference graph.     |
| `compatibility_mappings`, `legacy_sources`, `legacy_origins`       | Immutable mappings and exact v1/v2 source/target fingerprint checks. The v1 baseline is hash-pinned; only its origin hashes are added, without copying learner history or replacing its catalog.              |
| `releases`, `import_events`                                        | Idempotent staged-release receipt and first import principal/time. Release state is constrained to **inactive**.                                                                                              |
| `channels`                                                         | Disabled metadata only: `enabled=false`, active hash `NULL`, epoch `0`. No activation function exists; changes/deletion/truncation are blocked.                                                               |

Validated ancestor drafts may be archived as provenance artifacts. They do **not** receive staged-release rows or approvals. The structural `registry_snapshot().releases` array names versioned artifacts for existing v2 validation contracts; it is not an operational published-release list. Only the separate SQL `releases` relation records staged candidates, all inactive.

Updates, deletes and truncation are rejected for immutable records, even through ordinary owner SQL. Reviewer scope assignments are administrative access configuration and may be revoked. All browser roles, including `anon` and `authenticated`, have no schema/table/function access. The importer and reviewer groups receive only schema usage and narrowly listed function execution; neither receives direct table or sequence access. Privileged entry points use an empty search path and schema-qualified objects.

## Authenticated review gates

The SQL review entry point is:

```sql
curriculum_private.record_review(package_hash, scope, decision, request_uuid)
```

It derives the principal from **`session_user`**, checks membership in the reviewer group and an assigned scope, and rejects principals that also belong to the importer group. A caller cannot supply a reviewer name, learner UUID or `approvedBy` value. JWT/GUC claims and author-written manifest approvals confer no authority.

The conservative D2 gate requires at least one currently assigned independent approval in each scope: **translation, coverage, grading, compatibility**, all bound to the exact candidate hash. The same independent reviewer may cover several scopes if assigned. The latest decision per principal/scope applies; any current rejection blocks staging. Revoked assignments stop counting. Approval does not transfer to changed bytes, another version or another candidate. Replaying a review request returns its original receipt; conflicting reuse fails.

This implements database-principal authorization, not a human review UI or production identity provisioning. Isolated tests simulate authenticated SQL sessions by administrator-controlled session switching. The local CLI has **no approval command or reviewer impersonation flag** and provisions no reviewers. A local filesystem/database administrator remains trusted and can provision test principals; these tests are not evidence that any real editorial review occurred. Production reviewer identities, grants and any stronger quorum policy need operational approval before a real candidate is staged.

Draft 1.3.0 remains unchanged, with **55 pending locale exceptions, 237 pending compatibility entries and no editorial approvals**. No real replacement candidate was created or auto-approved. Tests use temporary synthetic sealed packages at 9.x versions; they are not reviewed teaching releases and are never served by the application.

## Import tools and commands

`src/lib/curriculum/staging/prepare.ts` is server-only trusted tooling. It re-reads the original 1.0.0 baseline, validates the package/ancestor chain using the existing strict reader and registry contracts, requires a sealed candidate, preserves the known draft hash pins, verifies media, and checks capabilities. It builds a private import plan; callers must not serialize that plan into an API or browser payload.

D2's configured capability allowlist is `legacy-v1-bridge`, `multiple_choice`, `package-media`. Missing declared capabilities fail semantic validation; unsupported capabilities fail staging preflight. This is an import support gate, not a claim that every v2 block has a production renderer. Managed-media adapters and other exercise families remain disabled. Embedded archives are limited to **32 MiB of original bytes per complete plan**, including ancestors; larger packages require a separately reviewed storage approach.

`database.ts` supplies registry snapshot, dry-run, candidate registration and transactional staging helpers. Staging uses one privileged SQL statement/transaction with an advisory lock, hash/approval checks, immutable conflict checks, FKs and an idempotent receipt. A failure leaves no partial artifact/entity/grade/release import. Candidate registration and review audit entries remain separate immutable workflow steps. Every CLI action revalidates bytes; a dry-run cannot authorize later changed input.

The CLI uses embedded PostgreSQL through PGlite. It has **no hosted connection adapter**, accepts no database URLs, and never reads production credentials. Database directories must be under the ignored `.curriculum-registry-local` root or an OS temporary directory. Initialization exclusively creates a new empty isolated directory/database after inspecting its schema; it cannot reset or migrate an existing database. Symlinked database directories and protected application/content directories are rejected. SQL errors are sanitized so private tuples and grading payloads are not printed.

From the repository, with Node 22+:

```bash
# Creates only an isolated embedded database; no reviewers are provisioned.
npm run curriculum:registry -- init --db .curriculum-registry-local

# Use an independently reviewed, sealed package in an unused content version.
# This path is a placeholder; a real sealed successor to 1.3.0 does not yet exist.
LINGUATRACK_CANDIDATE_DIR=/path/to/reviewed/sealed-package

npm run curriculum:registry -- dry-run "$LINGUATRACK_CANDIDATE_DIR" \
  --db .curriculum-registry-local \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.3.0

npm run curriculum:registry -- register "$LINGUATRACK_CANDIDATE_DIR" \
  --db .curriculum-registry-local \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.3.0

# Remains blocked until independent authenticated review events cover this hash.
npm run curriculum:registry -- stage "$LINGUATRACK_CANDIDATE_DIR" \
  --db .curriculum-registry-local \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.3.0

# Reproduces successful and blocked CLI flows using disposable test packages/databases.
npm run test:registry
```

Dry-run returns safe counts, hash/algorithm, review scopes, `writes=false`, `active=false`, and `canStage`; it inserts nothing into the registry. `register` only reserves the sealed candidate. Successful `stage` returns `state=inactive`, `activated=false`. Identical imports retain the original entities, reviews and first import receipt. Same version/different hash or changed entity/grading payloads fail.

Passing the existing `.curriculum-drafts/1.3.0` as a candidate is rejected: it is a draft, not a sealed approved successor. Do not change its state, flags or bytes to bypass this gate. Create an unused version after real review, with appropriate entity revisions, exact references and mappings, retaining the original drafts.

## Exact D2 changed-file list

| File                                                         | Change                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `.gitignore`                                                 | Ignore the isolated embedded registry directory.                                  |
| `package.json`                                               | Add `curriculum:registry` and `test:registry`; no dependency or lockfile changes. |
| `supabase/migrations/20261012000100_curriculum_registry.sql` | New additive private registry migration.                                          |
| `src/lib/curriculum/staging/prepare.ts`                      | New sealed-package validation, byte archive and private plan compiler.            |
| `src/lib/curriculum/staging/database.ts`                     | New narrow database interfaces.                                                   |
| `scripts/curriculum/registry.ts`                             | New local-only CLI.                                                               |
| `tests/registry/fixtures.ts`                                 | New isolated migration/authentication and synthetic package fixtures.             |
| `tests/registry/registry.test.ts`                            | New SQL integration/security/compatibility tests.                                 |
| `tests/registry/tools.test.ts`                               | New CLI, validation and ancestor-preservation tests.                              |
| `docs/phase-3d-d2-report.md`                                 | This report.                                                                      |

Pre-existing D1 files/changes, including its reader hash delegation and catalog facade, are preserved and are not D2 changes. No curriculum JSON, generated schema, existing migration, public component, learner API or Supabase configuration changed.

## Verification

The new suite has **13 tests**, covering actual local CLI success and refusal, authenticated review scopes/hash binding/replay/rejection/revocation, browser privilege denial, immutable updates/deletes/truncation, version and grading conflicts, exact refs, altered media, public key leakage, capability gates, atomic rollback, inactive channels, durable package bytes and unchanged draft ancestry. A compatibility test creates two users and v1 learning data **before** the forward migration; afterward it verifies identical saved answer snapshots, owner isolation, reset/generation behavior and the other user's retained progress.

All SQL integration runs use empty isolated PGlite instances or temporary local storage. No hosted database was queried or migrated.

| Check                                 | Result                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run lint`                        | Passed; final run performed after Playwright output cleanup to avoid a filesystem scan race.           |
| `npm run typecheck`                   | Passed.                                                                                                |
| `npm test`                            | **134/134** tests across 22 files passed.                                                              |
| `npm run test:registry`               | **13/13** registry/tool integration tests passed.                                                      |
| `npm run build`                       | Production build passed, with existing routes unchanged.                                               |
| `npm run test:e2e`                    | **16/16** desktop/mobile production regressions passed.                                                |
| `npm run test:e2e:preview`            | **8/8** desktop/mobile preview regressions passed.                                                     |
| `npm run content:check`               | V1 generated content unchanged.                                                                        |
| `npm run curriculum:v2:schemas:check` | Generated v2 schemas unchanged.                                                                        |
| Existing 1.3.0 chain validation       | Valid inactive draft; hash remains `0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029`. |

These tests establish local authorization, integrity and compatibility behavior. Browser persistence tests simulate authenticated responses; they are not a live hosted Supabase audit. The production preview remains disabled and all 14 development questions retain their existing isolated feedback behavior.

## Remaining blockers and D3 prerequisites

1. A real reviewed sealed successor to 1.3.0 does not exist. Resolve its pending editorial work in a new unused version, with real scope-assigned reviewers and hash-bound audit events. The local fixtures confer no approval on actual content.
2. Before any hosted operation, verify the intended project, deployed schema and migration ledger, function/grant/role compatibility, backups and an isolated restore drill. The new migration has only been tested locally; do not run `supabase db push` as part of D2.
3. D3 must add owner-scoped v2 learning storage/read/export interfaces and extend existing reset/account-deletion behavior before enabling any v2 write. Continue using the shared learning generation and retain v1 outbox/API semantics.
4. Review production importer/reviewer authentication and secret management separately. D2 supplies database-role gates and no browser review API, hosted adapter or production credential configuration.
5. Publishing, activation/CAS/rollback, production media delivery, grader rollout and v2 submissions remain later phases. Current channels are deliberately incapable of activation. Larger/managed assets and additional capabilities need separate tests and policy changes; SQL/TypeScript validation is not a production renderer or proficiency award.
