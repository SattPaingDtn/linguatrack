// Local-only content tooling. Never import into the learner/client module graph.
import { z } from "zod";
import { hashSchema, idSchema, ref, type Ref } from "./common";
import { canonicalJson, fail, fingerprint, sha256 } from "./json";
import { publicCollectionsSchema, type PublicEntity } from "./public";
import { gradingSchema } from "./private";
import type { CurriculumPackage } from "./package";
import type { PrototypeOptions } from "./authoring";
const questionMap = z
  .object({
    sourceId: z.string().regex(/^(K(?:[1-9]|1[0-2])|[LR][12]\.[1-3])$/),
    exerciseId: idSchema,
    lessonId: idSchema,
    audioStatus: z.enum(["audio_pending", "not_applicable"]),
  })
  .strict();
export const batchMetadataSchema = z
  .object({
    basedOnVersion: z.literal("1.4.0"),
    chapter1Reuse: z
      .object({ chapterId: z.literal("a1-chapter-1"), lessonIds: z.array(idSchema).length(8) })
      .strict(),
    chapters: z
      .array(
        z
          .object({
            number: z.union([z.literal(2), z.literal(3)]),
            chapterId: idSchema,
            slug: idSchema,
            sourceFile: z
              .string()
              .regex(/^content-authoring\/A1_Chapter_0[23]_Full_Lesson_Pack\.md$/),
            sourceSha256: hashSchema,
            lessonIds: z.array(idSchema).length(7),
            audioStatus: z.literal("audio_pending"),
            questions: z.array(questionMap).length(22),
          })
          .strict(),
      )
      .length(2),
    clarifications: z
      .array(
        z
          .object({
            chapter: z.union([z.literal(2), z.literal(3)]),
            sourceId: z.enum(["K4", "K10"]),
            field: z.literal("prompt"),
            sourceText: z.string().min(1),
            authoredText: z.string().min(1),
            reason: z.string().min(1),
          })
          .strict(),
      )
      .length(2),
  })
  .strict();
export type BatchMetadata = z.infer<typeof batchMetadataSchema>;
export type SourceQuestion = {
  sourceId: string;
  prompt: string;
  options: string[];
  key: string;
  explanation: string;
};
// Intentionally supports the supplied pack format only. It fails on missing/duplicate activities.
// This parses private keys, so callers must never serialize its output into browser props.
export function parseExpansionQuestions(markdown: string): SourceQuestion[] {
  const parts = markdown.split("### Answer key — TEACHER / PRIVATE ONLY");
  if (parts.length !== 2)
    fail("source-format", "answer-key", "Require exactly one private teacher section");
  const [publicText, privateText] = parts as [string, string];
  const lessonSections = [...publicText.matchAll(/^## Lesson ([1-7]) — /gm)];
  if (lessonSections.length !== 7 || new Set(lessonSections.map((m) => m[1])).size !== 7)
    fail("source-lessons", "source", "Require seven distinct lesson sections");
  const keyRows = [...privateText.matchAll(/^(\d+)\. ([ABC]) — (.+)$/gm)].map((m) => ({
    id: `K${m[1]}`,
    key: m[2]!,
    explanation: m[3]!,
  }));
  keyRows.push(
    ...[...privateText.matchAll(/^- ([LR][12]\.[123]): ([ABC]) — (.+)$/gm)].map((m) => ({
      id: m[1]!,
      key: m[2]!,
      explanation: m[3]!,
    })),
  );
  if (keyRows.length !== 22 || new Set(keyRows.map((k) => k.id)).size !== 22)
    fail(
      "source-keys",
      "source",
      "Require 22 distinct private keys (12 knowledge, 5 reading, 5 audio-pending)",
    );
  const keyMap = new Map(keyRows.map((k) => [k.id, k]));
  const output: SourceQuestion[] = [];
  function add(id: string, prompt: string, options: string[]) {
    const rule = keyMap.get(id);
    if (!rule || options.length !== 3 || output.some((q) => q.sourceId === id))
      fail("source-question", id, "Missing key, duplicate question or incomplete options");
    output.push({ sourceId: id, prompt, options, key: rule.key, explanation: rule.explanation });
  }
  for (const m of publicText.matchAll(
    /^(\d+)\. (.+)\n\s+- A\) (.+)\n\s+- B\) (.+)\n\s+- C\) (.+)/gm,
  ))
    add(`K${m[1]}`, m[2]!, [m[3]!, m[4]!, m[5]!]);
  for (const [prefix, kind] of [
    ["L", "Dialogue"],
    ["R", "Passage"],
  ] as const) {
    const sectionNumber = prefix === "L" ? 3 : 5;
    const section = publicText
      .split(new RegExp(`^## Lesson ${sectionNumber} — .+\\n`, "m"))[1]
      ?.split(/^## Lesson [1-7] — /m)[0];
    if (!section) fail("source-groups", kind, "The expected lesson section is missing");
    const groups = section.split(new RegExp(`^### ${kind} (\\d): (.+)\\n`, "m"));
    if (groups.length !== 7) fail("source-groups", kind, "Require two script/passage groups");
    for (let i = 1; i < groups.length; i += 3)
      for (const m of groups[i + 2]!.matchAll(
        /^(\d+)\. (.*?)\s+A\) (.*?)\s+B\) (.*?)\s+C\) (.+)$/gm,
      ))
        add(`${prefix}${groups[i]}.${m[1]}`, m[2]!, [m[3]!, m[4]!, m[5]!]);
  }
  if (
    output.length !== 22 ||
    output.filter((q) => q.sourceId.startsWith("K")).length !== 12 ||
    output.filter((q) => q.sourceId.startsWith("L")).length !== 5 ||
    output.filter((q) => q.sourceId.startsWith("R")).length !== 5
  )
    fail("source-inventory", "source", "Do not drop or add numbered source questions");
  return output;
}
const allowedClarifications = new Map([
  [
    "2:K4",
    {
      source: "That is Ko’s book. It is ___ book.",
      authored: "That is Ko’s book. Ko uses he/him pronouns. It is ___ book.",
    },
  ],
  [
    "3:K10",
    {
      source: "Choose the correct sentence.",
      authored: "Choose the sentence with the usual neutral placement of usually after be.",
    },
  ],
]);
export function validateBatchSources(
  sources: ReadonlyMap<number, string>,
  publicInput: unknown,
  gradingInput: unknown,
  metadataInput: unknown,
) {
  const addition = publicCollectionsSchema.parse(publicInput),
    grading = gradingSchema.parse(gradingInput),
    metadata = batchMetadataSchema.parse(metadataInput);
  if (new Set(metadata.chapters.map((c) => c.number)).size !== 2)
    fail("batch-chapters", "metadata", "Include Chapters 2 and 3 exactly once");
  if (new Set(metadata.clarifications.map((c) => `${c.chapter}:${c.sourceId}`)).size !== 2)
    fail("source-clarification", "metadata", "Require distinct explicit editorial clarifications");
  for (const change of metadata.clarifications) {
    const allowed = allowedClarifications.get(`${change.chapter}:${change.sourceId}`);
    if (
      !allowed ||
      change.sourceText !== allowed.source ||
      change.authoredText !== allowed.authored
    )
      fail(
        "source-clarification",
        change.sourceId,
        "Only the documented construct clarifications are permitted",
      );
  }
  for (const chapter of metadata.chapters) {
    const text = sources.get(chapter.number);
    if (!text || sha256(text) !== chapter.sourceSha256)
      fail(
        "source-hash",
        chapter.sourceFile,
        "Source bytes changed; use a new reviewed candidate, never edit an existing draft",
      );
    const parsed = parseExpansionQuestions(text);
    if (
      new Set(chapter.questions.map((q) => q.sourceId)).size !== 22 ||
      new Set(chapter.questions.map((q) => q.exerciseId)).size !== 22
    )
      fail("source-inventory", chapter.chapterId, "Question mappings must be unique");
    for (const q of parsed) {
      const map = chapter.questions.find((m) => m.sourceId === q.sourceId);
      if (!map) fail("source-mapping", q.sourceId, "Question mapping missing");
      const expectedAudio = q.sourceId.startsWith("L") ? "audio_pending" : "not_applicable";
      if (map.audioStatus !== expectedAudio)
        fail(
          "source-audio",
          q.sourceId,
          "Audio-pending questions cannot be treated as assessed listening",
        );
      const e = addition.exercises.find((e) => e.id === map.exerciseId),
        r = grading.exerciseRules.find((r) => r.exerciseRef.id === map.exerciseId);
      const change = metadata.clarifications.find(
        (c) => c.chapter === chapter.number && c.sourceId === q.sourceId,
      );
      if (change && change.sourceText !== q.prompt)
        fail(
          "source-clarification",
          q.sourceId,
          "Source prompt no longer matches the documented clarification",
        );
      if (
        !e ||
        e.type !== "multiple_choice" ||
        e.prompt.text !== (change?.authoredText ?? q.prompt) ||
        fingerprint(e.options.map((o) => o.text.text)) !== fingerprint(q.options)
      )
        fail(
          "source-options",
          q.sourceId,
          "Preserve all source options and the source or explicitly clarified prompt",
        );
      if (
        !r ||
        r.type !== "multiple_choice" ||
        r.correctOptionIds.length !== 1 ||
        r.correctOptionIds[0] !== e.options["ABC".indexOf(q.key)]!.id ||
        r.exerciseRef.revision !== e.revision
      )
        fail(
          "source-key",
          q.sourceId,
          "Private key does not match the source answer and exact revision",
        );
      if (!/[\u1000-\u109f]/.test(r.explanation.my))
        fail("source-translation", q.sourceId, "A Burmese explanation is required");
      const assigned = addition.lessons.find((l) => l.id === map.lessonId);
      if (
        !assigned ||
        assigned.chapterRef.id !== chapter.chapterId ||
        !assigned.blockRefs.some((bref) => {
          const b = addition.blocks.find((b) => b.id === bref.id);
          if (!b || !(b.type === "exercise_set" || b.type === "quiz")) return false;
          return b.exerciseRefs.some((eref) => {
            const group = addition.exercises.find((e) => e.id === eref.id);
            return (
              eref.id === e.id ||
              (group?.type === "reading_comprehension" &&
                group.itemRefs.some((leaf) => leaf.id === e.id))
            );
          });
        })
      )
        fail("source-reachability", e.id, "Question must be reachable from its mapped lesson");
      if (
        q.sourceId.startsWith("K") &&
        (e.tags.coreSkills.length || !e.tags.areas.includes("grammar"))
      )
        fail("source-evidence", e.id, "Knowledge MCQs are recognition, not reading proficiency");
      if (
        q.sourceId.startsWith("L") &&
        (e.tags.coreSkills.length || !e.tags.areas.includes("listening"))
      )
        fail("source-evidence", e.id, "Pending audio is not listening evidence");
    }
  }
  if (
    grading.exerciseRules.length !== 44 ||
    addition.exercises.filter((e) => e.type === "multiple_choice").length !== 44
  )
    fail(
      "batch-inventory",
      "exercises",
      "Exactly 44 new MCQ leaves and private rules are required",
    );
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
  for (const v of Object.values(value)) refs(v, visit);
}
export function appendA1Chapters(
  source: CurriculumPackage,
  publicInput: unknown,
  gradingInput: unknown,
  metadataInput: unknown,
  options: PrototypeOptions,
): CurriculumPackage {
  if (
    source.manifest.state !== "draft" ||
    source.manifest.contentVersion !== "1.4.0" ||
    options.contentVersion === source.manifest.contentVersion
  )
    fail(
      "batch-source",
      "manifest",
      "Append to a validated inactive 1.4.0 working copy with an unused version",
    );
  const addition = publicCollectionsSchema.parse(publicInput),
    grading = gradingSchema.parse(gradingInput),
    metadata = batchMetadataSchema.parse(metadataInput);
  if (
    addition.chapters.length !== 2 ||
    addition.lessons.length !== 14 ||
    [
      addition.courses,
      addition.assessments,
      addition.assets,
      addition.transcripts,
      grading.assessmentPolicies,
    ].some((a) => a.length)
  )
    fail(
      "batch-scope",
      "authoring",
      "Add only two chapters/seven lessons each; retain media and assessment policies",
    );
  const oldEntities = Object.values(source.public).flat(),
    oldById = new Map(oldEntities.map((e) => [e.id, e]));
  const existingChapter = source.public.chapters.find(
    (c) => c.id === metadata.chapter1Reuse.chapterId,
  );
  if (
    !existingChapter ||
    fingerprint(existingChapter.lessonRefs.map((r) => r.id).sort()) !==
      fingerprint([...metadata.chapter1Reuse.lessonIds].sort())
  )
    fail(
      "chapter-one-map",
      "metadata",
      "Map all eight established Chapter 1 lessons exactly; do not clone them",
    );
  const candidate = structuredClone(source);
  for (const [name, entities] of Object.entries(addition)) {
    for (const e of entities)
      if (oldById.has(e.id) || e.revision !== 1)
        fail("batch-identity", e.id, "All added entities must have new IDs and revision 1");
    (candidate.public[name as keyof typeof addition] as PublicEntity[]).push(
      ...structuredClone(entities),
    );
  }
  const course = candidate.public.courses.find((c) => c.id === "general-a1");
  if (!course) fail("batch-course", "general-a1", "Existing A1 course missing");
  for (const cm of metadata.chapters) {
    const c = addition.chapters.find(
      (c) => c.id === cm.chapterId && c.order === cm.number && c.slug === cm.slug,
    );
    if (
      !c ||
      c.courseRef.id !== course.id ||
      fingerprint(c.lessonRefs.map((r) => r.id)) !== fingerprint(cm.lessonIds)
    )
      fail(
        "batch-mapping",
        cm.chapterId,
        "Chapter mapping and ordered lesson membership must match",
      );
    course.chapterRefs.push(ref("chapter", c.id));
  }
  const changed = new Set([course.id]);
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
  if (grading.exerciseRules.some((r) => oldById.has(r.exerciseRef.id)))
    fail("batch-grading", "private", "Existing grading rules cannot be replaced");
  candidate.private.grading.exerciseRules.push(...structuredClone(grading.exerciseRules));
  for (const policy of candidate.private.grading.assessmentPolicies)
    if (changed.has(policy.assessmentRef.id)) {
      policy.policyRevision++;
      update(policy.assessmentRef);
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
  // Retain negative historical decisions. A reference-only successor never upgrades an old
  // requires-recompletion/not-equivalent proposal from v1 or older drafts into carry/equivalence.
  for (const m of source.compatibility.filter(
    (m) => m.to.contentVersion === source.manifest.contentVersion,
  )) {
    const target = newById.get(m.to.ref.id)!;
    candidate.compatibility.push({
      ...structuredClone(m),
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      reviewStatus: "pending",
      reason:
        "Only Chapter 2/3 membership and exact hierarchy refs changed. Retain the prior compatibility decision; independent review remains required.",
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
      completion: old.kind === "lesson" ? "carry_forward" : "archive_only",
      evidence: old.kind === "exercise" ? "equivalent" : "none",
      resume: "same_ids",
      reviewStatus: "pending",
      reason:
        "Chapter 1 teaching and scoring unchanged; exact hierarchy revisions only. Pending independent review; never rewrites historical scores.",
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
