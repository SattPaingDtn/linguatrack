import { Button } from "@/components/ui/button";
import type { PreviewQuestion } from "@/lib/curriculum/preview/contracts";
import { PreviewAnswerFeedback } from "./preview-feedback";
import type { PracticeStates } from "./use-preview-practice";

export function PreviewReview({
  questions,
  states,
  onRevisit,
}: {
  questions: PreviewQuestion[];
  states: PracticeStates;
  onRevisit: (index: number) => void;
}) {
  const answered = questions.filter((q) => states[q.id]?.history.length);
  const correct = answered.filter((q) => states[q.id]!.history.at(-1)!.isCorrect).length;
  const pending = questions.filter((q) => states[q.id]?.pending).length;
  const errors = questions.filter((q) => states[q.id]?.error);
  return (
    <>
      <p className="mb-5 text-base leading-7 text-muted-foreground">
        Review the latest checked answer for each question. This is practice feedback from this
        page, not saved history or a proficiency assessment. Earlier checks remain available below.
      </p>
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Practice summary">
        {[
          ["Answered", answered.length],
          ["Correct", correct],
          ["Incorrect", answered.length - correct],
          ["Remaining", questions.length - answered.length],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border bg-background p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{count}</dd>
          </div>
        ))}
      </dl>
      <p role="status" className="sr-only">
        {answered.length} answered, {correct} correct, {answered.length - correct} incorrect.
      </p>
      {pending > 0 && (
        <p role="status" className="mb-4 rounded-lg bg-muted p-4">
          Checking {pending} {pending === 1 ? "answer" : "answers"}… Feedback will appear here when
          returned.
        </p>
      )}
      {errors.map((q) => (
        <div role="alert" key={q.id} className="mb-4 rounded-xl border p-4">
          <p className="text-sm text-destructive">{states[q.id]!.error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => onRevisit(questions.indexOf(q))}
          >
            Return to question {questions.indexOf(q) + 1}
          </Button>
        </div>
      ))}
      {answered.length === 0 ? (
        <div className="rounded-xl border bg-background p-5">
          <h3 className="text-lg font-semibold">No answers checked yet</h3>
          <p className="my-3 text-base text-muted-foreground">
            Practise a question to see its English and Burmese feedback here.
          </p>
          <Button type="button" onClick={() => onRevisit(0)}>
            Start practice
          </Button>
        </div>
      ) : (
        <ol className="space-y-5">
          {questions.map((q, index) => {
            const state = states[q.id];
            const latest = state?.history.at(-1);
            if (!latest) return null;
            const selected = q.options.find((o) => o.id === latest.selectedOptionId)?.text.text;
            return (
              <li
                key={q.id}
                className="rounded-xl border bg-background p-4 sm:p-5"
                data-preview-reviewed={q.id}
              >
                <h3 className="text-base font-semibold leading-7">
                  Question {index + 1}: {q.prompt.text}
                </h3>
                <p className="mb-4 mt-3 text-base">Your checked answer: {selected}</p>
                <PreviewAnswerFeedback feedback={latest} />
                {!state!.feedback && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    You are retrying this question. The last checked result is still shown above.
                  </p>
                )}
                {state!.history.length > 1 && (
                  <details className="mt-4 rounded-lg border px-4">
                    <summary className="text-sm font-semibold">
                      Earlier checks ({state!.history.length - 1})
                    </summary>
                    <div className="space-y-3 pb-4">
                      {state!.history.slice(0, -1).map((feedback, i) => (
                        <div key={i}>
                          <p className="mb-2 text-sm">
                            Check {i + 1} · Your answer:{" "}
                            {q.options.find((o) => o.id === feedback.selectedOptionId)?.text.text}
                          </p>
                          <PreviewAnswerFeedback feedback={feedback} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => onRevisit(index)}
                >
                  Revisit question {index + 1}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
