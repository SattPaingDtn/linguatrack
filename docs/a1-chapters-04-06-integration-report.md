# A1 Chapters 4–6 · sequential local integration

Followed `content-authoring/CODEX_INTEGRATION.md`. Chapter 4 was converted and validated first, then passed eight desktop/mobile browser cases and visual review of captured layouts before Chapters 5 and 6 were generated. All are **inactive, unapproved drafts**, with no hosted database operation, persistence rollout, activation or publication. Existing v1 and all prior draft directories remain intact.

## Identity mapping and draft boundaries

The blueprint's `a1-ch04-outline`, `a1-ch05-outline`, `a1-ch06-outline` are editorial outline identifiers, not existing learner entities. Before authoring, the validated 1.5.0 package contained only `a1-chapter-1`, `a1-chapter-2`, `a1-chapter-3` with 22 lessons. Those entities, slugs, original lesson/block order, teaching text and all historical private keys were retained.

| Source                  | New actual chapter ID | Slug                   | Inactive draft | Preceding validated source |
| ----------------------- | --------------------- | ---------------------- | -------------- | -------------------------- |
| Home & Neighborhood     | `a1-chapter-4@1`      | `home-neighborhood`    | 1.6.0          | 1.5.0                      |
| Food, Drinks & Shopping | `a1-chapter-5@1`      | `food-drinks-shopping` | 1.7.0          | 1.6.0                      |
| Work & Study            | `a1-chapter-6@1`      | `work-study`           | 1.8.0          | 1.7.0                      |

Exact hierarchy revisions propagate through the A1 course and earlier chapters/lessons/blocks/assessment. Their payloads differ only in reference revisions/course membership. Original question entities and grading rules remain identical. The legacy five-question policy retains its items, weights, required-all behavior, rounded-percent algorithm and **80%** threshold; exact binding/policy revisions advance in each successor without altering the immutable ancestors. No new chapter pass threshold is invented.

Each preview is pinned independently: Chapter 1 uses 1.4.0; Chapters 2/3 use 1.5.0; Chapters 4, 5 and 6 use 1.6.0, 1.7.0 and 1.8.0 respectively. Later additions cannot change an earlier preview's question/body digest. No Chapter 1–3 lesson is cloned. D1 and D2 publishing/staging interfaces remain unchanged.

## Preview URLs and authored lessons

From `/Users/sp/Documents/git/linguatrack`, use Node 22+/npm 10+ and launch:

```bash
npm run dev
```

Picker: **http://localhost:3000/dev/a1**. It offers Chapters 1–6 only. Chapters 7–12 remain editorial outlines with no lesson entities or learning links.

### Chapter 4 — http://localhost:3000/dev/a1/home-neighborhood

| Lesson ID, new revision 1  | URL suffix           |
| -------------------------- | -------------------- |
| `a1-c4-home-words`         | `home-words`         |
| `a1-c4-there-is-and-place` | `there-is-and-place` |
| `a1-c4-home-scripts`       | `home-scripts`       |
| `a1-c4-describe-your-home` | `describe-your-home` |
| `a1-c4-my-new-room`        | `my-new-room`        |
| `a1-c4-write-about-home`   | `write-about-home`   |
| `a1-c4-review`             | `review`             |

### Chapter 5 — http://localhost:3000/dev/a1/food-drinks-shopping

| Lesson ID, new revision 1     | URL suffix              |
| ----------------------------- | ----------------------- |
| `a1-c5-food-words`            | `food-words`            |
| `a1-c5-quantities-and-orders` | `quantities-and-orders` |
| `a1-c5-shopping-scripts`      | `shopping-scripts`      |
| `a1-c5-order-and-shop`        | `order-and-shop`        |
| `a1-c5-a-shopping-list`       | `a-shopping-list`       |
| `a1-c5-write-an-order`        | `write-an-order`        |
| `a1-c5-review`                | `review`                |

### Chapter 6 — http://localhost:3000/dev/a1/work-study

| Lesson ID, new revision 1   | URL suffix            |
| --------------------------- | --------------------- |
| `a1-c6-work-words`          | `work-words`          |
| `a1-c6-can-and-requests`    | `can-and-requests`    |
| `a1-c6-work-scripts`        | `work-scripts`        |
| `a1-c6-talk-about-work`     | `talk-about-work`     |
| `a1-c6-my-workday`          | `my-workday`          |
| `a1-c6-write-a-work-update` | `write-a-work-update` |
| `a1-c6-review`              | `review`              |

Append a suffix to its chapter URL, e.g. **http://localhost:3000/dev/a1/work-study/review**.

All seven source roles are present per chapter: twelve vocabulary entries and original production, bilingual grammar rules and mistakes, two scripts/four open checks, two speaking activities, the original reading passage/five open questions, writing/model/edit/rewrite, and twelve MCQs/skills reflection.

## Public/private mapping and honest exercise support

Each source is split before delivery. New public additions and private bindings are stored under `content-authoring/a1-chapters-04-06/chapter-{4,5,6}/{public,grading,metadata}.json`. Original Markdown and `PACK_MANIFEST.json` are unchanged. Metadata records source hashes, distinct IDs, `awaiting_audio`, unapproved status and each activity's actual mode.

Per chapter:

- **12 single-choice MCQs**, IDs `a1-cN-k1`–`k12`, options `<exercise-id>-a/-b/-c`. Immediate bilingual feedback uses the unchanged supported exact-set grader on the development server. Grammar recognition has no demonstrated reading/writing skill tag.
- **Five reading short responses**, IDs `a1-cN-r1`–`r5`, represented by supported `fill_in_blank` entities in `a1-cN-reading-group`, linked to `a1-cN-reading-stimulus`. The text prompt is retained and there is one `answer` blank. The comprehension container is `practice_with_support` and has no duplicate grade rule.
- **Four audio-pending short checks**, IDs `a1-cN-l1-1`, `l1-2`, `l2-1`, `l2-2`. Scripts use explanation blocks, with no fabricated listening stimulus/media reference. Their learning objectives/evidence are self-practice, with no listening skill credit.
- **Reading self-review is ungraded.** A nonempty response permits one server-returned teacher example and bilingual explanation. The response contains no `isCorrect`, points, score, complete key list or hidden variants. Alternate wording is not incorrectly marked wrong. It is sent only to the local server to retrieve that one example, never stored. These canonical private `acceptedByBlank` bindings preserve source examples structurally; they are **not an exhaustive accepted-answer policy** and must be reviewed/replaced before any future automatic grading.
- **Speaking/writing remain unsaved and ungraded.** The source's optional recording task is retained with an explicit unavailable notice; no upload, microphone or grading workflow is added. Writing examples are revealed in the UI only after drafting, then manually opened. They are public teaching examples, not private exercise keys; this is pedagogical timing, not a secure hidden-test mechanism.
- **Listening and shadowing are unavailable without audio.** All four planned prompts are shown for preparation, but requests for examples/grades are rejected with 409. No score or listening proficiency is inferred from transcript reading.

The new chapters add **21 lessons, 55 bilingual blocks, 21 typed objectives, three reading stimuli, 36 MCQs, 27 short-response entities and three comprehension containers**. The 1.8.0 package has six chapters, 43 lessons, 153 blocks, 66 objectives and 176 exercise entities overall. No lesson completion, quiz pass result or CEFR level is saved by the preview.

## Authoring and immutability checks

Create each new directory once, in order, with existing 1.1.0–1.5.0 ancestors present. **Do not run create mode over a directory that already exists.**

```bash
npm run curriculum:v2:author-manuscript -- --chapter 4
# Validate/review Chapter 4 before proceeding:
npm run curriculum:v2:author-manuscript -- --chapter 5
npm run curriculum:v2:author-manuscript -- --chapter 6
```

Repeat checks without writes:

```bash
npm run curriculum:v2:author-manuscript -- --chapter 4 --check
npm run curriculum:v2:author-manuscript -- --chapter 5 --check
npm run curriculum:v2:author-manuscript -- --chapter 6 --check
npm run curriculum:v2:validate -- .curriculum-drafts/1.8.0 \
  --against .curriculum-drafts/1.1.0 --against .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.3.0 --against .curriculum-drafts/1.4.0 \
  --against .curriculum-drafts/1.5.0 --against .curriculum-drafts/1.6.0 \
  --against .curriculum-drafts/1.7.0
```

Fresh checkouts can first reconstruct ignored 1.1.0–1.5.0 using the earlier integration reports. The manuscript CLI then validates all source questions/keys, words/meanings/examples, exact scripts/passage, public/private separation, source SHA, numbered activity coverage and supported graph/revisions. Exclusive output creation and canonical path checks refuse overwrite/source overlap. After writing, the entire source chain is reread and hash-compared. `--check` verifies deterministic reproduction without modifying output. No command connects to Supabase or the D2 registry.

File-package hash pins (manifest included):

```text
1.5.0  994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa
1.6.0  dbd4fe0e93f82dfded12645f706d5c9cf1600956e04c5588bd6bdf130b677d9e
1.7.0  cacc1e19a1794400babae8c5e73d40af8d75902d7dff661d9f3a577aa6b693c9
1.8.0  17a087e714ca5bcaea6e3ba2051664b6c0ee73da612f4337a4a81211def3d604
```

The original 1.1.0–1.5.0 hashes remain as documented in earlier reports. All 833 mappings from 1.5.0 are retained; successors append pending proposals (1.6.0: 1,506 total; 1.7.0: 2,529; 1.8.0: 3,959). Earlier negative completion/evidence/resume decisions are preserved, not promoted to compatibility when copied. All 55 legacy locale exceptions remain unresolved; no approval is fabricated or applied to learner history.

## Security and production behavior

`src/lib/curriculum/manuscript-preview/server.ts` is server-only. It loads fixed allowed drafts and verifies each pinned hash after full chain validation. Strict DTOs contain only the selected lesson's public content. Raw manuscripts, grading bindings, teacher keys, compatibility inventory and hidden metadata are never passed to browser components or static files.

`POST /api/dev-manuscript-preview/answer` supports one MCQ response or one reading self-review response. It requires a development server, same-origin loopback host, strict version/lesson/question/option or text binding, exact revisions/public digest, and streamed JSON of at most 4 KiB. Empty reading input, bulk fields, foreign versions/questions, forged revision/digest, cross-origin requests and audio-pending requests are rejected. Responses are no-store; every method returns 404 in production before body/content reads. Writing/speaking blocks cannot be submitted through it.

New preview paths bypass `SessionProvider`, so they cannot read/write learning data or reconcile an old outbox. No Supabase/learning service is imported by the grader. Answers, returned examples, writing drafts and checklists stay in page memory across steps and clear on refresh/leaving. A failed example request retains the draft and exposes a retry. Earlier preview endpoint defaults, live v1 routes/auth, owner history, reset/export, course content, migrations and outbox are retained.

## Editorial findings and remaining gates

1. **Chapter 4 dialogue 1 first teacher answer includes a supermarket.** The transcript explicitly confirms only a station near the apartment; the supermarket is across from the station. The disabled private canonical example is clarified to “A station.” Original Markdown is preserved; no historical grading rule is changed. Review before adding audio/assessment.
2. **Chapter 5's mistake table contrasts some/any.** `Do you have some milk?` can be grammatical in a positive-expectation context. An added bilingual note explains that the taught `any` form is the neutral question, not a universal ban on `some`.
3. Native Burmese, teacher review of examples/pacing, and pronunciation guides remain pending. Pronunciation fields explicitly mark a guide pending rather than inventing one.
4. Canonical short-response examples are not exhaustive variants and do not provide automatic reading grading. Independent assessment, answer-acceptance policy, unseen reading/audio material, licensed/authorized recordings, transcript concealment and real media QA are future work.
5. Optional recording, saved writing revisions, reviewer rubrics, human/AI grading and CEFR assessment are not implemented. No paid AI integration is added.
6. Chapters 7–12 remain outlines only. No finished/unlocked learning chapters are fabricated.
7. Follow the D3 storage/reset/export/generation lifecycle, D4 gated staging persistence/outbox and D5 review/backup/preflight/canary/rollback gates in the publishing plan before production use. D2 currently rejects these draft/comprehension/fill packages; do not bypass capability or review gates. No hosted schema or Supabase compatibility is claimed.

## Files and verification

New: `src/lib/curriculum/v2/manuscript-authoring.ts`, `scripts/curriculum/author-a1-manuscript.ts`, `src/lib/curriculum/manuscript-preview/{config,contracts,server}.ts`, `src/components/preview/manuscript-lesson.tsx`, `src/app/api/dev-manuscript-preview/answer/route.ts`, nine authoring JSON inputs under `content-authoring/a1-chapters-04-06/`, `tests/manuscript-preview/{fixtures,content.test,server.test}.ts`, `tests/preview-e2e/manuscript.spec.ts`, and this report.

Modified: `package.json` (one local authoring command), `README.md`, editorial checklist, three existing `/dev/a1` page files, `src/components/layout/application-boundary.tsx`, `src/components/preview/{chapter-lesson,preview-writing}.tsx` (optional defaults preserve earlier previews), and browser picker/production denial tests. Existing schema and migration files are unchanged. Generated draft directories remain ignored.

Verification commands:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e:preview
npx playwright test --config playwright.preview.config.ts --grep 'A1 picker|new self-review controls'
npm run test:e2e
npm run build
npm run content:check
npm run curriculum:v2:schemas:check
```

All checks passed after the stale outline-route assertion was updated and lint was rerun independently of Playwright artifact cleanup.

| Check                                 | Result                                                                                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source and package validation         | All three drafts pass strict schemas, source option/key consistency, bilingual fields, exact references/revisions, supported graph/media and immutable ancestor hash checks                              |
| Unit/integration suite                | **161 tests / 28 files passed**, including eight manuscript authoring/security tests plus all earlier grading/history, outbox/reset and isolated registry tests                                          |
| Development browser cases             | **62 distinct desktop/mobile cases passed**: 58 unchanged cases passed in the complete preview run; the two updated picker checks and two new keyboard/retry checks passed in a targeted four-case rerun |
| Production browser regressions        | **22 passed**, including 404 for all new routes/endpoint methods and existing v1 resume, repeat attempts, retries, reset and accessibility                                                               |
| Lint / TypeScript / production build  | Passed                                                                                                                                                                                                   |
| v1 integrity / generated schema drift | Passed, unchanged                                                                                                                                                                                        |

The complete preview run initially had two outdated assertions that Chapter 4 was an outline and should return 404. That route is now intentionally authored; the tests now check an outline-only Chapter 7 path. No application content or guard was weakened to satisfy the test. The additional keyboard checks validate Enter/Tab focus and draft retention/retry after a simulated 503. The browser suite now contains 62 cases.

Every new lesson, all 36 MCQs, all 15 reading self-review examples and all 12 unavailable listening prompts were exercised on desktop and mobile. Axe found no violations in tested states; no horizontal overflow, private key fields in initial HTML/client scripts, learning/auth requests or learner-storage modifications were detected. Models stayed closed until writing; examples never returned automatic correctness/points. Chapter 4 visual review occurred before Chapter 5/6 generation. Screenshots are reproducible ignored Playwright artifacts, not production assets.

These tests use local drafts, isolated PGlite and the existing mocked persistence browser adapter. They do not establish live hosted Supabase compatibility or reviewer approval.
