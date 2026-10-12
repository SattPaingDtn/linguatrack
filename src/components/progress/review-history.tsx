"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useSession } from "@/components/progress/session-provider";
import { firstCourse, firstChapter, lessonHref, courses, curriculum } from "@/lib/curriculum";
import { Button } from "@/components/ui/button";
import { ResetProgress } from "./reset-progress";
export function ReviewHistory() {
  const { attempts, mode, loading, mistakes, reviewMistake } = useSession();
  const [incorrectOnly, setIncorrectOnly] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quizLesson = firstChapter.lessons.find((l) => l.blocks.some((b) => b.type === "quiz"))!;
  if (loading || mode === "loading")
    return (
      <div className="soft-panel mt-7" role="status">
        Loading your review history…
      </div>
    );
  if (!attempts.length)
    return (
      <section className="soft-panel mt-7 py-12 text-center">
        <RotateCcw size={30} className="mx-auto text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-5 text-xl font-semibold">Your first try belongs here.</h2>
        <p className="mx-auto mt-3 max-w-md text-xs leading-6 text-muted-foreground">
          Answer a quiz question to start your history.{" "}
          {mode === "persistent"
            ? "Every attempt is saved separately."
            : "Preview history resets on reload."}
        </p>
        <Button asChild className="mt-5 rounded-lg text-xs">
          <Link href={lessonHref(firstCourse, firstChapter, quizLesson)}>
            Try the chapter quiz <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    );
  return (
    <div className="mt-7 space-y-4">
      <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
        <p>
          {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"} ·{" "}
          {mode === "persistent" ? "saved history" : "this session"} · newest first
        </p>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={incorrectOnly}
            onChange={(e) => setIncorrectOnly(e.target.checked)}
          />{" "}
          Incorrect answers only
        </label>
      </div>
      <ResetProgress />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {[...attempts]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((attempt, index) => {
          let href: string | null = null;
          if (attempt.contentVersion === curriculum.contentVersion)
            for (const course of courses)
              for (const chapter of course.chapters) {
                const lesson = chapter.lessons.find((l) => l.id === attempt.lessonId);
                if (lesson) href = lessonHref(course, chapter, lesson);
              }
          const responses = attempt.responses.filter((r) => !incorrectOnly || !r.isCorrect);
          return (
            <article key={attempt.id} className="soft-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-[9px]">
                    CONTENT {attempt.contentVersion} · ATTEMPT {attempts.length - index}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">{attempt.title}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <time dateTime={new Date(attempt.timestamp).toISOString()}>
                      {new Date(attempt.timestamp).toLocaleString("en-GB")}
                    </time>{" "}
                    · {attempt.status === "completed" ? "Completed" : "In progress"} ·{" "}
                    {attempt.answered}/{attempt.total} answered
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">
                    {attempt.status === "completed" ? `${attempt.percentage}%` : "Unfinished"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {attempt.correct}/{attempt.total} correct ·{" "}
                    {attempt.passed
                      ? "Passed"
                      : attempt.status === "completed"
                        ? "Keep practising"
                        : "Resume to finish"}
                  </p>
                </div>
              </div>
              <details className="mt-5 border-t pt-4">
                <summary className="text-xs font-semibold">
                  Review answers and Burmese explanations
                </summary>
                {!responses.length && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    No incorrect answers in this attempt.
                  </p>
                )}
                <ol className="mt-4 space-y-4">
                  {responses.map((response) => {
                    const mistake = mistakes.find((m) => m.responseId === response.id);
                    return (
                      <li key={response.id} className="rounded-xl bg-muted p-4">
                        <h3 className="text-sm font-medium">{response.prompt}</h3>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Your answer: {response.selectedText} ·{" "}
                          {response.isCorrect ? "Correct" : "Incorrect"}
                        </p>
                        <p className="mt-1 text-xs font-medium">
                          Correct answer: {response.correctText}
                        </p>
                        <p className="mt-3 text-xs leading-6 text-muted-foreground">
                          {response.explanation.en}
                        </p>
                        <p lang="my" className="mt-2 text-xs text-muted-foreground">
                          {response.explanation.my}
                        </p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Answered {new Date(response.timestamp).toLocaleString("en-GB")}
                        </p>
                        {mistake && (
                          <Button
                            variant="outline"
                            className="mt-3 text-xs"
                            disabled={Boolean(mistake.reviewedAt) || saving === response.id}
                            onClick={async () => {
                              setSaving(response.id);
                              setError(null);
                              try {
                                await reviewMistake(response.id);
                              } catch (e) {
                                setError(
                                  e instanceof Error ? e.message : "Review was not saved. Retry.",
                                );
                              } finally {
                                setSaving(null);
                              }
                            }}
                          >
                            {mistake.reviewedAt
                              ? "Reviewed"
                              : saving === response.id
                                ? "Saving…"
                                : "Mark explanation reviewed"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </details>
              {href ? (
                <Button asChild variant="outline" className="mt-5 rounded-lg text-xs">
                  <Link
                    href={`${href}?attempt=${attempt.status === "in_progress" ? attempt.id : "new"}`}
                  >
                    <RotateCcw aria-hidden="true" />
                    {attempt.status === "in_progress" ? "Resume quiz" : "Practise again"}
                  </Link>
                </Button>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  This curriculum version is archived. Its saved answers remain available above.
                </p>
              )}
            </article>
          );
        })}
    </div>
  );
}
