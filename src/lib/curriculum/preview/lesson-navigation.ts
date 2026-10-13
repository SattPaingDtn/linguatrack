// Navigation consumes public catalog metadata only; no grading or persistence dependencies.
export type LessonLink = { href: string; title: string };
export type LessonNavigation = {
  position: number;
  total: number;
  previous?: LessonLink;
  next?: LessonLink;
};
type CatalogLesson = {
  id: string;
  slug: string;
  title: { en: string; my: string } | { language: string; text: string };
};
export function buildLessonNavigation(
  lessons: readonly CatalogLesson[],
  currentId: string,
  chapterPath: string,
): LessonNavigation {
  const index = lessons.findIndex((lesson) => lesson.id === currentId);
  if (index < 0) throw new Error("The lesson is missing from its public chapter catalog.");
  const link = (lesson: CatalogLesson | undefined): LessonLink | undefined =>
    lesson
      ? {
          href: `${chapterPath}/${lesson.slug}`,
          title: "en" in lesson.title ? lesson.title.en : lesson.title.text,
        }
      : undefined;
  return {
    position: index + 1,
    total: lessons.length,
    previous: link(lessons[index - 1]),
    next: link(lessons[index + 1]),
  };
}
