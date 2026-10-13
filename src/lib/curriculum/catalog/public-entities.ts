import "server-only";
import type { Chapter, Course, Curriculum, Lesson, LessonBlock, QuizBlock } from "../schema";
import type { CurriculumPackage } from "../v2/package";
import type { PublicEntity, PublicCollections } from "../v2/public";
import { refKey } from "../v2/validate";

export type LegacyPublicEntity =
  Course | Chapter | Lesson | LessonBlock | QuizBlock["questions"][number];
export function legacyPublicEntities(curriculum: Curriculum) {
  const entries: {
    kind: "course" | "chapter" | "lesson" | "block" | "question";
    entity: LegacyPublicEntity;
  }[] = [];
  for (const course of curriculum.courses) {
    entries.push({ kind: "course", entity: course });
    for (const chapter of course.chapters) {
      entries.push({ kind: "chapter", entity: chapter });
      for (const lesson of chapter.lessons) {
        entries.push({ kind: "lesson", entity: lesson });
        for (const block of lesson.blocks) {
          entries.push({ kind: "block", entity: block });
          if (block.type === "quiz")
            for (const question of block.questions)
              entries.push({ kind: "question", entity: question });
        }
      }
    }
  }
  return entries;
}

export function visibleDraftEntities(pkg: CurriculumPackage): PublicEntity[] {
  return visiblePublicEntities(pkg.public);
}

export function visiblePublicEntities(content: PublicCollections): PublicEntity[] {
  // No learner submission/reviewer context exists in D1: conditional transcripts fail closed.
  return Object.values(content)
    .flat()
    .filter((entity) => {
      if (entity.kind !== "transcript") return true;
      const uses = content.stimuli.filter(
        (s) => s.type === "listening" && refKey(s.transcriptRef) === refKey(entity),
      );
      return (
        uses.length > 0 &&
        uses.every((s) => s.type === "listening" && s.transcriptAccess === "always")
      );
    });
}
