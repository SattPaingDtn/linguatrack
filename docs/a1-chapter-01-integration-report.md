# A1 Chapter 1 · inactive content integration

## Scope and mapping

The complete source pack is converted into **schema v2 draft 1.4.0**, based on the exact validated 1.3.0 package. Seven pedagogical lesson roles reuse three established lessons, link the established subject-pronouns lesson and add four new lessons. The chapter therefore has eight catalog lessons, without replacing any established identity or slug.

The requested Markdown was initially missing from the repository. The matching file from `/Users/sp/Downloads/A1_Chapter_01_Full_Lesson_Pack.md` was copied unchanged into `content-authoring/A1_Chapter_01_Full_Lesson_Pack.md`. Source SHA-256: `f4754519aea27855b3c6d48c403b5924e68d27a0857d2f5b9553fa58160507dc`. This file contains a private editorial answer table and must never be published as learner content.

| Source role                        | Integration / exact lesson revision                                                                                                   | Preview suffix under `/dev/chapters/a1-chapter-1/` |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1. Greetings and vocabulary        | Enrich `a1-c1-introductions@4`; retain all original blocks and the original real audio                                                | `introductions`                                    |
| 2. Grammar                         | Enrich `a1-c1-be@4`; articles, basic questions, complements/objects, mistakes and sentence production                                 | `am-is-are`                                        |
| Linked pronouns                    | Retain `a1-c1-subject-pronouns@3`, its original slug, 14 questions and private rules; only hierarchy references change                | `subject-pronouns-and-sentences`                   |
| 3. Listening                       | New `a1-c1-meet-colleagues@1`; two scripts and eight audio-gated questions                                                            | `meet-the-new-colleague`                           |
| 4. Speaking                        | New `a1-c1-speaking-at-work@1`; S1 introduction, S2 role-play, S3 repairs and self-review                                             | `introduce-yourself-at-work`                       |
| 5. Reading                         | New `a1-c1-new-team@1`; two passages and two supported comprehension groups, eight child MCQs                                         | `our-new-team-members`                             |
| 6. Writing                         | New `a1-c1-professional-introduction@1`; W1–W3 flexible guided writing, first draft, checklist and separate rewrite                   | `my-first-professional-introduction`               |
| 7. Review and assessment blueprint | Enrich `a1-c1-check@4`; preserve original five-question assessment; append ten formative questions and future assessment requirements | `chapter-check`                                    |

Preview order follows these learning roles, inserting the retained pronoun lesson after be grammar. The package retains existing chapter lesson order and appends new lesson references; no original block is removed or reordered. The preview has no completion action or formal test mode.

## Delivered content and identity preservation

- **32 new bilingual blocks, 7 typed objectives, 4 new lessons, 2 new reading stimuli, 41 new MCQs and 2 reading-comprehension containers**, all new entities at revision 1.
- Source question mapping: `V1–V5` → `a1-c1-pack-v01`–`v05`; `G1–G10` → `a1-c1-pack-g01`–`g10`; `L1–L8` → `a1-c1-pack-l01`–`l08`; `R1–R8` → `a1-c1-pack-r01`–`r08`; `T1–T10` → `a1-c1-pack-t01`–`t10`. All suffixes use the `a1-c1-pack-` prefix. Options have distinct `<question-id>-a/-b/-c` identities.
- Reading group IDs: `a1-c1-pack-reading-group-a/b`; reading stimuli: `a1-c1-pack-reading-a/b`. They are `practice_with_support`, not independent assessments. Containers have no separate grading rule, avoiding double grading.
- The complete draft has **8 lessons, 48 blocks, 31 objectives and 62 exercise entities**: 60 MCQ leaves and two containers. **52 MCQs are checkable locally**; eight are awaiting audio. Existing 19 questions/options/keys remain unchanged.
- Exact reference changes propagate to a fixed point through course, chapter, lessons, blocks and assessment. Existing `general-a1` and `a1-chapter-1` are revision 4. The original five-question policy keeps its items, weights, rounded-percent algorithm, required-all behavior and **80%** threshold; only its exact assessment binding/policy revision advances. Historical policy and scores remain available in the unchanged ancestors.
- All **237 existing compatibility records** are retained verbatim. **217 new proposals** target 1.4.0, all pending; total 454. Enriched introductions, be and chapter-check lessons propose recompletion rather than automatically carrying prior completions. Reference-only pronouns and unchanged questions propose continuity pending review. No mapping is applied to learner data.
- All **55 pending legacy locale exceptions** remain pending. No editorial approvals were fabricated. Inherited untranslated v1 fields are explicitly labeled in the preview; new content and feedback are bilingual. Grammar/vocabulary MCQs carry no reading-comprehension skill tag.

Package file-inventory hashes (including manifest):

```text
1.1.0  d3bc6e336d3cf25ee74eb8cf7c1ce69e6a4cff9aefea9a2d99ed833d7648a668
1.2.0  c37cbacb93e1591f1b95d0473ac30f59895d3b9e05e50561330d58ee3297a755
1.3.0  0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029
1.4.0  e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67
```

The generated `.curriculum-drafts/1.4.0/` remains ignored by Git, like earlier drafts. Version-control source inputs and offline tooling reproduce it deterministically. Do not edit any existing draft directory.

## Local authoring and preview commands

Use Node.js 22+ and npm 10+. No Supabase or AI credentials are required.

With the existing validated 1.1.0–1.3.0 chain present, create 1.4.0 **once**, only if absent:

```bash
npm run curriculum:v2:author-chapter
```

For a fresh checkout with **none** of the draft directories present, rebuild the immutable ancestors first. Do not run these create commands over existing directories:

```bash
npm run curriculum:v2:bridge -- --out .curriculum-drafts/1.1.0
npm run curriculum:v2:author-prototype
npm run curriculum:v2:edit-pronouns
npm run curriculum:v2:author-chapter
```

Repeatable read-only checks:

```bash
npm run curriculum:v2:author-chapter -- --check
npm run curriculum:v2:validate -- .curriculum-drafts/1.4.0 \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.3.0
```

The authoring CLI validates source SHA, all 41 prompt/option/key mappings, audio gates, reachability, strict schemas, translations, exact references, revisions, compatibility and media. Create mode refuses source overlap/existing output. `--check` compares the existing package against the deterministic candidate without writes. Future editorial changes require an unused version and explicit review; the preview intentionally pins 1.4.0 and its exact hash.

Launch locally:

```bash
npm run dev
```

Open **http://localhost:3000/dev/chapters/a1-chapter-1**. Add the table's suffix to open a lesson directly, for example **http://localhost:3000/dev/chapters/a1-chapter-1/our-new-team-members**. Existing **http://localhost:3000/dev/lessons/subject-pronouns** remains pinned to 1.3.0 and behaves as before. Preview requires the development server and a loopback host; `npm start` deliberately returns 404.

## Security and learner behavior

- Private answer rules live in `content-authoring/a1-chapter-01/grading.json` and generated `private/grading.json`, outside `public/`. Markdown/private sources are never imported into browser components or public static assets.
- Server-only reader validates the complete immutable chain and pinned file-inventory hash. It constructs strict, public-only lesson DTOs. Only originally public transcripts are returned; hidden transcripts, grading inventory, compatibility records and private assessment policies are excluded.
- `POST /api/dev-chapter-preview/answer` checks one exact version/revision/option/public digest. Development-only, same-origin loopback requests, 4 KiB streamed body limit, no credentials, no-store responses; all methods return 404 in production before content or body reads. Invalid submissions and altered drafts fail closed with safe error states. No bulk grading endpoint exists.
- Learn/Practice/Review reuse existing colors, Burmese font/1.95 line height and responsive components. One MCQ at a time; immediate bilingual feedback is retained in page memory. Review uses only feedback already returned. Navigation preserves writing drafts and checklists within the page; refresh/leaving clears them. Changing lessons clears state.
- Preview routes bypass `SessionProvider`, so they cannot reconcile the v1 outbox or read/write learning records. Grading has no learning/Supabase imports. Existing live v1 routes, auth, history, reset, export, outbox and D1/D2 interfaces stay unchanged.
- The existing introduction WAV is played only for its original dialogue. Its actual `public/audio/a1-introductions.wav` bytes must match the validated package. It is never substituted for the newly authored scripts.
- No completion, pass result, skill proficiency or CEFR level is saved or awarded, even after all MCQs are correct. Writing/speaking are expressly ungraded self-practice; no recording/upload or exact-string writing grading exists.

## Outstanding features and editorial review

1. **New listening audio is absent.** Both scripts and all eight questions are retained and clearly marked awaiting audio. They use supported explanation/exercise-set/MCQ structures for authoring visibility, with server checks disabled. No fake listening stimulus/asset or assessed listening coverage is created. A future unused revision must bind actual reviewed media/transcripts to listening-comprehension containers and implement transcript concealment.
2. **Formal multi-skill chapter assessment is a blueprint.** The source has no fresh parallel dialogue/questions or unseen 60–90-word reading passage/five-question set. These must be authored and reviewed; none is silently invented. Existing five-question legacy assessment remains; the added ten-question practice set has no new pass threshold.
3. **Speaking recording and authorized human writing/speaking review** remain future work. Both writing drafts are memory-only; participation/checklists are not production proficiency evidence. The current format supports self-practice, not the source's eventual saving/recording ambitions.
4. The source writing model contains eight sentences against the 5–7 sentence instruction. Its text is preserved and a bilingual note clarifies its role as phrase examples. Editorial review should decide whether a future version shortens the model.
5. Source distractors, including G10 `Is he a manager.` and unusual V1/T10 options, are retained exactly with correct key mappings. Review their pedagogical quality/punctuation before approval; G10 feedback identifies the affirmative statement target.
6. Native Burmese pedagogical review, new British pronunciation guides, pacing after enriching retained lessons, all 55 legacy translation exceptions and all new compatibility proposals require independent editorial review. Schema/mapping tests are not human translation approval.
7. Schema v2 supports the used MCQ, reading-comprehension containers and self-practice blocks. No source activity was dropped or transformed into rigid writing grading. Other supported exercise types were not necessary. This candidate adds the `reading_comprehension` capability; existing D2 staging capability/review gates remain unchanged and must not be bypassed.
8. No hosted database was inspected or mutated, no migration file was changed or added for this integration and no hosted migration was executed, and no v2 package was sealed, staged, published or activated. Hosted progress compatibility has not been verified.

## Files for this integration

New source/tooling files:

- `content-authoring/A1_Chapter_01_Full_Lesson_Pack.md` — exact private editorial source copy.
- `content-authoring/a1-chapter-01/public.json` — public additions only.
- `content-authoring/a1-chapter-01/grading.json` — 41 private grading rules and bilingual explanations.
- `content-authoring/a1-chapter-01/mapping.json` — source hash, question inventory and lesson assignments.
- `src/lib/curriculum/v2/chapter-authoring.ts` — source checks, additive converter, exact revision propagation and pending mappings.
- `scripts/curriculum/author-chapter.ts` — exclusive generation / repeatable read-only check.
- `src/lib/curriculum/chapter-preview/{config,contracts,server}.ts` — public route metadata, safe DTOs and guarded server reader/grader.
- `src/app/dev/chapters/a1-chapter-1/{layout,page}.tsx` and `[lessonSlug]/page.tsx` — development-only preview pages.
- `src/app/api/dev-chapter-preview/answer/route.ts` — stateless development-only single-answer endpoint.
- `src/components/preview/chapter-lesson.tsx` — bilingual renderer and self-practice layout.
- `tests/chapter-preview/{fixtures,authoring.test,server.test}.ts` and `tests/preview-e2e/chapter.spec.ts` — authoring/security/browser verification.
- `docs/a1-chapter-01-integration-report.md` — this report.

Modified for this integration:

- `README.md` — adds the local chapter preview entry point and report link.
- `package.json` — adds `curriculum:v2:author-chapter` only; preserves existing D1/D2 scripts/dependencies.
- `src/components/layout/application-boundary.tsx` — development-only chapter routes bypass the session provider.
- `src/components/preview/preview-shell.tsx` — optional version label, retaining original 1.3.0 default.
- `src/components/preview/preview-writing.tsx` — optional textarea label, retaining original default.
- `src/components/preview/use-preview-practice.ts` — optional endpoint/version/lesson context, retaining original defaults.
- `tests/e2e/preview-disabled.spec.ts` — production denial checks for new pages and all endpoint methods.

Generated local artifact: `.curriculum-drafts/1.4.0/` (16 package files including the unchanged WAV). Pre-existing D1/D2 changes and newly supplied unrelated chapter 2/3/blueprint/import instruction files were not modified by this task.

## Verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e:preview
npm run test:e2e
npm run build
npm run content:check
npm run curriculum:v2:schemas:check
```

Results are recorded below after the final verification pass.

**Final result: all checks passed.**

- Full v2 package/ancestor validation and `author-chapter --check`: exact pinned 1.4.0 hash, all 41 source mappings, bilingual feedback, references/revisions, private rules and media verified; ancestors unchanged.
- `npm run lint`, `npm run typecheck`, `npm run build`, v1 content integrity and generated schema drift checks: passed.
- `npm test`: **143 tests / 24 files passed**, including nine new authoring/server tests, prior identity/grading/history checks, isolated registry/PGlite tests and persistence/isolation/reset regressions. The process-heavy CLI integration test uses a 30-second limit, matching existing authoring CLI tests; an initial default five-second timeout under the full suite was corrected without relaxing any assertions.
- `npm run test:e2e:preview`: **22 passed** on desktop and mobile (14 new chapter cases, eight existing preview regressions). Every lesson rendered; all 33 newly checkable MCQs returned correct bilingual feedback; eight pending audio questions were shown but could not be checked. Writing/rewrite/checklists survived step navigation and cleared on refresh. Axe reported no violations in tested states; no horizontal overflow or learning/auth requests, private-key fields in initial HTML/client scripts, or learner-storage changes were detected.
- `npm run test:e2e`: **18 passed** on desktop/mobile, including production 404 denial for new preview pages/all grader methods, v1 learning/navigation, saved-progress resume/repeated attempts, retries, reset and accessibility. Persistence browser cases use the existing mocked learning API; PostgreSQL regressions use isolated PGlite. **These are not hosted Supabase verification.**
