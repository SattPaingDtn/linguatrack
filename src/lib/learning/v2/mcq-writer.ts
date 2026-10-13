import "server-only";
import { z } from "zod";
import { ApiError } from "../server";
import { exerciseSchema } from "@/lib/curriculum/v2/public";
import { gradingRuleSchema } from "@/lib/curriculum/v2/private";
import { canonicalJson, sha256 } from "@/lib/curriculum/v2/json";
import {
  mcqSubmissionSchema,
  mcqReceiptSchema,
  mcqFeedbackSchema,
  type McqSubmission,
} from "./mcq-contracts";
export interface McqTransaction {
  query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}
export function gradePinnedMcq(questionRaw: unknown, ruleRaw: unknown, input: McqSubmission) {
  const question = exerciseSchema.parse(questionRaw),
    rule = gradingRuleSchema.parse(ruleRaw);
  if (
    question.type !== "multiple_choice" ||
    rule.type !== "multiple_choice" ||
    rule.graderVersion !== "multiple-choice-exact-set-v1" ||
    rule.scoring !== "exact_set" ||
    question.id !== input.exercise.id ||
    question.revision !== input.exercise.revision ||
    rule.exerciseRef.id !== question.id ||
    rule.exerciseRef.revision !== question.revision
  )
    throw new ApiError("The pinned MCQ grader is unavailable.", 409);
  const selected = input.response.optionIds;
  if (
    new Set(selected).size !== selected.length ||
    (question.selection === "single" && selected.length !== 1) ||
    selected.some((id) => !question.options.some((o) => o.id === id))
  )
    throw new ApiError("Choose valid options for this question.");
  const isCorrect =
    selected.length === rule.correctOptionIds.length &&
    selected.every((id) => rule.correctOptionIds.includes(id));
  return mcqFeedbackSchema.parse({
    points: isCorrect ? rule.maxPoints : 0,
    maxPoints: rule.maxPoints,
    isCorrect,
    explanation: rule.explanation,
    correctAnswer: question.options
      .filter((o) => rule.correctOptionIds.includes(o.id))
      .map((o) => o.text.text)
      .join("; "),
  });
}
export async function saveMcqInTransaction(
  db: McqTransaction,
  projectRef: string,
  ownerId: string,
  raw: unknown,
) {
  const input = mcqSubmissionSchema.parse(raw);
  const requestHash = sha256(
    canonicalJson({
      algorithm: "owner-pinned-mcq-request-v1",
      projectRef,
      ownerId,
      submission: input,
    }),
  );
  const params = [projectRef, ownerId, JSON.stringify(input), requestHash];
  const context = (
    await db.query<{ value: unknown }>(
      "select private.staging_mcq_context($1,$2,$3::jsonb,$4) as value",
      params,
    )
  ).rows[0]!.value;
  const receipt = z.object({ receipt: mcqReceiptSchema }).strict().safeParse(context);
  const check = (raw: unknown) => {
    const acknowledgement = mcqReceiptSchema.parse(raw);
    if (
      acknowledgement.ownerId !== ownerId ||
      acknowledgement.projectRef !== projectRef ||
      acknowledgement.requestHash !== requestHash ||
      canonicalJson(acknowledgement.submission) !== canonicalJson(input)
    )
      throw new ApiError("The save acknowledgement did not match this answer. Retry safely.", 503);
    return acknowledgement;
  };
  if (receipt.success) return check(receipt.data.receipt);
  const parsed = z
    .object({
      question: z.unknown(),
      rule: z.unknown(),
      bindingHash: z.string(),
      requiredExercises: z.array(z.unknown()),
    })
    .strict()
    .parse(context);
  const grade = gradePinnedMcq(parsed.question, parsed.rule, input);
  const saved = (
    await db.query<{ value: unknown }>(
      "select private.commit_staging_mcq($1,$2,$3::jsonb,$4,$5::jsonb) as value",
      [...params, JSON.stringify(grade)],
    )
  ).rows[0]!.value;
  return check(saved);
}
