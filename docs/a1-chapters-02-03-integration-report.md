# A1 chapter expansion · local integration report

Implemented the supplied `content-authoring/CODEX_IMPORT_INSTRUCTIONS.md` workflow. **Inactive schema v2 draft 1.5.0** extends the exact 1.4.0 Chapter 1 package. No hosted operation, activation, publishing, grading/persistence rollout or real reviewer approval occurred. The live website continues to use v1.

## Chapter 1 reuse mapping

Chapter 1 was already converted. Do not import the seven Markdown pedagogical sections as seven new lesson IDs:

| Source role         | Established lesson IDs / behavior                                                      |
| ------------------- | -------------------------------------------------------------------------------------- |
| Greetings and words | `a1-c1-introductions`; original blocks and real introduction audio retained            |
| Grammar             | `a1-c1-be`, with linked `a1-c1-subject-pronouns`; original slugs/options/keys retained |
| Listening scripts   | `a1-c1-meet-colleagues`; eight questions still audio-pending                           |
| Speaking            | `a1-c1-speaking-at-work`; ungraded self-practice                                       |
| Reading             | `a1-c1-new-team`; two supported comprehension groups                                   |
| Writing             | `a1-c1-professional-introduction`; memory-only drafts                                  |
| Review              | `a1-c1-check`; original five-question/80% policy plus formative practice               |

All eight identities and original lesson/block order are retained. Membership in the expanded A1 course requires new exact hierarchy revisions in 1.5.0, without changing Chapter 1 teaching text or answers. The **existing Chapter 1 preview continues to resolve 1.4.0**, including its original digest and grader. The older subject-pronoun preview still resolves 1.3.0.

## Completed conversion and preview URLs

Run Node 22+/npm 10+ from the repository:

```bash
npm run dev
```

The development-only picker is **http://localhost:3000/dev/a1**. It shows Chapters 1–3 only. Chapter 1 links to its existing **http://localhost:3000/dev/chapters/a1-chapter-1** preview. Chapters 4–12 are explicitly labeled as editorial outlines, without learning routes or unlock claims.

Chapter 2: **http://localhost:3000/dev/a1/people-family-possessions**

| Lesson ID (new revision 1)    | Lesson                                                                          | URL suffix under the Chapter 2 URL |
| ----------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| `a1-c2-family-words`          | 12 family/possession words, five-sentence production                            | `family-words`                     |
| `a1-c2-have-and-possessions`  | Have/has, possessives, singular/plural, be vs have, errors and free production  | `have-and-possessive-adjectives`   |
| `a1-c2-family-scripts`        | Two scripts, five planned questions; audio pending                              | `meet-my-family-scripts`           |
| `a1-c2-describing-people`     | Family description, role-play, future recording task retained as aloud practice | `describe-people-and-possessions`  |
| `a1-c2-family-and-colleagues` | Two reading passages, five explicit-fact questions                              | `my-family-and-my-work`            |
| `a1-c2-writing-about-family`  | 6–8 sentence paragraph, repair tasks, self-edit and separate rewrite            | `write-about-family-and-friends`   |
| `a1-c2-review`                | 12 formative grammar/vocabulary MCQs and integrated skill checklist             | `chapter-review`                   |

Chapter 3: **http://localhost:3000/dev/a1/daily-routines-time**

| Lesson ID (new revision 1)      | Lesson                                                                        | URL suffix under the Chapter 3 URL |
| ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| `a1-c3-routine-words`           | 12 routine/time words, five-sentence production                               | `routine-words`                    |
| `a1-c3-present-simple-routines` | Statements/negatives/questions, do/does, time phrases, adverbs and production | `present-simple-and-time`          |
| `a1-c3-routine-scripts`         | Two scripts, five planned questions; audio pending                            | `routine-scripts-awaiting-audio`   |
| `a1-c3-talking-about-routines`  | Weekday description, role-play and one-minute aloud practice                  | `talk-about-your-routine`          |
| `a1-c3-routine-reading`         | Developer weekday and Saturday passages, five comprehension questions         | `a-developers-weekday`             |
| `a1-c3-writing-my-day`          | 7–9 sentence paragraph with times/negative/question, repairs and rewrite      | `write-about-your-day`             |
| `a1-c3-review`                  | 12 formative MCQs and integrated skill checklist                              | `chapter-review`                   |

For example: **http://localhost:3000/dev/a1/daily-routines-time/present-simple-and-time**.

New chapters: `a1-chapter-2@1`, `a1-chapter-3@1`. New question identities use `a1-c2-` or `a1-c3-` with `k1`–`k12`, `r1-1`–`r1-3`, `r2-1`–`r2-2`, `l1-1`–`l1-3`, `l2-1`–`l2-2`. Each option has `<exercise-id>-a/-b/-c`. Reading containers use `a1-c2-reading-group-1/2`, `a1-c3-reading-group-1/2`, with corresponding `reading-stimulus-1/2` IDs.

## Batch authoring workflow and integrity

New public/private inputs are in `content-authoring/a1-chapters-02-03/{public,grading,metadata}.json`. All existing Markdown packs and the supplied blueprint/instructions remain unchanged. Metadata explicitly records `audio_pending`, source SHA-256, seven ordered lesson IDs per chapter, source-to-exercise mappings and the two prompt clarifications. Source private teacher sections are parsed offline only and never rendered directly.

Create **once, only if absent**, with the unchanged 1.1.0–1.4.0 ancestors present:

```bash
npm run curriculum:v2:author-a1-batch
```

Repeatable no-write checks:

```bash
npm run curriculum:v2:author-a1-batch -- --check
npm run curriculum:v2:validate -- .curriculum-drafts/1.5.0 \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.3.0 \
  --against .curriculum-drafts/1.4.0
```

The converter requires the existing 1.4.0 Chapter 1 map, new unique revision-1 entities, two chapters/seven lessons each and unchanged historical rules. Source checks require all 22 distinct MCQs/private keys per chapter, exact ordered options, documented prompt changes, valid audio status, lesson reachability, bilingual feedback and correct evidence tags. The semantic validator additionally verifies uniqueness, reciprocal exact references, prerequisites, revision/identity conflicts, answer keys, translations, private separation and media inventory. Duplicate outputs/source overlaps fail closed. The tool does not connect to Supabase or the D2 registry; no credentials are required.

A fresh checkout can reconstruct earlier ignored drafts using the commands in `docs/a1-chapter-01-integration-report.md`, then run the batch command. Generated `.curriculum-drafts/1.5.0/` stays ignored like all earlier drafts. `--version`/`--out` permit another unused authoring version; existing preview selection is deliberately hash-pinned and never auto-switches.

File-package hashes (manifest included, canonical sorted file-inventory hash):

```text
1.1.0  d3bc6e336d3cf25ee74eb8cf7c1ce69e6a4cff9aefea9a2d99ed833d7648a668
1.2.0  c37cbacb93e1591f1b95d0473ac30f59895d3b9e05e50561330d58ee3297a755
1.3.0  0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029
1.4.0  e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67
1.5.0  994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa
```

The new draft adds **14 lessons, 50 bilingual blocks, 14 typed objectives, four reading stimuli, 44 MCQ leaves and four comprehension containers**. It contains three chapters/22 lessons overall; 110 exercise entities (104 MCQ leaves + six containers). Across the packages, 86 MCQs are checkable and 18 are audio-pending; Chapter 1's existing 52 checkable/eight pending remain on its 1.4.0 preview, while the new previews supply 34 checkable/ten pending questions.

All 454 previous compatibility records remain verbatim. 379 new candidate-target proposals are appended, totaling 833. Inherited `requires_recompletion`, `not_equivalent` and restart decisions are preserved rather than promoted when copying target mappings to the successor. New 1.4.0→1.5.0 reference-only proposals remain pending. The 55 inherited locale exceptions and all editorial approvals remain unresolved/unapproved; no history is imported, rewritten or copied.

## Security, supported activities and limits

- New `/dev/a1` routes are development/loopback only and bypass `SessionProvider`; they cannot reconcile the v1 outbox. Production returns 404. No live v1 content, route, authentication, progress, reset/export, migration or D1/D2 staging interface is changed.
- Shared renderer/projector supports the existing explanation, grammar, vocabulary, reading, speaking, writing, quiz/exercise-set blocks. A1 new previews use a strict 1.5.0 public DTO and exact allowed chapter/lesson membership. Reading containers flatten child questions once; they are `practice_with_support`, not independent tests.
- `POST /api/dev-a1-preview/answer` is server-only, development-only, single-question, same-origin loopback, bounded to 4 KiB streamed JSON and no-store. It validates version, public digest, exact question revision, lesson membership and selected option. Audio-pending questions fail with 409. All methods return 404 in production before parsing/loading data. Feedback contains only this checked question; private bindings/keys/rules never enter initial props or client code.
- Answers, feedback, separate writing drafts and speaking checklists remain in page memory across Learn/Practice/Review and clear on refresh/leaving. No preview attempts/completions/history are saved and no CEFR/proficiency/pass result is awarded. Grammar recognition carries no reading-comprehension skill tags.
- **Unsupported/deferred:** actual listening playback/assessment for all new scripts, controlled transcript concealment, voice recording/upload, saved writing revisions, human/AI grading and formal new chapter assessment. Recording instructions remain visible with an explicit “future activity; practise aloud here” notice. No fabricated assets or media references exist. The source's eventual recording/self-review ambition was not silently dropped.
- Chapters 4–12 have **no imported entities, finished lessons, preview links or unlock state**. `content-authoring/A1_EDITORIAL_CHECKLIST.md` maps the entire outline and distinguishes converted sources from these unfinished outlines.

## Editorial decisions still requiring review

1. Chapter 2 grammar says “After a singular countable noun, use an article…”. The new block corrects this to **before** the noun. Original Markdown is untouched.
2. Chapter 2 K4 assumes Ko's gender/pronouns. Its new prompt explicitly states **Ko uses he/him pronouns**, retaining all options and source key B. No identity is inferred from a name.
3. Chapter 3 K10 originally asks for the correct sentence although “She usually is late” can also be grammatical. The new prompt asks for **usual neutral placement of usually after be**; source options/key B are retained. Bilingual feedback acknowledges the valid emphasized alternative. Both prompt changes are recorded in metadata, not treated as reviewer approval.
4. Private feedback removes duplicate terminal punctuation in the source key descriptions and adds natural Burmese explanations. New teaching has bilingual objectives/prompts/explanations, including possessive `its` vs `it's`; independent native-language/pedagogical review remains pending.
5. Pronunciation fields explicitly say the guide is pending; no invented pronunciation recording or phonetic accuracy claim is made. Review pronunciation guides, examples, pace and local wording before publication.
6. Existing Chapter 1 issues remain: eight-sentence model vs 5–7 sentence instruction, source distractor quality, legacy untranslated fields, missing audio and formal unseen assessment material. This task does not silently revise the older package to resolve them.

## Files and next production gates

New files:

- `content-authoring/a1-chapters-02-03/{public,grading,metadata}.json`
- `content-authoring/A1_EDITORIAL_CHECKLIST.md`
- `src/lib/curriculum/v2/batch-authoring.ts`, `scripts/curriculum/author-a1-batch.ts`
- `src/lib/curriculum/a1-preview/{config,contracts,server}.ts`
- `src/lib/curriculum/chapter-preview/project.ts` (shared server-only public projection)
- `src/app/dev/a1/{layout,page}.tsx`, `[chapterSlug]/page.tsx`, `[chapterSlug]/[lessonSlug]/page.tsx`
- `src/app/api/dev-a1-preview/answer/route.ts`
- `tests/a1-expansion/{fixtures,authoring.test,server.test}.ts`, `tests/preview-e2e/a1-expansion.spec.ts`
- `docs/a1-chapters-02-03-integration-report.md`

Changed files: `package.json` (new batch command), `README.md` (launch/report link), `src/components/layout/application-boundary.tsx` (new dev routes only), `src/components/preview/chapter-lesson.tsx` (optional route/endpoint selection and variable pending-question count), `src/lib/curriculum/chapter-preview/server.ts` (delegates to the same guarded public projection with original 1.4.0 defaults), and `tests/e2e/preview-disabled.spec.ts` (new production-denial regression). Earlier dirty work is retained.

Before any production rollout: complete independent authenticated, hash-bound content/translation/grading/compatibility reviews in a new sealed candidate; retain all ancestor artifacts. D2's current capability gate does not stage comprehension packages automatically and must not be bypassed. D3 must add owner-scoped v2 storage/reset/export/generation lifecycle; D4 must implement gated staging persistence/outbox/retries; D5 requires hosted schema/migration inspection, backups and restore drill, explicit release authorization, canary activation and rollback. Follow `docs/phase-3d-publishing-plan.md` and `docs/phase-3d-d2-report.md`. **No hosted compatibility is claimed and none of these rollout phases was implemented here.**

## Verification

All checks passed. Commands: package validation and `author-a1-batch --check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e:preview`, `npm run test:e2e`, `npm run build`, `npm run content:check`, `npm run curriculum:v2:schemas:check`.

| Check                                                    | Final result                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch source validation / package validation / `--check` | Passed: all 44 option/key mappings, complete teaching-text fixtures, source hashes, translations, exact graph/revisions, media and unchanged ancestors          |
| Lint / TypeScript                                        | Passed                                                                                                                                                          |
| Unit/integration suite                                   | **153 tests / 26 files passed**, including ten new batch/preview tests and existing history, registry, owner-isolation, outbox and reset tests                  |
| Development preview browsers                             | **36 passed** across desktop/mobile: 14 new expansion cases plus 22 earlier preview regressions; all 14 new lesson pages and all 34 enabled questions exercised |
| Production browser regressions                           | **20 passed** across desktop/mobile; all preview pages/endpoints remain 404 and v1 navigation, progress/retry/reset flows pass                                  |
| Production build                                         | Passed                                                                                                                                                          |
| v1 content integrity / generated JSON Schema drift       | Passed; content/schemas unchanged                                                                                                                               |

Browser checks found no axe violations or horizontal overflow in tested states, no private key fields in initial HTML/client scripts, no learning/auth requests and no learner-storage changes. All ten new audio-pending checks were rejected; scripts remained visible for preparation. Writing drafts/checklists survived step navigation and cleared on refresh. Source text tests cover vocabulary meanings/examples, exact scripts/passages, all speaking tasks, writing models and the explicit grammar correction.

The first picker assertion used an incorrect legacy title; it was corrected to the preserved **Your first conversations**, then the complete preview suite passed. Additional source-text fixtures use parsed Zod types; strict type-check passes. No application content was changed to satisfy a test.

Persistence browser tests use the existing mocked API; database regressions use isolated PGlite. These results do **not** verify a hosted Supabase project or authorize publishing.
