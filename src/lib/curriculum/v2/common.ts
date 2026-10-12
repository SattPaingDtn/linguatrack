import { z } from "zod";

export const CONTRACT_VERSION = "2.0.0";
export const LIMITS = {
  jsonFileBytes: 16 * 1024 * 1024,
  jsonTotalBytes: 128 * 1024 * 1024,
  mediaTotalBytes: 1024 * 1024 * 1024,
  files: 20_000,
  entities: 100_000,
  depth: 32,
  assetBytes: 100 * 1024 * 1024,
} as const;
export const idSchema = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const versionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const revisionSchema = z.number().int().min(1).max(2_147_483_647);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
// Refine emptiness and code-point budgets without trimming or transforming authored bytes.
export const textSchema = z
  .string()
  .min(1)
  .max(40_000)
  .refine(
    (s) => s.trim().length > 0 && [...s].length <= 20_000,
    "Expected nonblank text with at most 20,000 Unicode code points",
  );
export const passageSchema = z
  .string()
  .min(1)
  .max(100_000)
  .refine(
    (s) => s.trim().length > 0 && [...s].length <= 50_000,
    "Expected nonblank passage with at most 50,000 Unicode code points",
  );
export const localizedSchema = z.object({ en: textSchema, my: textSchema }).strict();
export const englishSchema = z.object({ language: z.literal("en"), text: passageSchema }).strict();
export const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1"]);
export const coreSkillSchema = z.enum(["listening", "speaking", "reading", "writing"]);
export const areaSchema = z.enum([
  "listening",
  "speaking",
  "reading",
  "writing",
  "grammar",
  "vocabulary",
]);
export const kindSchema = z.enum([
  "course",
  "chapter",
  "lesson",
  "block",
  "exercise",
  "objective",
  "stimulus",
  "transcript",
  "asset",
  "assessment",
  "rubric",
]);
export type Kind = z.infer<typeof kindSchema>;
export const refSchema = z
  .object({ kind: kindSchema, id: idSchema, revision: revisionSchema })
  .strict();
export function reference<K extends Kind>(kind: K) {
  return z.object({ kind: z.literal(kind), id: idSchema, revision: revisionSchema }).strict();
}
export type Ref<K extends Kind = Kind> = { kind: K; id: string; revision: number };
export function ref<K extends Kind>(kind: K, id: string, revision = 1): Ref<K> {
  return { kind, id, revision };
}
export const originSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: versionSchema,
    kind: z.enum(["course", "chapter", "lesson", "block", "question"]),
    id: idSchema,
    pointer: z
      .string()
      .regex(/^(?:\/(?:[^~\/]|~[01])*)*$/)
      .max(1000)
      .optional(),
  })
  .strict();
export type LegacyOrigin = z.infer<typeof originSchema>;
// Only provenance-verified legacy fields can use this branch; validator requires an exact exception.
export const legacyTextSchema = z
  .object({
    legacy: z.literal(true),
    language: z.enum(["en", "my"]),
    text: textSchema,
    source: originSchema,
  })
  .strict();
export const teachingTextSchema = z.union([localizedSchema, legacyTextSchema]);
export const tagsSchema = z
  .object({ areas: z.array(areaSchema).min(1).max(6), coreSkills: z.array(coreSkillSchema).max(4) })
  .strict();
export const difficultySchema = z
  .object({
    targetCefr: cefrSchema,
    band: z.enum(["introductory", "developing", "consolidating"]),
    estimateSource: z.enum(["author", "pilot"]),
    estimatedMinutes: z.number().positive().max(240),
  })
  .strict();
export const prerequisiteSchema = z.discriminatedUnion("requirement", [
  z
    .object({
      target: reference("lesson"),
      requirement: z.literal("completed"),
      enforcement: z.enum(["advisory", "required"]),
    })
    .strict(),
  z
    .object({
      target: reference("assessment"),
      requirement: z.literal("passed"),
      enforcement: z.enum(["advisory", "required"]),
    })
    .strict(),
]);
export const evidenceSchema = z.enum([
  "recognition",
  "comprehension",
  "written_production",
  "spoken_production",
  "self_practice",
]);
export const coverageSchema = z
  .object({
    area: areaSchema,
    evidenceKind: z.enum([
      "teaching",
      "recognition",
      "comprehension",
      "written_production",
      "spoken_production",
    ]),
    objectiveRefs: z.array(reference("objective")).min(1).max(1000),
    minimumDistinctItems: z.number().int().min(1).max(1000),
  })
  .strict();
export function entity<K extends Kind>(kind: K) {
  return {
    kind: z.literal(kind),
    id: idSchema,
    revision: revisionSchema,
    source: originSchema.optional(),
  };
}
export const pathSchema = z
  .string()
  .max(500)
  .regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*(?:\.[a-zA-Z0-9_-]+)?$/);
export const pointsSchema = z.number().int().min(1).max(10_000);
export const percentSchema = z.number().int().min(0).max(100);
export const recordingMimeSchema = z.enum(["audio/webm", "audio/mp4", "audio/wav", "audio/ogg"]);
