import { z } from "zod";
import { learningSnapshotSchema, quizAttemptSchema, exerciseResponseSchema } from "./contracts";
export const learningStateSchema = z.object({
  mode: z.enum(["preview", "persistent"]),
  configured: z.boolean(),
  user: z.object({ id: z.uuid(), email: z.string() }).nullable(),
  snapshot: learningSnapshotSchema,
});
export const answerResultSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("persistent"), attempt: quizAttemptSchema }),
  z.object({
    mode: z.literal("preview"),
    response: exerciseResponseSchema,
    title: z.string(),
    total: z.number().int().positive(),
    passingPercent: z.number().min(1).max(100),
  }),
]);
export type LearningState = z.infer<typeof learningStateSchema>;
export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(
      error.success
        ? error.data.error
        : "The server could not save or load your learning data. Retry without changing your answer.",
    );
  }
  return schema.parse(data);
}
