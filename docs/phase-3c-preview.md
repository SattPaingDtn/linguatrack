# Phase 3C: local lesson preview

Run with Node 22+ from the repository root:

```bash
npm run dev
```

Open **http://localhost:3000/dev/lessons/subject-pronouns**. The same route works on `127.0.0.1` or IPv6 loopback. Supabase credentials are not needed for this preview. Do not replace an existing `.env.local`.

Only `NODE_ENV=development` enables this feature. `npm run build && npm start` serves a 404 for the page and every supported method at `/api/dev-preview/answer`. The preview is intentionally unavailable on LAN/public hostnames. It has no link in production navigation and no release activation switch.

## Content and behavior

The server reads and validates the existing `.curriculum-drafts/1.1.0`, `1.2.0`, and `1.3.0` chain against the canonical v1 baseline. The 1.3.0 release hash is pinned to `0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029`; edited bytes, broken references, missing media, version conflicts or an activated/sealed package fail closed. These ignored local packages must already exist. A fresh checkout without them shows a descriptive unavailable state. Restore the reviewed packages using the Phase 3A/3B instructions; this preview never regenerates or overwrites them.

The preview resolves lesson `a1-c1-subject-pronouns@2` using exact references. It renders all seven ordered blocks: overview, pronouns reference, be agreement, sentence patterns, common mistakes, the 14-question exercise set, and sentence-production self-practice. English and Burmese explanations appear together; newlines and grammar role labels remain visible. Questions retain their authored options and ordering, including question 12's statement/question distinction.

Each question is checked through the local, stateless POST endpoint. Submitted lesson/version/revision/option and a fingerprint of **public** content are strictly validated. Requests require same-origin JSON on a loopback host, are limited to 4 KiB, omit credentials, and receive `no-store` responses. Only the answered question's correctness, correct answer text and bilingual explanation are returned. No bulk grading rules, private hashes or grading inventory are serialized into initial HTML, client props, browser JavaScript or public files. The loader and grader are marked `server-only`, and production guards run before filesystem access.

Answers, feedback and writing exist only in React memory. Refreshing clears them. An unsuccessful check retains its selected option and displays an explicit retry error. Individual questions can be retried without creating history. The writing block provides an editable draft, word count and optional example; it has no submission or automatic grader. Results neither complete a lesson nor establish reading, writing or CEFR proficiency.

## Files

- `src/lib/curriculum/preview/config.ts`: public route/version/lesson constants; the normal application shell imports no v2 schemas.
- `src/lib/curriculum/preview/contracts.ts`: strict browser-safe public DTOs, supported renderer types, answer and feedback contracts.
- `src/lib/curriculum/v2/reader.ts` and `files.ts`: extract the existing read-only validator from the authoring writer, preserving all existing exports and writer behavior. Preview code imports only the reader, avoiding whole-repository tracing from writer path checks.
- `src/lib/curriculum/preview/server.ts`: read-only chain validation, pinned package, exact-reference projection and isolated grading.
- `src/app/dev/lessons/subject-pronouns/page.tsx`: development/loopback guarded page, noindex metadata and missing-draft state.
- `src/app/api/dev-preview/answer/route.ts`: guarded endpoint, bounded submission validation and safe errors.
- `src/components/preview/`: bilingual text, lesson/grammar renderer, isolated question interactions, writing practice and preview shell using existing fonts, colors and UI buttons.
- `src/components/layout/application-boundary.tsx` and `src/app/layout.tsx`: bypass the live session provider only on this development preview. All other routes retain the existing provider and application shell. This matters because ordinary provider initialization may reconcile an existing pending-answer outbox.
- `tests/preview/`: renderer, public/private separation, all 42 option/key comparisons, stale/forged submissions, production guards and provider isolation.
- `tests/preview-e2e/lesson.spec.ts`, `playwright.preview.config.ts`, `scripts/serve-preview-e2e.mjs`: real development-server desktop/mobile checks, bilingual feedback, failures/retries, no learning/auth/Supabase requests, unchanged browser storage, refresh clearing and axe accessibility checks. Uses port 3101 and the existing ignored `.next-e2e` directory; run separately from production E2E tests.
- `tests/e2e/preview-disabled.spec.ts`: real production-server page and all grading methods return 404.
- `package.json`: adds `test:preview` and `test:e2e:preview`.

No migrations, accounts, learning APIs, saved attempts, compatibility mappings, curriculum JSON, authoring JSON or existing draft packages are modified. No hosted database operation is performed.

## Verification commands

```bash
npm run curriculum:v2:validate -- .curriculum-drafts/1.3.0 \
  --against .curriculum-drafts/1.1.0 --against .curriculum-drafts/1.2.0
npm run test:preview
npm run test:e2e:preview
npm run check
npm run test:e2e
```

`check` includes v1 content integrity, generated v2 schema integrity, lint, strict type-check, all Vitest tests and production build. Production E2E also exercises the existing dashboard, lesson, progress, review and reset flows with the established isolated/mocked environment. Database regression tests use local PGlite; they do not inspect or migrate the deployed Supabase project.

Verified for this delivery: **96 Vitest tests**, **4 development preview browser tests** and **16 production regression browser tests** passed. Lint, strict type-check, production build, v1 content integrity, generated schema integrity and 1.3.0 validation passed. Axe checks passed on desktop and mobile. All 26 production browser JavaScript assets were scanned with zero matches for the private answer-key field or draft feedback text. The exact local preview URL returned HTTP 200 with 14 questions on desktop and mobile; production returned 404 for the page and all seven supported grading methods.

A before/after SHA-256 comparison confirmed the existing v1 content, all authoring content, all 48 files in the three validated draft packages, all three migrations, generated schemas and public assets were unchanged. The read-only loader extraction preserves the previous authoring API and is covered by the existing curriculum regression suite.

## Limitations and editorial observations

This prototype supports the four block discriminators used by the revised lesson and single-choice exercises; common mistakes and simple examples are content within explanation/grammar blocks. It is not a full v2 player, publisher, persistence adapter, audio recorder or proficiency assessor. It deliberately revalidates the local draft for each check rather than retaining a private grading cache.

No incorrect answer mapping or blocking grammar issue was found. The shared question instruction asks learners to read the situation before choosing a pronoun, including questions 8–14 about be agreement and sentence order. That wording could be generalized in a future version; the immutable 1.3.0 draft is preserved. Burmese content is rendered verbatim from the reviewed draft. This implementation does not claim a new native-speaker editorial sign-off.
