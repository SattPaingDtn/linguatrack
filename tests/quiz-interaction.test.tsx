import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultipleChoiceQuiz } from "@/components/exercises/multiple-choice-quiz";
import { SessionProvider, useSession } from "@/components/progress/session-provider";
import { canonicalQuiz, gradedResponse, input, savedAttempt } from "./fixtures";
import { emptySnapshot } from "@/lib/learning/contracts";
import { queueAnswer, readOutbox } from "@/lib/learning/outbox";
import { firstChapter } from "@/lib/curriculum";
const lesson = firstChapter.lessons[2]!;
const publicQuiz = lesson.blocks.find((block) => block.type === "quiz")!;
const quiz = canonicalQuiz;
const preview = {
  mode: "preview" as const,
  configured: false,
  user: null,
  snapshot: emptySnapshot,
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const answer = JSON.parse(options.body);
      return Response.json({
        mode: "preview",
        response: gradedResponse(answer),
        title: quiz.title,
        total: quiz.questions.length,
        passingPercent: quiz.passingPercent,
      });
    }),
  );
});
function SessionProbe() {
  const { attempts, completed, completeLesson, resetSession } = useSession();
  return (
    <>
      <output aria-label="Attempt count">{attempts.length}</output>
      <output aria-label="Completed count">{completed.length}</output>
      <button onClick={() => completeLesson(firstChapter.lessons[0]!.id)}>Complete sample</button>
      <button onClick={resetSession}>Reset session</button>
    </>
  );
}
function setup() {
  return render(
    <SessionProvider initial={preview}>
      <MultipleChoiceQuiz quiz={publicQuiz} lessonId={lesson.id} />
      <SessionProbe />
    </SessionProvider>,
  );
}
describe("accessible quiz interaction", () => {
  it("requires an answer, locks checked answers, gives bilingual feedback, scores and retries", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    for (let index = 0; index < quiz.questions.length; index++) {
      const question = quiz.questions[index]!;
      const option = question.options.find((o) => o.id === question.correctOptionId)!;
      await user.click(
        screen.getByRole("radio", {
          name: new RegExp(option.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        }),
      );
      await user.click(screen.getByRole("button", { name: "Check answer" }));
      expect(await screen.findByRole("status", { name: "Answer feedback" })).toHaveTextContent(
        question.explanation.en,
      );
      expect(await screen.findByRole("status", { name: "Answer feedback" })).toHaveTextContent(
        question.explanation.my,
      );
      for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
      await user.click(
        screen.getByRole("button", { name: index === 4 ? "See my result" : "Next question" }),
      );
    }
    expect(screen.getByText("5 of 5 correct · Passed")).toBeInTheDocument();
    expect(screen.getByLabelText("Attempt count")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Attempt count")).toHaveTextContent("1");
  });
  it("records a failed attempt without completing the lesson", async () => {
    const user = userEvent.setup();
    setup();
    for (let i = 0; i < 5; i++) {
      const q = quiz.questions[i]!;
      const wrong = q.options.find((o) => o.id !== q.correctOptionId)!;
      await user.click(
        screen.getByRole("radio", {
          name: new RegExp(wrong.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        }),
      );
      await user.click(screen.getByRole("button", { name: "Check answer" }));
      expect(await screen.findByRole("status", { name: "Answer feedback" })).toHaveTextContent(
        "Not quite",
      );
      await user.click(
        screen.getByRole("button", { name: i === 4 ? "See my result" : "Next question" }),
      );
    }
    expect(screen.getByText("0 of 5 correct · Try again to reach 80%")).toBeInTheDocument();
    expect(screen.getByLabelText("Completed count")).toHaveTextContent("0");
    expect(screen.getByLabelText("Attempt count")).toHaveTextContent("1");
  });
  it("deduplicates completion and explicitly resets memory", async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByText("Complete sample"));
    await user.click(screen.getByText("Complete sample"));
    expect(screen.getByLabelText("Completed count")).toHaveTextContent("1");
    await user.click(screen.getByText("Reset session"));
    expect(screen.getByLabelText("Completed count")).toHaveTextContent("0");
    await user.click(screen.getByText("Complete sample"));
    view.unmount();
    setup();
    expect(screen.getByLabelText("Completed count")).toHaveTextContent("0");
  });
});

describe("save acknowledgement and recovery", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const persistent = {
    mode: "persistent" as const,
    configured: true,
    user: { id: owner, email: "learner@example.test" },
    snapshot: emptySnapshot,
  };
  it("retains a failed submission and retries the identical attempt without premature feedback", async () => {
    const user = userEvent.setup();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network disconnected"))
      .mockImplementationOnce(async (_url, options) => {
        const answer = JSON.parse(options.body);
        return Response.json({
          mode: "persistent",
          attempt: savedAttempt(answer.attemptId, [gradedResponse(answer)]),
        });
      });
    vi.stubGlobal("fetch", fetch);
    render(
      <SessionProvider initial={persistent}>
        <MultipleChoiceQuiz quiz={publicQuiz} lessonId={lesson.id} />
      </SessionProvider>,
    );
    await user.click(screen.getAllByRole("radio")[0]!);
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network disconnected");
    expect(screen.queryByRole("status", { name: "Answer feedback" })).not.toBeInTheDocument();
    const pending = readOutbox(localStorage, owner);
    expect(pending).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry saving answer" }));
    expect(await screen.findByRole("status", { name: "Answer feedback" })).toHaveTextContent(
      "That’s right!",
    );
    expect(readOutbox(localStorage, owner)).toHaveLength(0);
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  });
  it("opens a requested historical unfinished attempt and starts an independent retry", async () => {
    const first = savedAttempt();
    const second = savedAttempt(crypto.randomUUID(), [
      gradedResponse(input),
      gradedResponse({
        ...input,
        questionId: quiz.questions[1]!.id,
        optionId: quiz.questions[1]!.correctOptionId,
      }),
    ]);
    const initial = { ...persistent, snapshot: { ...emptySnapshot, attempts: [second, first] } };
    const view = render(
      <SessionProvider initial={initial}>
        <MultipleChoiceQuiz quiz={publicQuiz} lessonId={lesson.id} requestedAttempt={first.id} />
      </SessionProvider>,
    );
    expect(screen.getByText("Question 2 of 5")).toBeInTheDocument();
    view.unmount();
    const fetch = vi.fn(async (_url, options) => {
      const answer = JSON.parse(options.body);
      return Response.json({
        mode: "persistent",
        attempt: savedAttempt(answer.attemptId, [gradedResponse(answer)]),
      });
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <SessionProvider initial={initial}>
        <MultipleChoiceQuiz quiz={publicQuiz} lessonId={lesson.id} requestedAttempt="new" />
        <SessionProbe />
      </SessionProvider>,
    );
    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("radio")[0]!);
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await screen.findByRole("status", { name: "Answer feedback" });
    expect(screen.getByLabelText("Attempt count")).toHaveTextContent("3");
    const posted = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(posted.attemptId).not.toBe(first.id);
    expect(posted.attemptId).not.toBe(second.id);
  });
  it("resumes an unfinished saved attempt and retains a queued answer after remount", async () => {
    const second = {
      ...input,
      questionId: quiz.questions[1]!.id,
      optionId: quiz.questions[1]!.correctOptionId,
    };
    queueAnswer(localStorage, owner, second);
    // Normal application boot reads owner-scoped drafts from storage alongside the snapshot.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) =>
        url === "/api/learning"
          ? Response.json({
              ...persistent,
              snapshot: { ...emptySnapshot, attempts: [savedAttempt()] },
            })
          : Response.json({
              mode: "persistent",
              attempt: savedAttempt(input.attemptId, [
                gradedResponse(input),
                gradedResponse(JSON.parse(options.body)),
              ]),
            }),
      ),
    );
    render(
      <SessionProvider>
        <MultipleChoiceQuiz quiz={publicQuiz} lessonId={lesson.id} />
      </SessionProvider>,
    );
    expect(await screen.findByText("Question 2 of 5")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry saving answer" })).toBeEnabled(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry saving answer" }));
    expect(await screen.findByRole("status", { name: "Answer feedback" })).toHaveTextContent(
      "That’s right!",
    );
    expect(readOutbox(localStorage, owner)).toHaveLength(0);
  });
});
