import { z } from "zod";
import { areaSchema } from "@/lib/curriculum/schema";
const contentId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
export const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const answerSubmissionSchema = z
  .object({
    attemptId: z.uuid(),
    contentVersion: versionSchema,
    lessonId: contentId,
    quizId: contentId,
    questionId: contentId,
    optionId: contentId,
  })
  .strict();
export const positionSchema = z
  .object({
    contentVersion: versionSchema,
    lessonId: contentId,
    blockId: contentId.nullable(),
    sessionId: z.uuid(),
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const completionSchema = z
  .object({ contentVersion: versionSchema, lessonId: contentId })
  .strict();
export const exerciseResponseSchema = z.object({
  id: z.uuid(),
  questionId: contentId,
  prompt: z.string(),
  skill: areaSchema,
  options: z.array(z.object({ id: contentId, text: z.string() })),
  selectedOptionId: contentId,
  selectedText: z.string(),
  correctOptionId: contentId,
  correctText: z.string(),
  isCorrect: z.boolean(),
  explanation: z.object({ en: z.string(), my: z.string() }),
  timestamp: z.number(),
});
export const quizAttemptSchema = z.object({
  id: z.uuid(),
  quizId: contentId,
  lessonId: contentId,
  contentVersion: versionSchema,
  title: z.string(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  answered: z.number().int().nonnegative(),
  percentage: z.number().int().min(0).max(100),
  passed: z.boolean(),
  timestamp: z.number(),
  completedAt: z.number().nullable(),
  status: z.enum(["in_progress", "completed"]),
  answers: z.record(z.string(), z.string()),
  responses: z.array(exerciseResponseSchema),
});
export const profileSchema = z.object({
  lastLessonId: contentId.nullable(),
  lastBlockId: contentId.nullable(),
  contentVersion: versionSchema.nullable(),
  updatedAt: z.string().nullable(),
});
export const learningSnapshotSchema = z.object({
  completed: z.array(contentId),
  attempts: z.array(quizAttemptSchema),
  profile: profileSchema,
  mistakes: z.array(z.object({ responseId: z.uuid(), reviewedAt: z.string().nullable() })),
  studySeconds: z.number().nonnegative(),
  studySessionCount: z.number().int().nonnegative(),
});
export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;
export type ExerciseResponse = z.infer<typeof exerciseResponseSchema>;
export type LearningSnapshot = z.infer<typeof learningSnapshotSchema>;
export const emptySnapshot: LearningSnapshot = {
  completed: [],
  attempts: [],
  profile: { lastLessonId: null, lastBlockId: null, contentVersion: null, updatedAt: null },
  mistakes: [],
  studySeconds: 0,
  studySessionCount: 0,
};
