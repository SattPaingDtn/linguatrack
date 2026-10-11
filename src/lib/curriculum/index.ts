import content from "@/content/public/v1/curriculum.json";
import { publicCurriculumSchema, type Course, type Chapter, type Lesson } from "./schema";

// Parse once at the content boundary. Invalid content fails builds and tests.
export const curriculum = publicCurriculumSchema.parse(content);
export const courses = curriculum.courses;
export const availableLessons = courses.flatMap((course) =>
  course.chapters.flatMap((chapter) => chapter.lessons),
);
export function getCourse(slug: string): Course | undefined {
  return courses.find((course) => course.slug === slug);
}
export function getChapter(courseSlug: string, chapterSlug: string): Chapter | undefined {
  return getCourse(courseSlug)?.chapters.find((chapter) => chapter.slug === chapterSlug);
}
export function getLesson(
  courseSlug: string,
  chapterSlug: string,
  lessonSlug: string,
): Lesson | undefined {
  return getChapter(courseSlug, chapterSlug)?.lessons.find((lesson) => lesson.slug === lessonSlug);
}
export function lessonHref(course: Course, chapter: Chapter, lesson: Lesson) {
  return `/courses/${course.slug}/chapters/${chapter.slug}/lessons/${lesson.slug}`;
}
// The Phase 1 dashboard intentionally features the sample, regardless of catalogue order.
function getPhaseOneSample() {
  const course = getCourse("a1");
  const chapter = course?.chapters.find((item) => item.slug === "first-conversations");
  const lesson = chapter?.lessons[0];
  if (!course || !chapter || !lesson) {
    throw new Error("The Phase 1 A1 sample chapter must be present in the curriculum release");
  }
  return { course, chapter, lesson };
}
export const {
  course: firstCourse,
  chapter: firstChapter,
  lesson: firstLesson,
} = getPhaseOneSample();
export const firstLessonHref = lessonHref(firstCourse, firstChapter, firstLesson);
