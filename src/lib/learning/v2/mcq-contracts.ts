import { z } from "zod";
import {
  hashSchema,
  idSchema,
  localizedSchema,
  reference,
  versionSchema,
} from "@/lib/curriculum/v2/common";
export const mcqSubmissionSchema = z
  .object({
    schemaVersion: z.literal(2),
    releaseHash: hashSchema,
    contentVersion: versionSchema,
    attemptId: z.uuid(),
    responseId: z.uuid(),
    generation: z.number().int().nonnegative().max(2147483647),
    lesson: reference("lesson"),
    delivery: reference("block"),
    exercise: reference("exercise"),
    response: z
      .object({ type: z.literal("multiple_choice"), optionIds: z.array(idSchema).min(1).max(12) })
      .strict(),
  })
  .strict();
export const mcqFeedbackSchema = z
  .object({
    points: z.number().int().nonnegative(),
    maxPoints: z.number().int().positive(),
    isCorrect: z.boolean(),
    explanation: localizedSchema,
    correctAnswer: z.string().min(1),
  })
  .strict()
  .refine((g) => g.points <= g.maxPoints, "Invalid score bounds");
export const mcqReceiptSchema = z
  .object({
    mode: z.literal("persistent"),
    saved: z.literal(true),
    ownerId: z.uuid(),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    requestHash: hashSchema,
    submission: mcqSubmissionSchema,
    responseId: z.uuid(),
    gradeId: z.uuid(),
    resultId: z.uuid().nullable(),
    feedback: mcqFeedbackSchema,
    receivedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((r) => r.responseId === r.submission.responseId, "Receipt response mismatch");
export type McqSubmission = z.infer<typeof mcqSubmissionSchema>;
export type McqReceipt = z.infer<typeof mcqReceiptSchema>;
// Pure stable comparison shared by server/queue. No keys, node crypto or server imports.
export function submissionIdentity(input: McqSubmission) {
  return JSON.stringify(mcqSubmissionSchema.parse(input));
}
