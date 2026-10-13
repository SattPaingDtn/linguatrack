"use client";
import { useRef, useState } from "react";
import type {
  ManuscriptLesson,
  SelfReviewFeedback,
} from "@/lib/curriculum/manuscript-preview/contracts";
import { selfReviewFeedbackSchema } from "@/lib/curriculum/manuscript-preview/contracts";
import { manuscriptAwaitsAudio } from "@/lib/curriculum/manuscript-preview/config";
import { ChapterLessonView } from "./chapter-lesson";
import { BilingualText } from "./bilingual-text";
import { Button } from "@/components/ui/button";
function ShortPractice({ preview }: { preview: ManuscriptLesson }) {
  const [states, setStates] = useState<
    Record<
      string,
      { text: string; pending: boolean; error?: string; feedback?: SelfReviewFeedback }
    >
  >({});
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  function update(id: string, changes: Partial<(typeof states)[string]>) {
    setStates((s) => ({ ...s, [id]: { text: "", pending: false, ...s[id], ...changes } }));
  }
  async function compare(id: string) {
    const question = preview.shortResponses.find((q) => q.id === id)!;
    const text = states[id]?.text.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setBusy(id);
    update(id, { pending: true, error: undefined });
    try {
      const response = await fetch("/api/dev-manuscript-preview/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          contentVersion: preview.contentVersion,
          lessonId: preview.lesson.id,
          publicDigest: preview.publicDigest,
          exercise: { kind: "exercise", id, revision: question.revision },
          mode: "self_review",
          text,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result === "object" &&
            result &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "Could not load the self-review example.",
        );
      const feedback = selfReviewFeedbackSchema.parse(result);
      if (
        feedback.exercise.id !== id ||
        feedback.exercise.revision !== question.revision ||
        feedback.submittedText !== text
      )
        throw new Error("The example did not match this response.");
      update(id, { feedback });
    } catch (e) {
      update(id, {
        error: `${e instanceof Error ? e.message : "Unable to compare."} Your draft is still here; retry. Nothing was saved.`,
      });
    } finally {
      update(id, { pending: false });
      inFlight.current = false;
      setBusy(null);
    }
  }
  return (
    <div className="mt-6 space-y-5">
      {preview.shortResponses.length > 0 && (
        <BilingualText
          en={
            preview.shortResponses.some((q) => manuscriptAwaitsAudio(q.id))
              ? "Awaiting audio · the four planned checks are shown for editorial preparation. No checking or listening score is available."
              : "Reading short-answer self-review · unsaved and ungraded. Write a response before requesting one example. No automatic correctness judgment or proficiency award."
          }
          my="ကိုယ့်အဖြေကို ကိုယ်တိုင် ပြန်စစ်ရန်သာ ဖြစ်သည်။ မသိမ်းဆည်းပါ၊ အလိုအလျောက် အမှား/အမှန် မသတ်မှတ်ပါ။ အသံဖိုင် မရှိသော နားထောင်မေးခွန်းများကို စစ်ဆေးခြင်း မရနိုင်သေးပါ။"
        />
      )}
      {preview.shortResponses.map((q, i) => {
        const state = states[q.id] ?? { text: "", pending: false };
        const pendingAudio = manuscriptAwaitsAudio(q.id);
        const prompt = q.segments
          .filter((s) => s.type === "text")
          .map((s) => s.text)
          .join("")
          .trim();
        return (
          <section
            key={q.id}
            data-short-question={q.id}
            className="rounded-xl border bg-white p-4 sm:p-5"
            aria-labelledby={`${q.id}-heading`}
          >
            <h3 id={`${q.id}-heading`} className="text-lg font-semibold">
              {i + 1}. {prompt}
            </h3>
            {pendingAudio ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Awaiting audio · answer checks unavailable.
              </p>
            ) : (
              <>
                <label htmlFor={`${q.id}-response`} className="mb-2 mt-4 block font-semibold">
                  Your short answer
                </label>
                <textarea
                  id={`${q.id}-response`}
                  rows={3}
                  maxLength={1000}
                  value={state.text}
                  disabled={state.pending}
                  onChange={(e) =>
                    update(q.id, { text: e.target.value, feedback: undefined, error: undefined })
                  }
                  className="w-full rounded-xl border bg-background p-4"
                  aria-describedby={`${q.id}-hint`}
                />
                <p id={`${q.id}-hint`} className="mt-2 text-sm leading-7 text-muted-foreground">
                  Self-review only. This response is sent to the local server to request one
                  example; it is not stored or graded. Leaving/refreshing clears it.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={!state.text.trim() || busy !== null}
                  onClick={() => void compare(q.id)}
                >
                  {state.pending ? "Loading example…" : "Compare with one example"}
                </Button>
                {state.error && (
                  <p role="alert" className="mt-3 text-destructive">
                    {state.error}
                  </p>
                )}
                {state.feedback && (
                  <div role="status" className="mt-4 rounded-xl border bg-muted p-4">
                    <p className="mb-3 font-semibold">One example · not an automatic grade</p>
                    <p className="mb-4 leading-8">{state.feedback.exampleAnswer}</p>
                    <BilingualText {...state.feedback.explanation} />
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
export function ManuscriptLessonView({
  preview,
  chapterSlug,
}: {
  preview: ManuscriptLesson;
  chapterSlug: string;
}) {
  const { shortResponses: _, ...base } = preview;
  void _;
  return (
    <ChapterLessonView
      preview={base}
      chapterPath={`/dev/a1/${chapterSlug}`}
      pickerPath="/dev/a1"
      endpoint="/api/dev-manuscript-preview/answer"
      writingRevealAfterDraft
      extraPractice={<ShortPractice preview={preview} />}
    />
  );
}
