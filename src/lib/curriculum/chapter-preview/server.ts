import "server-only";
import { resolve } from "node:path";
import { curriculumSchema } from "../schema";
import { LIMITS } from "../v2/common";
import { parseJson, sha256 } from "../v2/json";
import type { CurriculumPackage } from "../v2/package";
import { PreviewError, previewEnabled } from "../preview/server";
import { previewFeedbackSchema } from "../preview/contracts";
import { chapterAnswerSchema, chapterLessonSchema } from "./contracts";
import { awaitsAudio, CHAPTER_PREVIEW_LESSONS, CHAPTER_PREVIEW_VERSION } from "./config";
import { projectLessonContent } from "./project";
const RELEASE_HASH = "e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67";
function requireDevelopment() {
  if (!previewEnabled()) throw new PreviewError("Not found", 404);
}
export async function loadChapterDraft() {
  requireDevelopment(); // Before filesystem/tooling import, including direct calls.
  const { loadPackageChain, readRegularFile } = await import("../v2/reader");
  const root = process.cwd();
  const bytes = await readRegularFile(
    resolve(root, "src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const chain = await loadPackageChain(
    ["1.1.0", "1.2.0", "1.3.0", CHAPTER_PREVIEW_VERSION].map((v) =>
      resolve(root, ".curriculum-drafts", v),
    ),
    { legacy: curriculumSchema.parse(parseJson(bytes, "v1 baseline")), legacyHash: sha256(bytes) },
  );
  const loaded = chain.packages.at(-1)!;
  if (
    loaded.releaseHash !== RELEASE_HASH ||
    loaded.pkg.manifest.state !== "draft" ||
    loaded.pkg.manifest.contentVersion !== CHAPTER_PREVIEW_VERSION
  )
    throw new PreviewError("The exact inactive chapter preview draft is unavailable.", 503);
  const asset = loaded.pkg.public.assets.find(
    (a) => a.legacyPublicPath === "/audio/a1-introductions.wav",
  );
  if (
    !asset ||
    sha256(
      await readRegularFile(resolve(root, "public/audio/a1-introductions.wav"), LIMITS.assetBytes),
    ) !== asset.sha256
  )
    throw new PreviewError("The actual preview audio does not match the validated package.", 503);
  return loaded.pkg;
}
// All helpers are server-only and development-guarded. Private rules never enter a DTO.
export function projectChapterLesson(pkg: CurriculumPackage, slug: string) {
  requireDevelopment();
  return chapterLessonSchema.parse({
    contentVersion: CHAPTER_PREVIEW_VERSION,
    ...projectLessonContent(pkg, "a1-chapter-1", slug, CHAPTER_PREVIEW_LESSONS, awaitsAudio),
  });
}
export async function getChapterLesson(slug: string) {
  return projectChapterLesson(await loadChapterDraft(), slug);
}
export async function getChapterCatalog() {
  const pkg = await loadChapterDraft();
  return CHAPTER_PREVIEW_LESSONS.map((id) => {
    const l = pkg.public.lessons.find((l) => l.id === id)!;
    return { id: l.id, slug: l.slug, title: l.title, areas: l.tags.areas };
  });
}
export async function gradeChapterAnswer(raw: unknown) {
  requireDevelopment();
  const parsed = chapterAnswerSchema.safeParse(raw);
  if (!parsed.success) throw new PreviewError("Invalid chapter preview answer.");
  const input = parsed.data;
  if (awaitsAudio(input.exercise.id))
    throw new PreviewError(
      "Awaiting matching audio. Listening checks are disabled; no listening evidence is awarded.",
      409,
    );
  const pkg = await loadChapterDraft();
  const lesson = pkg.public.lessons.find((l) => l.id === input.lessonId);
  if (!lesson) throw new PreviewError("Invalid lesson.");
  const preview = projectChapterLesson(pkg, lesson.slug);
  if (preview.publicDigest !== input.publicDigest)
    throw new PreviewError("Preview changed. Reload before checking; nothing was saved.", 409);
  const q = preview.questions.find(
    (q) => q.id === input.exercise.id && q.revision === input.exercise.revision,
  );
  if (!q || !q.options.some((o) => o.id === input.optionId))
    throw new PreviewError("The question revision or option is not in this lesson.");
  const rule = pkg.private.grading.exerciseRules.find(
    (r) => r.exerciseRef.id === q.id && r.exerciseRef.revision === q.revision,
  );
  if (
    !rule ||
    rule.type !== "multiple_choice" ||
    rule.graderVersion !== "multiple-choice-exact-set-v1" ||
    rule.scoring !== "exact_set" ||
    rule.correctOptionIds.length !== 1
  )
    throw new PreviewError("Preview grading is unavailable.", 503);
  const correct = q.options.find((o) => o.id === rule.correctOptionIds[0]);
  if (!correct) throw new PreviewError("Preview grading reference is unavailable.", 503);
  return previewFeedbackSchema.parse({
    simulated: true,
    saved: false,
    exercise: input.exercise,
    selectedOptionId: input.optionId,
    isCorrect: input.optionId === correct.id,
    correctAnswer: correct.text.text,
    explanation: rule.explanation,
  });
}
