# Phase 3B: one-lesson content-authoring prototype

**Result:** inactive working copy `.curriculum-drafts/1.2.0`, derived from the validated `.curriculum-drafts/1.1.0`. The source's 16 files remain byte-for-byte unchanged. No website UI, live v1 content, Supabase migration, account or saved learning record was changed. Nothing was activated, published or imported.

## New content

The optional 20-minute lesson is appended to `a1-chapter-1` after the original three lessons. It covers seven subject pronouns, `am/is/are` agreement, subject–verb–complement and subject–verb–object patterns, capitalization and six common mistakes. English teaching content has Burmese explanations/translations. Fourteen single-answer multiple-choice items have separate private keys and bilingual feedback.

| Entity          | New identity                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson          | `a1-c1-subject-pronouns`                                                                                                                            |
| Lesson slug     | `subject-pronouns-and-sentences`                                                                                                                    |
| Objectives      | `a1-c1-subject-pronouns-objective-pronouns`, `a1-c1-subject-pronouns-objective-be`, `a1-c1-subject-pronouns-objective-order`                        |
| Teaching blocks | `a1-c1-pronouns-overview`, `a1-c1-pronouns-reference`, `a1-c1-pronouns-be-agreement`, `a1-c1-pronouns-word-order`, `a1-c1-pronouns-common-mistakes` |
| Practice block  | `a1-c1-pronouns-practice` (`exercise_set`)                                                                                                          |
| Questions       | `a1-c1-pronouns-q01` through `a1-c1-pronouns-q14` (`multiple_choice`)                                                                               |

Every new entity starts at revision 1. All original IDs, slugs, teaching text, option IDs/order, keys, explanations and relative lesson order are retained. The original chapter assessment still has its five questions and 80% threshold; its coverage has not silently expanded to the new lesson.

Exact reciprocal references require revision 2 for the A1 course, its chapter, the three old lessons, their nine blocks and the existing assessment. The existing assessment policy becomes revision 2 solely for its revised assessment reference; its scoring behavior is unchanged. The five original exercise entities and grading rules remain revision 1. A2–C1, original media, transcripts and stimuli are unchanged.

All **23 original compatibility entries** are retained exactly. Twenty-three new legacy-to-`1.2.0` mappings and 48 draft-v2-to-`1.2.0` mappings are appended, for 94 total. New mappings remain pending review. Revision metadata alone does not invalidate identical teaching/scoring semantics; changed keys, scoring or routes still fail compatibility checks.

## Files

Frozen, version-control-ready source for the original 1.2.0 prototype (the root authoring files now hold the [editorial revision](pronouns-editorial-review.md)):

- [`content-authoring/a1-subject-pronouns/revisions/1.2.0/public.json`](../content-authoring/a1-subject-pronouns/revisions/1.2.0/public.json): one lesson, six blocks, three objectives and 14 public exercises. It uses the existing public collection schemas, not a new exercise format.
- [`content-authoring/a1-subject-pronouns/revisions/1.2.0/grading.json`](../content-authoring/a1-subject-pronouns/revisions/1.2.0/grading.json): 14 private grading rules with English/Burmese explanations.

Offline authoring support:

- `src/lib/curriculum/v2/authoring.ts`: clone the source, append the lesson, propagate exact-reference revisions, retain/append mappings and recalculate file integrity metadata.
- `scripts/curriculum/author-prototype.ts`: validate the source, reject source-overlapping/existing output paths, write a new inactive copy and revalidate both copies.
- `src/lib/curriculum/v2/validate.ts`: allow version-scoped historical mappings only against verified registry revisions; require the exact v2 parent digest. Duplicate mappings within one target version and forged historical hashes are rejected.
- `src/lib/curriculum/v2/compatibility.ts`: compare pedagogical/scoring payloads independently of revision counters, preserving strict checks of keys, explanations, grader versions and thresholds.
- `tests/curriculum-v2/authoring.test.ts`: six authoring regression tests. `package.json` adds `curriculum:v2:author-prototype`.

In the new working copy, these 10 files differ from their counterparts in `1.1.0`: `manifest.json`, `compatibility.json`, `public/{courses,chapters,lessons,blocks,objectives,exercises,assessments}.json` and `private/grading.json`. The other six files are byte-identical. Both `.curriculum-drafts/` directories remain ignored by Git; the authored source, tooling and tests can reproduce the output.

## Validation and commands

Validate the delivered working copy against its immutable parent:

```bash
npm run curriculum:v2:validate -- .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.1.0 --json
npm run test:curriculum:v2
```

To reproduce into another **new** directory (the delivered `1.2.0` directory already exists):

```bash
npm run curriculum:v2:author-prototype -- \
  --source .curriculum-drafts/1.1.0 \
  --out .curriculum-drafts/1.2.0-reproduction
```

The prototype intentionally supports this standard, unsharded bridge package and its existing PCM WAV media. It is not a general editor or publisher. Output creation is exclusive; existing copies and source descendants cannot be overwritten. Authored dates are fixed to 2026-10-12 for deterministic reproduction. Use Node.js 22+ and npm 10+.

Verification passed:

- Actual package validation with `--against`: strict structures, reference/revision ownership, unique IDs, bilingual fields, keys, historical mappings, parent digest and media integrity.
- **32 curriculum tests**, including six new authoring tests; **77 total tests** under `npm run check`.
- Lint, type-check, v1 content integrity, generated JSON Schema drift and production build.
- Regression fixtures retain completed lessons, partial/repeated quiz attempts, scores, original timestamps and resume anchors without mutating learning snapshots or reset generation. Disk tests prove source preservation and refused output overwrite. These are offline compatibility tests, not a live progress migration.

```text
1.1.0 source digest: d3bc6e336d3cf25ee74eb8cf7c1ce69e6a4cff9aefea9a2d99ed833d7648a668
1.2.0 draft digest:  c37cbacb93e1591f1b95d0473ac30f59895d3b9e05e50561330d58ee3297a755
```

## Limits

The app continues to serve v1 `1.0.0`; this lesson is not visible in the website. Completion is self-reported practice, and its MCQs demonstrate grammar recognition, not free writing, speaking or CEFR proficiency. No new chapter assessment, UI, media, AI grading or persistence workflow is added. New bilingual copy and compatibility mappings remain draft material for editorial review before any future activation; no approval is fabricated. Hosted database inspection and migration are outside this prototype, and no hosted database operation was performed.
