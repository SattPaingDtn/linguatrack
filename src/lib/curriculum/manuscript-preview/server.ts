import "server-only";
import { resolve } from "node:path";
import { curriculumSchema } from "../schema";
import { LIMITS } from "../v2/common";
import { parseJson, sha256, fingerprint } from "../v2/json";
import { PreviewError, previewEnabled } from "../preview/server";
import { previewFeedbackSchema } from "../preview/contracts";
import type { CurriculumPackage } from "../v2/package";
import type { PublicEntity, Exercise } from "../v2/public";
import { MANUSCRIPT_CHAPTERS, manuscriptAwaitsAudio } from "./config";
import {
  manuscriptLessonSchema,
  manuscriptAnswerSchema,
  selfReviewFeedbackSchema,
} from "./contracts";
const HASHES: Record<string, string> = {
  "1.6.0": "dbd4fe0e93f82dfded12645f706d5c9cf1600956e04c5588bd6bdf130b677d9e",
  "1.7.0": "cacc1e19a1794400babae8c5e73d40af8d75902d7dff661d9f3a577aa6b693c9",
  "1.8.0": "17a087e714ca5bcaea6e3ba2051664b6c0ee73da612f4337a4a81211def3d604",
};
function guard() {
  if (!previewEnabled()) throw new PreviewError("Not found", 404);
}
function exact<T extends PublicEntity>(items: T[], r: { id: string; revision: number }): T {
  const e = items.find((e) => e.id === r.id && e.revision === r.revision);
  if (!e) throw new PreviewError("An exact manuscript reference is unavailable.", 503);
  return e;
}
export async function loadManuscriptDraft(version: string) {
  guard();
  if (!MANUSCRIPT_CHAPTERS.some((c) => c.version === version))
    throw new PreviewError("Not found", 404);
  const { loadPackageChain, readRegularFile } = await import("../v2/reader");
  const root = process.cwd();
  const bytes = await readRegularFile(
    resolve(root, "src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const count = Number(version.split(".")[1]);
  const chain = await loadPackageChain(
    Array.from({ length: count }, (_, i) => resolve(root, ".curriculum-drafts", `1.${i + 1}.0`)),
    { legacy: curriculumSchema.parse(parseJson(bytes, "v1 baseline")), legacyHash: sha256(bytes) },
  );
  const loaded = chain.packages.at(-1)!;
  if (
    loaded.releaseHash !== HASHES[version] ||
    loaded.pkg.manifest.state !== "draft" ||
    loaded.pkg.manifest.contentVersion !== version
  )
    throw new PreviewError("The exact inactive manuscript draft is unavailable.", 503);
  return loaded.pkg;
}
export function projectManuscriptLesson(
  pkg: CurriculumPackage,
  chapterSlug: string,
  lessonSlug: string,
) {
  guard();
  const cfg = MANUSCRIPT_CHAPTERS.find(
    (c) => c.slug === chapterSlug && c.version === pkg.manifest.contentVersion,
  );
  if (!cfg) throw new PreviewError("Not found", 404);
  const p = pkg.public,
    chapter = p.chapters.find((c) => c.id === cfg.id)!;
  const lesson = chapter.lessonRefs
    .map((r) => exact(p.lessons, r))
    .find((l) => l.slug === lessonSlug && cfg.lessonIds.some((id) => id === l.id));
  if (!lesson) throw new PreviewError("Not found", 404);
  const blocks = lesson.blockRefs.map((r) => exact(p.blocks, r)),
    objectives = lesson.objectiveRefs.map((r) => exact(p.objectives, r));
  const questions: Extract<Exercise, { type: "multiple_choice" }>[] = [],
    shortResponses: Extract<Exercise, { type: "fill_in_blank" }>[] = [],
    passages: Extract<(typeof p.stimuli)[0], { type: "reading" }>[] = [];
  function passage(r: { id: string; revision: number }) {
    const s = exact(p.stimuli, r);
    if (s.type !== "reading") throw new PreviewError("Unsupported manuscript stimulus.", 503);
    if (!passages.some((p) => p.id === s.id)) passages.push(s);
  }
  function add(r: { id: string; revision: number }) {
    const e = exact(p.exercises, r);
    if (e.type === "reading_comprehension") {
      passage(e.stimulusRef);
      for (const child of e.itemRefs) add(child);
    } else if (e.type === "multiple_choice" && e.selection === "single") {
      if (!questions.some((q) => q.id === e.id)) questions.push(e);
    } else if (e.type === "fill_in_blank") {
      if (!shortResponses.some((q) => q.id === e.id)) shortResponses.push(e);
    } else throw new PreviewError("Unsupported manuscript exercise; no silent omission.", 503);
  }
  for (const b of blocks) {
    if (b.type === "reading") passage(b.stimulusRef);
    if (b.type === "quiz" || b.type === "exercise_set") for (const r of b.exerciseRefs) add(r);
    if (b.type === "listening")
      throw new PreviewError("This manuscript has no reviewed audio binding.", 503);
  }
  const content = {
    lesson,
    blocks,
    objectives,
    questions,
    shortResponses,
    passages,
    audio: [],
    awaitingAudioIds: [],
  };
  return manuscriptLessonSchema.parse({
    contentVersion: cfg.version,
    publicDigest: fingerprint(content),
    ...content,
  });
}
export async function getManuscriptCatalog() {
  guard();
  return Promise.all(
    MANUSCRIPT_CHAPTERS.map(async (cfg) => {
      const pkg = await loadManuscriptDraft(cfg.version),
        c = pkg.public.chapters.find((c) => c.id === cfg.id)!;
      return {
        id: c.id,
        order: c.order,
        title: c.title,
        lessonCount: c.lessonRefs.length,
        path: `/dev/a1/${c.slug}`,
        version: cfg.version,
      };
    }),
  );
}
export async function getManuscriptChapter(slug: string) {
  guard();
  const cfg = MANUSCRIPT_CHAPTERS.find((c) => c.slug === slug);
  if (!cfg) throw new PreviewError("Not found", 404);
  const pkg = await loadManuscriptDraft(cfg.version),
    chapter = pkg.public.chapters.find((c) => c.id === cfg.id)!;
  return {
    id: chapter.id,
    slug: chapter.slug,
    title: chapter.title,
    order: chapter.order,
    version: cfg.version,
    description: chapter.description,
    lessons: chapter.lessonRefs.map((r) => {
      const l = exact(pkg.public.lessons, r);
      return { id: l.id, slug: l.slug, title: l.title, areas: l.tags.areas };
    }),
  };
}
export async function getManuscriptLesson(slug: string, lessonSlug: string) {
  guard();
  const cfg = MANUSCRIPT_CHAPTERS.find((c) => c.slug === slug);
  if (!cfg) throw new PreviewError("Not found", 404);
  return projectManuscriptLesson(await loadManuscriptDraft(cfg.version), slug, lessonSlug);
}
export async function answerManuscript(raw: unknown) {
  guard();
  const parsed = manuscriptAnswerSchema.safeParse(raw);
  if (!parsed.success) throw new PreviewError("Invalid manuscript preview response.");
  const input = parsed.data;
  const cfg = MANUSCRIPT_CHAPTERS.find(
    (c) => c.version === input.contentVersion && c.lessonIds.some((id) => id === input.lessonId),
  );
  if (!cfg) throw new PreviewError("The lesson/version is not in this preview.");
  if (manuscriptAwaitsAudio(input.exercise.id))
    throw new PreviewError(
      "Awaiting audio. Listening checks are unavailable; script reading receives no listening credit.",
      409,
    );
  const pkg = await loadManuscriptDraft(cfg.version),
    lesson = pkg.public.lessons.find((l) => l.id === input.lessonId)!;
  const preview = projectManuscriptLesson(pkg, cfg.slug, lesson.slug);
  if (preview.publicDigest !== input.publicDigest)
    throw new PreviewError("Preview changed. Reload before checking; nothing was saved.", 409);
  const rule = pkg.private.grading.exerciseRules.find(
    (r) =>
      r.exerciseRef.id === input.exercise.id && r.exerciseRef.revision === input.exercise.revision,
  );
  if ("mode" in input) {
    const q = preview.shortResponses.find(
      (q) => q.id === input.exercise.id && q.revision === input.exercise.revision,
    );
    if (
      !q ||
      !q.tags.areas.includes("reading") ||
      !rule ||
      rule.type !== "fill_in_blank" ||
      rule.acceptedByBlank.length !== 1
    )
      throw new PreviewError("This response has no reading self-review example.");
    // No exact-string grading: alternative phrasings may be valid. Return ONE submitted
    // question's teacher example, without variants, scores, private rules or bulk key data.
    return selfReviewFeedbackSchema.parse({
      simulated: true,
      saved: false,
      selfReviewOnly: true,
      exercise: input.exercise,
      submittedText: input.text,
      exampleAnswer: rule.acceptedByBlank[0]!.variants[0],
      explanation: rule.explanation,
    });
  }
  const q = preview.questions.find(
    (q) => q.id === input.exercise.id && q.revision === input.exercise.revision,
  );
  if (
    !q ||
    !q.options.some((o) => o.id === input.optionId) ||
    !rule ||
    rule.type !== "multiple_choice" ||
    rule.correctOptionIds.length !== 1 ||
    rule.graderVersion !== "multiple-choice-exact-set-v1"
  )
    throw new PreviewError("The question revision or option is not in this lesson.");
  const correct = q.options.find((o) => o.id === rule.correctOptionIds[0]);
  if (!correct) throw new PreviewError("A grading reference is unavailable.", 503);
  return previewFeedbackSchema.parse({
    simulated: true,
    saved: false,
    exercise: input.exercise,
    selectedOptionId: input.optionId,
    isCorrect: correct.id === input.optionId,
    correctAnswer: correct.text.text,
    explanation: rule.explanation,
  });
}
