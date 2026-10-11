import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3 } from "lucide-react";
import { courses, getCourse } from "@/lib/curriculum";
import { PageHeading } from "@/components/shared/page-heading";
import { DemoNotice } from "@/components/shared/demo-notice";
import { Button } from "@/components/ui/button";
import { SkillBadge } from "@/components/shared/skill-badge";
import { LessonList } from "@/components/courses/lesson-list";

export function generateStaticParams() {
  return courses.map((course) => ({ courseSlug: course.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string }> }) {
  const course = getCourse((await params).courseSlug);
  return { title: course ? `${course.level} · ${course.title}` : "Course not found" };
}
export default async function CoursePage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const course = getCourse((await params).courseSlug);
  if (!course) notFound();
  return (
    <>
      <Link
        href="/courses"
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All courses
      </Link>
      <PageHeading
        eyebrow={`${course.level} · GENERAL ENGLISH`}
        title={course.title}
        description={course.description.en}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {(["listening", "speaking", "reading", "writing"] as const).map((area) => (
          <SkillBadge key={area} area={area} />
        ))}
      </div>
      <DemoNotice />
      {course.status === "planned" ? (
        <section className="soft-panel mt-7">
          <span className="eyebrow">CURRICULUM PREVIEW · COMING LATER</span>
          <h2 className="mt-3 text-xl font-semibold">A glimpse of your next level</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            This course is planned. Lessons and chapter content are not available in this release.
          </p>
          <ul className="my-6 space-y-3">
            {course.outcomes.map((outcome) => (
              <li key={outcome} className="flex gap-2 text-sm">
                <Check size={17} aria-hidden="true" />
                {outcome}
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href="/courses/a1">
              Try the A1 sample <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
          <div>
            <h2 className="section-title mb-4">Your chapters</h2>
            {course.chapters.map((chapter) => (
              <section key={chapter.id} className="mb-6">
                <div className="mb-4 rounded-2xl bg-[#e9efdd] p-6">
                  <p className="eyebrow text-[10px]">
                    CHAPTER {String(chapter.order).padStart(2, "0")} · SAMPLE CONTENT
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                    <Link href={`/courses/${course.slug}/chapters/${chapter.slug}`}>
                      {chapter.title}
                    </Link>
                  </h3>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    {chapter.description.en}
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen size={12} aria-hidden="true" />
                      {chapter.lessons.length} lessons
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock3 size={12} aria-hidden="true" />
                      {chapter.lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0)} min
                    </span>
                    <Link
                      href={`/courses/${course.slug}/chapters/${chapter.slug}`}
                      className="ml-auto font-semibold text-primary"
                    >
                      Chapter overview{" "}
                      <ArrowRight size={12} className="ml-1 inline" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
                <LessonList course={course} chapter={chapter} />
              </section>
            ))}
          </div>
          <aside className="soft-panel h-fit">
            <p className="eyebrow">BY THE END, YOU CAN</p>
            <ul className="mt-5 space-y-4">
              {course.outcomes.map((outcome) => (
                <li key={outcome} className="flex gap-2 text-xs leading-5">
                  <Check className="mt-0.5 shrink-0 text-[#63864f]" size={15} aria-hidden="true" />
                  {outcome}
                </li>
              ))}
            </ul>
            <div className="mt-6 border-t pt-5">
              <p className="text-xs font-semibold">Learn in two languages</p>
              <p lang="my" className="mt-3 text-xs text-muted-foreground">
                အင်္ဂလိပ်စာကို မြန်မာဘာသာရှင်းလင်းချက်များနှင့် လေ့လာနိုင်ပါသည်။
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
