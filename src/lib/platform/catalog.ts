import "server-only";
import { z } from "zod";
import { hashSchema, reference, type Ref } from "@/lib/curriculum/v2/common";
import { publicCollectionsSchema, type PublicEntity } from "@/lib/curriculum/v2/public";
import { publicManifestSchema } from "@/lib/curriculum/v2/projection";
import { visiblePublicEntities } from "@/lib/curriculum/catalog/public-entities";

const projectionSchema = z
  .object({ manifest: publicManifestSchema, content: publicCollectionsSchema })
  .strict();
const key = (r: Ref) => `${r.kind}:${r.id}@${r.revision}`;
const identity = <K extends Ref["kind"]>(e: Ref<K>): Ref<K> => ({
  kind: e.kind,
  id: e.id,
  revision: e.revision,
});

/** Read-only presentation model. Sealed is not published; this grants no learner access/writes.
 * Only an explicit public projection may enter. No private grading/source package is accepted.
 */
export function createLearningCatalog(rawProjection: unknown, rawHash: unknown) {
  const projected = projectionSchema.parse(rawProjection);
  const releaseHash = hashSchema.parse(rawHash);
  const entities = visiblePublicEntities(projected.content);
  const index = new Map<string, PublicEntity>();
  for (const entity of entities) {
    if (index.has(key(entity)))
      throw new Error(`Duplicate exact content reference: ${key(entity)}`);
    index.set(key(entity), entity);
  }
  function resolve<K extends PublicEntity["kind"]>(
    ref: Ref<K>,
  ): Extract<PublicEntity, { kind: K }> {
    const value = index.get(key(ref));
    if (!value) throw new Error(`Missing public content reference: ${key(ref)}`);
    return value as Extract<PublicEntity, { kind: K }>;
  }
  const release = {
    schemaVersion: 2 as const,
    contentVersion: projected.manifest.contentVersion,
    releaseHash,
    contentState: projected.manifest.state,
    publication: "unpublished" as const,
    persistence: "not-enabled" as const,
    cefrAwarding: "disabled" as const,
  };
  const courses = projected.manifest.courseRefs.map((courseRef) => {
    const course = resolve(courseRef);
    const proposedHref = `/courses/${course.slug}`;
    const chapters = course.chapterRefs.map((chapterRef) => {
      const chapter = resolve(chapterRef);
      if (key(chapter.courseRef) !== key(course))
        throw new Error(`Chapter owner mismatch: ${chapter.id}`);
      const proposedHref = `/courses/${course.slug}/chapters/${chapter.slug}`;
      const lessons = chapter.lessonRefs.map((lessonRef) => {
        const lesson = resolve(lessonRef);
        if (key(lesson.chapterRef) !== key(chapter))
          throw new Error(`Lesson owner mismatch: ${lesson.id}`);
        return {
          ref: identity(lesson),
          slug: lesson.slug,
          title: lesson.title,
          tags: lesson.tags,
          proposedHref: `${proposedHref}/lessons/${lesson.slug}`,
        };
      });
      return {
        ref: identity(chapter),
        slug: chapter.slug,
        title: chapter.title,
        order: chapter.order,
        proposedHref,
        assessments: chapter.assessmentRefs.map((r) => identity(resolve(r))),
        lessons,
      };
    });
    return {
      ref: identity(course),
      slug: course.slug,
      level: course.level,
      title: course.title,
      description: course.description,
      status: course.status,
      coverageState: course.coverageState,
      proposedHref,
      chapters,
    };
  });
  const paths = courses.flatMap((c) => [
    c.proposedHref,
    ...c.chapters.flatMap((ch) => [ch.proposedHref, ...ch.lessons.map((l) => l.proposedHref)]),
  ]);
  if (new Set(paths).size !== paths.length)
    throw new Error("Duplicate course/chapter/lesson route slug");

  function lesson(rawRef: unknown) {
    const ref = reference("lesson").parse(rawRef);
    const content = resolve(ref);
    const course = courses.find((c) =>
      c.chapters.some((ch) => ch.lessons.some((l) => key(l.ref) === key(ref))),
    );
    const chapter = course?.chapters.find((ch) => ch.lessons.some((l) => key(l.ref) === key(ref)));
    if (!course || !chapter) throw new Error(`Lesson is not in a declared course: ${key(ref)}`);
    const blocks = content.blockRefs.map((r) => {
      const block = resolve(r);
      if (key(block.lessonRef) !== key(content))
        throw new Error(`Block owner mismatch: ${block.id}`);
      return block;
    });
    const questions = new Map<string, ReturnType<typeof resolve<"exercise">>>();
    function exercise(r: Ref<"exercise">, ancestors = new Set<string>()) {
      if (ancestors.has(key(r))) throw new Error(`Cyclic comprehension reference: ${key(r)}`);
      const e = resolve(r);
      questions.set(key(e), e);
      if (e.type === "reading_comprehension" || e.type === "listening_comprehension") {
        const next = new Set(ancestors).add(key(r));
        e.itemRefs.forEach((child) => exercise(child, next));
      }
    }
    blocks.forEach((b) => {
      if (b.type === "quiz" || b.type === "exercise_set")
        b.exerciseRefs.forEach((r) => exercise(r));
    });
    const stimuli = new Map<string, ReturnType<typeof resolve<"stimulus">>>();
    [...blocks, ...questions.values()].forEach((e) => {
      if ("stimulusRef" in e) stimuli.set(key(e.stimulusRef), resolve(e.stimulusRef));
    });
    const assets = [...stimuli.values()].flatMap((s) =>
      s.type === "listening" ? [resolve(s.audioRef)] : [],
    );
    const transcripts = [...stimuli.values()].flatMap((s) =>
      s.type === "listening" && s.transcriptAccess === "always" && index.has(key(s.transcriptRef))
        ? [resolve(s.transcriptRef)]
        : [],
    );
    const listeningRequested =
      content.tags.areas.includes("listening") || content.tags.coreSkills.includes("listening");
    const allLessons = course.chapters.flatMap((ch) => ch.lessons);
    const position = allLessons.findIndex((l) => key(l.ref) === key(ref));
    return structuredClone({
      release,
      lesson: content,
      blocks,
      objectives: content.objectiveRefs.map((r) => resolve(r)),
      exercises: [...questions.values()],
      stimuli: [...stimuli.values()],
      assets,
      transcripts,
      availability: {
        publication: "unpublished" as const,
        learning: "not-enabled" as const,
        audio: assets.length
          ? ("media-present-playback-pending" as const)
          : listeningRequested
            ? ("audio-pending" as const)
            : ("not-requested" as const),
        writing: "ungraded-saving-pending" as const,
        speaking: "ungraded-recording-pending" as const,
      },
      navigation: {
        course: course.proposedHref,
        chapter: chapter.proposedHref,
        courses: "/courses",
        position: position + 1,
        total: allLessons.length,
        previous: allLessons[position - 1] ?? null,
        next: allLessons[position + 1] ?? null,
      },
    });
  }
  return Object.freeze({
    release: () => structuredClone(release),
    courses: () => structuredClone(courses),
    lesson,
  });
}
export type LearningCatalog = ReturnType<typeof createLearningCatalog>;
export type LearningLesson = ReturnType<LearningCatalog["lesson"]>;
