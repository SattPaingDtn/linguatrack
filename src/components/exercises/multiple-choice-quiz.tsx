"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, RotateCcw, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/components/progress/session-provider";
import type { QuizBlock } from "@/lib/curriculum/schema";
import { curriculum } from "@/lib/curriculum";
import type { QuizAttempt } from "@/lib/learning/contracts";
import { cn } from "@/lib/utils";

export function MultipleChoiceQuiz({
  quiz,
  lessonId,
  requestedAttempt,
}: {
  quiz: QuizBlock;
  lessonId: string;
  requestedAttempt?: string;
}) {
  const session = useSession();
  if (session.loading || session.mode === "loading")
    return (
      <div className="soft-panel" role="status">
        Loading your quiz…
      </div>
    );
  const pending = session.pendingAnswers.find(
    (a) => a.quizId === quiz.id && a.lessonId === lessonId,
  );
  const unfinished =
    requestedAttempt === "new"
      ? undefined
      : session.attempts.find(
          (a) =>
            a.quizId === quiz.id &&
            a.lessonId === lessonId &&
            a.contentVersion === curriculum.contentVersion &&
            a.status === "in_progress" &&
            (!requestedAttempt || a.id === requestedAttempt),
        );
  const saved = pending ? session.attempts.find((a) => a.id === pending.attemptId) : unfinished;
  return (
    <QuizPlayer
      key={`${session.user?.id ?? "preview"}:${quiz.id}:${requestedAttempt ?? "resume"}`}
      quiz={quiz}
      lessonId={lessonId}
      saved={saved}
      pending={pending}
    />
  );
}
function QuizPlayer({
  quiz,
  lessonId,
  saved,
  pending,
}: {
  quiz: QuizBlock;
  lessonId: string;
  saved?: QuizAttempt;
  pending?: import("@/lib/learning/contracts").AnswerSubmission;
}) {
  const { submitAnswer, attempts, mode } = useSession();
  const [attemptId, setAttemptId] = useState(pending?.attemptId ?? saved?.id ?? "");
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      pending
        ? quiz.questions.findIndex((q) => q.id === pending.questionId)
        : quiz.questions.findIndex((q) => !saved?.answers[q.id]),
    ),
  );
  const [selected, setSelected] = useState(pending?.optionId ?? "");
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(Boolean(pending));
  const heading = useRef<HTMLHeadingElement>(null);
  const question = quiz.questions[index];
  const result = attempts.find((a) => a.id === attemptId);
  const feedback = result?.responses.find((r) => r.questionId === question?.id);
  const checked = Boolean(feedback);
  useEffect(() => {
    if (index > 0 || finished) heading.current?.focus();
  }, [index, finished]);
  if (!question) return null;
  async function checkAnswer() {
    if (!selected || checked || saving || !question) return;
    const id = attemptId || crypto.randomUUID();
    setAttemptId(id);
    setSaving(true);
    setLocked(true);
    setError(null);
    try {
      await submitAnswer({
        attemptId: id,
        contentVersion: curriculum.contentVersion,
        lessonId,
        quizId: quiz.id,
        questionId: question.id,
        optionId: selected,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Answer was not saved. Retry saving without leaving this page.",
      );
    } finally {
      setSaving(false);
    }
  }
  function next() {
    if (!checked || finished) return;
    if (index < quiz.questions.length - 1) {
      setIndex(index + 1);
      setSelected("");
      setLocked(false);
      setError(null);
    } else setFinished(true);
  }
  function retry() {
    setAttemptId(crypto.randomUUID());
    setIndex(0);
    setSelected("");
    setLocked(false);
    setFinished(false);
    setError(null);
    requestAnimationFrame(() => heading.current?.focus());
  }
  const correct = feedback?.isCorrect;
  return (
    <div className="rounded-2xl border bg-white p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow text-[10px]">KNOWLEDGE CHECK</span>
        <span className="text-[10px] text-muted-foreground">
          {quiz.questions.length} questions · {quiz.passingPercent}% to pass ·{" "}
          {mode === "persistent" ? "saved to your account" : "session only"}
        </span>
      </div>
      {finished && result ? (
        <div>
          <div className="py-5 text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#eef2e7]">
              <Trophy size={28} className="text-primary" aria-hidden="true" />
            </span>
            <h3 ref={heading} tabIndex={-1} className="mt-5 text-2xl font-semibold">
              {result.passed ? "A great first step!" : "You’re learning. Keep going."}
            </h3>
            <p className="mt-3 text-4xl font-semibold">
              {result.percentage}
              <span className="text-lg">%</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.correct} of {result.total} correct ·{" "}
              {result.passed ? "Passed" : `Try again to reach ${quiz.passingPercent}%`}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {result.passed
                ? "You can now mark this lesson complete."
                : "Review the explanations below, then give it another go."}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {mode === "persistent"
                ? "This attempt is saved. Trying again creates a separate attempt."
                : "Preview results reset when you reload the app."}
            </p>
            <Button onClick={retry} variant="outline" className="mt-5 rounded-lg text-xs">
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          </div>
          <details className="mt-5 border-t pt-4">
            <summary className="text-xs font-semibold">Review your answers</summary>
            <ol className="mt-4 space-y-5">
              {result.responses.map((response) => (
                <li key={response.id} className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium">{response.prompt}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Your answer: {response.selectedText}
                  </p>
                  <p className="mt-1 text-xs font-medium">Correct answer: {response.correctText}</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {response.explanation.en}
                  </p>
                  <p lang="my" className="mt-2 text-xs text-muted-foreground">
                    {response.explanation.my}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        </div>
      ) : (
        <>
          <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
            <span>
              Question {index + 1} of {quiz.questions.length}
            </span>
            <span>Choose one answer</span>
          </div>
          <Progress
            value={(index / quiz.questions.length) * 100}
            aria-label="Quiz progress"
            className="mb-6 h-1.5"
          />
          <h3 ref={heading} tabIndex={-1} className="mb-5 text-xl font-semibold tracking-tight">
            {question.prompt}
          </h3>
          <fieldset disabled={checked || saving || locked} className="space-y-2.5">
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option, optionIndex) => {
              const isCorrect = checked && option.id === feedback?.correctOptionId;
              const isWrong = checked && selected === option.id && !isCorrect;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition-colors hover:bg-muted",
                    selected === option.id && "border-primary bg-[#eef3e8]",
                    isCorrect && "border-[#73915c] bg-[#eef3e8]",
                    isWrong && "border-[#b46057] bg-[#fcf0ec]",
                    checked && "cursor-default",
                  )}
                >
                  <input
                    type="radio"
                    name={`${quiz.id}-${question.id}`}
                    value={option.id}
                    checked={(feedback?.selectedOptionId ?? selected) === option.id}
                    onChange={() => setSelected(option.id)}
                    className="size-4 shrink-0 accent-[#294e3c]"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  {isCorrect && <CheckCircle2 size={17} aria-label="Correct answer" />}
                  {isWrong && <XCircle size={17} aria-label="Incorrect answer" />}
                </label>
              );
            })}
          </fieldset>
          {checked && (
            <div
              role="status"
              aria-label="Answer feedback"
              className={cn("mt-5 rounded-xl p-4", correct ? "bg-[#eef3e8]" : "bg-[#fcf0ec]")}
            >
              <p className="text-sm font-semibold">
                {correct ? "That’s right!" : "Not quite — here’s why."}
              </p>
              <p className="mt-2 text-xs leading-6">{feedback?.explanation.en}</p>
              <p lang="my" className="mt-2 text-xs">
                {feedback?.explanation.my}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error} Your selected answer is retained; retry saving.
            </p>
          )}
          <div className="mt-6 flex justify-end">
            {checked ? (
              <Button onClick={next} className="rounded-lg text-xs">
                {index === quiz.questions.length - 1 ? "See my result" : "Next question"}
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button
                onClick={checkAnswer}
                disabled={!selected || saving}
                className="rounded-lg text-xs"
              >
                {saving
                  ? "Saving answer…"
                  : error || locked
                    ? "Retry saving answer"
                    : "Check answer"}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
