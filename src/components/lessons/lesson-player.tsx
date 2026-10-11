"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3 } from "lucide-react";
import type { Course, Chapter, Lesson } from "@/lib/curriculum/schema";
import { curriculum, lessonHref } from "@/lib/curriculum";
import { LessonContentBlock } from "@/components/lessons/lesson-block";
import { SkillBadge } from "@/components/shared/skill-badge";
import { DemoNotice } from "@/components/shared/demo-notice";
import { useSession } from "@/components/progress/session-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LessonPlayer({
  course,
  chapter,
  lesson,
  requestedAttempt,
}: {
  course: Course;
  chapter: Chapter;
  lesson: Lesson;
  requestedAttempt?: string;
}) {
  const { completed, completeLesson, attempts, mode, loading, user, profile, visitLesson } =
    useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const position = useRef<string | null>(null);
  const resume = useRef(profile);
  useEffect(() => {
    resume.current = profile;
  }, [profile]);
  useEffect(() => {
    if (loading || mode !== "persistent" || !user?.id) return;
    const saved = resume.current;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target =
      lesson.blocks.find((b) => b.id === hash)?.id ??
      (saved.lastLessonId === lesson.id && saved.contentVersion === curriculum.contentVersion
        ? saved.lastBlockId
        : null);
    position.current = target;
    if (target) document.getElementById(target)?.scrollIntoView();
    void visitLesson(lesson.id, target).catch(() => undefined);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (
          visible &&
          visible.target.id !== position.current &&
          document.visibilityState === "visible"
        ) {
          position.current = visible.target.id;
          void visitLesson(lesson.id, position.current).catch(() => undefined);
        }
      },
      { rootMargin: "-10% 0px -50% 0px", threshold: 0 },
    );
    lesson.blocks.forEach((b) => {
      const el = document.getElementById(b.id);
      if (el) observer.observe(el);
    });
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void visitLesson(lesson.id, position.current).catch(() => undefined);
    }, 30000);
    return () => {
      observer.disconnect();
      window.clearInterval(heartbeat);
    };
  }, [loading, mode, user?.id, lesson, visitLesson]);
  const index = chapter.lessons.findIndex((item) => item.id === lesson.id);
  const nextLesson = chapter.lessons[index + 1];
  const done = completed.includes(lesson.id);
  const quizzes = lesson.blocks.filter((block) => block.type === "quiz");
  const canComplete = quizzes.every((quiz) =>
    attempts.some((attempt) => attempt.quizId === quiz.id && attempt.passed),
  );
  return (
    <>
      <Link
        href={`/courses/${course.slug}/chapters/${chapter.slug}`}
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {chapter.title}
      </Link>
      <div className="mb-6">
        <p className="eyebrow mb-2">
          {course.level} · CHAPTER {String(chapter.order).padStart(2, "0")} · LESSON{" "}
          {String(index + 1).padStart(2, "0")}
        </p>
        <h1 className="page-title">{lesson.title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{lesson.description.en}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {lesson.areas.map((area) => (
            <SkillBadge key={area} area={area} />
          ))}
          <span className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock3 size={12} aria-hidden="true" />
            {lesson.durationMinutes} min
          </span>
        </div>
      </div>
      <DemoNotice compact />
      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-[#dce5ce] bg-[#e9efdd] p-5">
            <h2 className="text-sm font-semibold">Today’s small wins</h2>
            <ul className="mt-3 space-y-3">
              {lesson.objectives.map((objective) => (
                <li key={objective.en} className="flex gap-2.5">
                  <Check size={15} className="mt-1 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs leading-6">{objective.en}</p>
                    <p lang="my" className="mt-1 text-[11px] text-muted-foreground">
                      {objective.my}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {lesson.blocks.map((block) => (
            <LessonContentBlock
              key={block.id}
              block={block}
              lessonId={lesson.id}
              requestedAttempt={requestedAttempt}
            />
          ))}
          <div className="soft-panel">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">
                  {done ? "One more step forward." : "Ready for the next step?"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {done
                    ? mode === "persistent"
                      ? "Completion is saved to your account."
                      : "Completed in this session. Reloading clears progress."
                    : quizzes.length
                      ? "Pass the quiz to complete this lesson."
                      : "Mark this lesson complete when you finish practising."}
                </p>
              </div>
              <Button
                disabled={done || !canComplete || loading || mode === "loading" || saving}
                onClick={async () => {
                  setSaving(true);
                  setError(null);
                  try {
                    await completeLesson(lesson.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Completion was not saved. Retry.");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-lg text-xs"
              >
                <Check aria-hidden="true" />
                {saving
                  ? "Saving completion…"
                  : done
                    ? mode === "persistent"
                      ? "Completed"
                      : "Completed this session"
                    : "Mark lesson complete"}
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-5 border-t pt-4">
              <Button asChild variant="outline" className="w-full rounded-lg text-xs">
                <Link href={nextLesson ? lessonHref(course, chapter, nextLesson) : "/review"}>
                  {nextLesson ? `Next: ${nextLesson.title}` : "View review history"}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <aside className="soft-panel xl:sticky xl:top-6">
          <p className="eyebrow text-[10px]">IN THIS CHAPTER</p>
          <nav aria-label="Chapter lessons" className="mt-4 space-y-2">
            {chapter.lessons.map((item, itemIndex) => (
              <Link
                key={item.id}
                href={lessonHref(course, chapter, item)}
                aria-current={item.id === lesson.id ? "page" : undefined}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg p-3 text-xs leading-5",
                  item.id === lesson.id
                    ? "bg-[#edf2e7] font-semibold"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="shrink-0">
                  {completed.includes(item.id) ? (
                    <Check size={13} className="mt-1" aria-label="Completed" />
                  ) : (
                    String(itemIndex + 1).padStart(2, "0")
                  )}
                </span>
                {item.title}
              </Link>
            ))}
          </nav>
          <div className="mt-5 border-t pt-5">
            <p className="eyebrow text-[9px]">ON THIS PAGE</p>
            <nav aria-label="Lesson sections" className="mt-3 space-y-2">
              {lesson.blocks.map((block) => (
                <a
                  key={block.id}
                  href={`#${block.id}`}
                  className="block text-[11px] leading-5 text-muted-foreground hover:text-primary"
                >
                  {block.title}
                </a>
              ))}
            </nav>
          </div>
          <p className="mt-5 border-t pt-4 text-[10px] leading-5 text-muted-foreground">
            No rush. Read the Burmese notes whenever you need a little clarity.
          </p>
        </aside>
      </div>
    </>
  );
}
