import "server-only";
import { resolve } from "node:path";
import { curriculumSchema } from "../schema";
import { LIMITS } from "../v2/common";
import { parseJson, sha256 } from "../v2/json";
import { PreviewError, previewEnabled } from "../preview/server";
import { previewFeedbackSchema } from "../preview/contracts";
import { projectLessonContent } from "../chapter-preview/project";
import { CHAPTER_PREVIEW_PATH } from "../chapter-preview/config";
import { A1_PREVIEW_CHAPTERS, A1_PREVIEW_PATH, A1_PREVIEW_VERSION, a1AwaitsAudio } from "./config";
import { a1AnswerSchema, a1LessonSchema } from "./contracts";
const HASH = "994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa";
function guard() {
  if (!previewEnabled()) throw new PreviewError("Not found", 404);
}
export async function loadA1Draft() {
  guard(); // Before tooling imports/filesystem reads, even on direct helper calls.
  const { loadPackageChain, readRegularFile } = await import("../v2/reader");
  const root = process.cwd(),
    bytes = await readRegularFile(
      resolve(root, "src/content/v1/curriculum.json"),
      LIMITS.jsonFileBytes,
    );
  const chain = await loadPackageChain(
    ["1.1.0", "1.2.0", "1.3.0", "1.4.0", A1_PREVIEW_VERSION].map((v) =>
      resolve(root, ".curriculum-drafts", v),
    ),
    { legacy: curriculumSchema.parse(parseJson(bytes, "v1 baseline")), legacyHash: sha256(bytes) },
  );
  const loaded = chain.packages.at(-1)!;
  if (
    loaded.releaseHash !== HASH ||
    loaded.pkg.manifest.state !== "draft" ||
    loaded.pkg.manifest.contentVersion !== A1_PREVIEW_VERSION
  )
    throw new PreviewError("The exact inactive A1 expansion draft is unavailable.", 503);
  return loaded.pkg;
}
export async function getA1Catalog() {
  const pkg = await loadA1Draft();
  return pkg.public.chapters
    .filter((c) => c.id === "a1-chapter-1" || A1_PREVIEW_CHAPTERS.some((cfg) => cfg.id === c.id))
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      order: c.order,
      title: c.title,
      lessonCount: c.lessonRefs.length,
      path: c.id === "a1-chapter-1" ? CHAPTER_PREVIEW_PATH : `${A1_PREVIEW_PATH}/${c.slug}`,
      version: c.id === "a1-chapter-1" ? "1.4.0" : A1_PREVIEW_VERSION,
    }));
}
export async function getA1Chapter(slug: string) {
  guard();
  const config = A1_PREVIEW_CHAPTERS.find((c) => c.slug === slug);
  if (!config) throw new PreviewError("Not found", 404);
  const pkg = await loadA1Draft(),
    chapter = pkg.public.chapters.find((c) => c.id === config.id)!;
  const lessons = chapter.lessonRefs.map((r) => {
    const l = pkg.public.lessons.find(
      (l) =>
        l.id === r.id && l.revision === r.revision && config.lessonIds.some((id) => id === l.id),
    );
    if (!l) throw new PreviewError("An exact lesson reference is unavailable.", 503);
    return { id: l.id, slug: l.slug, title: l.title, areas: l.tags.areas };
  });
  return {
    id: chapter.id,
    slug: chapter.slug,
    title: chapter.title,
    order: chapter.order,
    description: chapter.description,
    lessons,
  };
}
export async function getA1Lesson(chapterSlug: string, lessonSlug: string) {
  guard();
  const config = A1_PREVIEW_CHAPTERS.find((c) => c.slug === chapterSlug);
  if (!config) throw new PreviewError("Not found", 404);
  const pkg = await loadA1Draft();
  return a1LessonSchema.parse({
    contentVersion: A1_PREVIEW_VERSION,
    ...projectLessonContent(pkg, config.id, lessonSlug, config.lessonIds, a1AwaitsAudio),
  });
}
export async function gradeA1Answer(raw: unknown) {
  guard();
  const parsed = a1AnswerSchema.safeParse(raw);
  if (!parsed.success) throw new PreviewError("Invalid A1 preview answer.");
  const input = parsed.data;
  if (a1AwaitsAudio(input.exercise.id))
    throw new PreviewError(
      "Audio pending. Script-reading preparation cannot be graded as listening.",
      409,
    );
  const pkg = await loadA1Draft(),
    lesson = pkg.public.lessons.find((l) => l.id === input.lessonId);
  const config = A1_PREVIEW_CHAPTERS.find(
    (c) => c.id === lesson?.chapterRef.id && c.lessonIds.some((id) => id === lesson?.id),
  );
  if (!lesson || !config)
    throw new PreviewError("This lesson is not part of the A1 expansion preview.");
  const preview = a1LessonSchema.parse({
    contentVersion: A1_PREVIEW_VERSION,
    ...projectLessonContent(pkg, config.id, lesson.slug, config.lessonIds, a1AwaitsAudio),
  });
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
    rule.correctOptionIds.length !== 1 ||
    rule.graderVersion !== "multiple-choice-exact-set-v1" ||
    rule.scoring !== "exact_set"
  )
    throw new PreviewError("A compatible grading rule is unavailable.", 503);
  const correct = q.options.find((o) => o.id === rule.correctOptionIds[0]);
  if (!correct) throw new PreviewError("The grading reference is invalid.", 503);
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
