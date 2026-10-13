import { notFound } from "next/navigation";
import { MANUSCRIPT_CHAPTERS } from "@/lib/curriculum/manuscript-preview/config";
import { getManuscriptLesson } from "@/lib/curriculum/manuscript-preview/server";
import { ManuscriptLessonView } from "@/components/preview/manuscript-lesson";
import { ChapterLessonView } from "@/components/preview/chapter-lesson";
import { getA1Lesson, getA1Chapter } from "@/lib/curriculum/a1-preview/server";
import { buildLessonNavigation } from "@/lib/curriculum/preview/lesson-navigation";
import { A1_PREVIEW_PATH } from "@/lib/curriculum/a1-preview/config";
import { PreviewError } from "@/lib/curriculum/preview/server";
export const dynamic = "force-dynamic";
export default async function A1Lesson({
  params,
}: {
  params: Promise<{ chapterSlug: string; lessonSlug: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { chapterSlug, lessonSlug } = await params;
  let preview;
  let lessonNavigation;
  try {
    preview = MANUSCRIPT_CHAPTERS.some((c) => c.slug === chapterSlug)
      ? await getManuscriptLesson(chapterSlug, lessonSlug)
      : await getA1Lesson(chapterSlug, lessonSlug);
    if (!("shortResponses" in preview)) {
      const chapter = await getA1Chapter(chapterSlug);
      lessonNavigation = buildLessonNavigation(
        chapter.lessons,
        preview.lesson.id,
        `${A1_PREVIEW_PATH}/${chapterSlug}`,
      );
    }
  } catch (e) {
    if (e instanceof PreviewError && e.status === 404) notFound();
    return (
      <section role="alert" className="soft-panel">
        <h1 className="text-xl font-semibold">A1 lesson preview unavailable</h1>
        <p className="mt-4 leading-7">
          Check the validated 1.1.0–1.5.0 draft chain. No answers or learning records were saved.
        </p>
      </section>
    );
  }
  if ("shortResponses" in preview)
    return (
      <ManuscriptLessonView key={preview.lesson.id} preview={preview} chapterSlug={chapterSlug} />
    );
  return (
    <ChapterLessonView
      key={preview.lesson.id}
      preview={preview}
      chapterPath={`${A1_PREVIEW_PATH}/${chapterSlug}`}
      pickerPath={A1_PREVIEW_PATH}
      endpoint="/api/dev-a1-preview/answer"
      lessonNavigation={lessonNavigation}
    />
  );
}
