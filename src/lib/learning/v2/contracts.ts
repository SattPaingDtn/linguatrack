import { z } from "zod";
import { legacyExportSchema } from "@/lib/curriculum/v2/history";
import { hashSchema, idSchema, reference, versionSchema } from "@/lib/curriculum/v2/common";
import { responseSchema } from "@/lib/curriculum/v2/submissions";
const time = z.iso.datetime({ offset: true });
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const generation = z.number().int().nonnegative().max(2147483647);
const owned = { user_id: z.uuid(), generation };
const pinned = { ...owned, release_hash: hashSchema };
const record = { ...pinned, id: z.uuid(), created_at: time };
const lesson = { lesson_id: idSchema, lesson_revision: z.number().int().positive() };
export const v2AttemptSchema = z
  .object({
    ...record,
    ...lesson,
    content_version: versionSchema,
    delivery_kind: z.enum(["block", "assessment"]),
    delivery_id: idSchema,
    delivery_revision: z.number().int().positive(),
    mode: z.enum(["practice", "assessment"]),
    required_exercises: z.array(reference("exercise")).min(1).max(1000),
    runtime_version: z.string().min(1).max(120),
  })
  .strict();
export const v2ResponseSchema = z
  .object({
    ...record,
    attempt_id: z.uuid(),
    exercise_id: idSchema,
    exercise_revision: z.number().int().positive(),
    request_hash: hashSchema,
    response: responseSchema,
    prompt_snapshot: z.string().min(1).max(20000),
    options_snapshot: z.array(z.object({ id: idSchema, text: z.string().min(1) }).strict()).max(12),
    evidence_construct: z.enum([
      "recognition",
      "reading_comprehension",
      "listening_comprehension",
      "writing_production",
      "speaking_production",
    ]),
    assistance: z.array(z.string().max(120)).max(20),
  })
  .strict();
export const v2GradeSchema = z
  .object({
    ...record,
    response_id: z.uuid(),
    previous_grade_id: z.uuid().nullable(),
    status: z.enum(["graded", "pending_review"]),
    source: z.enum(["automatic", "human"]),
    points: integer.nullable(),
    max_points: z.number().int().positive(),
    is_correct: z.boolean().nullable(),
    feedback: z
      .object({ en: z.string(), my: z.string(), correctAnswer: z.string().optional() })
      .strict(),
  })
  .strict()
  .superRefine((g, context) => {
    if (
      g.status === "pending_review"
        ? g.points !== null || g.is_correct !== null
        : g.points === null || g.points > g.max_points || g.is_correct === null
    )
      context.addIssue({ code: "custom", message: "Invalid grade bounds/state" });
  });
export const v2ResultSchema = z
  .object({
    ...record,
    attempt_id: z.uuid(),
    previous_result_id: z.uuid().nullable(),
    points: integer,
    max_points: z.number().int().positive(),
    correct: integer,
    total: z.number().int().positive(),
    percentage: z.number().int().min(0).max(100),
    passed: z.boolean().nullable(),
    policy_revision: z.number().int().positive().nullable(),
    policy_hash: hashSchema.nullable(),
    runtime_version: z.string(),
  })
  .strict()
  .refine((r) => r.points <= r.max_points && r.correct <= r.total, "Invalid result bounds");
export const v2CompletionSchema = z
  .object({
    ...record,
    ...lesson,
    source: z.enum(["self_reported", "assessment_pass"]),
    result_id: z.uuid().nullable(),
  })
  .strict();
export const v2MistakeSchema = z
  .object({ ...record, response_id: z.uuid(), grade_id: z.uuid() })
  .strict();
export const v2ReviewSchema = z
  .object({ ...record, mistake_id: z.uuid(), action: z.enum(["reviewed", "retry_planned"]) })
  .strict();
export const v2ResumeSchema = z
  .object({
    ...pinned,
    ...lesson,
    block_id: idSchema.nullable(),
    block_revision: z.number().int().positive().nullable(),
    step: z.enum(["learn", "practice", "review"]),
    exercise_id: idSchema.nullable(),
    exercise_revision: z.number().int().positive().nullable(),
    session_id: z.uuid(),
    sequence: integer,
    navigation_order: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    accepted_at: time,
  })
  .strict();
export const v2StudySessionSchema = z
  .object({
    ...owned,
    id: z.uuid(),
    started_at: time,
    last_seen_at: time,
    active_seconds: integer,
    last_sequence: integer,
  })
  .strict();
const navigationSchema = z
  .object({
    event_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    schema_version: z.union([z.literal(1), z.literal(2)]),
    content_version: versionSchema,
    release_hash: hashSchema.nullable(),
    lesson_id: idSchema,
    lesson_revision: z.number().int().positive().nullable(),
    block_id: idSchema.nullable(),
    block_revision: z.number().int().positive().nullable(),
    step: z.enum(["learn", "practice", "review"]).nullable(),
    exercise_id: idSchema.nullable(),
    exercise_revision: z.number().int().positive().nullable(),
    source: z.enum(["legacy_baseline", "v1_position_change", "v2_navigation"]),
    accepted_at: time,
  })
  .strict();
export const combinedHistorySchema = z
  .object({
    exportVersion: z.literal(2),
    complete: z.literal(true),
    exportedAt: time,
    userId: z.uuid(),
    generation,
    legacy: legacyExportSchema,
    v2: z
      .object({
        attempts: z.array(v2AttemptSchema),
        responses: z.array(v2ResponseSchema),
        grades: z.array(v2GradeSchema),
        attempt_results: z.array(v2ResultSchema),
        completion_events: z.array(v2CompletionSchema),
        mistakes: z.array(v2MistakeSchema),
        review_events: z.array(v2ReviewSchema),
        resume: z.array(v2ResumeSchema).max(1),
        study_sessions: z.array(v2StudySessionSchema),
      })
      .strict(),
    resume: navigationSchema.nullable(),
  })
  .strict()
  .superRefine((data, context) => {
    const legacy = data.legacy;
    if (
      legacy.userId !== data.userId ||
      (legacy.profile &&
        (legacy.profile.id !== data.userId ||
          legacy.profile.learning_generation !== data.generation)) ||
      [...legacy.lessonProgress, ...legacy.mistakeReviews, ...legacy.studySessions].some(
        (r) => r.user_id !== data.userId,
      ) ||
      Object.values(data.v2)
        .flat()
        .some((r) => r.user_id !== data.userId || r.generation !== data.generation)
    )
      context.addIssue({ code: "custom", message: "History owner/generation mismatch" });
    const attempts = new Map(data.v2.attempts.map((a) => [a.id, a]));
    const responses = new Map(data.v2.responses.map((r) => [r.id, r]));
    const grades = new Map(data.v2.grades.map((g) => [g.id, g]));
    const results = new Map(data.v2.attempt_results.map((r) => [r.id, r]));
    const mistakes = new Map(data.v2.mistakes.map((m) => [m.id, m]));
    if (
      data.v2.responses.some((r) => attempts.get(r.attempt_id)?.release_hash !== r.release_hash) ||
      data.v2.grades.some(
        (g) =>
          responses.get(g.response_id)?.release_hash !== g.release_hash ||
          (g.previous_grade_id && grades.get(g.previous_grade_id)?.response_id !== g.response_id),
      )
    )
      context.addIssue({ code: "custom", message: "Incomplete or mismatched history references" });
    if (
      data.v2.attempt_results.some(
        (r) =>
          attempts.get(r.attempt_id)?.release_hash !== r.release_hash ||
          (r.previous_result_id && results.get(r.previous_result_id)?.attempt_id !== r.attempt_id),
      ) ||
      data.v2.completion_events.some((c) =>
        c.source === "self_reported"
          ? c.result_id !== null
          : c.result_id === null ||
            results.get(c.result_id)?.passed !== true ||
            results.get(c.result_id)?.release_hash !== c.release_hash,
      ) ||
      data.v2.mistakes.some(
        (m) =>
          grades.get(m.grade_id)?.response_id !== m.response_id ||
          grades.get(m.grade_id)?.is_correct !== false,
      ) ||
      data.v2.review_events.some((r) => mistakes.get(r.mistake_id)?.release_hash !== r.release_hash)
    )
      context.addIssue({
        code: "custom",
        message: "Incomplete completion/result/review provenance",
      });
    if (
      data.resume &&
      (data.resume.schema_version === 1
        ? data.resume.release_hash !== null || data.resume.lesson_revision !== null
        : data.resume.release_hash === null || data.resume.lesson_revision === null)
    )
      context.addIssue({ code: "custom", message: "Invalid versioned resume identity" });
  });
export type CombinedHistory = z.infer<typeof combinedHistorySchema>;
