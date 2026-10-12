// Structural contract for a later v2 API. No route, upload or grader is activated by these types.
import { z } from "zod";
import { idSchema, passageSchema, reference, versionSchema } from "./common";
export const responseSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("multiple_choice"), optionIds: z.array(idSchema).min(1).max(12) })
    .strict(),
  z
    .object({
      type: z.literal("matching"),
      pairs: z
        .array(z.object({ leftId: idSchema, rightId: idSchema }).strict())
        .min(1)
        .max(50),
    })
    .strict(),
  z
    .object({
      type: z.literal("fill_in_blank"),
      values: z
        .array(z.object({ blankId: idSchema, text: passageSchema }).strict())
        .min(1)
        .max(50),
    })
    .strict(),
  z
    .object({ type: z.literal("sentence_ordering"), tokenIds: z.array(idSchema).min(2).max(100) })
    .strict(),
  z.object({ type: z.literal("writing_submission"), text: passageSchema }).strict(),
  z.object({ type: z.literal("speaking_recording"), submissionAssetId: z.uuid() }).strict(),
]);
export const submissionSchema = z
  .object({
    schemaVersion: z.literal(2),
    contentVersion: versionSchema,
    attemptId: z.uuid(),
    responseId: z.uuid(),
    generation: z.number().int().nonnegative().max(2_147_483_647),
    delivery: z.union([reference("block"), reference("assessment")]),
    exercise: reference("exercise"),
    response: responseSchema,
  })
  .strict();
export type ResponsePayload = z.infer<typeof responseSchema>;
export type Submission = z.infer<typeof submissionSchema>;
