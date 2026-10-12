# Phase 3C: Learn, Practice and Review

Run `npm run dev` with Node 22+ and open **http://localhost:3000/dev/lessons/subject-pronouns**. The existing reviewed 1.1.0–1.3.0 local draft chain remains required. This is still a development-only, loopback-host preview; no release is activated or published.

## Learner flow

- **Learn:** the existing lesson introduction and objectives precede three native disclosures: Subject pronouns (overview and reference), Be and sentence patterns (agreement and word order), and Common mistakes. The original five teaching blocks keep their IDs, text and relative order. The first section opens initially; disclosure positions remain while switching steps.
- **Practice:** one of the 14 ordered MCQs appears at a time. Previous/next controls retain checked answers and unchecked selections. Question position and a progress bar distinguish the current question from the number of questions actually checked. Immediate bilingual feedback comes from the existing stateless development endpoint; there is no graded test mode or pass/CEFR award.
- **Review:** counts show unique answered questions and the correct/incorrect latest returned result, plus remaining questions. Each card shows the selected public option text and the returned English/Burmese feedback. Revisit controls return to the same question. Retrying does not erase the last checked result; earlier returned checks are available in a disclosure after another successful check. Review never requests grading data or recomputes correctness from private keys.
- **Writing:** a separate Practice disclosure identifies self-practice as unsaved and ungraded. A seven-row textarea and model comparison sit beside each other on desktop and stack on mobile. The public model is explicitly an example, not the only possible answer. Drafts and model disclosure state survive switching steps.
- **Navigation:** the step buttons expose `aria-current="step"` and `aria-controls`. Navigation focuses the destination heading; question changes focus the new legend. A visible Back to courses link is available on mobile and desktop. The compact bilingual preview notice explains memory-only state and clearing on refresh/exit.

## State and boundaries

`PreviewLessonView` owns step position, question position and the `usePreviewPractice` state. The hook retains selected choices, pending/error states, current returned feedback and earlier checks per question. An in-flight guard prevents duplicate checks; late feedback still updates Review after leaving Practice. Failed checks keep the selected answer and an actionable error. A mismatched response is rejected and never added to Review.

Step panels remain mounted and use the native `hidden` attribute so local writing/disclosure state survives navigation while inactive content is absent from the accessibility tree. The question renderer itself displays a single controlled question, rather than mounting all 14 forms. The page does not use localStorage, sessionStorage, the learning session provider, Supabase, or learning/history APIs. Refreshing or leaving the route destroys the preview state. These results are not saved progress or demonstrated proficiency.

The endpoint, server loader, strict public DTOs, schemas, private grading, release pin, production guards and live v1 routes are unchanged. Private answers are absent from initial content and browser bundles. Only previously returned per-question feedback appears in Review. The existing Noto Sans Myanmar font/17 px typography, 1.95 line height, green/cream palette and scoped wrapping rules remain in use.

## Implementation files

- `src/components/preview/preview-lesson.tsx`: accessible step navigation, grouped Learn sections and mounted panels.
- `src/components/preview/use-preview-practice.ts`: memory-only choices, checks, errors, feedback history and in-flight isolation.
- `src/components/preview/preview-exercises.tsx`: single-question controls and checked progress.
- `src/components/preview/preview-feedback.tsx`: shared bilingual rendering of returned feedback.
- `src/components/preview/preview-review.tsx`: summary, empty/pending/error states and revisiting earlier checks.
- `src/components/preview/preview-writing.tsx`: retained draft and responsive model comparison.
- `src/components/preview/grammar-examples.tsx`: adjusts the guide heading level within the grouped lesson hierarchy; example text is unchanged.
- `tests/preview/renderer.test.tsx`: block text/order, one-question navigation, choice/writing retention, repeated checks, pending/error handling, strict feedback matching and no storage/account/bulk requests.
- `tests/preview-e2e/lesson.spec.ts`: real server grading of every question on desktop/mobile, refresh clearing, returned-feedback review, retry history, keyboard/focus navigation, Burmese fonts, narrow/200% reflow, axe and no learning/Supabase requests.

## Verification

```bash
npm run test:preview
npm run test:e2e:preview
npm run check
npm run test:e2e
```

Run development and production browser suites separately because both use the ignored `.next-e2e` directory. `check` covers v1 integrity, generated schema integrity, lint, type-check, all Vitest tests and production build. Existing PostgreSQL regression tests use isolated local PGlite; no hosted database is inspected or modified.

**Verified:** lint, strict type-check, production build, v1 content integrity and generated schema integrity passed. All **102 Vitest tests**, **8 development preview browser scenarios** and **16 production browser regressions** passed. The final compact Learn layout was also checked on desktop/mobile at 320 px and 200% text size. Axe found no violations, and keyboard focus targets and Burmese font metrics passed.

Checks cover all 14 real server answer mappings, returning to selected/checked questions, writing retention, incorrect/latest/earlier results, refresh clearing, failed/mismatched feedback, in-flight completion across steps, duplicate submission protection and zero bulk/learning/auth/Supabase requests from preview navigation. Production still returns 404 for the page and all grading methods. A scan of 26 production browser JavaScript assets found no private answer-key field or private feedback text. Before/after SHA-256 checks confirm the content, schemas, draft packages, grading/server logic, APIs, account/progress code, production layouts and migrations were untouched.
