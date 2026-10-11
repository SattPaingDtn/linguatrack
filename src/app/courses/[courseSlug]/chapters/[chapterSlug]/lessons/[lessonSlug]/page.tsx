import { z } from "zod";
import { notFound } from "next/navigation";
import { courses, getCourse, getChapter, getLesson } from "@/lib/curriculum";
import { LessonPlayer } from "@/components/lessons/lesson-player";
type Params = { courseSlug: string; chapterSlug: string; lessonSlug: string };
export function generateStaticParams() {
  return courses.flatMap((course) =>
    course.chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => ({
        courseSlug: course.slug,
        chapterSlug: chapter.slug,
        lessonSlug: lesson.slug,
      })),
    ),
  );
}
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { courseSlug, chapterSlug, lessonSlug } = await params;
  return { title: getLesson(courseSlug, chapterSlug, lessonSlug)?.title ?? "Lesson not found" };
}
export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { attempt } = await searchParams;
  const requestedAttempt =
    attempt === "new" || z.uuid().safeParse(attempt).success ? attempt : undefined;
  const { courseSlug, chapterSlug, lessonSlug } = await params;
  const course = getCourse(courseSlug);
  const chapter = getChapter(courseSlug, chapterSlug);
  const lesson = getLesson(courseSlug, chapterSlug, lessonSlug);
  if (!course || !chapter || !lesson) notFound();
  // Remount page-local exercise state on lesson changes. SessionProvider stays mounted.
  return (
    <LessonPlayer
      key={`${lesson.id}:${requestedAttempt ?? "resume"}`}
      course={course}
      chapter={chapter}
      lesson={lesson}
      requestedAttempt={requestedAttempt}
    />
  );
}
