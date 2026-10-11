"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Flag,
  Leaf,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/components/progress/session-provider";
import { DemoNotice } from "@/components/shared/demo-notice";
import { GrowthIllustration } from "@/components/shared/growth-illustration";
import { areaIcons, areaColors } from "@/components/shared/skill-badge";
import { firstCourse, firstChapter, lessonHref, courses } from "@/lib/curriculum";
import type { Skill } from "@/lib/curriculum/schema";
import { cn } from "@/lib/utils";

const skills: { area: Skill; description: string; href: string }[] = [
  { area: "listening", description: "Tune in to real English", href: "introductions#a1-c1-listen" },
  { area: "speaking", description: "Find your voice", href: "introductions#a1-c1-speak" },
  { area: "reading", description: "Open up a new world", href: "introductions#a1-c1-dialogue" },
  { area: "writing", description: "Make words your own", href: "am-is-are#a1-c1-write" },
];

export function Dashboard() {
  const { completed, attempts, profile, mode } = useSession();
  const count = firstChapter.lessons.filter((lesson) => completed.includes(lesson.id)).length;
  const nextLesson =
    firstChapter.lessons.find((lesson) => !completed.includes(lesson.id)) ??
    firstChapter.lessons[0]!;
  const resumeLesson =
    firstChapter.lessons.find((l) => l.id === profile.lastLessonId) ?? nextLesson;
  const resumeBlock = resumeLesson.blocks.find((b) => b.id === profile.lastBlockId)?.id;
  const minutes = firstChapter.lessons.reduce((total, lesson) => total + lesson.durationMinutes, 0);
  const stats = [
    {
      label: "Lessons completed",
      value: String(count).padStart(2, "0"),
      detail: `of ${firstChapter.lessons.length} sample lessons · ${mode === "persistent" ? "saved" : "this session"}`,
      icon: BookOpen,
      color: "bg-[#e8efdf]",
    },
    {
      label: "Your current level",
      value: "A1",
      detail: "Beginner learning path · not an assessed level",
      icon: Flag,
      color: "bg-[#f9ebdf]",
    },
    {
      label: "Chapter study time",
      value: String(minutes),
      suffix: "min",
      detail: "Estimated time · go at your own pace",
      icon: Clock3,
      color: "bg-[#eeeaf7]",
    },
    {
      label: "Quiz attempts",
      value: String(attempts.length).padStart(2, "0"),
      detail:
        mode === "persistent"
          ? "Every attempt saved separately"
          : "Practice makes progress · this session",
      icon: Target,
      color: "bg-[#e7edf7]",
    },
  ];
  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">LET’S GROW TOGETHER</p>
          <h1 className="page-title">
            Your next chapter starts here<span className="text-orange">.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A little practice today. A little more confidence tomorrow.
          </p>
        </div>
        <Link href="/courses" className="flex items-center gap-2 text-xs font-semibold">
          Explore courses <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <section
        className="relative mb-6 flex items-center overflow-hidden rounded-2xl border border-[#dce5ce] bg-[#e9efdd] px-6 py-7 sm:px-8"
        aria-labelledby="welcome-title"
      >
        <div className="relative z-10 max-w-md">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold text-[#527042]">
            <Leaf size={12} aria-hidden="true" /> YOUR ENGLISH JOURNEY, YOUR PACE
          </span>
          <h2
            id="welcome-title"
            className="text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]"
          >
            Big possibilities.
            <br />
            Small, everyday steps.
          </h2>
          <p className="mt-3 max-w-[310px] text-xs leading-6 text-[#56674b]">
            Build your English from the ground up, with practical lessons and explanations in
            Burmese.
          </p>
          <Button asChild className="mt-5 h-10 rounded-lg px-5 text-xs">
            <Link
              href={`${lessonHref(firstCourse, firstChapter, resumeLesson)}${resumeBlock ? `#${resumeBlock}` : ""}`}
            >
              {count || profile.lastLessonId ? "Continue learning" : "Start your first lesson"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="absolute -right-10 bottom-0 h-[210px] w-[280px] opacity-25 sm:right-4 sm:h-[230px] sm:w-[320px] sm:opacity-100 xl:right-12">
          <GrowthIllustration />
        </div>
      </section>
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(({ label, value, suffix, detail, icon: Icon, color }) => (
          <Card key={label} className="gap-0 rounded-xl py-0 shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    color,
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-2 text-[30px] font-semibold tracking-tight">
                {value}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Your learning path</h2>
            <Link
              href="/courses/a1"
              className="text-[11px] font-medium text-muted-foreground hover:text-primary"
            >
              View course <ArrowRight size={12} className="ml-1 inline" aria-hidden="true" />
            </Link>
          </div>
          <section className="soft-panel" aria-labelledby="chapter-title">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#e8efdf] text-lg font-bold">
                  A1
                </span>
                <div>
                  <p className="eyebrow text-[9px]">BEGINNER · CHAPTER 01</p>
                  <h3 id="chapter-title" className="mt-1 text-lg font-semibold tracking-tight">
                    Your first conversations
                  </h3>
                </div>
              </div>
              <span className="hidden rounded-full bg-[#f4f6f0] px-2 py-1 text-[9px] text-muted-foreground sm:block">
                3 lessons
              </span>
            </div>
            <div className="mb-4 mt-5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Chapter progress · {mode === "persistent" ? "saved" : "session only"}</span>
              <span className="font-semibold text-primary">{count} / 3 completed</span>
            </div>
            <Progress
              value={(count / 3) * 100}
              aria-label="Sample chapter session progress"
              className="h-1.5"
            />
            <div className="mt-4 divide-y">
              {firstChapter.lessons.map((lesson, index) => {
                const done = completed.includes(lesson.id);
                return (
                  <Link
                    key={lesson.id}
                    href={lessonHref(firstCourse, firstChapter, lesson)}
                    className="group flex items-center gap-3 py-3"
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        done
                          ? "border-primary bg-primary text-white"
                          : "bg-[#f7f8f4] text-muted-foreground",
                      )}
                    >
                      {done ? (
                        <Check size={12} aria-label="Completed" />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-medium group-hover:text-[#558043]">
                        {lesson.title}
                      </h4>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {lesson.areas.slice(-2).join(" + ")} · {lesson.durationMinutes} min
                      </p>
                    </div>
                    <ArrowRight
                      size={14}
                      className="ml-auto shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
        <div className="min-w-0">
          <h2 className="section-title mb-3">A little inspiration</h2>
          <section className="rounded-2xl bg-primary p-6 text-white">
            <Sparkles size={22} className="text-[#e4c483]" aria-hidden="true" />
            <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.15em] text-[#c4d4ba]">
              Phrase of the day
            </p>
            <p className="mt-4 text-2xl font-medium tracking-tight">“Nice to meet you.”</p>
            <p lang="my" className="mt-3 text-xs text-[#d6e5cd]">
              တွေ့ရတာ ဝမ်းသာပါတယ်။
            </p>
            <div className="mt-5 border-t border-white/15 pt-4">
              <p className="text-[11px] leading-5 text-[#cfdbcb]">
                A simple phrase that opens the door to a new conversation.
              </p>
              <Link
                href={lessonHref(firstCourse, firstChapter, firstChapter.lessons[0]!)}
                className="mt-4 flex items-center gap-2 text-[11px] font-semibold"
              >
                Try it in a lesson <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </div>
      <section className="mt-7" aria-labelledby="skills-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="skills-title" className="section-title">
            Four skills. One confident you.
          </h2>
          <Link href="/practice" className="text-[11px] text-muted-foreground">
            Practice studio <ArrowUpRight className="ml-1 inline" size={12} aria-hidden="true" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {skills.map(({ area, description, href }) => {
            const Icon = areaIcons[area];
            return (
              <Link
                href={`/courses/a1/chapters/first-conversations/lessons/${href}`}
                key={area}
                className="group rounded-xl border bg-white p-4 transition-colors hover:border-[#a9bb9b]"
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg",
                    areaColors[area],
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div className="mt-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold capitalize">{area}</h3>
                  <ArrowUpRight
                    size={13}
                    className="text-muted-foreground group-hover:text-primary"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <section
        className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border px-5 py-4"
        aria-label="CEFR pathway"
      >
        <div>
          <p className="text-xs font-semibold">From your first hello to your next opportunity.</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            A1 is ready to try. A2–C1 are planned for future releases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {courses.map((course, index) => (
            <span key={course.id} className="flex items-center gap-2">
              <Link
                href={`/courses/${course.slug}`}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-[10px] font-bold",
                  index === 0 ? "bg-primary text-white" : "border text-muted-foreground",
                )}
              >
                {course.level}
              </Link>
              {index < 4 && <span className="h-px w-2 bg-border" />}
            </span>
          ))}
        </div>
      </section>
      <div className="mt-6">
        <DemoNotice compact />
      </div>
    </>
  );
}
