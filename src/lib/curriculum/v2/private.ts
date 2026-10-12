// Importer/server tooling only. Never import this module through an application/client barrel.
import { z } from "zod";
import {
  englishSchema,
  entity,
  idSchema,
  localizedSchema,
  percentSchema,
  pointsSchema,
  reference,
  revisionSchema,
  textSchema,
} from "./common";
const base = {
  exerciseRef: reference("exercise"),
  gradingRevision: revisionSchema,
  graderVersion: textSchema,
  maxPoints: pointsSchema,
  explanation: localizedSchema,
};
export const gradingRuleSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("multiple_choice"),
      correctOptionIds: z.array(idSchema).min(1).max(12),
      scoring: z.literal("exact_set"),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("matching"),
      acceptedPairs: z
        .array(z.object({ leftId: idSchema, rightId: idSchema }).strict())
        .min(1)
        .max(50),
      scoring: z.enum(["exact_set", "per_pair"]),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("fill_in_blank"),
      acceptedByBlank: z
        .array(
          z.object({ blankId: idSchema, variants: z.array(textSchema).min(1).max(100) }).strict(),
        )
        .min(1)
        .max(50),
      normalizerVersion: z.literal("en-nfc-trim-ascii-space-casefold-v1"),
      scoring: z.enum(["exact_set", "per_blank"]),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("sentence_ordering"),
      acceptedOrders: z.array(z.array(idSchema).min(2).max(100)).min(1).max(100),
      scoring: z.literal("exact_sequence"),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("writing_submission"),
      method: z.literal("human_rubric"),
      rubricRef: reference("rubric"),
      wordCounterVersion: z.literal("en-apostrophe-hyphen-v1"),
      modelResponse: englishSchema,
      markingNotes: localizedSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("speaking_recording"),
      method: z.literal("human_rubric"),
      rubricRef: reference("rubric"),
      modelResponse: englishSchema,
      markingNotes: localizedSchema,
    })
    .strict(),
]);
export const assessmentPolicySchema = z
  .object({
    assessmentRef: reference("assessment"),
    policyRevision: revisionSchema,
    aggregation: z.enum(["legacy-rounded-percent-v1", "weighted-integer-points-v1"]),
    requiredItems: z.array(reference("exercise")).min(1).max(1000),
    itemWeights: z
      .array(z.object({ exerciseRef: reference("exercise"), weight: pointsSchema }).strict())
      .min(1)
      .max(1000),
    passPercent: percentSchema,
    requireAllResponses: z.literal(true),
    requireAllGrades: z.literal(true),
    sectionMinimums: z
      .array(z.object({ sectionId: idSchema, minimumPercent: percentSchema }).strict())
      .max(100),
  })
  .strict();
export const gradingSchema = z
  .object({
    exerciseRules: z.array(gradingRuleSchema).max(100_000),
    assessmentPolicies: z.array(assessmentPolicySchema).max(100_000),
  })
  .strict();
export const rubricSchema = z
  .object({
    ...entity("rubric"),
    coreSkill: z.enum(["writing", "speaking"]),
    title: localizedSchema,
    criteria: z
      .array(
        z
          .object({
            id: idSchema,
            description: localizedSchema,
            maxPoints: pointsSchema,
            anchors: z
              .array(
                z
                  .object({
                    points: z.number().int().min(0).max(10_000),
                    description: localizedSchema,
                  })
                  .strict(),
              )
              .min(2)
              .max(10_001),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    aggregation: z.literal("sum_integer_points"),
  })
  .strict();
export type GradingRule = z.infer<typeof gradingRuleSchema>;
export type AssessmentPolicy = z.infer<typeof assessmentPolicySchema>;
export type Grading = z.infer<typeof gradingSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
