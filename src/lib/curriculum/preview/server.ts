import "server-only";
import { resolve } from "node:path";
import { curriculumSchema } from "@/lib/curriculum/schema";
import { LIMITS } from "../v2/common";
import { fingerprint, parseJson, sha256 } from "../v2/json";
import type { PublicEntity } from "../v2/public";
import {
  PREVIEW_LESSON_ID,
  PREVIEW_VERSION,
  previewAnswerSchema,
  previewFeedbackSchema,
  previewLessonSchema,
  type PreviewAnswer,
} from "./contracts";

const PINNED_RELEASE_HASH = "0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029";
export class PreviewError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function previewEnabled() {
  return process.env.NODE_ENV === "development";
}
function requireDevelopment() {
  if (!previewEnabled()) throw new PreviewError("Not found", 404);
}
function exact<T extends PublicEntity>(items: T[], ref: { id: string; revision: number }): T {
  const item = items.find((e) => e.id === ref.id && e.revision === ref.revision);
  if (!item) throw new PreviewError(`Preview reference is missing: ${ref.id}@${ref.revision}`, 503);
  return item;
}
async function loadDraft() {
  // Guard before any filesystem access. Fixed paths cannot be selected by submissions.
  // Guard the read-only tooling import too, including direct helper calls.
  if (process.env.NODE_ENV !== "development") throw new PreviewError("Not found", 404);
  const { loadPackageChain, readRegularFile } = await import("../v2/reader");
  const root = process.cwd();
  const baseline = await readRegularFile(
    resolve(root, "src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const chain = await loadPackageChain(
    ["1.1.0", "1.2.0", PREVIEW_VERSION].map((v) => resolve(root, ".curriculum-drafts", v)),
    {
      legacy: curriculumSchema.parse(parseJson(baseline, "v1 baseline")),
      legacyHash: sha256(baseline),
    },
  );
  const loaded = chain.packages.at(-1)!;
  if (
    loaded.releaseHash !== PINNED_RELEASE_HASH ||
    loaded.pkg.manifest.state !== "draft" ||
    loaded.pkg.manifest.contentVersion !== PREVIEW_VERSION
  )
    throw new PreviewError(
      "The preview requires the unchanged, validated 1.3.0 draft. Restore that draft; do not regenerate or overwrite it.",
      503,
    );
  const p = loaded.pkg.public;
  const lesson = p.lessons.find((l) => l.id === PREVIEW_LESSON_ID);
  if (!lesson) throw new PreviewError("Subject pronouns lesson is missing from the draft.", 503);
  const blocks = lesson.blockRefs.map((ref) => exact(p.blocks, ref));
  const objectives = lesson.objectiveRefs.map((ref) => exact(p.objectives, ref));
  const exercises = blocks.flatMap((b) =>
    b.type === "exercise_set" ? b.exerciseRefs.map((ref) => exact(p.exercises, ref)) : [],
  );
  const publicContent = { lesson, blocks, objectives, exercises };
  // Explicit public allowlist plus strict parsing: never serialize the package or private inventory.
  const preview = previewLessonSchema.parse({
    contentVersion: PREVIEW_VERSION,
    publicDigest: fingerprint(publicContent),
    ...publicContent,
  });
  if (exercises.length !== 14)
    throw new PreviewError("This preview requires all 14 questions.", 503);
  return { preview, grading: loaded.pkg.private.grading };
}
export async function getPreviewLesson() {
  return (await loadDraft()).preview;
}
export async function gradePreviewAnswer(raw: PreviewAnswer) {
  requireDevelopment();
  const parsed = previewAnswerSchema.safeParse(raw);
  if (!parsed.success) throw new PreviewError("Invalid preview submission.");
  const input = parsed.data;
  const { preview, grading } = await loadDraft();
  if (input.publicDigest !== preview.publicDigest)
    throw new PreviewError(
      "Preview content changed. Reload the preview before trying again; your selection has not been saved.",
      409,
    );
  const question = preview.exercises.find(
    (e) => e.id === input.exercise.id && e.revision === input.exercise.revision,
  );
  if (!question || !question.options.some((o) => o.id === input.optionId))
    throw new PreviewError("The question revision or selected option is not part of this preview.");
  const rule = grading.exerciseRules.find(
    (r) => r.exerciseRef.id === question.id && r.exerciseRef.revision === question.revision,
  );
  if (
    !rule ||
    rule.type !== "multiple_choice" ||
    rule.scoring !== "exact_set" ||
    rule.correctOptionIds.length !== 1
  )
    throw new PreviewError("A compatible preview grading rule is unavailable.", 503);
  const correct = question.options.find((o) => o.id === rule.correctOptionIds[0]);
  if (!correct) throw new PreviewError("The preview answer reference is invalid.", 503);
  // Stateless formative feedback for this question only; no learning/session/database imports.
  return previewFeedbackSchema.parse({
    simulated: true,
    saved: false,
    exercise: input.exercise,
    selectedOptionId: input.optionId,
    isCorrect: rule.correctOptionIds[0] === input.optionId,
    correctAnswer: correct.text.text,
    explanation: rule.explanation,
  });
}
