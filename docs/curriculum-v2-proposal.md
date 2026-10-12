# Phase 3: curriculum v2 import contract

**Status: design proposal for review.** No application changes, database migrations, content imports or curriculum releases are part of this task. The schemas, package files and tables below are proposed, not implemented.

## 1. Decision and source of truth

Adopt immutable, versioned content packages containing separately validated public teaching entities and private grading entities. Keep stable identities independent of release versions and presentation order. Pin every attempt to the exact content, exercise and grading revisions used at submission; recognize compatible lesson completion through explicit provenance mappings rather than rewriting history.

This proposal follows [the architecture review](curriculum-architecture.md) and [the canonical v1 curriculum](../src/content/v1/curriculum.json). Implementation constraints were checked against `src/lib/curriculum/schema.ts`, `src/lib/learning/{contracts,canonical,progress,outbox}.ts`, `scripts/generate-content.mjs` and migrations 001–003.

Current baseline: `schemaVersion: 1`, `contentVersion: "1.0.0"`, English (`en`) teaching with Burmese (`my`) explanations. The canonical file SHA-256 at inspection is `eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3`. This identifies the inspected bytes, not a substitute for recording the actual deployed release during migration.

A1 currently has one chapter, three lessons and five multiple-choice questions. A2–C1 are empty planned courses. The v2 contract supports a complete curriculum; the first migration must not claim that the missing curriculum has been authored.

### Identity inventory that must survive migration

| Entity                 | Existing ID                                                                     | Existing slug / identity notes                               |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Courses                | `general-a1`, `general-a2`, `general-b1`, `general-b2`, `general-c1`            | `a1`, `a2`, `b1`, `b2`, `c1` respectively                    |
| Chapter                | `a1-chapter-1`                                                                  | `first-conversations`                                        |
| Lessons                | `a1-c1-introductions`, `a1-c1-be`, `a1-c1-check`                                | `introductions`, `am-is-are`, `chapter-check` respectively   |
| Introduction blocks    | `a1-c1-welcome`, `a1-c1-dialogue`, `a1-c1-listen`, `a1-c1-words`, `a1-c1-speak` | No block slugs exist; preserve IDs and anchor links          |
| Grammar/writing blocks | `a1-c1-grammar`, `a1-c1-contractions`, `a1-c1-write`                            | No block slugs exist                                         |
| Quiz block             | `a1-c1-quiz`                                                                    | Preserve its quiz identity and its location in `a1-c1-check` |
| Questions              | `a1-c1-q1` through `a1-c1-q5`                                                   | Become exercise entities with the same IDs                   |
| Options                | `option-1`, `option-2`, `option-3` within each question                         | IDs are question-scoped, not globally unique                 |

The string `a1-c1-*` is an opaque historical ID: its `c1` substring must not be interpreted as CEFR C1. Existing titles, English prompts/options, Burmese explanations, block order, audio, correct answers and 80% pass rule are preserved by the migration adapter. Translation additions require editorial review; English text must not be duplicated into a Burmese field to satisfy validation.

## 2. Package, identities and versioning

Use one curriculum namespace, `linguatrack-academy`, across general English and future tracks. A release is uniquely identified by `(curriculumId, contentVersion)`. This avoids ambiguity with today's history, which stores only the global content version. Future independently released curricula require explicit namespaces and a deliberate API/database migration.

| Field                      | Meaning and invariant                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion: 2`         | Structural major version; selects the v2 parser                                                                                                   |
| `contractVersion: "2.0.0"` | Exact schema/validator contract edition, separate from pedagogical content                                                                        |
| `contentVersion`           | Stable SemVer release, initially proposed as `1.1.0`; never reuse a published version with different bytes                                        |
| Entity `id`                | Stable lowercase kebab-case, maximum 120 characters; never derived from array position, a title or a slug                                         |
| Entity `revision`          | Positive monotonic integer per ID; changed published payload requires a new revision                                                              |
| `Ref`                      | Exact `{kind, id, revision}` reference; published packages cannot contain `latest`, ranges or unresolved references                               |
| `source`                   | Optional v1 origin tuple for migration/audit; retains the original version, entity type and ID                                                    |
| Checksums                  | SHA-256 of exact UTF-8 JSON or media bytes; importer rejects a reused entity revision with different bytes                                        |
| Lifecycle                  | Authoring package is draft; staged package is sealed; published release is immutable. Retirement is registry metadata, not an edit to its payload |

Manifest artifact `state` is `draft` or `sealed`. Registry lifecycle is separately `staging`, `published` or `retired`; promotion/retirement does not change sealed bytes. Runtime requires a sealed public manifest belonging to a published registry release. A small active-release descriptor identifies its immutable public manifest/hash; this descriptor can change atomically while each manifest stays fixed.

New resource IDs are unique across course/chapter/lesson/block/exercise/objective/stimulus/transcript/asset/assessment/rubric definitions. Repeated references are allowed. Nested option, matching-side, token, blank, section and criterion IDs are unique only within their owning entity. Private grading records refer to an exercise; they do not redefine that exercise ID.

Maintain an append-only identity/route registry. Existing course/chapter/lesson slugs, parent relationships, full routes and block anchors are frozen for this migration. An eventual relocation needs an explicit alias and review; it must never make a saved ID refer to a different learning item. Presentation order is held in ordered references, not encoded into new IDs.

Packages are full resolved snapshots for the first implementation: every referenced revision is included, even if an importer already has it. Matching stored hashes permit reuse. Do not introduce implicit inheritance or delta-package resolution in the initial importer.

Changing serialization from v1 to v2 does not prove pedagogical equivalence. V1 has no entity revisions: keep its original release and snapshots intact, and map its origin tuples to first v2 revisions through audited compatibility entries. Do not invent a revision number inside existing saved attempts.

## 3. Proposed entities and sample TypeScript contracts

The following definitions specify the important contract shapes. Implementation should use strict Zod discriminated unions, infer runtime TypeScript types, and generate JSON Schema Draft 2020-12 for authoring tools. Semantic checks in section 8 remain necessary even when JSON Schema validation passes.

```ts
type Cefr = "A1" | "A2" | "B1" | "B2" | "C1";
type CoreSkill = "listening" | "speaking" | "reading" | "writing";
type Area = CoreSkill | "grammar" | "vocabulary";
type Track = "general-english" | "toeic" | "it-business-english";
type Localized = { en: string; my: string };
type EnglishText = { language: "en"; text: string };
type Kind =
  | "course"
  | "chapter"
  | "lesson"
  | "block"
  | "exercise"
  | "objective"
  | "stimulus"
  | "transcript"
  | "asset"
  | "assessment"
  | "rubric";
type Ref<K extends Kind> = { kind: K; id: string; revision: number };
type LegacyOrigin = {
  schemaVersion: 1;
  contentVersion: string;
  kind: "course" | "chapter" | "lesson" | "block" | "question";
  id: string;
  pointer?: string; // Relative to this immutable v1 entity, e.g. /objectives/0
};
type Entity<K extends Kind> = {
  kind: K;
  id: string;
  revision: number;
  source?: LegacyOrigin;
};
type Prerequisite = {
  target: Ref<"lesson"> | Ref<"assessment">;
  requirement: "completed" | "passed";
  enforcement: "advisory" | "required";
};
type Tags = { areas: Area[]; coreSkills: CoreSkill[] };
type Difficulty = {
  targetCefr: Cefr;
  band: "introductory" | "developing" | "consolidating";
  estimateSource: "author" | "pilot";
  estimatedMinutes: number;
};
type Objective = Entity<"objective"> & {
  statement: Localized;
  action:
    "identify" | "recognize" | "match" | "order" | "produce" | "interpret" | "summarize" | "argue";
  tags: Tags;
  successCriterion: Localized;
  expectedEvidence: (
    "recognition" | "comprehension" | "written_production" | "spoken_production" | "self_practice"
  )[];
  difficulty: Difficulty;
  descriptorRefs: { framework: "CEFR"; edition: string; descriptorId: string }[];
};
type CoverageTarget = {
  area: Area;
  evidenceKind:
    "teaching" | "recognition" | "comprehension" | "written_production" | "spoken_production";
  objectiveRefs: Ref<"objective">[];
  minimumDistinctItems: number;
};
type Course = Entity<"course"> & {
  slug: string;
  title: Localized;
  description: Localized;
  level: Cefr;
  track: Track;
  status: "available" | "planned";
  coverageState: "partial" | "complete";
  outcomeRefs: Ref<"objective">[];
  chapterRefs: Ref<"chapter">[];
  coverageTargets: CoverageTarget[];
};
type Chapter = Entity<"chapter"> & {
  courseRef: Ref<"course">;
  slug: string;
  order: number;
  title: Localized;
  description: Localized;
  objectiveRefs: Ref<"objective">[];
  prerequisites: Prerequisite[];
  lessonRefs: Ref<"lesson">[];
  assessmentRefs: Ref<"assessment">[];
  coverageTargets: CoverageTarget[];
};
type Lesson = Entity<"lesson"> & {
  chapterRef: Ref<"chapter">;
  slug: string;
  title: Localized;
  description: Localized;
  tags: Tags;
  difficulty: Difficulty;
  objectiveRefs: Ref<"objective">[];
  prerequisites: Prerequisite[];
  blockRefs: Ref<"block">[];
  completionPolicy:
    { type: "self_reported" } | { type: "assessment_pass"; assessmentRef: Ref<"assessment"> };
};
type Stimulus = Entity<"stimulus"> &
  (
    | { type: "reading"; passage: EnglishText; sourceAttribution: string }
    | {
        type: "listening";
        audioRef: Ref<"asset">;
        transcriptRef: Ref<"transcript">;
        transcriptAccess: "always" | "after_submission" | "reviewer_only";
      }
  );
type Transcript = Entity<"transcript"> & {
  language: "en";
  text: string;
  segments: { startMs: number; endMs: number; text: string }[];
};
type Asset = Entity<"asset"> & {
  language: "en" | "my";
  contentType: string;
  storage:
    | { type: "package"; path: string }
    | { type: "managed_object"; storeId: string; objectKey: string };
  sha256: string;
  byteLength: number;
  durationMs?: number; // Required for audio/video; absent for still images
  alt?: Localized; // Required for images
  legacyPublicPath?: string;
  provenance: string;
};
type ExerciseBase = Entity<"exercise"> & {
  instructions: Localized;
  tags: Tags;
  difficulty: Difficulty;
  objectiveRefs: Ref<"objective">[];
};
type Option = { id: string; text: EnglishText };
type AtomicExercise = ExerciseBase &
  (
    | {
        type: "multiple_choice";
        prompt: EnglishText;
        selection: "single" | "multiple";
        options: Option[];
      }
    | { type: "matching"; mode: "one_to_one" | "many_to_one"; left: Option[]; right: Option[] }
    | {
        type: "fill_in_blank";
        segments: ({ type: "text"; text: string } | { type: "blank"; id: string })[];
      }
    | { type: "sentence_ordering"; tokens: Option[] }
    | {
        type: "writing_submission";
        prompt: Localized;
        limits: { minWords: number; maxWords: number; maxChars: number };
      }
    | {
        type: "speaking_recording";
        prompt: Localized;
        limits: { minSeconds: number; maxSeconds: number; maxBytes: number; mimeTypes: string[] };
      }
  );
type ComprehensionExercise = ExerciseBase & {
  type: "reading_comprehension" | "listening_comprehension";
  stimulusRef: Ref<"stimulus">;
  itemRefs: Ref<"exercise">[];
  assistance: "practice_with_support" | "independent";
};
type Exercise = AtomicExercise | ComprehensionExercise;
type Assessment = Entity<"assessment"> & {
  purpose: "chapter_check" | "diagnostic";
  chapterRef: Ref<"chapter">;
  title: Localized;
  instructions: Localized;
  delivery: { lessonRef: Ref<"lesson">; blockRef: Ref<"block"> };
  prerequisites: Prerequisite[];
  sections: {
    id: string;
    title: Localized;
    exerciseRefs: Ref<"exercise">[];
    objectiveRefs: Ref<"objective">[];
  }[];
  declaredCoverage: CoverageTarget[];
  passSummary: Localized;
  feedbackTiming: "after_each_response" | "after_finalization";
};
```

Numbers above have runtime integer/finite/bound checks, not merely TypeScript types. Core-skill tags are not proficiency claims. Pure grammar/vocabulary recognition may have no core-skill measurement; keep teaching tags and observed evidence separate. CEFR descriptor references must resolve in a reviewed descriptor registry with its source/edition; empty references are honest for unaligned sample material. An author's target level and estimated difficulty are not a learner's attained level.

Proposed initial hard limits are part of contract 2.0.0, shared by validators and database/API boundaries. Raising a limit needs a supported contract edition and capability review; authors cannot override limits in a package:

| Value                                     | Initial bound                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| JSON file / total JSON bytes              | 16 MiB / 128 MiB after decompression                                                                                                     |
| Import expansion                          | 1 GiB included media, 20,000 files, 100,000 entity definitions, maximum JSON nesting depth 32                                            |
| Identity / revisions                      | ID 1–120 ASCII characters; slug same pattern/limit; revisions 1–2,147,483,647                                                            |
| Teaching strings / English passage        | 1–20,000 / 1–50,000 Unicode code points; byte budgets checked separately                                                                 |
| Choice options                            | 2–12, unique nested IDs; single-choice correct set has cardinality one                                                                   |
| Matching sides / blanks / ordering tokens | 1–50 / 1–50 / 2–100; no duplicate nested IDs                                                                                             |
| Assessment / rubric                       | 1–100 sections, 1–1,000 distinct scored leaves; 1–50 rubric criteria                                                                     |
| Points / weights / percentages            | Integer points 1–10,000 per rule; weights 1–10,000; thresholds 0–100. Earned points range 0–maximum                                      |
| Lesson duration estimate                  | 1–240 minutes; exercise estimate may be fractional but must be finite and greater than zero, at most 240                                 |
| Submitted English writing                 | Authored range within 1–5,000 words and at most 50,000 code points                                                                       |
| Learner recording                         | Authored duration within 1–600 seconds, at most 50 MiB; candidate allowed MIME types `audio/webm`, `audio/mp4`, `audio/wav`, `audio/ogg` |
| Curriculum media                          | At most 100 MiB per asset; approved MIME allowlist and decoder validation; greater libraries use managed immutable objects               |

Large collections may shard across multiple manifest-declared JSON files; merged definitions still obey global uniqueness/reference checks. Managed media uses a configured store ID and content-addressed object key, never an arbitrary fetch URL. Import verifies existence and actual hash/format through the configured storage adapter; staging cannot succeed when media is unavailable. Publication copies/locks immutable objects and preserves all referenced versions. Imported file MIME headers alone cannot establish that recording/media bytes are safe or decodable.

Teaching instructions, descriptions, objectives, rules, explanations and new entity titles require nonempty `en` and `my`. Target-language passages, question sentences, options, tokens, transcripts and pronunciation examples remain English; translating tested material before a response may change the task. Localized production prompts may give Burmese instructions without translating the learner's expected English answer.

V1 has English-only titles and some English-only practice instructions inside blocks. A bridge package may declare an exact, reviewed `legacyLocaleExceptions` list of origin/entity/JSON-pointer fields that retain those values, rendered with the existing locale behavior. This is a transitional schema branch, not a generic optional Burmese field. Legacy-derived metadata can use it only for an exact mapped source field; newly authored material cannot. Course coverage cannot be labelled complete until required translations are reviewed. Translation additions publish new revisions and pass the compatibility review. V1 objective/outcome strings get new, frozen metadata IDs and a source pointer; array position is used only to identify an immutable legacy origin, never as an ongoing identity generator.

### Blocks and hierarchy

Keep all existing block IDs and the eight existing block kinds. V2 blocks have `lessonRef`, bilingual title (or a declared legacy exception), and a strictly typed payload:

| Block type         | Proposed payload                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `explanation`      | Bilingual body; English examples                                                                     |
| `grammar`          | Bilingual rule; pattern/example/Burmese-translation entries                                          |
| `vocabulary`       | English word, IPA, bilingual meaning and English example entries                                     |
| `reading`          | Reading `stimulusRef` and bilingual teaching explanation                                             |
| `listening`        | Listening `stimulusRef` and bilingual instruction                                                    |
| `speaking`         | Existing self-practice prompt, public model answer and checklist; no inferred grade                  |
| `writing`          | Existing self-practice prompt, public model answer and word range; no inferred grade                 |
| `quiz`             | Ordered exercise references, optional `assessmentRef`; preserves `a1-c1-quiz`                        |
| New `exercise_set` | Ordered atomic/comprehension exercise references for submitted practice, including recording/writing |

Public teaching model answers in existing self-practice blocks remain public. Private assessment model answers are separate material; an assessment using an already revealed model must be labelled supported practice, not independent production evidence. V1 payloads are converted field-for-field by a deterministic adapter, not passed through an unrestricted `unknown` JSON field.

### Sample JSON Schema definition

This is a standalone **fragment schema** for shared values, not the complete package schema. Proposed authoring schema files must define every strict entity union and the draft/sealed manifest branches; the importer must validate all of them plus graph semantics.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:linguatrack:curriculum:common:2.0.0",
  "$defs": {
    "id": { "type": "string", "maxLength": 120, "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    "revision": { "type": "integer", "minimum": 1, "maximum": 2147483647 },
    "localized": {
      "type": "object",
      "additionalProperties": false,
      "required": ["en", "my"],
      "properties": {
        "en": { "type": "string", "minLength": 1 },
        "my": { "type": "string", "minLength": 1 }
      }
    },
    "exerciseRef": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "id", "revision"],
      "properties": {
        "kind": { "const": "exercise" },
        "id": { "$ref": "#/$defs/id" },
        "revision": { "$ref": "#/$defs/revision" }
      }
    }
  }
}
```

The runtime validator additionally trims for emptiness without silently changing published bytes. Unknown fields, duplicate JSON keys and unsupported contract editions are rejected. Do not use deletion of known secret fields as the public projection strategy: explicitly construct an allowlisted public entity and validate it with the public schema.

## 4. Private grading and typed submissions

Public entities contain neither answer keys nor full grading rubrics, criterion anchors, marking notes or scored-task model responses. Place these in `private/grading.json` and `private/rubrics.json`; they are server/importer-only and never included in browser bundles, static public files, source maps or public release manifests. Store delayed/private transcripts in private collections too.

Every atomic exercise has exactly one grading rule bound to its exact exercise revision. A rule has its own positive `gradingRevision`, `graderVersion`, `maxPoints`, feedback explanation `{en,my}`, feedback timing inherited from delivery, and one matching discriminated configuration:

| Exercise                | Typed response payload                                | Private grading configuration and validation                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multiple choice         | `{type:"multiple_choice", optionIds:string[]}`        | `correctOptionIds`, `scoring:"exact_set"`; single selection requires exactly one key/response. Validate key membership, distinct selections and cardinality. No implicit partial credit                |
| Matching                | `{type:"matching", pairs:{leftId,rightId}[]}`         | Complete accepted left-to-right mapping; mode-compatible targets and explicit distractors. Each left ID appears once. `exact_set` or declared `per_pair` scoring                                       |
| Fill-in-the-blank       | `{type:"fill_in_blank", values:{blankId,text}[]}`     | Accepted variants for every blank; named normalizer version; `exact_set` or `per_blank` scoring. Blank IDs and answer keys must match exactly                                                          |
| Sentence ordering       | `{type:"sentence_ordering", tokenIds:string[]}`       | One or more accepted permutations of stable token IDs, `exact_sequence` scoring. Each token appears exactly once, even when text repeats                                                               |
| Reading comprehension   | Responses to referenced atomic items                  | A reading stimulus and ordered child items. The group is a container, not another scored answer; leaf rules grade it                                                                                   |
| Listening comprehension | Responses to referenced atomic items                  | A listening stimulus, permitted playback/transcript support and child items. Require the asset/transcript relationship and assess comprehension, not merely audio playback                             |
| Writing submission      | `{type:"writing_submission", text:string}`            | `method:"human_rubric"`, exact rubric reference, English word-counter version, private model/marking notes. Validate limits; save as pending review, never as automatically correct                    |
| Speaking recording      | `{type:"speaking_recording", submissionAssetId:UUID}` | `method:"human_rubric"`, exact rubric reference and private exemplars/marking notes. Verify upload ownership, attempt/exercise binding, actual duration/size/MIME and readiness before acknowledgement |

Comprehension item references resolve only to objective atomic types (choice, matching, blank, ordering); nesting comprehension groups is rejected initially. Each item declares compatible area/objectives. A delivery cannot include the same leaf twice through different groups/sections. Count group evidence using its stimulus and leaf provenance; do not sum both container and leaf points.

Private schema samples:

```ts
type Rubric = Entity<"rubric"> & {
  coreSkill: "writing" | "speaking";
  title: Localized;
  criteria: {
    id: string;
    description: Localized;
    maxPoints: number;
    anchors: { points: number; description: Localized }[];
  }[];
  aggregation: "sum_integer_points";
};
type RuleBase = {
  exerciseRef: Ref<"exercise">;
  gradingRevision: number;
  graderVersion: string;
  maxPoints: number;
  explanation: Localized;
};
type GradingRule = RuleBase &
  (
    | { type: "multiple_choice"; correctOptionIds: string[]; scoring: "exact_set" }
    | {
        type: "matching";
        acceptedPairs: { leftId: string; rightId: string }[];
        scoring: "exact_set" | "per_pair";
      }
    | {
        type: "fill_in_blank";
        acceptedByBlank: { blankId: string; variants: string[] }[];
        normalizerVersion: string;
        scoring: "exact_set" | "per_blank";
      }
    | { type: "sentence_ordering"; acceptedOrders: string[][]; scoring: "exact_sequence" }
    | {
        type: "writing_submission";
        method: "human_rubric";
        rubricRef: Ref<"rubric">;
        wordCounterVersion: string;
        modelResponse: EnglishText;
        markingNotes: Localized;
      }
    | {
        type: "speaking_recording";
        method: "human_rubric";
        rubricRef: Ref<"rubric">;
        modelResponse: EnglishText;
        markingNotes: Localized;
      }
  );
type AssessmentPolicy = {
  assessmentRef: Ref<"assessment">;
  policyRevision: number;
  aggregation: "legacy-rounded-percent-v1" | "weighted-integer-points-v1";
  requiredItems: Ref<"exercise">[];
  itemWeights: { exerciseRef: Ref<"exercise">; weight: number }[];
  passPercent: number;
  requireAllResponses: true;
  requireAllGrades: true;
  sectionMinimums: { sectionId: string; minimumPercent: number }[];
};
```

Private revisions are immutable too. An answer-key, scoring, rubric-binding or explanation change requires a new exercise revision and rule revision, even if its public prompt is identical. A changed assessment aggregation/pass requirement needs a new assessment/policy revision. Reusing an exercise revision across packages requires the same pinned rule/hash. Criterion anchors must cover the rubric's declared integer scale. For per-pair/per-blank scores, maximum points must divide evenly among units; sum checked integer points/weights with bounded arithmetic and apply only the named display/pass rounding rule.

Delayed transcript access opens only after all required items in its comprehension group are finalized, and never earlier than the containing assessment’s feedback policy permits. The server records support actually used. Public teaching transcripts stay accessible; a new private reference cannot make previously public material a protected independent assessment.

Normalization is explicit and deterministic, e.g. `en-nfc-trim-ascii-space-casefold-v1`: Unicode NFC, trim/collapse declared ASCII whitespace, and English case folding. Preserve submitted original text. Accent removal, fuzzy matching, smart punctuation changes or spelling correction are never enabled implicitly. Reject ambiguous accepted variants after normalization. English word counting has a pinned tokenizer definition (including apostrophes/hyphens), not a browser-dependent count.

Rubrics have stable ID/revision, typed core skill, criterion IDs, bilingual criterion descriptions and score anchors, integer maximums and a defined aggregate formula. A criterion cannot silently change in a published revision. Learners may see a separately authored public checklist; full assessment rubrics remain private. Human reviewer feedback is stored separately from author explanations. If no trusted reviewer workflow exists, submitted production work remains `pending_review`; self-reflection is labelled self-reported. No paid AI grading or automatic speech assessment is required by this contract.

An illustrative v2 submission envelope is:

```ts
type ResponsePayload =
  | { type: "multiple_choice"; optionIds: string[] }
  | { type: "matching"; pairs: { leftId: string; rightId: string }[] }
  | { type: "fill_in_blank"; values: { blankId: string; text: string }[] }
  | { type: "sentence_ordering"; tokenIds: string[] }
  | { type: "writing_submission"; text: string }
  | { type: "speaking_recording"; submissionAssetId: string };
type Submission = {
  schemaVersion: 2;
  contentVersion: string;
  attemptId: string;
  responseId: string;
  generation: number;
  delivery: Ref<"block"> | Ref<"assessment">;
  exercise: Ref<"exercise">;
  response: ResponsePayload;
};
```

The server derives owner, timestamps, permitted references, grades and grader versions. Client references are checked against the attempt's pinned release/delivery, not trusted as authority. Idempotency is `(owner, attemptId, responseId)`, with a stored canonical request digest: identical replay returns its original acknowledgement; different content under that ID is a conflict. Each checked objective item has at most one final response per attempt; a changed checked answer requires a new attempt. Repeated delivery must not create duplicate uploads, grades or mistake records.

For production recording, use private learner-upload storage distinct from published curriculum media. An authenticated upload ticket binds owner/attempt/exercise/generation, allowed MIME types and size. Verify file signatures and decoded duration, quarantine until ready, and retain the acknowledged artifact/checksum or show an explicit processing failure. Store opaque IDs rather than expiring signed URLs in attempts. Owner and authorized-reviewer access, retention/deletion policy and orphan-upload cleanup are implementation requirements; permission denial needs an accessible retry/alternative state. Transcription is optional and cannot be fabricated as assessment evidence.

## 5. Explicit chapter assessments and honest progress

Add a new assessment ID, proposed `a1-c1-assessment`, without replacing `a1-c1-check`, `a1-c1-quiz` or any question ID. Its delivery points to the existing lesson and quiz block. The initial definition contains exactly `a1-c1-q1`–`q5`, retains immediate formative feedback and the existing five-question, 80% pass behavior. Legacy completed quiz attempts may satisfy this equivalent assessment through an explicit mapping; their stored `quizId`, answers, score and timestamps remain unchanged.

Separate public delivery definitions from private assessment policies. Private policies specify required leaf items/sections, integer points/weights, pass threshold, any per-section minimums, and aggregation/rounding version. Server calculation is reproducible; an incomplete or pending-review assessment cannot pass. A percentage uses its fixed maximum, not only answered questions. Missing skill sections are unassessed, not zero proficiency and not passed. For the legacy check, preserve `round(correct / 5 * 100) >= 80` and the requirement that all five questions are answered.

The first assessment declares grammar recognition (three items), vocabulary recognition (one) and writing recognition (one). The writing label on q5 is preserved, but selecting a sentence does not become written-production evidence. It has no scored listening, speaking or independent reading-comprehension sections. Do not retroactively require new recording/writing tasks to keep an old lesson completed. A later expanded assessment gets a new revision and explicit assessment compatibility policy.

Track four separate outcomes:

| Outcome                   | Evidence and display                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Lesson completion         | Self-reported completion or the lesson's explicit quiz/pass requirement, with source timestamp/provenance            |
| Curriculum coverage       | Completed teaching activities tagged by area/skill; not proficiency                                                  |
| Assessment evidence       | Recognition, comprehension or production results with revisions, support used, grader status and assessed objectives |
| CEFR proficiency decision | Separate future reviewed/calibrated decision requiring an approved evidence policy; disabled for this phase          |

A course's `level` is its target curriculum level, never a learner award. MCQ completion, chapter pass, streaks and course completion must not automatically assign CEFR proficiency. Latest equivalent unique exercise evidence may support a dashboard summary; repeated retries cannot inflate evidence counts. Do not aggregate incomparable rubric revisions or supported practice into a proficiency percentage. Preserve assessment scope and distinguish missing evidence from failed evidence.

## 6. Example authoring package and proposed organization

The example is the **v1-preserving A1 bridge package**, with five existing course records, the original chapter/lessons/blocks/questions and new objective/stimulus/assessment metadata. A2–C1 remain planned. All eight exercise types are legal in the contract; additional sample production/comprehension tasks should be authored as new IDs in a subsequent package, not substituted for old questions.

```text
content-packages/linguatrack-academy/1.1.0/
  manifest.json                    # Internal authoring/import manifest
  public/
    courses.json                   # All five stable course IDs
    chapters.json                  # a1-chapter-1
    lessons.json                   # All three original lesson IDs/slugs
    blocks.json                    # All nine original block IDs
    objectives.json                # Typed objectives/outcomes; new stable IDs
    exercises.json                 # a1-c1-q1 ... a1-c1-q5
    assessments.json               # a1-c1-assessment, delivered by original quiz
    stimuli.json                   # Extracted dialogue/audio stimuli
    transcripts.json               # Original teaching transcript, always visible
    assets.json                    # Checksummed curriculum-media metadata
  private/
    grading.json                   # Exercise rules + assessment policies
    rubrics.json                   # Empty for bridge; populated for new production tasks
    transcripts.json               # Empty for bridge; gated transcripts for future tasks
  compatibility.json              # Internal, reviewed progress/evidence mappings
  media/a1-introductions.wav       # Copy original bytes; retain old public URL alias

schemas/curriculum-v2/2.0.0/        # Proposed implementation files, not created now
  common.schema.json
  manifest.schema.json
  public-entities.schema.json
  private-grading.schema.json
  compatibility.schema.json

src/lib/curriculum/v2/             # Future parsers/resolver/public projections
scripts/curriculum/                # Future validate, seal, diff, import, activate
tests/fixtures/curriculum-v2/       # Future valid/adversarial/upgrade packages
```

Keep `src/content/v1/`, its sanitized public copy and all applied migrations intact. Authoring private files may be version-controlled like the existing canonical keys, but must stay outside deployed public assets. Learner recording files never belong in the package or Git. Release projection produces a separate **public manifest containing only public files**; the internal manifest below must not be served to learners.

### Manifest example

This is a draft manifest with deliberately unsealed file hashes. Its package layout is fully specified above; the selected records below illustrate the contract, not a complete importable release. Before staging, populate every collection and compute every file hash/byte length. Draft placeholders/null hashes are rejected by the sealed-manifest schema and runtime reader.

```json
{
  "schemaVersion": 2,
  "contractVersion": "2.0.0",
  "curriculumId": "linguatrack-academy",
  "contentVersion": "1.1.0",
  "state": "draft",
  "createdAt": "2026-10-11T00:00:00Z",
  "basedOn": {
    "schemaVersion": 1,
    "contentVersion": "1.0.0",
    "sha256": "eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3"
  },
  "locales": ["en", "my"],
  "teachingLanguage": "en",
  "explanationLanguage": "my",
  "courseRefs": [
    { "kind": "course", "id": "general-a1", "revision": 1 },
    { "kind": "course", "id": "general-a2", "revision": 1 },
    { "kind": "course", "id": "general-b1", "revision": 1 },
    { "kind": "course", "id": "general-b2", "revision": 1 },
    { "kind": "course", "id": "general-c1", "revision": 1 }
  ],
  "requiredCapabilities": ["v2-public-projection", "v1-bridge-rendering", "multiple-choice-v1"],
  "cefrAwarding": "disabled",
  "files": [
    {
      "collection": "courses",
      "path": "public/courses.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "chapters",
      "path": "public/chapters.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "lessons",
      "path": "public/lessons.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "blocks",
      "path": "public/blocks.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "objectives",
      "path": "public/objectives.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "exercises",
      "path": "public/exercises.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "assessments",
      "path": "public/assessments.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "stimuli",
      "path": "public/stimuli.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "transcripts",
      "path": "public/transcripts.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "assets",
      "path": "public/assets.json",
      "visibility": "public",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "grading",
      "path": "private/grading.json",
      "visibility": "private",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "rubrics",
      "path": "private/rubrics.json",
      "visibility": "private",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "transcripts",
      "path": "private/transcripts.json",
      "visibility": "private",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "compatibility",
      "path": "compatibility.json",
      "visibility": "internal",
      "sha256": null,
      "byteLength": null
    },
    {
      "collection": "media",
      "path": "media/a1-introductions.wav",
      "visibility": "public",
      "sha256": "34d7188808da4e4e8c60e0957312c35c4867173cd8db3c653c8b6fd07b6021c2",
      "byteLength": 272622
    }
  ],
  "legacyLocaleExceptions": [],
  "editorialApprovals": []
}
```

Each public/private JSON entity collection is an array; `grading.json` is an object containing `exerciseRules` and `assessmentPolicies`, and `compatibility.json` is a mapping array. Media entries are binary files. File uniqueness is by path; transcripts can have public and private collections but their entity IDs remain globally unique. Media files are listed in asset records and included in the sealed file inventory. Final editorial approvals identify reviewed entity revisions, reviewer and time; authoring drafts can have none, while publication requires approved translations, coverage and grading.

### Public objective and original question example

The objective statement and criterion reuse the original grammar lesson objective. `a1-c1-be-objective-1` is a new metadata ID; the original question/option IDs and English prompt are unchanged. The extra Burmese instruction below is proposed teaching copy requiring review.

```json
{
  "kind": "objective",
  "id": "a1-c1-be-objective-1",
  "revision": 1,
  "statement": {
    "en": "Choose am, is, or are for the correct subject.",
    "my": "ကတ္တားနှင့်ကိုက်ညီသော am၊ is သို့မဟုတ် are ကို ရွေးနိုင်မည်။"
  },
  "action": "recognize",
  "tags": { "areas": ["grammar"], "coreSkills": [] },
  "successCriterion": {
    "en": "Choose am, is, or are for the correct subject.",
    "my": "ကတ္တားနှင့်ကိုက်ညီသော am၊ is သို့မဟုတ် are ကို ရွေးနိုင်မည်။"
  },
  "expectedEvidence": ["recognition"],
  "difficulty": {
    "targetCefr": "A1",
    "band": "introductory",
    "estimateSource": "author",
    "estimatedMinutes": 1
  },
  "descriptorRefs": []
}
```

```json
{
  "kind": "exercise",
  "id": "a1-c1-q1",
  "revision": 1,
  "source": { "schemaVersion": 1, "contentVersion": "1.0.0", "kind": "question", "id": "a1-c1-q1" },
  "type": "multiple_choice",
  "instructions": { "en": "Choose one answer.", "my": "အဖြေတစ်ခုကို ရွေးပါ။" },
  "tags": { "areas": ["grammar"], "coreSkills": [] },
  "difficulty": {
    "targetCefr": "A1",
    "band": "introductory",
    "estimateSource": "author",
    "estimatedMinutes": 1
  },
  "objectiveRefs": [{ "kind": "objective", "id": "a1-c1-be-objective-1", "revision": 1 }],
  "prompt": { "language": "en", "text": "I ___ a student." },
  "selection": "single",
  "options": [
    { "id": "option-1", "text": { "language": "en", "text": "am" } },
    { "id": "option-2", "text": { "language": "en", "text": "is" } },
    { "id": "option-3", "text": { "language": "en", "text": "are" } }
  ]
}
```

### Private paired rule and assessment policy examples

These records belong only in `private/grading.json`. The q1 key and bilingual explanation are copied exactly from v1. The complete bridge must include q2–q5 with keys `option-2`, `option-3`, `option-2`, `option-3` respectively and their original explanations.

```json
{
  "exerciseRules": [
    {
      "exerciseRef": { "kind": "exercise", "id": "a1-c1-q1", "revision": 1 },
      "gradingRevision": 1,
      "graderVersion": "multiple-choice-exact-set-v1",
      "type": "multiple_choice",
      "maxPoints": 1,
      "correctOptionIds": ["option-1"],
      "scoring": "exact_set",
      "explanation": {
        "en": "Use am with I: “I am a student.”",
        "my": "I နှင့် am ကို သုံးရသည်။ “I am a student.” ဟု ပြောပါ။"
      }
    }
  ],
  "assessmentPolicies": [
    {
      "assessmentRef": { "kind": "assessment", "id": "a1-c1-assessment", "revision": 1 },
      "policyRevision": 1,
      "aggregation": "legacy-rounded-percent-v1",
      "requiredItems": [
        { "kind": "exercise", "id": "a1-c1-q1", "revision": 1 },
        { "kind": "exercise", "id": "a1-c1-q2", "revision": 1 },
        { "kind": "exercise", "id": "a1-c1-q3", "revision": 1 },
        { "kind": "exercise", "id": "a1-c1-q4", "revision": 1 },
        { "kind": "exercise", "id": "a1-c1-q5", "revision": 1 }
      ],
      "itemWeights": [
        { "exerciseRef": { "kind": "exercise", "id": "a1-c1-q1", "revision": 1 }, "weight": 1 },
        { "exerciseRef": { "kind": "exercise", "id": "a1-c1-q2", "revision": 1 }, "weight": 1 },
        { "exerciseRef": { "kind": "exercise", "id": "a1-c1-q3", "revision": 1 }, "weight": 1 },
        { "exerciseRef": { "kind": "exercise", "id": "a1-c1-q4", "revision": 1 }, "weight": 1 },
        { "exerciseRef": { "kind": "exercise", "id": "a1-c1-q5", "revision": 1 }, "weight": 1 }
      ],
      "passPercent": 80,
      "requireAllResponses": true,
      "requireAllGrades": true,
      "sectionMinimums": []
    }
  ]
}
```

The assessment definition references `a1-chapter-1`, delivers through `a1-c1-check` / `a1-c1-quiz`, and lists these same five exercise references in a knowledge-check section. Public `passSummary` explains the 80% requirement; its declared coverage contains only the three measured areas described in section 5. The remaining public entity records are deterministically derived from the identity inventory and v1 payloads, with explicitly reviewed new metadata/translations. No anonymous placeholder entity can satisfy a reference at publication.

### Existing audio asset example

```json
{
  "kind": "asset",
  "id": "a1-introductions-audio",
  "revision": 1,
  "language": "en",
  "contentType": "audio/wav",
  "storage": { "type": "package", "path": "media/a1-introductions.wav" },
  "legacyPublicPath": "/audio/a1-introductions.wav",
  "byteLength": 272622,
  "sha256": "34d7188808da4e4e8c60e0957312c35c4867173cd8db3c653c8b6fd07b6021c2",
  "durationMs": 6089,
  "provenance": "Original sample dialogue synthesized locally; confirm reuse rights during editorial review."
}
```

The listening stimulus references this asset and a new transcript entity with the exact existing text: “Hello! My name is Su. I am from Myanmar. I am a student. Nice to meet you!” The bridge uses `transcriptAccess: "always"`, preserving current teaching behavior. The asset values above were measured from the checked-in WAV; verify again at sealing. Future assets additionally require source attribution, reviewed reuse rights, and localized alt text where appropriate. Do not promise an independent listening assessment if its transcript/answers are already public teaching material.

## 7. Compatibility and historical records

Compatibility is a directed, reviewed mapping from a specific legacy origin or v2 revision to a specific target revision. Completion and assessment evidence have separate decisions. Example entry:

```json
{
  "from": {
    "schemaVersion": 1,
    "contentVersion": "1.0.0",
    "kind": "lesson",
    "id": "a1-c1-introductions"
  },
  "to": {
    "contentVersion": "1.1.0",
    "ref": { "kind": "lesson", "id": "a1-c1-introductions", "revision": 1 }
  },
  "completion": "carry_forward",
  "evidence": "none",
  "resume": "same_ids",
  "reason": "Same teaching blocks, objectives and self-reported completion requirement; structural normalization only.",
  "reviewStatus": "pending",
  "approvedBy": null,
  "approvedAt": null
}
```

Only approved mappings can activate. Allowed completion decisions are `carry_forward`, `requires_recompletion` and `archive_only`; allowed evidence decisions are `equivalent`, `not_equivalent` and `none`. Resume decisions are `same_ids`, an explicit block mapping, or `restart_with_notice`. Each entry has source/target semantic fingerprints and review provenance in its sealed form. Schema supports either legacy origins or exact v2 refs, never loose ID-only equivalence.

Carry forward the three existing lesson completions only after checking their original policies against the bridge. For `a1-c1-check`, create a separate mapping from legacy quiz `a1-c1-quiz` to the new assessment: identical five questions, keys, scoring and pass rule permit equivalent **recognition** evidence and an equivalent chapter pass. In-progress attempts are not passes. Adding unrelated A2 material or bilingual presentation does not erase unchanged A1 completion. A changed task, required objective, scoring rule, transcript support or rubric is not automatically equivalent merely because its ID stayed the same.

A completion read model should return `lessonId`, target revision, `status: direct | carried_forward | needs_recompletion | archived`, original source completion/event and timestamp. Preserve the original completed record even when the current revision needs new work. Do not mass-insert fabricated new completion timestamps. Compatibility never changes an original attempt's score or interpretation. Use an audited flattened mapping from retained origins to the target release initially; do not infer transitive equivalence across a chain without approval.

Attempts record the release/contract version, exact exercise/stimulus/asset/grading/rubric/policy revisions and hashes, delivery context/order, selected answers, original public prompt/options, timestamps and assistance used. Server grading snapshots include explanations and released correct answers; private rubric anchors remain private. Learner-readable reviewed feedback and privileged grading audit data must have separate projections. Retain immutable media content and grading definitions for referenced attempts, subject to explicit personal-data deletion rules.

Grades are append-only events: pending human work has nullable score/correctness, not `false` or `0`; an authorized correction appends a superseding grade event with reviewer/reason/time. A trusted read model chooses the effective grade but the earlier event remains auditable. New attempts always get new IDs. History resolves original snapshots even when a release is no longer offered for fresh practice.

## 8. Automated validation and publication

Use a deterministic multi-stage importer, with machine-readable errors containing file, JSON pointer, entity ID, rule code and severity. Proposed commands are `curriculum validate`, `seal`, `diff`, `import --dry-run` and `activate`; these commands do not exist yet.

| Gate                  | Required automated checks                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope and bytes    | Supported schema/contract; valid stable SemVer and ISO timestamps; duplicate-key rejection; safe relative paths; no `..`, absolute paths, symlinks, executable assets or oversized archives; configured file/count/depth/byte limits                                                               |
| Structures            | Strict public/private unions; integer bounds; nonempty localized teaching strings; reviewed legacy exceptions; valid statuses/tracks/levels/difficulty and min/max ranges                                                                                                                          |
| Identity preservation | Compare every v1 course/chapter/lesson/block/question ID and every slug/parent/anchor/option ID with the inventory; no replacement, omission, renamed ID or duplicate definition; reused revision must have matching payload hash                                                                  |
| References and graph  | Exact type/revision resolution; bidirectional parent agreement; unique ordered children; chapter order uniqueness; no orphan playable entities; prerequisite requirement matches target kind; no blocking prerequisite cycles/self-links; planned courses have no playable chapters                |
| Private answers       | One type-matching grader per atomic item; no dangling/extra rules; key membership/cardinality; exhaustive matching/blank keys; valid token permutations; unambiguous normalized variants; rubric criteria/ranges and score maximums coherent                                                       |
| Assessments           | Declared delivery exists; leaf membership unique after expansion; objective/area correspondence; positive weights and stable denominator; pass policy valid; group/leaf scores not double-counted; pending work cannot pass                                                                        |
| Skill coverage        | Derive teaching and assessable coverage from real entities/stimuli/response modes, not tags alone. Compare with a reviewed per-level objective/coverage matrix. Reject `complete` courses lacking required coverage, production tasks or approved translations. Explicitly report unassessed areas |
| Media/transcripts     | Package file exists; bytes/hash/MIME/decoded duration match; allowed format; transcript language and any timed segments are valid/in bounds; reading/listening group references correct stimulus type; private transcript visibility cannot leak through public projection                         |
| Public boundary       | Public schema rejects grading keys/rubrics/private model answers; allowlisted output excludes private collections/manifest hashes; inspect generated browser payloads, bundles and source maps; gated feedback/transcripts enforce attempt/owner state                                             |
| Compatibility         | Actual deployed baseline hash/version; source and target exist; sealed fingerprints and independent completion/evidence decisions; approval present; no equivalent evidence for changed constructs; reset generation respected                                                                     |
| Activation            | Runtime declares support for every required renderer/grader/upload capability; public artifact and private catalog hashes correspond to the same release; all referenced assets are ready; no partial activation                                                                                   |

For a course labelled complete, the coverage matrix must span all four core skills and grammar/vocabulary through appropriate teaching and assessed objectives. Chapter matrices can intentionally cover subsets. Writing/speaking production cannot be satisfied by choice questions or tags. Minimum distinct-item/context counts come from an approved syllabus policy, not invented CEFR thresholds. An automated count detects omissions; bilingual/pedagogical review establishes content quality and whether tasks actually measure the declared objectives.

Sealing uses one documented serializer (sorted object keys, preserved array order/Unicode values, UTF-8 and LF) and hashes exact output bytes; it does not silently rewrite text or normalize accepted answers. Store grading and public hashes separately in the internal manifest. The importer verifies those bytes before using them. Seal only after editorial approval; published timestamps/approvals cannot be edited later. Record the sealed manifest digest in the release registry rather than self-hashing a manifest containing its own digest.

Hashes establish byte integrity, not publishing authority. The importer accepts only an authenticated administrator/CI publication workflow and verifies approval provenance against the trusted review registry or approved artifact record. Arbitrary `approvedBy` strings inside an uploaded package cannot authorize publication. The bounded serializer must reject invalid JSON number values and duplicate keys; timestamps use UTC with an explicit offset, and stable SemVer components cannot have leading zeros. Metadata, IDs, arrays, text, media and upload sizes all have documented finite limits in the eventual schema; maximums are shared by authoring, server validation and database constraints.

Import flow: validate draft → review content/compatibility → seal → generate public projection → validate projection → dry-run changes → stage immutable entities/private rules/assets → verify ready artifacts → atomically switch the active release pointer. Keep old artifacts addressable. Upload media before database activation, using content-addressed immutable keys; orphaned staging assets can be cleaned after failure. A publish request with the same release/hash is a no-op; a different hash under that version is a conflict. Concurrent publishers use a lock/expected-parent check. Rollback switches the pointer back without deleting any later attempts.

Do not rewrite `20261011000200_curriculum_v1.sql` or reuse the current generator to change an applied seed. A future runtime resolver reads the active public manifest, then fetches immutable release-specific entities. Routes retain stable IDs/slugs; rendered pages and submission envelopes pin the displayed release. Compiled static v1 module imports cannot provide an atomic runtime release switch without this reader change. Content publication becomes an authorized importer action; database schema changes remain forward migrations. Imports are unavailable to learner roles. Private definitions use inaccessible schemas/RPC boundaries; published public entities can be read without exposing private grading.

## 9. Supabase persistence evolution and v1 migration

Proposed additive storage responsibilities, to be finalized before implementation:

| Proposed storage                                     | Responsibility                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `curriculum_releases`, `curriculum_release_entities` | Sealed releases, lifecycle/active pointer and exact included revisions                                 |
| `curriculum_entity_revisions`, route registry        | Immutable public typed payloads and stable IDs/slugs/aliases                                           |
| Private grading/rubric revision tables               | Exact private keys, explanations, rubric anchors and assessment policies; no learner SELECT grants     |
| Compatibility registry                               | Reviewed immutable mappings/fingerprints/approvals                                                     |
| New typed attempt/response tables                    | Pinned release/delivery/exercise and type-specific validated answer JSON; composite owner foreign keys |
| Grade event table                                    | Append-only automatic/manual results and supersession audit                                            |
| Completion events/read model                         | Direct or carried completion with original provenance and current user generation                      |
| Private submission-asset registry                    | Upload owner/attempt binding, checksum, processing state, retention and private storage locator        |

Retain the existing MCQ tables and their immutable triggers initially; do not widen them by filling fake option/correctness fields for recordings or essays. A unified history reader can combine legacy records with new typed records. New personal tables keep owner RLS, revoked direct browser mutations, server validation and tightly scoped owner-derived RPCs. Future reviewer access requires explicit scoped authorization and audit; knowing a learner ID is insufficient. Never expose a service-role key to the browser.

Migration sequence:

1. **Capture baseline and backup.** Verify the deployed v1 content/catalog against the inspected source, record counts/IDs/hashes for progress, attempts, responses, reviews and profiles, and take a verified backup/export. Resolve mismatches before activation. This proposal does not execute a backup or migration.
2. **Add registries and v2 readers alongside v1.** Preserve migrations 001–003, catalog rows, user IDs and original history. Register legacy origins without replacing their payloads. Keep historical v1 grading/media addressable; disabled fresh practice is distinct from readable history and resumable existing attempts.
3. **Convert and review the bridge package.** Preserve all inventory IDs/slugs/parents/order and original response keys/explanations. Extract q1–q5 as exercise entities, add the explicit assessment wrapper and typed objectives/assets. Derive v1 `question.skill` as an area label; never turn grammar into a fifth core skill or q5 into production evidence. Keep original self-reported completion and quiz pass policies. Do not add required prerequisites to previously open lessons. Reject a gate requiring completion of the delivery lesson when that lesson itself requires the gated assessment to pass.
4. **Approve compatibility.** Compare meaning and grading, not just JSON formatting. Persist explicit provenance mappings for compatible completions, recognition evidence and resume anchors. A pending approval blocks activation. Any expanded assessment keeps earlier completion/history visible while identifying its new evidence requirements separately.
5. **Support pinned submissions.** Today's `canonical.ts` rejects non-current content; implementation must resolve the attempt's release from a multi-version registry instead. Continue accepting valid existing v1 outbox payloads through their v1 parser and original RPC/grader, under the current user-generation guard. Do not silently convert pending answers to new questions/keys, force a new attempt, or discard them on release activation.
6. **Activate after staging tests.** Deploy compatible readers/renderers first, then activate matching public/private artifacts. Resolve profile lesson/block IDs through preserved routes or explicit mappings; keep their original saved version/provenance until actual new activity. Adding A2 cannot blank A1 progress. Cache URLs include immutable release hashes; runtime verifies the displayed release when submitting.
7. **Verify and retain rollback.** Compare original counts and snapshot hashes, exercise two-user isolation and cross-device resume/queued recovery, inspect coverage summaries, and test activation rollback with newer attempts present. Rollback must keep their release reader/assets available. Retain legacy support while referenced attempts/drafts remain; any retirement deadline requires an explicit user-visible recovery policy.

**Reset interaction:** migration 003's profile `learning_generation` is independent of curriculum versions. Imports never reset/increment it. V2 submissions/completions/uploads/review updates must use the same owner lock and generation guard. Reset must also delete new personal attempt/response/grade/upload/completion records and invalidate carried-completion projections; otherwise old provenance could recreate reset progress. Link derived events to their original source with deletion propagation and generation filtering. Private reset receipts remain idempotent; a delayed retry must not delete post-reset work. Media deletion can be queued, but access must be revoked immediately and cleanup retried visibly in operational records.

## 10. Acceptance tests and review decisions

Before implementation is considered ready, add these meaningful fixtures/tests:

- A v1→v2 bridge retains every listed ID/slug/option, all three completion behaviors, old scores/explanations/timestamps, resume anchors and original history row hashes. Adding an A2 chapter carries unchanged A1 completion without creating new completion dates.
- Each of the eight exercise types accepts valid payloads and rejects foreign IDs, mismatched variants, malformed answers, invalid media and forged scores/owners. Comprehension groups do not double-count leaves; production remains pending until authorized grading.
- Adversarial imports reject missing/duplicate references, unsafe paths, mismatched keys/hashes/MIME, unsupported types, cyclic prerequisites, leaked keys/rubrics/transcripts, fake Burmese fields and falsely declared complete skill coverage.
- Same-hash import/replayed response is idempotent; changed bytes under a release/revision conflict. Mid-import failure and concurrent activation leave one coherent active release and no partial publication.
- Legacy in-progress attempts and queued answers finish using original keys after activation. New attempts use current pinned definitions; historical results never change when a new key/rubric is published.
- Changed assessment policy requires new evidence without rewriting old completion. Unassessed skills remain unassessed; repeated MCQs never award a CEFR level or create extra distinct evidence.
- Two-user RLS/RPC/upload isolation, authorized reviewer boundaries, reset across both legacy/v2 records, stale-generation rejection, lost-ack retry and cross-device restoration are exercised against PostgreSQL and API/UI boundaries.
- Rollback retains readable and resumable newer-release history; private-grade/public-feedback projections and supported transcript accommodations remain reproducible.

Recommended review outcome: approve immutable full-snapshot packages, the exact-ref entity model, additive legacy migration, explicit assessment wrappers, private manual rubrics and disabled CEFR awarding. Before coding, confirm the bilingual editorial/coverage policy, the human-review operating model for production submissions, and upload retention requirements. These are implementation decisions within the proposed contract, not reasons to reinterpret current learner records. No complete A1–C1 content, importer, new renderer or database migration is delivered by this design document.
