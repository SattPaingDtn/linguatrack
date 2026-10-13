# Start learning A1 locally

Open http://localhost:3000/ and choose **Study A1 lessons** on the dashboard, or **A1 study previews** in the sidebar/mobile menu. You can also open http://localhost:3000/dev/a1 directly in the running development app. If it is not running, use Node.js 22+ and `npm run dev` from the repository. These routes are local-development only, return 404 in production, and require no sign-in.

## Study flow

1. Open **Chapter Picker**, then **Start learning · Chapter 1** (or choose Chapter 2 or 3).
2. Choose an available lesson. Listening-script cards explicitly label audio-pending activities.
3. Read **Learn**, open teaching sections and objectives as needed, then choose **Practice**.
4. Answer one MCQ at a time and choose **Check answer** for server-returned bilingual feedback. Use **Review** to revisit your checked answers.
5. Choose **Next Lesson** or **Previous Lesson** at the bottom. On the last lesson, use **Back to Chapter**, then **Back to Chapter Picker** to choose the next chapter.

Answers, writing drafts and checklists stay in page memory when moving between Learn / Practice / Review. Leaving a lesson or refreshing clears them, including returning with Previous Lesson. Nothing is saved to accounts, progress, outbox or history. Writing and speaking remain ungraded; participation or MCQs do not award CEFR proficiency. New listening scripts await audio and their listening checks are disabled. The original Chapter 1 introduction audio remains available.

## Exact URLs

Chapter Picker: http://localhost:3000/dev/a1

### Chapter 1 · inactive draft 1.4.0

Chapter: http://localhost:3000/dev/chapters/a1-chapter-1

| Lesson                                                  | URL                                                                                | Availability                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Hello, nice to meet you!                             | http://localhost:3000/dev/chapters/a1-chapter-1/introductions                      | Available · unsaved; speaking/writing ungraded                |
| 2. The little verb “to be”                              | http://localhost:3000/dev/chapters/a1-chapter-1/am-is-are                          | Available · unsaved; speaking/writing ungraded                |
| 3. Who does what? Subject pronouns and simple sentences | http://localhost:3000/dev/chapters/a1-chapter-1/subject-pronouns-and-sentences     | Available · unsaved; speaking/writing ungraded                |
| 4. Meet the new colleague · awaiting audio              | http://localhost:3000/dev/chapters/a1-chapter-1/meet-the-new-colleague             | Available · unsaved; audio pending, listening checks disabled |
| 5. Introduce yourself at work                           | http://localhost:3000/dev/chapters/a1-chapter-1/introduce-yourself-at-work         | Available · unsaved; speaking/writing ungraded                |
| 6. Our new team members                                 | http://localhost:3000/dev/chapters/a1-chapter-1/our-new-team-members               | Available · unsaved                                           |
| 7. My first professional introduction                   | http://localhost:3000/dev/chapters/a1-chapter-1/my-first-professional-introduction | Available · unsaved; speaking/writing ungraded                |
| 8. Let’s put it all together                            | http://localhost:3000/dev/chapters/a1-chapter-1/chapter-check                      | Available · unsaved; speaking/writing ungraded                |

### Chapter 2 · inactive draft 1.5.0

Chapter: http://localhost:3000/dev/a1/people-family-possessions

| Lesson                                      | URL                                                                                    | Availability                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Family words and useful phrases          | http://localhost:3000/dev/a1/people-family-possessions/family-words                    | Available · unsaved                                           |
| 2. Have, has and possessive adjectives      | http://localhost:3000/dev/a1/people-family-possessions/have-and-possessive-adjectives  | Available · unsaved                                           |
| 3. Meet my family · scripts awaiting audio  | http://localhost:3000/dev/a1/people-family-possessions/meet-my-family-scripts          | Available · unsaved; audio pending, listening checks disabled |
| 4. Describe people and possessions          | http://localhost:3000/dev/a1/people-family-possessions/describe-people-and-possessions | Available · unsaved; speaking/writing ungraded                |
| 5. My family and my work                    | http://localhost:3000/dev/a1/people-family-possessions/my-family-and-my-work           | Available · unsaved                                           |
| 6. Write about family and friends           | http://localhost:3000/dev/a1/people-family-possessions/write-about-family-and-friends  | Available · unsaved; speaking/writing ungraded                |
| 7. Chapter knowledge check and skill review | http://localhost:3000/dev/a1/people-family-possessions/chapter-review                  | Available · unsaved                                           |

### Chapter 3 · inactive draft 1.5.0

Chapter: http://localhost:3000/dev/a1/daily-routines-time

| Lesson                                         | URL                                                                             | Availability                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Routine words and useful phrases            | http://localhost:3000/dev/a1/daily-routines-time/routine-words                  | Available · unsaved                                           |
| 2. Present simple and time                     | http://localhost:3000/dev/a1/daily-routines-time/present-simple-and-time        | Available · unsaved                                           |
| 3. Routine dialogues · scripts awaiting audio  | http://localhost:3000/dev/a1/daily-routines-time/routine-scripts-awaiting-audio | Available · unsaved; audio pending, listening checks disabled |
| 4. Talk about your routine                     | http://localhost:3000/dev/a1/daily-routines-time/talk-about-your-routine        | Available · unsaved; speaking/writing ungraded                |
| 5. A developer’s weekday and Saturday routines | http://localhost:3000/dev/a1/daily-routines-time/a-developers-weekday           | Available · unsaved                                           |
| 6. Write about your day                        | http://localhost:3000/dev/a1/daily-routines-time/write-about-your-day           | Available · unsaved; speaking/writing ungraded                |
| 7. Chapter knowledge check and skill review    | http://localhost:3000/dev/a1/daily-routines-time/chapter-review                 | Available · unsaved                                           |

## Implementation boundaries

Only development preview navigation and availability presentation changed. Navigation is derived from exact public catalog lesson IDs and slugs, preserves chapter order and does not project grading fields. The Chapter 1 lesson view is keyed by lesson ID to prevent carrying another lesson’s answers across client navigation. Later draft-loading failures cannot block Chapters 1–3 in the picker. Existing production routes, Supabase operations, immutable drafts, schemas and grading endpoints remain unchanged. Chapters 4–6 retain their existing previews; Chapters 7–12 remain outlines.

Files added: `src/lib/curriculum/preview/lesson-navigation.ts`, `src/components/preview/lesson-availability.tsx`, `tests/preview/lesson-navigation.test.tsx`, `tests/preview/picker.test.tsx`, `tests/preview-e2e/study-navigation.spec.ts`, this guide.

Files updated: `src/components/preview/chapter-lesson.tsx`, the Chapter 1 chapter/lesson pages, and the A1 picker/chapter/lesson pages under `src/app/dev/`.

Verification commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run content:check`, `npm run test:e2e:preview -- study-navigation.spec.ts chapter.spec.ts a1-expansion.spec.ts`, `npm run test:e2e` (which builds production before testing). Check results below for the completed run. No hosted database compatibility check or operation was performed.

The Chapter 4 shared-renderer regression is checked with `npm run test:e2e:preview -- manuscript.spec.ts --grep "Chapter 4: all seven lessons"`. Tests use isolated `.next-e2e` output so the already-running development app on port 3000 remains available. Type checking used `NEXT_DIST_DIR=.next-e2e npm run typecheck`.

## Completed verification

- ESLint and strict TypeScript: passed.
- Unit/integration suite: 172 tests across 30 files passed.
- Chapter 1–3 preview and navigation browser regressions: 32 desktop/mobile tests passed.
- Chapter 4 shared-renderer browser regression: 2 desktop/mobile tests passed.
- Production build and production browser regressions: passed; all 22 tests passed, including preview 404s, learning, persistence mocks, retry, reset and accessibility. The production build ran through `scripts/serve-e2e.mjs` before these tests.
- v1 content-generation and v2 generated-schema checks: passed.
- All 26 documented picker, chapter and lesson URLs returned HTTP 200 on the actual running `localhost:3000` development server; initial HTML contained no private grading fields.
- Browser checks found no axe accessibility violations or horizontal overflow on the tested lesson/step pages. Preview activity did not call persistent learning/auth endpoints or alter seeded v1 outbox records.
- Integrity comparison: all 167 existing curriculum, source-authoring, draft and migration files remained byte-for-byte unchanged. No Supabase data operation or release activation was performed.

## Dashboard entry points

The development dashboard now has a **Study A1 lessons** button. Desktop sidebar and mobile navigation include **A1 study previews**. Both links open `/dev/a1` with prefetch disabled and are hidden in production. Existing v1 start/resume links are unchanged. Local preview URLs work on the computer running `npm run dev`; hosted production continues to refuse the previews.

Added `src/components/preview/local-study-entry.tsx`, `tests/preview/local-study-entry.test.tsx`, `tests/preview-e2e/home-study-entry.spec.ts`, and `tests/e2e/local-study-disabled.spec.ts`. Updated `src/components/dashboard/dashboard.tsx` and `src/components/layout/app-shell.tsx` plus this guide.

Follow-up validation: lint and strict type-check passed; all 174 unit/integration tests passed; 6 desktop/mobile home-entry and study-navigation tests passed. Production access and accessibility checks use `npm run test:e2e -- local-study-disabled.spec.ts preview-disabled.spec.ts accessibility.spec.ts`, with a fresh isolated production build. All 12 production regressions and the production build passed.
