import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { courses, getCourse, getChapter } from "@/lib/curriculum";
import { PageHeading } from "@/components/shared/page-heading";
import { DemoNotice } from "@/components/shared/demo-notice";
import { LessonList } from "@/components/courses/lesson-list";
type Params = { courseSlug: string; chapterSlug: string };
export function generateStaticParams() {
  return courses.flatMap((course) =>
    course.chapters.map((chapter) => ({ courseSlug: course.slug, chapterSlug: chapter.slug })),
  );
}
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { courseSlug, chapterSlug } = await params;
  return { title: getChapter(courseSlug, chapterSlug)?.title ?? "Chapter not found" };
}
export default async function ChapterPage({ params }: { params: Promise<Params> }) {
  const { courseSlug, chapterSlug } = await params;
  const course = getCourse(courseSlug);
  const chapter = getChapter(courseSlug, chapterSlug);
  if (!course || !chapter) notFound();
  return (
    <>
      <Link
        href={`/courses/${course.slug}`}
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {course.level} course
      </Link>
      <PageHeading
        eyebrow={`${course.level} · CHAPTER ${String(chapter.order).padStart(2, "0")} · SAMPLE`}
        title={chapter.title}
        description={chapter.description.en}
      />
      <DemoNotice />
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <h2 className="section-title mb-4">One hello. Three small steps.</h2>
          <LessonList course={course} chapter={chapter} />
        </section>
        <aside className="soft-panel h-fit">
          <h2 className="section-title">Before you begin</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            You don’t need to know any English yet. Find a quiet moment, listen carefully, and
            practise at your own pace.
          </p>
          <p lang="my" className="mt-4 text-xs text-muted-foreground">
            အင်္ဂလိပ်စာ မတတ်သေးလည်း စတင်နိုင်ပါသည်။ သေချာနားထောင်ပြီး မိမိနှုန်းအတိုင်း လေ့ကျင့်ပါ။
          </p>
          <p className="mt-5 border-t pt-4 text-[10px] text-muted-foreground">
            25 minutes estimated · 5-question quiz · 80% to pass
          </p>
        </aside>
      </div>
    </>
  );
}
