import { z } from "zod";
import { chapterLessonSchema } from "../chapter-preview/contracts";
import { exerciseSchema } from "../v2/public";
import { hashSchema, idSchema, localizedSchema, reference } from "../v2/common";
const version = z.enum(["1.6.0", "1.7.0", "1.8.0"]);
export const manuscriptLessonSchema = chapterLessonSchema.extend({
  contentVersion: version,
  shortResponses: z.array(exerciseSchema.options[2]),
});
export type ManuscriptLesson = z.infer<typeof manuscriptLessonSchema>;
const base = {
  contentVersion: version,
  lessonId: idSchema,
  publicDigest: hashSchema,
  exercise: reference("exercise"),
};
export const manuscriptAnswerSchema = z.union([
  z.object({ ...base, optionId: idSchema }).strict(),
  z
    .object({ ...base, mode: z.literal("self_review"), text: z.string().trim().min(1).max(1000) })
    .strict(),
]);
export const selfReviewFeedbackSchema = z
  .object({
    simulated: z.literal(true),
    saved: z.literal(false),
    selfReviewOnly: z.literal(true),
    exercise: reference("exercise"),
    submittedText: z.string().min(1).max(1000),
    exampleAnswer: z.string().min(1),
    explanation: localizedSchema,
  })
  .strict();
export type SelfReviewFeedback = z.infer<typeof selfReviewFeedbackSchema>;
