// Safe structural contracts. No private grading imports or content in this module.
import { z } from "zod";
import {
  areaSchema,
  cefrSchema,
  coreSkillSchema,
  coverageSchema,
  difficultySchema,
  englishSchema,
  entity,
  evidenceSchema,
  hashSchema,
  idSchema,
  LIMITS,
  localizedSchema,
  passageSchema,
  pathSchema,
  prerequisiteSchema,
  recordingMimeSchema,
  reference,
  tagsSchema,
  teachingTextSchema,
  textSchema,
} from "./common";

export const objectiveSchema = z
  .object({
    ...entity("objective"),
    statement: teachingTextSchema,
    action: z.enum([
      "identify",
      "recognize",
      "match",
      "order",
      "produce",
      "interpret",
      "summarize",
      "argue",
    ]),
    tags: tagsSchema,
    successCriterion: teachingTextSchema,
    expectedEvidence: z.array(evidenceSchema).min(1).max(5),
    difficulty: difficultySchema,
    descriptorRefs: z
      .array(
        z
          .object({ framework: z.literal("CEFR"), edition: textSchema, descriptorId: textSchema })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const courseSchema = z
  .object({
    ...entity("course"),
    slug: idSchema,
    title: teachingTextSchema,
    description: localizedSchema,
    level: cefrSchema,
    track: z.enum(["general-english", "toeic", "it-business-english"]),
    status: z.enum(["available", "planned"]),
    coverageState: z.enum(["partial", "complete"]),
    outcomeRefs: z.array(reference("objective")).min(1).max(1000),
    chapterRefs: z.array(reference("chapter")).max(1000),
    coverageTargets: z.array(coverageSchema).max(1000),
  })
  .strict();
export const chapterSchema = z
  .object({
    ...entity("chapter"),
    courseRef: reference("course"),
    slug: idSchema,
    order: z.number().int().positive().max(10_000),
    title: teachingTextSchema,
    description: localizedSchema,
    objectiveRefs: z.array(reference("objective")).min(1).max(1000),
    prerequisites: z.array(prerequisiteSchema).max(1000),
    lessonRefs: z.array(reference("lesson")).min(1).max(1000),
    assessmentRefs: z.array(reference("assessment")).max(1000),
    coverageTargets: z.array(coverageSchema).max(1000),
  })
  .strict();
export const lessonSchema = z
  .object({
    ...entity("lesson"),
    chapterRef: reference("chapter"),
    slug: idSchema,
    title: teachingTextSchema,
    description: localizedSchema,
    tags: tagsSchema,
    difficulty: difficultySchema,
    objectiveRefs: z.array(reference("objective")).min(1).max(1000),
    prerequisites: z.array(prerequisiteSchema).max(1000),
    blockRefs: z.array(reference("block")).min(1).max(1000),
    completionPolicy: z.discriminatedUnion("type", [
      z.object({ type: z.literal("self_reported") }).strict(),
      z
        .object({ type: z.literal("assessment_pass"), assessmentRef: reference("assessment") })
        .strict(),
    ]),
  })
  .strict();
export const stimulusSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...entity("stimulus"),
      type: z.literal("reading"),
      passage: englishSchema,
      sourceAttribution: textSchema,
    })
    .strict(),
  z
    .object({
      ...entity("stimulus"),
      type: z.literal("listening"),
      audioRef: reference("asset"),
      transcriptRef: reference("transcript"),
      transcriptAccess: z.enum(["always", "after_submission", "reviewer_only"]),
    })
    .strict(),
]);
export const transcriptSchema = z
  .object({
    ...entity("transcript"),
    language: z.literal("en"),
    text: passageSchema,
    segments: z
      .array(
        z
          .object({
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().positive(),
            text: textSchema,
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict();
export const assetSchema = z
  .object({
    ...entity("asset"),
    language: z.enum(["en", "my"]),
    contentType: z.enum([
      "audio/wav",
      "audio/mpeg",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "video/mp4",
      "video/webm",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]),
    storage: z.discriminatedUnion("type", [
      z.object({ type: z.literal("package"), path: pathSchema }).strict(),
      z
        .object({ type: z.literal("managed_object"), storeId: idSchema, objectKey: pathSchema })
        .strict(),
    ]),
    sha256: hashSchema,
    byteLength: z.number().int().positive().max(LIMITS.assetBytes),
    durationMs: z.number().int().positive().max(86_400_000).optional(),
    alt: localizedSchema.optional(),
    legacyPublicPath: z
      .string()
      .regex(/^\/audio\/[a-z0-9-]+\.(wav|mp3|ogg)$/)
      .optional(),
    provenance: textSchema,
  })
  .strict();
const exerciseBase = {
  ...entity("exercise"),
  instructions: localizedSchema,
  tags: tagsSchema,
  difficulty: difficultySchema,
  objectiveRefs: z.array(reference("objective")).min(1).max(1000),
};
const option = z.object({ id: idSchema, text: englishSchema }).strict();
export const exerciseSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...exerciseBase,
      type: z.literal("multiple_choice"),
      prompt: englishSchema,
      selection: z.enum(["single", "multiple"]),
      options: z.array(option).min(2).max(12),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("matching"),
      mode: z.enum(["one_to_one", "many_to_one"]),
      left: z.array(option).min(1).max(50),
      right: z.array(option).min(1).max(50),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("fill_in_blank"),
      segments: z
        .array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("text"), text: textSchema }).strict(),
            z.object({ type: z.literal("blank"), id: idSchema }).strict(),
          ]),
        )
        .min(1)
        .max(101),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("sentence_ordering"),
      tokens: z.array(option).min(2).max(100),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("writing_submission"),
      prompt: localizedSchema,
      limits: z
        .object({
          minWords: z.number().int().min(1).max(5000),
          maxWords: z.number().int().min(1).max(5000),
          maxChars: z.number().int().min(1).max(50_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("speaking_recording"),
      prompt: localizedSchema,
      limits: z
        .object({
          minSeconds: z.number().int().min(1).max(600),
          maxSeconds: z.number().int().min(1).max(600),
          maxBytes: z
            .number()
            .int()
            .positive()
            .max(50 * 1024 * 1024),
          mimeTypes: z.array(recordingMimeSchema).min(1).max(4),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("reading_comprehension"),
      stimulusRef: reference("stimulus"),
      itemRefs: z.array(reference("exercise")).min(1).max(1000),
      assistance: z.enum(["practice_with_support", "independent"]),
    })
    .strict(),
  z
    .object({
      ...exerciseBase,
      type: z.literal("listening_comprehension"),
      stimulusRef: reference("stimulus"),
      itemRefs: z.array(reference("exercise")).min(1).max(1000),
      assistance: z.enum(["practice_with_support", "independent"]),
    })
    .strict(),
]);
const blockBase = { ...entity("block"), lessonRef: reference("lesson"), title: teachingTextSchema };
export const blockSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...blockBase,
      type: z.literal("explanation"),
      body: localizedSchema,
      examples: z.array(englishSchema).max(1000),
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("grammar"),
      rule: localizedSchema,
      examples: z
        .array(
          z
            .object({ pattern: textSchema, example: englishSchema, translation: textSchema })
            .strict(),
        )
        .min(1)
        .max(1000),
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("vocabulary"),
      words: z
        .array(
          z
            .object({
              word: textSchema,
              pronunciation: textSchema,
              meaning: teachingTextSchema,
              example: englishSchema,
            })
            .strict(),
        )
        .min(1)
        .max(1000),
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("reading"),
      stimulusRef: reference("stimulus"),
      explanation: localizedSchema,
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("listening"),
      stimulusRef: reference("stimulus"),
      instruction: localizedSchema,
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("speaking"),
      prompt: localizedSchema,
      modelAnswer: englishSchema,
      checklist: z.array(englishSchema).min(1).max(1000),
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("writing"),
      prompt: localizedSchema,
      modelAnswer: englishSchema,
      minWords: z.number().int().min(1).max(5000),
      maxWords: z.number().int().min(1).max(5000),
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("quiz"),
      exerciseRefs: z.array(reference("exercise")).min(1).max(1000),
      assessmentRef: reference("assessment").optional(),
    })
    .strict(),
  z
    .object({
      ...blockBase,
      type: z.literal("exercise_set"),
      exerciseRefs: z.array(reference("exercise")).min(1).max(1000),
    })
    .strict(),
]);
export const assessmentSchema = z
  .object({
    ...entity("assessment"),
    purpose: z.enum(["chapter_check", "diagnostic"]),
    chapterRef: reference("chapter"),
    title: teachingTextSchema,
    instructions: localizedSchema,
    delivery: z.object({ lessonRef: reference("lesson"), blockRef: reference("block") }).strict(),
    prerequisites: z.array(prerequisiteSchema).max(1000),
    sections: z
      .array(
        z
          .object({
            id: idSchema,
            title: teachingTextSchema,
            exerciseRefs: z.array(reference("exercise")).min(1).max(1000),
            objectiveRefs: z.array(reference("objective")).min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    declaredCoverage: z.array(coverageSchema).max(1000),
    passSummary: localizedSchema,
    feedbackTiming: z.enum(["after_each_response", "after_finalization"]),
  })
  .strict();
export const publicCollectionsSchema = z
  .object({
    courses: z.array(courseSchema),
    chapters: z.array(chapterSchema),
    lessons: z.array(lessonSchema),
    blocks: z.array(blockSchema),
    objectives: z.array(objectiveSchema),
    exercises: z.array(exerciseSchema),
    assessments: z.array(assessmentSchema),
    stimuli: z.array(stimulusSchema),
    transcripts: z.array(transcriptSchema),
    assets: z.array(assetSchema),
  })
  .strict();
export type PublicCollections = z.infer<typeof publicCollectionsSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type PublicEntity = PublicCollections[keyof PublicCollections][number];
export type Course = z.infer<typeof courseSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type Stimulus = z.infer<typeof stimulusSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Asset = z.infer<typeof assetSchema>;
export const publicEntitySchemas = {
  courses: courseSchema,
  chapters: chapterSchema,
  lessons: lessonSchema,
  blocks: blockSchema,
  objectives: objectiveSchema,
  exercises: exerciseSchema,
  assessments: assessmentSchema,
  stimuli: stimulusSchema,
  transcripts: transcriptSchema,
  assets: assetSchema,
};
// Exported metadata schemas let authoring tools use the same contracts.
export { areaSchema, coreSkillSchema };
