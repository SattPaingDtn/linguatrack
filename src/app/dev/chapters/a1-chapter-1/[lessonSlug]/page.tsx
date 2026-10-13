import { notFound } from "next/navigation";
import { ChapterLessonView } from "@/components/preview/chapter-lesson";
import { getChapterLesson, getChapterCatalog } from "@/lib/curriculum/chapter-preview/server";
import { CHAPTER_PREVIEW_PATH } from "@/lib/curriculum/chapter-preview/config";
import { buildLessonNavigation } from "@/lib/curriculum/preview/lesson-navigation";
import { PreviewError } from "@/lib/curriculum/preview/server";
export const dynamic = "force-dynamic";
export default async function ChapterLessonPage({
  params,
}: {
  params: Promise<{ lessonSlug: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { lessonSlug } = await params;
  let preview;
  let lessonNavigation;
  try {
    preview = await getChapterLesson(lessonSlug);
    lessonNavigation = buildLessonNavigation(
      await getChapterCatalog(),
      preview.lesson.id,
      CHAPTER_PREVIEW_PATH,
    );
  } catch (error) {
    if (error instanceof PreviewError && error.status === 404) notFound();
    return (
      <section role="alert" className="soft-panel">
        <h1 className="text-xl font-semibold">Local lesson preview unavailable</h1>
        <p className="mt-4 leading-7">
          Check the validated 1.1.0–1.4.0 draft chain. No answers or learning records were saved.
        </p>
      </section>
    );
  }
  return (
    <ChapterLessonView
      key={preview.lesson.id}
      preview={preview}
      pickerPath="/dev/a1"
      lessonNavigation={lessonNavigation}
    />
  );
}
