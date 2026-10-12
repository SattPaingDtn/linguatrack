# Phase 3C preview readability refinement

The local preview remains at `http://localhost:3000/dev/lessons/subject-pronouns` with `npm run dev`. Production access and grading guards are unchanged.

## Reading changes

- Burmese text uses the locally bundled Noto Sans Myanmar, followed by Myanmar Text, Padauk and sans-serif. Teaching text is 17 px at the default root size with 1.95 line height, normal letter spacing and wrapping that preserves Unicode text. No external font service is required.
- English teaching text is 16 px with 1.85 line height. English appears first; Burmese follows below a quiet sage divider. Existing paragraph breaks are preserved, and reading width is limited to 72 characters where space permits.
- The lesson title appears first in a smaller header. Learning objectives and the existing section links sit inside a native `details`/`summary` disclosure, closed initially and usable with keyboard navigation. The unsaved-preview notice remains explicit in both languages.
- Grammar examples use stacked pattern/example/translation sections instead of a horizontally scrolling table. The sentence-order block includes a definition list explaining Subject, Verb, Object, Be and Complement in both languages. These are presentation-layer explanations; the versioned curriculum and exact pattern text stay unchanged.
- Writing uses a font stack suitable for mixed English/Burmese text. Preview buttons can wrap and grow at enlarged text sizes and have a 44 px minimum height. Green/cream colors, local-preview identity and the existing application shell remain intact.

## Changed files

- `src/components/preview/bilingual-text.tsx`: language ordering and paragraph grouping.
- `src/components/preview/preview-lesson.tsx`: compact heading, collapsible objectives and grammar renderer integration.
- `src/components/preview/grammar-examples.tsx`: wrapping examples and sentence-role explanations.
- `src/components/preview/preview-reading.css`: typography and wrapping rules scoped to `[data-preview-reading]`, including feedback and writing. Live lesson styles are unaffected, even if the stylesheet remains loaded after navigation.
- `src/components/preview/preview-writing.tsx`: readable Burmese guidance spacing.
- `tests/preview/renderer.test.tsx`: language order, disclosure visibility and sentence-role coverage; retains grading/retry/isolation checks.
- `tests/preview-e2e/lesson.spec.ts`: actual font loading/metrics, keyboard disclosure, 320/390/768/1440 px reflow, mixed-script wrapping, 200% text resizing, axe checks, runtime errors and repeatable screenshot capture.

No curriculum JSON, schemas, private grading rules, API handlers, server loader, security guards, session/provider behavior or migrations were changed. Preview practice still creates no Supabase records and does not modify existing browser storage.

## Verification

Run the following separately so development and production browser servers do not share their test build directory concurrently:

```bash
npm run test:preview
npm run test:e2e:preview
npm run check
npm run test:e2e
```

**Passed:** 98 Vitest tests, 6 development preview browser tests, 16 production browser regressions, lint, strict type-check and production build. Additional focused runs verify the final mixed-script wrapping and screenshot capture. Axe reported no violations on desktop/mobile, including the 320 px / 200% text test. Existing provider isolation, private-key exclusion, all 14 question mappings and production-disabled access continue to pass. A before/after SHA-256 audit confirmed all content JSON, draft packages, schemas, grading/server logic, APIs, progress/provider code and migrations are unchanged. Hosted Supabase data was not accessed.

The screenshots below are captured from the real development route before answering any questions, using the bundled fonts. Desktop is 1440 × 1000; mobile uses a 390 × 844 CSS viewport. Additional screenshots show the sentence-role guide and exact grammar patterns. The objective summary is unfocused for capture; keyboard focus visibility is tested separately.

| Layout  | Lesson header                      | Sentence roles                             | Grammar patterns                            |
| ------- | ---------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Desktop | `phase-3c-readability/desktop.png` | `phase-3c-readability/desktop-grammar.png` | `phase-3c-readability/desktop-patterns.png` |
| Mobile  | `phase-3c-readability/mobile.png`  | `phase-3c-readability/mobile-grammar.png`  | `phase-3c-readability/mobile-patterns.png`  |
