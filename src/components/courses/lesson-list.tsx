"use client";
import Link from "next/link";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import type { Chapter, Course } from "@/lib/curriculum/schema";
import { lessonHref } from "@/lib/curriculum";
import { useSession } from "@/components/progress/session-provider";
import { SkillBadge } from "@/components/shared/skill-badge";
import { cn } from "@/lib/utils";

export function LessonList({ course, chapter }: { course: Course; chapter: Chapter }) {
  const { completed, mode } = useSession();
  return (
    <ol className="space-y-3">
      {chapter.lessons.map((lesson, index) => (
        <li key={lesson.id}>
          <Link
            href={lessonHref(course, chapter, lesson)}
            className="group flex items-start gap-4 rounded-xl border bg-white p-5 transition-colors hover:border-[#a9bb9b]"
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                completed.includes(lesson.id) ? "bg-primary text-white" : "bg-[#eef2e7]",
              )}
            >
              {completed.includes(lesson.id) ? (
                <Check
                  size={17}
                  aria-label={mode === "persistent" ? "Completed" : "Completed in this session"}
                />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{lesson.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {lesson.description.en}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lesson.areas.map((area) => (
                  <SkillBadge key={area} area={area} />
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock3 size={12} aria-hidden="true" />
                {lesson.durationMinutes} min ·{" "}
                {completed.includes(lesson.id)
                  ? mode === "persistent"
                    ? "Completed"
                    : "Completed this session"
                  : "Ready to learn"}
              </p>
            </div>
            <ArrowRight
              size={17}
              className="mt-2 shrink-0 text-muted-foreground group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ol>
  );
}
