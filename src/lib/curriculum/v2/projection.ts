import { z } from "zod";
import { cefrSchema, pathSchema, hashSchema, versionSchema, reference } from "./common";
import { publicCollectionsSchema } from "./public";
import type { CurriculumPackage } from "./package";
// A distinct public-manifest contract deliberately has no private/internal inventory or hashes.
export const publicManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal("2.0.0"),
    curriculumId: z.literal("linguatrack-academy"),
    contentVersion: versionSchema,
    state: z.enum(["draft", "sealed"]),
    createdAt: z.iso.datetime(),
    publicOnly: z.literal(true),
    teachingLanguage: z.literal("en"),
    explanationLanguage: z.literal("my"),
    locales: z.tuple([z.literal("en"), z.literal("my")]),
    cefrAwarding: z.literal("disabled"),
    courseRefs: z.array(reference("course")).min(1).max(1000),
    files: z.array(
      z
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
            "media",
          ]),
          path: pathSchema,
          visibility: z.literal("public"),
          sha256: hashSchema.nullable(),
          byteLength: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export function publicProjection(pkg: CurriculumPackage) {
  const m = pkg.manifest;
  const manifest = publicManifestSchema.parse({
    schemaVersion: m.schemaVersion,
    contractVersion: m.contractVersion,
    curriculumId: m.curriculumId,
    contentVersion: m.contentVersion,
    state: m.state,
    createdAt: m.createdAt,
    publicOnly: true,
    teachingLanguage: m.teachingLanguage,
    explanationLanguage: m.explanationLanguage,
    locales: m.locales,
    cefrAwarding: m.cefrAwarding,
    courseRefs: m.courseRefs,
    files: m.files.filter((f) => f.visibility === "public"),
  });
  const p = pkg.public;
  const content = publicCollectionsSchema.parse({
    courses: p.courses,
    chapters: p.chapters,
    lessons: p.lessons,
    blocks: p.blocks,
    objectives: p.objectives,
    exercises: p.exercises,
    assessments: p.assessments,
    stimuli: p.stimuli,
    transcripts: p.transcripts,
    assets: p.assets,
  });
  return { manifest, content };
}
// Target level can inform authoring without implying an awarded CEFR level.
export const targetLevelSchema = cefrSchema;
