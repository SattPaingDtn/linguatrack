# Curriculum contract

The trusted canonical release is `src/content/v1/curriculum.json`. Phase 2 public routes read its sanitized generated copy through `src/lib/curriculum/index.ts`. Zod validates the file on import; invalid content fails tests and builds. No credentials or network requests are used for curriculum loading.

## Hierarchy and identity

`Curriculum → Course → Chapter → Lesson → LessonBlock → QuizQuestion`

- `schemaVersion: 1` is the structural contract. A breaking structure needs a new parser and content directory (`v2`), with an explicit migration.
- `contentVersion: "1.0.0"` versions this release. Publish a new version for changes to wording, questions, answer keys, or lesson order; never silently rewrite a release referenced by persisted attempts in Phase 2.
- `publishedAt` is an ISO date, and `primaryLanguage: en` / `explanationLanguage: my` identify the bilingual contract. Localized text has both `en` and `my`; UI marks Burmese passages with `lang="my"`.
- Stable, globally unique content IDs are independent of route slugs. Questions have stable IDs; option IDs are unique within each question. Slugs are lowercase route-safe strings, unique among siblings. Chapter order is explicit; lesson/block array order is presentation order.
- `track` allows `general-english`, `toeic`, and `it-business-english`. CEFR `level` is independent of the track. Future specialized courses can reuse the same lesson/exercise types.
- Courses have `available` or `planned` status. Available courses must contain chapters; planned courses expose no playable lessons. Planned outcomes are previews, not completed curriculum.

## Four skills and supporting areas

`skills` records any combination of listening, speaking, reading, and writing. `areas` can also include grammar and vocabulary. A grammar lesson can support reading and writing; grammar is not presented as a fifth core skill. Coverage in the progress view counts completed lessons tagged with a skill, **not CEFR proficiency**.

| Block type  | Required content                                         | Phase 1 renderer                          |
| ----------- | -------------------------------------------------------- | ----------------------------------------- |
| explanation | Bilingual body and English examples                      | Notes and examples                        |
| grammar     | Bilingual rule; patterns, examples, Burmese translations | Accessible grammar table                  |
| vocabulary  | Words, IPA, Burmese meaning, example sentences           | Word cards                                |
| reading     | Passage and bilingual explanation                        | Passage and reading notes                 |
| listening   | Local audio path, transcript, bilingual instructions     | Native audio controls and transcript      |
| speaking    | Bilingual prompt, model answer, self-check list          | Aloud practice and checkboxes             |
| writing     | Bilingual prompt, model answer, word range               | Temporary draft and word counter          |
| quiz        | Passing percentage and multiple-choice questions         | Selection, feedback, score, review, retry |

Blocks form a discriminated union in `schema.ts`. Add a new block type there and handle it exhaustively in `lesson-block.tsx`; do not hide unsupported types behind unchecked casts. Future recording/upload tasks, rubrics, matching, and free-response assessments should be new versioned block types. Listening audio currently permits checked-in `/audio/*.wav`, `.mp3`, or `.ogg` files only. Introduce validated media metadata and storage references when Phase 2 needs uploads.

## Sample chapter

A1 Chapter 1, **Your first conversations**, has three lessons (25 estimated minutes):

1. **Hello, nice to meet you!** — reading dialogue, local audio, five vocabulary words, speaking practice.
2. **The little verb “to be”** — am/is/are, negatives, contractions, temporary writing practice.
3. **Let’s put it all together** — five questions, bilingual feedback, 80% passing threshold.

The listening sample is a checked-in WAV synthesized locally with macOS Samantha from this original script: “Hello! My name is Su. I am from Myanmar. I am a student. Nice to meet you!” Regeneration is optional; playback requires neither macOS nor a speech API. Audio transcription matches the file. Burmese copy is sample instructional content; a bilingual educator should review it before expanding into a production curriculum.

## Editing workflow

1. Edit JSON, preserving IDs for unchanged learning items; bump `contentVersion` for a release.
2. Keep the passing percentage, correct option IDs, bilingual feedback, objectives, and media paths valid.
3. Run `npm run check` and `npm run test:e2e`; inspect the rendered lesson on mobile and desktop.
4. For Phase 2, import a new immutable curriculum release and pin attempts to its lesson/block identities. Recompute progress only under an explicit version migration policy.

Quiz answer keys stay in the canonical server content and private database catalog. Initial lesson payloads expose prompts and options; checked answers receive server-graded feedback. The scorer test utility is not a trusted client score. This is formative learning, not a protected examination.

## Phase 2 private quiz payloads

Canonical JSON retains answer keys for trusted grading. `scripts/generate-content.mjs` creates `src/content/public/v1/curriculum.json` without quiz keys or explanations and seeds the private database catalog. Public routes import the sanitized module; the grading module uses `server-only`. Responses snapshot bilingual explanations after submission. Never change a published key under the same content version or edit applied migrations. See the README and Phase 2 design for the release process.
