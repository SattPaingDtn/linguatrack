# LinguaTrack Academy — Safe chapter expansion instructions for Codex

## Goal
Author and preview A1 Chapters 1–3 in the EXISTING website; map later Chapters 4–12 from the outline without inventing 'complete' lessons. These source Markdown packs are not automatically importable JSON and have not received reviewer approval.

## Required inputs
- `A1_12_Chapter_Curriculum_Blueprint.json`: proposed 12-chapter A1 plan; chapters 4–12 remain outlines.
- `A1_Chapter_01_Full_Lesson_Pack.md`: existing ChatGPT-authored Chapter 1 source (7 pedagogical sections).
- `A1_Chapter_02_Full_Lesson_Pack.md`: new complete editorial source (family and possessions).
- `A1_Chapter_03_Full_Lesson_Pack.md`: new complete editorial source (daily routines and time).

## Codex task
1. Inspect `docs/phase-3d-publishing-plan.md`, `docs/phase-3d-d2-report.md`, actual Zod schemas and all existing A1 content/IDs. Output a content-to-existing-entities mapping first; reuse legacy Chapter 1 lessons rather than cloning them.
2. Copy/organize these files into `content-authoring/` as source material. Maintain an editorial checklist of actual complete content vs outlines.
3. Build a **local-only batch authoring tool** that converts chapters into an unused **inactive** v2 draft(s). Convert or preserve teacher-only answer keys as separate private grading rules; do not expose answers in public JSON, browser bundles, or preview initial data. Never directly render raw Markdown sections containing the teacher key to learners.
4. Generate appropriate exact IDs/revisions/refs, respect ancestor drafts 1.1.0–1.3.0, and never mutate older content or existing historical scores. Validate graph references, bilingual fields, answer option mapping, and questions with deterministic tests.
5. Listening scripts have NO audio yet. Mark as `audio_pending` in authoring metadata; do not mislabel text-question practice as assessed listening. Do not create broken media refs or fake media files. Offer reading-of-transcript preview until actual licensed/generated voice audio is supplied, with a clear label.
6. Speaking and writing are ungraded/self-practice. Do not assign CEFR proficiency or write to Supabase. MCQs may be checked in local development with server-only grading, using the existing preview security boundary.
7. Add A1 Chapters 2 and 3 to a **development-only** chapter-picker preview if the existing renderer supports their block types; otherwise implement small tested preview components for approved supported schema types. Keep the live v1 site, authentication and progress unchanged.
8. Only include Chapter 4–12 in an editorial outline; do not label these finished or unlocked learning chapters until real content exists.
9. Provide a report of which lessons were actually converted, their local preview URL(s), supported vs unsupported activities, editorial issues, test results and the next step to publish safely via D3–D5 later.
10. Stop before any hosted Supabase migration, production publishing, activation or grading change; no reviewer approvals are to be fabricated.

## Tests
Run schema validation, content answer-key consistency tests, lint, typecheck, unit tests, preview browser tests, and production build. Confirm production preview route 404 and no private grading leakage. Test older Chapter 1 and v1 progress flows still pass.
