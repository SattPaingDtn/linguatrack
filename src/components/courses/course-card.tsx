import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clock3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Course } from "@/lib/curriculum/schema";
import { cn } from "@/lib/utils";

const colors: Record<Course["level"], string> = {
  A1: "bg-[#e7efdc]",
  A2: "bg-[#f4e7d8]",
  B1: "bg-[#e6edf4]",
  B2: "bg-[#eee6f3]",
  C1: "bg-[#f3e9cf]",
};
export function CourseCard({ course }: { course: Course }) {
  const available = course.status === "available";
  const lessonCount = course.chapters.reduce((count, chapter) => count + chapter.lessons.length, 0);
  return (
    <Card className="overflow-hidden rounded-2xl py-0 shadow-none">
      <div
        className={cn("relative flex h-36 items-center justify-between p-6", colors[course.level])}
      >
        <span className="text-6xl font-semibold tracking-[-0.07em] text-primary/80">
          {course.level}
        </span>
        <div className="relative flex size-20 items-center justify-center rounded-full border border-white/80">
          <div className="size-14 rounded-full border border-white/80" />
          <BookOpen className="absolute text-primary/50" size={25} aria-hidden="true" />
        </div>
        <Badge
          className="absolute right-4 top-4 border-0 bg-white/70 text-[9px] text-primary hover:bg-white/70"
          variant="outline"
        >
          {available ? "Ready to explore" : "Coming later"}
        </Badge>
      </div>
      <CardContent className="p-6">
        <p className="eyebrow text-[9px]">
          GENERAL ENGLISH ·{" "}
          {course.level === "A1"
            ? "BEGINNER"
            : course.level === "A2"
              ? "ELEMENTARY"
              : course.level === "B1"
                ? "INTERMEDIATE"
                : course.level === "B2"
                  ? "UPPER INTERMEDIATE"
                  : "ADVANCED"}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{course.title}</h2>
        <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">
          {course.description.en}
        </p>
        <ul className="my-5 space-y-2.5">
          {course.outcomes.map((outcome) => (
            <li key={outcome} className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Check size={13} className="mt-0.5 shrink-0 text-[#63864f]" aria-hidden="true" />
              {outcome}
            </li>
          ))}
        </ul>
        <div className="mb-5 flex flex-wrap gap-4 border-t pt-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <BookOpen size={12} aria-hidden="true" />
            {available ? `${lessonCount} sample lessons` : "Curriculum preview"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={12} aria-hidden="true" />
            {available ? "25 min" : "Planned"}
          </span>
        </div>
        <Button
          asChild
          variant={available ? "default" : "outline"}
          className="w-full rounded-lg text-xs"
        >
          <Link href={`/courses/${course.slug}`}>
            {available ? "Explore A1" : `Preview ${course.level}`}
            <ArrowRight className="ml-auto" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
