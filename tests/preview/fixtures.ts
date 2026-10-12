import authored from "../../content-authoring/a1-subject-pronouns/public.json";
import grading from "../../content-authoring/a1-subject-pronouns/grading.json";
import { previewLessonSchema } from "../../src/lib/curriculum/preview/contracts";
import { fingerprint } from "../../src/lib/curriculum/v2/json";
const content = {
  lesson: authored.lessons[0],
  blocks: authored.blocks,
  objectives: authored.objectives,
  exercises: authored.exercises,
};
export const preview = previewLessonSchema.parse({
  contentVersion: "1.3.0",
  publicDigest: fingerprint(content),
  ...content,
});
export const rules = grading.exerciseRules;
export function answer(index = 0, optionId = "option-1") {
  const q = preview.exercises[index]!;
  return {
    contentVersion: "1.3.0" as const,
    lessonId: "a1-c1-subject-pronouns" as const,
    publicDigest: preview.publicDigest,
    exercise: { kind: "exercise" as const, id: q.id, revision: q.revision },
    optionId,
  };
}
export function loadedDraft() {
  return {
    packages: [
      {
        releaseHash: "0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029",
        pkg: {
          manifest: { state: "draft", contentVersion: "1.3.0" },
          public: structuredClone(authored),
          private: { grading: structuredClone(grading) },
        },
      },
    ],
  };
}
