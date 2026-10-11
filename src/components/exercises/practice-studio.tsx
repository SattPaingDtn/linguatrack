"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkillBadge } from "@/components/shared/skill-badge";
import { firstCourse, firstChapter, lessonHref } from "@/lib/curriculum";
import type { LearningArea, LessonBlock } from "@/lib/curriculum/schema";
const blockAreas: Record<LessonBlock["type"], LearningArea> = {
  explanation: "reading",
  reading: "reading",
  grammar: "grammar",
  vocabulary: "vocabulary",
  listening: "listening",
  speaking: "speaking",
  writing: "writing",
  quiz: "grammar",
};
const areas: LearningArea[] = [
  "listening",
  "speaking",
  "reading",
  "writing",
  "grammar",
  "vocabulary",
];
export function PracticeStudio() {
  const [filter, setFilter] = useState<LearningArea | "all">("all");
  const exercises = firstChapter.lessons.flatMap((lesson) =>
    lesson.blocks
      .filter((block) => block.type !== "explanation")
      .map((block) => ({ block, lesson, area: blockAreas[block.type] })),
  );
  const visible = exercises.filter((exercise) => filter === "all" || exercise.area === filter);
  return (
    <>
      <div
        role="group"
        aria-label="Filter exercises by learning area"
        className="my-7 flex flex-wrap gap-2"
      >
        {(["all", ...areas] as const).map((area) => (
          <Button
            key={area}
            size="sm"
            variant={filter === area ? "default" : "outline"}
            aria-pressed={filter === area}
            onClick={() => setFilter(area)}
            className="rounded-full text-xs capitalize"
          >
            {area === "all" ? "All practice" : area}
          </Button>
        ))}
      </div>
      <p role="status" className="mb-4 text-xs text-muted-foreground">
        {visible.length} sample {visible.length === 1 ? "exercise" : "exercises"}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map(({ block, lesson, area }) => (
          <article key={block.id} className="soft-panel">
            <SkillBadge area={area} />
            <h2 className="mt-4 text-lg font-semibold">{block.title}</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              A1 · Chapter 1 · {lesson.title}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {block.type === "quiz"
                ? "Multiple choice · instant feedback"
                : block.type === "speaking" || block.type === "writing"
                  ? "Self-practice · no automatic assessment"
                  : "Guided learning · Burmese explanations"}
            </p>
            <Button asChild variant="outline" className="mt-5 rounded-lg text-xs">
              <Link href={`${lessonHref(firstCourse, firstChapter, lesson)}#${block.id}`}>
                Practise now <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}
