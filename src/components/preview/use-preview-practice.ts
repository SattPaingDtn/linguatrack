"use client";
import { useRef, useState } from "react";
import {
  PREVIEW_LESSON_ID,
  PREVIEW_VERSION,
  previewFeedbackSchema,
  type PreviewFeedback,
  type PreviewQuestion,
} from "@/lib/curriculum/preview/contracts";

export type QuestionState = {
  selected: string;
  pending: boolean;
  error: string | null;
  feedback?: PreviewFeedback;
  history: PreviewFeedback[];
};
export const emptyQuestionState: QuestionState = {
  selected: "",
  pending: false,
  error: null,
  history: [],
};
export type PracticeStates = Record<string, QuestionState>;

// Memory only. No session provider, browser storage, persistence client or private grading imports.
export function usePreviewPractice(questions: PreviewQuestion[], publicDigest: string) {
  const [states, setStates] = useState<PracticeStates>({});
  const inFlight = useRef(new Set<string>());
  function update(id: string, change: (previous: QuestionState) => QuestionState) {
    setStates((previous) => ({ ...previous, [id]: change(previous[id] ?? emptyQuestionState) }));
  }
  function select(id: string, option: string) {
    if (inFlight.current.has(id)) return;
    update(id, (previous) =>
      previous.feedback ? previous : { ...previous, selected: option, error: null },
    );
  }
  function retry(id: string) {
    if (inFlight.current.has(id)) return;
    update(id, (previous) => ({ ...previous, selected: "", error: null, feedback: undefined }));
  }
  async function check(id: string) {
    const question = questions.find((q) => q.id === id);
    const state = states[id] ?? emptyQuestionState;
    if (!question || !state.selected || state.feedback || inFlight.current.has(id)) return;
    const selected = state.selected;
    inFlight.current.add(id);
    update(id, (previous) => ({ ...previous, pending: true, error: null }));
    try {
      const response = await fetch("/api/dev-preview/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          contentVersion: PREVIEW_VERSION,
          lessonId: PREVIEW_LESSON_ID,
          publicDigest,
          exercise: { kind: "exercise", id, revision: question.revision },
          optionId: selected,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Preview grading is unavailable.";
        throw new Error(message);
      }
      const feedback = previewFeedbackSchema.parse(result);
      if (
        feedback.exercise.id !== id ||
        feedback.exercise.revision !== question.revision ||
        feedback.selectedOptionId !== selected
      )
        throw new Error("The feedback did not match this question. Try checking again.");
      update(id, (previous) => ({
        ...previous,
        feedback,
        history: [...previous.history, feedback],
      }));
    } catch (cause) {
      update(id, (previous) => ({
        ...previous,
        error: `${cause instanceof Error ? cause.message : "Could not check your answer."} Your selection is still here. Nothing was saved; retry when ready.`,
      }));
    } finally {
      inFlight.current.delete(id);
      update(id, (previous) => ({ ...previous, pending: false }));
    }
  }
  return { states, select, retry, check };
}
