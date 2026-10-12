import { z } from "zod";
import {
  CONTRACT_VERSION,
  hashSchema,
  idSchema,
  LIMITS,
  originSchema,
  pathSchema,
  reference,
  refSchema,
  textSchema,
  versionSchema,
} from "./common";
import { publicCollectionsSchema, publicEntitySchemas, transcriptSchema } from "./public";
import { legacyExportSchema } from "./history";
import { gradingSchema, rubricSchema } from "./private";
import { submissionSchema } from "./submissions";
export const CAPABILITIES = [
  "legacy-v1-bridge",
  "multiple_choice",
  "matching",
  "fill_in_blank",
  "sentence_ordering",
  "reading_comprehension",
  "listening_comprehension",
  "writing_submission",
  "speaking_recording",
  "package-media",
  "managed-media",
  "human-rubric",
] as const;
export const fileSchema = z
  .object({
    collection: z.enum([
      "courses",
      "chapters",
      "lessons",
      "blocks",
      "objectives",
      "exercises",
      "assessments",
      "stimuli",
      "transcripts",
      "assets",
      "grading",
      "rubrics",
      "compatibility",
      "media",
    ]),
    path: pathSchema,
    visibility: z.enum(["public", "private", "internal"]),
    sha256: hashSchema.nullable(),
    byteLength: z.number().int().nonnegative().max(LIMITS.mediaTotalBytes).nullable(),
  })
  .strict();
export const localeExceptionSchema = z
  .object({
    target: z.object({ ref: refSchema, pointer: z.string().regex(/^\//).max(1000) }).strict(),
    source: originSchema,
    reason: z.literal("untranslated-v1-field"),
    reviewStatus: z.enum(["pending", "approved"]),
  })
  .strict();
const manifestBaseSchema = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(CONTRACT_VERSION),
    curriculumId: z.literal("linguatrack-academy"),
    contentVersion: versionSchema,
    createdAt: z.iso.datetime(),
    basedOn: z
      .object({
        schemaVersion: z.union([z.literal(1), z.literal(2)]),
        contentVersion: versionSchema,
        sha256: hashSchema,
      })
      .strict(),
    locales: z.tuple([z.literal("en"), z.literal("my")]),
    teachingLanguage: z.literal("en"),
    explanationLanguage: z.literal("my"),
    courseRefs: z.array(reference("course")).min(1).max(1000),
    requiredCapabilities: z.array(z.enum(CAPABILITIES)).min(1).max(CAPABILITIES.length),
    cefrAwarding: z.literal("disabled"),
    legacyLocaleExceptions: z.array(localeExceptionSchema).max(LIMITS.entities),
    editorialApprovals: z
      .array(
        z
          .object({
            ref: refSchema,
            reviewer: textSchema,
            reviewedAt: z.iso.datetime(),
            scope: z.enum(["translation", "coverage", "grading"]),
          })
          .strict(),
      )
      .max(LIMITS.entities),
  })
  .strict();
export const manifestSchema = z.discriminatedUnion("state", [
  manifestBaseSchema
    .extend({ state: z.literal("draft"), files: z.array(fileSchema).min(1).max(LIMITS.files) })
    .strict(),
  manifestBaseSchema
    .extend({
      state: z.literal("sealed"),
      files: z
        .array(
          fileSchema
            .extend({ sha256: hashSchema, byteLength: fileSchema.shape.byteLength.unwrap() })
            .strict(),
        )
        .min(1)
        .max(LIMITS.files),
    })
    .strict(),
]);
export const compatibilityEntrySchema = z
  .object({
    from: z.union([
      originSchema,
      z
        .object({ schemaVersion: z.literal(2), contentVersion: versionSchema, ref: refSchema })
        .strict(),
    ]),
    to: z.object({ contentVersion: versionSchema, ref: refSchema }).strict(),
    completion: z.enum(["carry_forward", "requires_recompletion", "archive_only"]),
    evidence: z.enum(["equivalent", "not_equivalent", "none"]),
    resume: z.enum(["same_ids", "restart_with_notice"]),
    reason: textSchema,
    reviewStatus: z.enum(["pending", "approved"]),
    fingerprints: z.object({ source: hashSchema, target: hashSchema }).strict(),
  })
  .strict();
export const compatibilitySchema = z.array(compatibilityEntrySchema).max(LIMITS.entities);
export const packageSchema = z
  .object({
    manifest: manifestSchema,
    public: publicCollectionsSchema,
    private: z
      .object({
        grading: gradingSchema,
        rubrics: z.array(rubricSchema),
        transcripts: z.array(transcriptSchema),
      })
      .strict(),
    compatibility: compatibilitySchema,
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;
export type CurriculumPackage = z.infer<typeof packageSchema>;
export type CompatibilityEntry = z.infer<typeof compatibilityEntrySchema>;
export const jsonSchemas = {
  common: z
    .object({ id: idSchema, version: versionSchema, ref: refSchema, origin: originSchema })
    .strict(),
  manifest: manifestSchema,
  "public-entities": publicCollectionsSchema,
  "private-grading": gradingSchema,
  rubrics: z.array(rubricSchema),
  compatibility: compatibilitySchema,
  package: packageSchema,
  submissions: submissionSchema,
  "legacy-export": legacyExportSchema,
  ...Object.fromEntries(
    Object.entries(publicEntitySchemas).map(([name, schema]) => [name, z.array(schema)]),
  ),
};
