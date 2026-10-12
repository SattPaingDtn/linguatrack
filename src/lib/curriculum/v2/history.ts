// Read-only adapter for the existing authenticated learning_export RPC format.
// This neither authenticates a local file nor authorizes an import/carry-forward event.
import { z } from "zod";
import { learningSnapshotSchema, quizAttemptSchema } from "../../learning/contracts";
import { idSchema, versionSchema } from "./common";
import { fail } from "./json";
const timestamp = z.iso.datetime({ offset: true });
const owner = { user_id: z.uuid() };
export const legacyExportSchema = z
  .object({
    exportVersion: z.literal(1),
    exportedAt: timestamp,
    userId: z.uuid(),
    profile: z
      .object({
        id: z.uuid(),
        last_lesson_id: idSchema.nullable(),
        last_block_id: idSchema.nullable(),
        content_version: versionSchema.nullable(),
        updated_at: timestamp.nullable(),
        created_at: timestamp,
        learning_generation: z.number().int().nonnegative().max(2_147_483_647).optional(),
      })
      .strict()
      .nullable(),
    lessonProgress: z.array(
      z
        .object({
          ...owner,
          content_version: versionSchema,
          lesson_id: idSchema,
          completed_at: timestamp,
          completion_source: z.enum(["quiz", "self_reported"]),
        })
        .strict(),
    ),
    attempts: z.array(quizAttemptSchema),
    mistakeReviews: z.array(
      z
        .object({
          ...owner,
          response_id: z.uuid(),
          reviewed_at: timestamp.nullable(),
          created_at: timestamp,
        })
        .strict(),
    ),
    studySessions: z.array(
      z
        .object({
          ...owner,
          id: z.uuid(),
          started_at: timestamp,
          last_seen_at: timestamp,
          ended_at: timestamp,
          active_seconds: z.number().int().nonnegative(),
          last_sequence: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export function readHistory(raw: unknown, snapshotVersion: string) {
  const exportData = legacyExportSchema.safeParse(raw);
  if (exportData.success) {
    const e = exportData.data;
    if (
      (e.profile && e.profile.id !== e.userId) ||
      [...e.lessonProgress, ...e.mistakeReviews, ...e.studySessions].some(
        (r) => r.user_id !== e.userId,
      )
    )
      fail("history-owner", "history", "Export contains records from another owner");
    return {
      generation: e.profile?.learning_generation ?? 0,
      completions: e.lessonProgress.map((p) => ({
        lessonId: p.lesson_id,
        contentVersion: p.content_version,
        completedAt: p.completed_at,
        source: p.completion_source,
      })),
      attempts: e.attempts,
      resume:
        e.profile?.last_lesson_id && e.profile.content_version
          ? {
              lessonId: e.profile.last_lesson_id,
              blockId: e.profile.last_block_id,
              contentVersion: e.profile.content_version,
            }
          : null,
    };
  }
  const snapshot = learningSnapshotSchema.safeParse(raw);
  if (!snapshot.success)
    fail(
      "history-schema",
      "history",
      "Expected the existing learner export (exportVersion 1) or a LearningSnapshot; malformed files are never imported",
    );
  const s = snapshot.data;
  return {
    generation: s.generation,
    completions: s.completed.map((lessonId) => ({
      lessonId,
      contentVersion: snapshotVersion,
      completedAt: null,
      source: null,
    })),
    attempts: s.attempts,
    resume:
      s.profile.lastLessonId && s.profile.contentVersion
        ? {
            lessonId: s.profile.lastLessonId,
            blockId: s.profile.lastBlockId,
            contentVersion: s.profile.contentVersion,
          }
        : null,
  };
}
