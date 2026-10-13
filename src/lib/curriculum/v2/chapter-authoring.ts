// Offline additive authoring only. No activation, database or runtime imports.
import { z } from "zod";
import { idSchema, hashSchema, ref, type Ref } from "./common";
import { canonicalJson, fail, fingerprint, sha256 } from "./json";
import type { CurriculumPackage, CompatibilityEntry } from "./package";
import { gradingSchema } from "./private";
import { publicCollectionsSchema, type PublicEntity } from "./public";
import type { PrototypeOptions } from "./authoring";
export const chapterMappingSchema = z
  .object({
    sourceFile: z.literal("content-authoring/A1_Chapter_01_Full_Lesson_Pack.md"),
    sourceSha256: hashSchema,
    sourceQuestionCount: z.literal(41),
    lessonAssignments: z.record(
      idSchema,
      z.object({ blockIds: z.array(idSchema), objectiveIds: z.array(idSchema) }).strict(),
    ),
    questions: z
      .array(
        z
          .object({
            sourceId: z.string().regex(/^[VGLRT][1-9][0-9]?$/),
            exerciseId: idSchema,
            lessonId: idSchema,
            awaitingAudio: z.boolean(),
          })
          .strict(),
      )
      .length(41),
    pedagogicalOrder: z.array(idSchema).length(7),
    supplementaryLessonId: z.literal("a1-c1-subject-pronouns"),
  })
  .strict();
export type ChapterMapping = z.infer<typeof chapterMappingSchema>;
// Fail closed if an editor drops a source activity, changes an option/key, or loses localization.
// The Markdown contains a private key table: call this only from offline authoring tools/tests.
export function validateChapterSource(
  markdown: string,
  publicInput: unknown,
  gradingInput: unknown,
  mappingInput: unknown,
) {
  const authored = publicCollectionsSchema.parse(publicInput);
  const grading = gradingSchema.parse(gradingInput);
  const mapping = chapterMappingSchema.parse(mappingInput);
  const questions = [
    ...markdown.matchAll(/\*\*([VGLRT]\d+)\.\*\*\s*([\s\S]*?)(?=\n\n|\n###|\n##|$)/g),
  ];
  const keys = new Map(
    [...markdown.matchAll(/^\| ([VGLRT]\d+) \| ([ABC]) \|/gm)].map((m) => [m[1]!, m[2]!]),
  );
  if (
    questions.length !== 41 ||
    keys.size !== 41 ||
    new Set(mapping.questions.map((q) => q.sourceId)).size !== 41 ||
    new Set(mapping.questions.map((q) => q.exerciseId)).size !== 41
  )
    fail("source-inventory", "authoring", "Require all 41 distinct source questions and keys");
  for (const match of questions) {
    const code = match[1]!;
    const mapped = mapping.questions.find((q) => q.sourceId === code);
    if (!mapped || mapped.awaitingAudio !== code.startsWith("L"))
      fail("source-inventory", code, "Question mapping or audio gate missing");
    const exercise = authored.exercises.find((e) => e.id === mapped.exerciseId);
    const rule = grading.exerciseRules.find((r) => r.exerciseRef.id === mapped.exerciseId);
    const prose = match[2]!.replaceAll("`", "").replaceAll("\n", " ").trim();
    const [prompt, rest] = prose.split(/\s+A\.\s+/);
    const options = rest?.split(/\s*\|?\s+[BC]\.\s+/).map((s) => s.trim().replace(/\s*\|$/, ""));
    if (
      !exercise ||
      exercise.type !== "multiple_choice" ||
      exercise.prompt.text !== prompt ||
      fingerprint(exercise.options.map((o) => o.text.text)) !== fingerprint(options)
    )
      fail("source-question", code, "Preserve the source prompt and ordered options");
    if (
      !rule ||
      rule.type !== "multiple_choice" ||
      rule.correctOptionIds.length !== 1 ||
      rule.correctOptionIds[0] !== exercise.options["ABC".indexOf(keys.get(code) ?? "")]?.id
    )
      fail("source-key", code, "The private rule does not match the original answer key");
    if (!/[\u1000-\u109f]/.test(rule.explanation.my))
      fail("source-translation", code, "Provide a Burmese feedback explanation");
    const assignment = mapping.lessonAssignments[mapped.lessonId];
    if (
      !assignment ||
      !authored.blocks.some(
        (b) =>
          b.lessonRef.id === mapped.lessonId &&
          (b.type === "exercise_set" || b.type === "quiz") &&
          b.exerciseRefs.some((r) => {
            const group = authored.exercises.find((e) => e.id === r.id);
            return (
              r.id === exercise.id ||
              (group?.type === "reading_comprehension" &&
                group.itemRefs.some((c) => c.id === exercise.id))
            );
          }),
      )
    )
      fail("source-assignment", code, "Source question must be reachable from its mapped lesson");
  }
}
function refs(value: unknown, visit: (r: Ref) => void) {
  if (!value || typeof value !== "object") return;
  if (
    !Array.isArray(value) &&
    Object.keys(value).length === 3 &&
    "kind" in value &&
    "id" in value &&
    "revision" in value
  )
    visit(value as Ref);
  for (const child of Object.values(value)) refs(child, visit);
}
const semantic = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(semantic)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([k]) => !["revision", "source"].includes(k))
            .map(([k, v]) => [k, semantic(v)]),
        )
      : value;
export function appendChapterPack(
  source: CurriculumPackage,
  publicInput: unknown,
  gradingInput: unknown,
  mappingInput: unknown,
  options: PrototypeOptions,
): CurriculumPackage {
  if (
    source.manifest.state !== "draft" ||
    source.manifest.contentVersion !== "1.3.0" ||
    options.contentVersion === source.manifest.contentVersion
  )
    fail(
      "chapter-source",
      "manifest",
      "Author only a distinct inactive working copy of validated 1.3.0",
    );
  const addition = publicCollectionsSchema.parse(publicInput),
    grading = gradingSchema.parse(gradingInput),
    mapping = chapterMappingSchema.parse(mappingInput);
  if (
    [
      addition.courses,
      addition.chapters,
      addition.assessments,
      addition.transcripts,
      addition.assets,
      grading.assessmentPolicies,
    ].some((items) => items.length)
  )
    fail(
      "chapter-scope",
      "authoring",
      "Retain all existing courses, chapters, media and assessment policies",
    );
  const oldEntities = Object.values(source.public).flat();
  const oldById = new Map(oldEntities.map((e) => [e.id, e]));
  const candidate = structuredClone(source);
  for (const [collection, values] of Object.entries(addition)) {
    for (const entity of values)
      if (oldById.has(entity.id) || entity.revision !== 1)
        fail(
          "chapter-identity",
          entity.id,
          "Add unique revision-1 entities; never replace existing identities",
        );
    (candidate.public[collection as keyof typeof addition] as PublicEntity[]).push(
      ...structuredClone(values),
    );
  }
  const chapter = candidate.public.chapters.find((c) => c.id === "a1-chapter-1");
  if (!chapter) fail("chapter-source", "a1-chapter-1", "The retained A1 chapter is missing");
  const changed = new Set<string>([chapter.id]);
  for (const [lessonId, assignment] of Object.entries(mapping.lessonAssignments)) {
    const lesson = candidate.public.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.chapterRef.id !== chapter.id)
      fail(
        "chapter-assignment",
        lessonId,
        "Assignments must reference this chapter's retained or new lessons",
      );
    for (const id of assignment.blockIds) {
      const block = addition.blocks.find((b) => b.id === id && b.lessonRef.id === lessonId);
      if (!block) fail("chapter-assignment", id, "A block must belong to its assigned lesson");
      if (!lesson.blockRefs.some((r) => r.id === id)) lesson.blockRefs.push(ref("block", id));
    }
    for (const id of assignment.objectiveIds) {
      if (!addition.objectives.some((o) => o.id === id))
        fail("chapter-objective", id, "Assigned objective missing");
      if (!lesson.objectiveRefs.some((r) => r.id === id))
        lesson.objectiveRefs.push(ref("objective", id));
      if (!chapter.objectiveRefs.some((r) => r.id === id))
        chapter.objectiveRefs.push(ref("objective", id));
    }
    if (oldById.has(lessonId)) changed.add(lessonId);
    else chapter.lessonRefs.push(ref("lesson", lessonId));
  }
  for (const b of addition.blocks)
    if (!mapping.lessonAssignments[b.lessonRef.id]?.blockIds.includes(b.id))
      fail("chapter-assignment", b.id, "Every authored block must be assigned");
  // Reciprocal exact parent/child references require revision propagation to a fixed point.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const e of oldEntities)
      if (!changed.has(e.id))
        refs(e, (r) => {
          if (changed.has(r.id)) {
            changed.add(e.id);
            expanded = true;
          }
        });
  }
  function update(r: Ref) {
    const old = oldById.get(r.id);
    if (old) r.revision = old.revision + (changed.has(old.id) ? 1 : 0);
  }
  for (const e of Object.values(candidate.public).flat()) {
    const old = oldById.get(e.id);
    if (old && changed.has(e.id)) e.revision = old.revision + 1;
    refs(e, update);
  }
  // Original questions and private scoring remain byte-identical: all new keys have new IDs.
  if (grading.exerciseRules.some((r) => oldById.has(r.exerciseRef.id)))
    fail("chapter-grading", "grading", "Never overwrite an existing grading rule");
  candidate.private.grading.exerciseRules.push(...structuredClone(grading.exerciseRules));
  for (const p of candidate.private.grading.assessmentPolicies)
    if (changed.has(p.assessmentRef.id)) {
      p.policyRevision++;
      update(p.assessmentRef);
    }
  candidate.manifest.contentVersion = options.contentVersion;
  candidate.manifest.createdAt = options.createdAt;
  candidate.manifest.basedOn = {
    schemaVersion: 2,
    contentVersion: source.manifest.contentVersion,
    sha256: options.sourceDigest,
  };
  refs(candidate.manifest.courseRefs, update);
  refs(candidate.manifest.legacyLocaleExceptions, update);
  candidate.manifest.editorialApprovals = candidate.manifest.editorialApprovals.filter(
    (a) => !changed.has(a.ref.id),
  );
  for (const e of addition.exercises)
    if (!candidate.manifest.requiredCapabilities.includes(e.type))
      candidate.manifest.requiredCapabilities.push(e.type);
  const newById = new Map(
    Object.values(candidate.public)
      .flat()
      .map((e) => [e.id, e]),
  );
  const classify = (
    old: PublicEntity,
    target: PublicEntity,
  ): Pick<CompatibilityEntry, "completion" | "evidence" | "resume" | "reason"> => {
    const same = fingerprint(semantic(old)) === fingerprint(semantic(target));
    return {
      completion:
        target.kind === "lesson"
          ? same
            ? "carry_forward"
            : "requires_recompletion"
          : "archive_only",
      evidence: target.kind === "exercise" ? (same ? "equivalent" : "not_equivalent") : "none",
      resume: same ? "same_ids" : "restart_with_notice",
      reason: same
        ? "Reference revisions only; original payload and grading retained. Pending independent review."
        : "New teaching/practice appended. Retain historical results unchanged; no automatic completion carry-forward. Pending independent review.",
    };
  };
  for (const m of source.compatibility.filter(
    (m) => m.to.contentVersion === source.manifest.contentVersion,
  )) {
    const old = oldById.get(m.to.ref.id)!,
      target = newById.get(old.id)!;
    candidate.compatibility.push({
      ...structuredClone(m),
      ...classify(old, target),
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      reviewStatus: "pending",
      fingerprints: { source: m.fingerprints.source, target: fingerprint(target) },
    });
  }
  for (const old of oldEntities) {
    const target = newById.get(old.id)!;
    candidate.compatibility.push({
      from: {
        schemaVersion: 2,
        contentVersion: source.manifest.contentVersion,
        ref: ref(old.kind, old.id, old.revision),
      },
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      ...classify(old, target),
      reviewStatus: "pending",
      fingerprints: { source: fingerprint(old), target: fingerprint(target) },
    });
  }
  for (const f of candidate.manifest.files) {
    if (f.collection === "media") continue;
    const payload =
      f.collection === "compatibility"
        ? candidate.compatibility
        : f.visibility === "private"
          ? candidate.private[f.collection as keyof typeof candidate.private]
          : candidate.public[f.collection as keyof typeof candidate.public];
    const bytes = canonicalJson(payload);
    f.sha256 = sha256(bytes);
    f.byteLength = Buffer.byteLength(bytes);
  }
  return candidate;
}
