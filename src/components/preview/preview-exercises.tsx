"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { PreviewQuestion } from "@/lib/curriculum/preview/contracts";
import { BilingualText } from "./bilingual-text";
import { PreviewAnswerFeedback } from "./preview-feedback";
import { emptyQuestionState, type PracticeStates } from "./use-preview-practice";

export function PreviewExercises({
  questions,
  states,
  current,
  onNavigate,
  onSelect,
  onCheck,
  onRetry,
}: {
  questions: PreviewQuestion[];
  states: PracticeStates;
  current: number;
  onNavigate: (index: number) => void;
  onSelect: (id: string, option: string) => void;
  onCheck: (id: string) => Promise<void>;
  onRetry: (id: string) => void;
}) {
  const legend = useRef<HTMLLegendElement>(null);
  const question = questions[current]!;
  const state = states[question.id] ?? emptyQuestionState;
  const checked = questions.filter((q) => states[q.id]?.history.length).length;
  function navigate(index: number) {
    onNavigate(index);
    requestAnimationFrame(() => legend.current?.focus());
  }
  return (
    <>
      <div className="mb-5 rounded-xl border bg-background p-4">
        <p className="text-sm font-medium" role="status">
          Question {current + 1} of {questions.length} · {checked} questions checked
        </p>
        <progress
          className="mt-3 h-2 w-full accent-[#294e3c]"
          aria-label="Questions checked"
          value={checked}
          max={questions.length}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Immediate practice feedback only. Results are kept on this page and lost on refresh; no
          completion or proficiency is awarded.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onCheck(question.id);
        }}
        data-preview-question={question.id}
        className="rounded-xl border bg-background p-4 sm:p-5"
      >
        <fieldset disabled={state.pending || !!state.feedback}>
          <legend ref={legend} tabIndex={-1} className="w-full text-base font-semibold leading-7">
            {question.prompt.text}
          </legend>
          <div className="mt-3">
            <BilingualText {...question.instructions} />
          </div>
          <div className="mt-4 space-y-2">
            {question.options.map((option) => (
              <label
                key={option.id}
                className="flex items-start gap-3 rounded-lg border bg-white p-3 text-base"
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option.id}
                  checked={state.selected === option.id}
                  onChange={() => onSelect(question.id, option.id)}
                  className="mt-1 size-4 shrink-0 accent-[#294e3c]"
                />
                <span>{option.text.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!state.feedback && (
          <Button type="submit" disabled={!state.selected || state.pending} className="mt-4">
            {state.pending ? "Checking…" : "Check answer"}
          </Button>
        )}
        {state.error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.feedback && (
          <div className="mt-4">
            <PreviewAnswerFeedback feedback={state.feedback} live />
            <Button
              type="button"
              variant="outline"
              onClick={() => onRetry(question.id)}
              className="mt-4"
            >
              Try this question again
            </Button>
          </div>
        )}
      </form>
      <nav aria-label="Question navigation" className="mt-5 flex flex-wrap justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={current === 0}
          onClick={() => navigate(current - 1)}
        >
          Previous question
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={current === questions.length - 1}
          onClick={() => navigate(current + 1)}
        >
          Next question
        </Button>
      </nav>
      <p className="mt-3 text-sm text-muted-foreground">
        You can revisit any question. An unchecked selection does not count as an answered question.
      </p>
    </>
  );
}
