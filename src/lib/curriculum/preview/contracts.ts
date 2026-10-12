// Browser-safe DTOs: imports only public curriculum contracts, never grading rules.
import { z } from "zod";
import { hashSchema, idSchema, localizedSchema, reference } from "../v2/common";
import { blockSchema, exerciseSchema, lessonSchema, objectiveSchema } from "../v2/public";

import { PREVIEW_LESSON_ID, PREVIEW_VERSION } from "./config";
export { PREVIEW_PATH, PREVIEW_VERSION, PREVIEW_LESSON_ID } from "./config";
const previewBlockSchema = z.discriminatedUnion("type", [
  blockSchema.options[0].extend({ title: localizedSchema }), // explanation
  blockSchema.options[1].extend({ title: localizedSchema }), // grammar
  blockSchema.options[6].extend({ title: localizedSchema }), // writing self-practice
  blockSchema.options[8].extend({ title: localizedSchema }), // exercise_set
]);
const previewQuestionSchema = exerciseSchema.options[0].refine(
  (e) => e.selection === "single",
  "Preview supports only single-choice exercises",
);
export type PreviewBlock = z.infer<typeof previewBlockSchema>;
export type PreviewQuestion = z.infer<typeof previewQuestionSchema>;
export const previewLessonSchema = z
  .object({
    contentVersion: z.literal(PREVIEW_VERSION),
    // Fingerprint of public lesson content only; never a private grading digest.
    publicDigest: hashSchema,
    lesson: lessonSchema.extend({ id: z.literal(PREVIEW_LESSON_ID), title: localizedSchema }),
    objectives: z.array(
      objectiveSchema.extend({ statement: localizedSchema, successCriterion: localizedSchema }),
    ),
    blocks: z.array(previewBlockSchema),
    exercises: z.array(previewQuestionSchema),
  })
  .strict();
export type PreviewLesson = z.infer<typeof previewLessonSchema>;
export const previewAnswerSchema = z
  .object({
    contentVersion: z.literal(PREVIEW_VERSION),
    lessonId: z.literal(PREVIEW_LESSON_ID),
    publicDigest: hashSchema,
    exercise: reference("exercise"),
    optionId: idSchema,
  })
  .strict();
export type PreviewAnswer = z.infer<typeof previewAnswerSchema>;
export const previewFeedbackSchema = z
  .object({
    simulated: z.literal(true),
    saved: z.literal(false),
    exercise: reference("exercise"),
    selectedOptionId: idSchema,
    isCorrect: z.boolean(),
    correctAnswer: z.string().min(1),
    explanation: localizedSchema,
  })
  .strict();
export type PreviewFeedback = z.infer<typeof previewFeedbackSchema>;
