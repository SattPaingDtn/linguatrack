// Offline local authoring only; source parsing includes private teacher material.
import { z } from "zod";
import { hashSchema, idSchema, ref, type Ref } from "./common";
import { canonicalJson, fail, fingerprint, sha256 } from "./json";
import { publicCollectionsSchema, type PublicEntity } from "./public";
import { gradingSchema } from "./private";
import type { CurriculumPackage } from "./package";
import type { PrototypeOptions } from "./authoring";
export const manuscriptMetadataSchema = z
  .object({
    number: z.union([z.literal(4), z.literal(5), z.literal(6)]),
    chapterId: idSchema,
    slug: idSchema,
    sourceFile: z.string().regex(/^content-authoring\/A1_Chapter_0[456]_Full_Lesson_Pack\.md$/),
    sourceSha256: hashSchema,
    audioStatus: z.literal("awaiting_audio"),
    lessonIds: z.array(idSchema).length(7),
    questions: z
      .array(
        z
          .object({
            sourceId: z.string().regex(/^(K(?:[1-9]|1[0-2])|R[1-5]|L[12]-[12])$/),
            exerciseId: idSchema,
            lessonId: idSchema,
            mode: z.enum(["recognition", "self_review", "awaiting_audio"]),
          })
          .strict(),
      )
      .length(21),
    reviewStatus: z.literal("pending"),
  })
  .strict();
export type ManuscriptMetadata = z.infer<typeof manuscriptMetadataSchema>;
export function parseManuscript(markdown: string) {
  const split = markdown.split("## PRIVATE TEACHER ANSWER KEY — REMOVE FROM PUBLIC CONTENT");
  if (split.length !== 2) fail("source-private", "source", "Require one private teacher section");
  const [publicText, privateText] = split as [string, string];
  const sections = publicText.split(/^## Lesson ([1-7]) — (.+)\n/m),
    bodies = new Map<number, string>();
  for (let i = 1; i < sections.length; i += 3) {
    const n = Number(sections[i]);
    if (bodies.has(n)) fail("source-lessons", "source", "Duplicate pedagogical section");
    bodies.set(n, sections[i + 2]!);
  }
  if (bodies.size !== 7) fail("source-lessons", "source", "Require all seven pedagogical sections");
  const keys = new Map(
    [...privateText.matchAll(/^(\d+)\. \*\*([ABC]) — (.+?)\*\*\. (.+)$/gm)].map((m) => [
      Number(m[1]),
      { key: m[2]!, answer: m[3]!, my: m[4]! },
    ]),
  );
  const mcqs = [
    ...bodies
      .get(7)!
      .matchAll(
        /^(\d+)\. \*\*(.+?)\*\*\s*\n\s*A\. (.+?)\s*\n\s*B\. (.+?)\s*\n\s*C\. (.+?)(?=\n\n)/gm,
      ),
  ].map((m) => {
    const n = Number(m[1]),
      key = keys.get(n);
    const options = [m[3]!, m[4]!, m[5]!].map((s) => s.trim());
    if (!key || options["ABC".indexOf(key.key)] !== key.answer)
      fail("source-key", `K${n}`, "Teacher answer must match its correct option exactly");
    return { sourceId: `K${n}`, prompt: m[2]!, options, ...key };
  });
  if (keys.size !== 12 || mcqs.length !== 12 || new Set(mcqs.map((q) => q.sourceId)).size !== 12)
    fail("source-mcqs", "source", "Require twelve distinct questions and private keys");
  const dialogueKeys = [...privateText.matchAll(/^\*\*(.+?):\*\* 1\. (.+?); 2\. (.+)$/gm)];
  const groups = bodies.get(3)!.split(/^### Dialogue ([12]) — (.+)\n/m),
    dialogues = [];
  for (let i = 1; i < groups.length; i += 3) {
    const number = Number(groups[i]),
      body = groups[i + 2]!,
      key = dialogueKeys[number - 1];
    if (!key || key[1] !== groups[i + 1])
      fail("source-dialogue", "source", "Dialogue key/title mismatch");
    const questions = [...body.matchAll(/^([12])\. (.+)$/gm)].map((m) => ({
      sourceId: `L${number}-${m[1]}`,
      prompt: m[2]!,
      answer: key[Number(m[1]) + 1]!,
    }));
    if (questions.length !== 2)
      fail("source-dialogue", "source", "Retain both open dialogue questions");
    const script = [...body.matchAll(/^- \*\*(.+?):\*\* (.+)$/gm)]
      .map((m) => `${m[1]}: ${m[2]}`)
      .join("\n");
    if (!script) fail("source-dialogue", "source", "Script missing");
    dialogues.push({ number, title: groups[i + 1]!, script, questions });
  }
  if (dialogues.length !== 2)
    fail("source-dialogue", "source", "Require two scripts without fabricated audio");
  const readingBody = bodies.get(5)!;
  const passage = readingBody.split("\n\n")[1]?.trim();
  const answers = new Map(
    [
      ...privateText
        .split("### Reading answer key")[1]!
        .split("### Production")[0]!
        .matchAll(/^([1-5])\. (.+)$/gm),
    ].map((m) => [m[1]!, m[2]!]),
  );
  const reading = [...readingBody.split("**Questions:**")[1]!.matchAll(/^([1-5])\. (.+)$/gm)].map(
    (m) => ({ sourceId: `R${m[1]}`, prompt: m[2]!, answer: answers.get(m[1]!)! }),
  );
  if (!passage || reading.length !== 5 || answers.size !== 5 || reading.some((q) => !q.answer))
    fail("source-reading", "source", "Retain passage and five exact teacher answers");
  const vocabulary = [...bodies.get(1)!.matchAll(/^\| (.+?) \| (.+?) \| (.+?) \|$/gm)]
    .slice(1)
    .map((m) => ({ word: m[1]!, my: m[2]!, example: m[3]! }));
  if (vocabulary.length !== 12)
    fail(
      "source-vocabulary",
      "source",
      "Require twelve words with Burmese meanings and English examples",
    );
  return { publicText, bodies, mcqs, dialogues, reading, passage, vocabulary };
}
export function validateManuscriptSource(
  markdown: string,
  publicInput: unknown,
  gradingInput: unknown,
  metadataInput: unknown,
) {
  const p = publicCollectionsSchema.parse(publicInput),
    g = gradingSchema.parse(gradingInput),
    m = manuscriptMetadataSchema.parse(metadataInput),
    source = parseManuscript(markdown);
  if (sha256(markdown) !== m.sourceSha256 || !m.sourceFile.includes(`0${m.number}_`))
    fail(
      "source-hash",
      m.sourceFile,
      "Source bytes/chapter do not match the mapped authoring input",
    );
  if (
    new Set(m.questions.map((q) => q.sourceId)).size !== 21 ||
    new Set(m.questions.map((q) => q.exerciseId)).size !== 21
  )
    fail("source-inventory", "metadata", "All 21 source activities must have distinct mappings");
  const original = [
    ...source.mcqs,
    ...source.dialogues.flatMap((d) => d.questions),
    ...source.reading,
  ];
  for (const q of original) {
    const map = m.questions.find((r) => r.sourceId === q.sourceId);
    if (!map) fail("source-map", q.sourceId, "Missing source question");
    const e = p.exercises.find((e) => e.id === map.exerciseId),
      r = g.exerciseRules.find(
        (r) => r.exerciseRef.id === map.exerciseId && r.exerciseRef.revision === e?.revision,
      );
    const mode = q.sourceId.startsWith("K")
      ? "recognition"
      : q.sourceId.startsWith("L")
        ? "awaiting_audio"
        : "self_review";
    if (map.mode !== mode || !e || !r)
      fail("source-map", q.sourceId, "Exact private binding or honest practice mode missing");
    if ("options" in q && "key" in q && typeof q.key === "string") {
      if (
        e.type !== "multiple_choice" ||
        r.type !== "multiple_choice" ||
        e.prompt.text !== q.prompt ||
        fingerprint(e.options.map((o) => o.text.text)) !== fingerprint(q.options) ||
        r.correctOptionIds.length !== 1 ||
        r.correctOptionIds[0] !== e.options["ABC".indexOf(q.key)]!.id
      )
        fail(
          "source-mcq",
          q.sourceId,
          "Preserve source prompt, ordered options and correct letter",
        );
      if (e.tags.coreSkills.length)
        fail(
          "source-evidence",
          e.id,
          "Recognition questions do not demonstrate reading/writing proficiency",
        );
    } else {
      if (
        e.type !== "fill_in_blank" ||
        r.type !== "fill_in_blank" ||
        e.segments.length !== 2 ||
        e.segments[0]?.type !== "text" ||
        e.segments[0].text !== q.prompt + " " ||
        e.segments[1]?.type !== "blank" ||
        r.acceptedByBlank.length !== 1 ||
        r.acceptedByBlank[0]!.blankId !== e.segments[1].id
      )
        fail(
          "source-short-response",
          q.sourceId,
          "Preserve open response prompts and exact blank binding",
        );
      // Chapter 4 dialogue mentions only the station as explicitly near the apartment.
      // Source teacher text remains in immutable Markdown; disabled listening canonical is clarified.
      const answer = m.number === 4 && q.sourceId === "L1-1" ? "A station." : q.answer;
      if (fingerprint(r.acceptedByBlank[0]!.variants) !== fingerprint([answer]))
        fail(
          "source-key",
          q.sourceId,
          "Preserve canonical teacher example (or the documented transcript clarification)",
        );
      if (mode === "awaiting_audio" && e.tags.coreSkills.length)
        fail("source-evidence", e.id, "Scripts cannot demonstrate listening proficiency");
    }
    if (!/[\u1000-\u109f]/.test(r.explanation.my))
      fail("source-locale", e.id, "Burmese answer explanation is required");
    const lesson = p.lessons.find((l) => l.id === map.lessonId);
    if (
      !lesson ||
      lesson.chapterRef.id !== m.chapterId ||
      !lesson.blockRefs.some((bref) => {
        const b = p.blocks.find((b) => b.id === bref.id);
        return (
          b &&
          (b.type === "quiz" || b.type === "exercise_set") &&
          b.exerciseRefs.some((eref) => {
            const container = p.exercises.find((c) => c.id === eref.id);
            return (
              eref.id === e.id ||
              (container?.type === "reading_comprehension" &&
                container.itemRefs.some((leaf) => leaf.id === e.id))
            );
          })
        );
      })
    )
      fail("source-reachability", e.id, "Question must be reachable from its assigned lesson");
  }
  if (p.exercises.length !== 22 || g.exerciseRules.length !== 21)
    fail(
      "source-inventory",
      "exercises",
      "Require 12 MCQs, 9 short responses, one reading container and 21 private bindings",
    );
  const vocab = p.blocks.find((b) => b.type === "vocabulary");
  if (
    !vocab ||
    vocab.type !== "vocabulary" ||
    fingerprint(
      vocab.words.map((w) => ({
        word: w.word,
        my: "my" in w.meaning ? w.meaning.my : null,
        example: w.example.text,
      })),
    ) !== fingerprint(source.vocabulary)
  )
    fail("source-vocabulary", "blocks", "Preserve all words, meanings and examples");
  if (
    p.stimuli.length !== 1 ||
    p.stimuli[0]?.type !== "reading" ||
    p.stimuli[0].passage.text !== source.passage
  )
    fail("source-reading", "stimuli", "Reading passage must match source exactly");
  for (const d of source.dialogues)
    if (!p.blocks.some((b) => b.type === "explanation" && b.body.en === d.script))
      fail("source-script", d.title, "Preserve the complete script");
}
function refs(v: unknown, visit: (r: Ref) => void) {
  if (!v || typeof v !== "object") return;
  if (
    !Array.isArray(v) &&
    Object.keys(v).length === 3 &&
    "kind" in v &&
    "id" in v &&
    "revision" in v
  )
    visit(v as Ref);
  for (const child of Object.values(v)) refs(child, visit);
}
export function appendManuscriptChapter(
  source: CurriculumPackage,
  publicInput: unknown,
  gradingInput: unknown,
  metadataInput: unknown,
  options: PrototypeOptions,
): CurriculumPackage {
  const p = publicCollectionsSchema.parse(publicInput),
    g = gradingSchema.parse(gradingInput),
    m = manuscriptMetadataSchema.parse(metadataInput);
  const parent = ["1.5.0", "1.6.0", "1.7.0"][m.number - 4];
  if (
    source.manifest.state !== "draft" ||
    source.manifest.contentVersion !== parent ||
    options.contentVersion === parent
  )
    fail(
      "manuscript-parent",
      "manifest",
      "Append only to the preceding validated inactive draft; use an unused version",
    );
  if (
    p.chapters.length !== 1 ||
    p.lessons.length !== 7 ||
    [p.courses, p.assessments, p.transcripts, p.assets, g.assessmentPolicies].some(
      (v) => v.length,
    ) ||
    p.lessons.some((l) => l.completionPolicy.type !== "self_reported")
  )
    fail(
      "manuscript-scope",
      "authoring",
      "Add one seven-lesson self-practice chapter, without replacing media or formal assessments",
    );
  const c = p.chapters[0]!;
  if (
    c.id !== `a1-chapter-${m.number}` ||
    c.id !== m.chapterId ||
    c.slug !== m.slug ||
    c.order !== m.number ||
    c.courseRef.id !== "general-a1" ||
    fingerprint(c.lessonRefs.map((r) => r.id)) !== fingerprint(m.lessonIds)
  )
    fail("manuscript-map", "chapter", "Exact new chapter/lesson identities must match metadata");
  const previous = Object.values(source.public).flat(),
    byId = new Map(previous.map((e) => [e.id, e])),
    candidate = structuredClone(source);
  for (const [name, entities] of Object.entries(p)) {
    for (const e of entities)
      if (byId.has(e.id) || e.revision !== 1)
        fail(
          "manuscript-identity",
          e.id,
          "Never replace an existing ID; new entities start at revision 1",
        );
    (candidate.public[name as keyof typeof p] as PublicEntity[]).push(...structuredClone(entities));
  }
  const course = candidate.public.courses.find((c) => c.id === "general-a1")!;
  course.chapterRefs.push(ref("chapter", c.id));
  const changed = new Set([course.id]);
  let more = true;
  while (more) {
    more = false;
    for (const e of previous)
      if (!changed.has(e.id))
        refs(e, (r) => {
          if (changed.has(r.id)) {
            changed.add(e.id);
            more = true;
          }
        });
  }
  function update(r: Ref) {
    const old = byId.get(r.id);
    if (old) r.revision = old.revision + (changed.has(old.id) ? 1 : 0);
  }
  for (const e of Object.values(candidate.public).flat()) {
    const old = byId.get(e.id);
    if (old && changed.has(e.id)) e.revision = old.revision + 1;
    refs(e, update);
  }
  if (g.exerciseRules.some((r) => byId.has(r.exerciseRef.id)))
    fail("manuscript-grading", "rules", "Historical keys cannot be overwritten");
  candidate.private.grading.exerciseRules.push(...structuredClone(g.exerciseRules));
  for (const policy of candidate.private.grading.assessmentPolicies)
    if (changed.has(policy.assessmentRef.id)) {
      policy.policyRevision++;
      update(policy.assessmentRef);
    }
  Object.assign(candidate.manifest, {
    contentVersion: options.contentVersion,
    createdAt: options.createdAt,
    basedOn: {
      schemaVersion: 2,
      contentVersion: source.manifest.contentVersion,
      sha256: options.sourceDigest,
    },
  });
  refs(candidate.manifest.courseRefs, update);
  refs(candidate.manifest.legacyLocaleExceptions, update);
  candidate.manifest.editorialApprovals = candidate.manifest.editorialApprovals.filter(
    (a) => !changed.has(a.ref.id),
  );
  for (const e of p.exercises)
    if (!candidate.manifest.requiredCapabilities.includes(e.type))
      candidate.manifest.requiredCapabilities.push(e.type);
  const next = new Map(
    Object.values(candidate.public)
      .flat()
      .map((e) => [e.id, e]),
  );
  for (const mapping of source.compatibility.filter(
    (m) => m.to.contentVersion === source.manifest.contentVersion,
  )) {
    const target = next.get(mapping.to.ref.id)!;
    candidate.compatibility.push({
      ...structuredClone(mapping),
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      reviewStatus: "pending",
      reason:
        "New chapter membership changes exact hierarchy refs only; retain earlier compatibility decisions and require independent review.",
      fingerprints: { source: mapping.fingerprints.source, target: fingerprint(target) },
    });
  }
  for (const old of previous) {
    const target = next.get(old.id)!;
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
        "Original teaching/scoring unchanged; exact reference revisions only. No historical results are rewritten.",
      fingerprints: { source: fingerprint(old), target: fingerprint(target) },
    });
  }
  for (const file of candidate.manifest.files) {
    if (file.collection === "media") continue;
    const payload =
      file.collection === "compatibility"
        ? candidate.compatibility
        : file.visibility === "private"
          ? candidate.private[file.collection as keyof typeof candidate.private]
          : candidate.public[file.collection as keyof typeof candidate.public];
    const bytes = canonicalJson(payload);
    file.sha256 = sha256(bytes);
    file.byteLength = Buffer.byteLength(bytes);
  }
  return candidate;
}
