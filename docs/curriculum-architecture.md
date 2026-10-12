# LinguaTrack curriculum architecture review

Repository inspection, 11 October 2026. Curriculum expansion below is a proposal; this change implements only the requested learning reset. Existing content, IDs, routes and lesson navigation are preserved.

## Current content and contracts

The hierarchy is **Curriculum → Course → Chapter → Lesson → LessonBlock → QuizQuestion**. The published release is structural schema **1**, content **1.0.0**, English teaching content with Burmese explanations. There are five general-English course records: A1 is available; A2, B1, B2 and C1 are planned with empty chapter lists. TOEIC and IT Business English are permitted track values, without course content yet.

| Layer                | Current structure                                                       | Source                                                                 |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Canonical content    | Version/date/languages and nested courses, including private quiz keys  | `src/content/v1/curriculum.json`                                       |
| Browser content      | Generated copy without quiz correct-option IDs or explanations          | `src/content/public/v1/curriculum.json`                                |
| Schemas / types      | Strict Zod schemas; TypeScript types inferred with `z.infer`            | `src/lib/curriculum/schema.ts`                                         |
| Loading / navigation | Public validation; scoped course/chapter/lesson lookup; slug-based URLs | `src/lib/curriculum/index.ts`                                          |
| Release generation   | Produces public JSON and initial private-catalog seed                   | `scripts/generate-content.mjs`                                         |
| Rendering            | Exhaustive block renderer and reusable quiz/writing components          | `src/components/lessons/lesson-block.tsx`, `src/components/exercises/` |

There is **no standalone JSON Schema document** today: JSON is the content format; TypeScript/Zod defines its runtime schema.

- **Course:** stable ID, slug, CEFR level, track, title, bilingual description, available/planned status, outcomes and chapters.
- **Chapter:** stable ID, slug, title, bilingual description, explicit order and lessons. Lesson/block order comes from arrays.
- **Lesson:** stable ID, slug, title, bilingual description/objectives, estimated minutes, four-core-skill tags, six-area tags and blocks.
- **Blocks:** discriminated union of explanation, grammar, vocabulary, reading, listening, speaking, writing and quiz. Listening has local audio/transcript; speaking has a model answer/checklist; writing has a model answer/word range. Writing drafts and speaking checks are page-local and ungraded.
- **Quiz question:** ID, prompt, 2–6 options, area stored under the field `skill`, correct option ID and bilingual explanation. The public question omits the last two fields. Validators check IDs/slugs, uniqueness, required chapters, valid correct options and writing bounds.

A1 chapter `a1-chapter-1` contains `a1-c1-introductions` (dialogue, audio, five vocabulary entries and speaking), `a1-c1-be` (grammar and writing), and `a1-c1-check` (five multiple-choice questions; 80% to pass). Its quiz assesses three grammar questions, one vocabulary question and one writing-recognition question. The chapter check is an ordinary quiz lesson, not a separate chapter-assessment entity.

## Validation and storage

`multiple-choice-quiz.tsx` sends an attempt UUID and version/lesson/quiz/question/option IDs. `contracts.ts` validates strict payloads; `server.ts` checks origin and verified Supabase identity; `canonical.ts` validates against server-only keys. `/api/learning/answer/route.ts` calls PostgreSQL `answer_question`, which independently validates the private catalog and grades atomically. Client scores/owner overrides are rejected.

Migration `20261011000100_learning.sql` defines profiles, lesson progress, quiz attempts, exercise responses, mistake reviews and study sessions, plus owner SELECT RLS and RPC-only writes. Migration `20261011000200_curriculum_v1.sql` seeds `private.lesson_catalog`. Each response snapshots options, selected/correct answers, correctness, bilingual explanation and timestamp. Repeated delivery of the same answer is idempotent; a retry creates a fresh attempt. Finished attempts and responses cannot be edited. The owner-scoped browser outbox retains unacknowledged answers (`src/lib/learning/outbox.ts`).

`progress.ts` distinguishes completion/skill coverage from latest unique-question recognition evidence. Completion is filtered by the active global content version; history includes older attempts. `canonical.ts` accepts only the current release for new submissions. These are important release-upgrade limitations.

## Changes needed for a complete curriculum

1. Author actual chapters/lessons for every level and all six areas, with explicit learning outcomes, prerequisites, sequencing and coverage targets. Replace A1 sample assumptions in dashboard, practice studio and progress summaries with course-aware selection and derived totals.
2. Separate reusable stimuli/exercises from teaching blocks. Add typed answer contracts for matching, cloze, ordering, comprehension and written/spoken production; generalize the MCQ-specific response columns into versioned answer/grading payloads. Rubric scores, self/manual assessment and unassessed work must remain distinguishable. Add validated media metadata, transcripts and accessible alternatives.
3. Add explicit chapter assessments with exercise references, coverage, scoring weights, pass policy and rubrics. Adapt the existing chapter-check lesson without renaming its IDs. Completion, assessed evidence and CEFR achievement require separate models.
4. Validate imports before generation: schema, cross-references, global IDs, prerequisites, media existence and coverage. The current generator only parses JSON; public schemas also omit canonical cross-entity refinements. Publish from a validated immutable release registry, not by rewriting the already-applied initial seed migration.

## Recommended versioned import contract

Use schema v2 with a manifest and typed entity collections. Separate stable identity, entity revision and package version. Export a JSON Schema for authoring tools, retaining Zod/semantic validation on import. A manifest could be:

```json
{
  "schemaVersion": 2,
  "contentVersion": "1.1.0",
  "basedOn": "1.0.0",
  "locales": ["en", "my"],
  "collections": {
    "courses": "courses.json",
    "chapters": "chapters.json",
    "lessons": "lessons.json",
    "exercises": "exercises.json",
    "assessments": "assessments.json",
    "assets": "assets.json"
  },
  "compatibility": [
    {
      "lessonId": "a1-c1-introductions",
      "fromRevision": 1,
      "toRevision": 1,
      "completion": "carry_forward"
    }
  ]
}
```

This is illustrative, not an implemented parser. Each entity needs stable `id`, `revision`, release status, localized content and references; exercises need `type`, `area`, core skills, public prompt/stimulus/options and **private** grading rules. Assessments reference chapter/exercise revisions and scoring policies. Asset records and collection files need verified checksums. Keep every existing A1 lesson/block/question ID and slug.

Stage imports, validate, dry-run differences, append immutable catalog/entity revisions, then atomically activate the matching public/API release. Reimporting an identical checksum is a no-op; conflicting content under the same version is rejected. Retain old keys/parsers for pinned historical or pending submissions. Store release/revision provenance in attempts; never rewrite historical answers. Carry completion/evidence forward only through explicit compatibility mappings for unchanged items; materially changed assessments require new evidence. Adding A2 content alone must not erase A1 completion. Add upgrade/regression tests before implementing this pipeline.

## Implemented reset

`src/components/progress/reset-progress.tsx` adds typed confirmation to My Progress and nonempty Review History. `/api/learning/reset/route.ts` calls owner-only `reset_learning` in **new migration `20261011000300_reset_learning.sql`**. It permanently clears all learning history/completions/activity/position across versions, retaining the account and curriculum. Export remains available before reset.

Profile generation guards and owner-row locks prevent stale device writes; request receipts make reset retries safe after a lost reply. Browser drafts are discarded only after acknowledging the reset. RLS/direct-write restrictions remain intact. Apply migration 003 once after existing migrations; deployment itself does not reset anyone. Tests cover confirmation/cancel, failures, duplicate resets, owner isolation, rollback, stale submissions/drafts and post-reset learning. See `docs/phase-2-supabase.md` and `docs/backups.md` for setup and export details.
