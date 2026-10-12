import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetProgress } from "@/components/progress/reset-progress";
import { SessionProvider, useSession } from "@/components/progress/session-provider";
import { MultipleChoiceQuiz } from "@/components/exercises/multiple-choice-quiz";
import { firstChapter } from "@/lib/curriculum";
import { emptySnapshot } from "@/lib/learning/contracts";
import { queueAnswer, readOutbox } from "@/lib/learning/outbox";
import { input, savedAttempt, gradedResponse } from "./fixtures";
const owner = "11111111-1111-4111-8111-111111111111";
const initial = {
  mode: "persistent" as const,
  configured: true,
  user: { id: owner, email: "learner@example.test" },
  snapshot: { ...emptySnapshot, completed: ["a1-c1-introductions"], attempts: [savedAttempt()] },
};
function Probe() {
  const state = useSession();
  return (
    <>
      <output aria-label="Completions">{state.completed.length}</output>
      <output aria-label="Attempts">{state.attempts.length}</output>
      <output aria-label="Generation">{state.generation}</output>
      <button onClick={() => void state.refresh()}>Refresh snapshot</button>
    </>
  );
}
function setup(quiz = false) {
  render(
    <SessionProvider initial={initial}>
      <ResetProgress />
      <Probe />
      {quiz && (
        <MultipleChoiceQuiz
          lessonId={input.lessonId}
          quiz={firstChapter.lessons[2]!.blocks.find((b) => b.type === "quiz")!}
        />
      )}
    </SessionProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("confirmed account reset", () => {
  it("requires typed confirmation, supports cancel, and clears local drafts only after acknowledgement", async () => {
    let acknowledge!: (value: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          acknowledge = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    queueAnswer(localStorage, owner, input);
    queueAnswer(localStorage, "other-user", input);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset progress and history" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("This cannot be undone");
    expect(screen.getByRole("button", { name: "Permanently reset" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset progress and history" }));
    await user.type(screen.getByLabelText("Type RESET to confirm"), "RESET");
    await user.click(screen.getByRole("button", { name: "Permanently reset" }));
    expect(screen.getByRole("button", { name: "Resetting…" })).toBeDisabled();
    expect(screen.getByLabelText("Attempts")).toHaveTextContent("1");
    expect(readOutbox(localStorage, owner)).toHaveLength(1);
    acknowledge(Response.json({ ...emptySnapshot, generation: 1 }));
    await screen.findByText("Your progress and review history have been reset.");
    expect(screen.getByLabelText("Completions")).toHaveTextContent("0");
    expect(screen.getByLabelText("Attempts")).toHaveTextContent("0");
    expect(screen.getByLabelText("Generation")).toHaveTextContent("1");
    expect(readOutbox(localStorage, owner)).toHaveLength(0);
    expect(readOutbox(localStorage, "other-user")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset progress and history" })).toHaveFocus();
  });
  it("retains displayed history and drafts on failure and retries the identical reset request", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(Response.json({ ...emptySnapshot, generation: 1 }));
    vi.stubGlobal("fetch", fetch);
    queueAnswer(localStorage, owner, input);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset progress and history" }));
    await user.type(screen.getByLabelText("Type RESET to confirm"), "RESET");
    await user.click(screen.getByRole("button", { name: "Permanently reset" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
    expect(screen.getByLabelText("Completions")).toHaveTextContent("1");
    expect(readOutbox(localStorage, owner)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry reset" }));
    await screen.findByText("Your progress and review history have been reset.");
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  });
  it("starts quizzes with the acknowledged generation after reset", async () => {
    const fetch = vi.fn(async (url, options) =>
      url === "/api/learning/reset"
        ? Response.json({ ...emptySnapshot, generation: 1 })
        : Response.json({
            mode: "persistent",
            attempt: savedAttempt(JSON.parse(options.body).attemptId, [
              gradedResponse(JSON.parse(options.body)),
            ]),
          }),
    );
    vi.stubGlobal("fetch", fetch);
    setup(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset progress and history" }));
    await user.type(screen.getByLabelText("Type RESET to confirm"), "RESET");
    await user.click(screen.getByRole("button", { name: "Permanently reset" }));
    await screen.findByText("Question 1 of 5");
    await user.click(screen.getAllByRole("radio")[0]!);
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await screen.findByRole("status", { name: "Answer feedback" });
    expect(JSON.parse(fetch.mock.calls[1]![1].body).generation).toBe(1);
  });
  it("ignores a late answer acknowledgement from before the reset", async () => {
    let acknowledge!: (value: Response) => void;
    let oldInput: typeof input;
    const fetch = vi.fn(async (url, options) => {
      if (url === "/api/learning/reset") return Response.json({ ...emptySnapshot, generation: 1 });
      oldInput = JSON.parse(options.body);
      return new Promise<Response>((resolve) => {
        acknowledge = resolve;
      });
    });
    vi.stubGlobal("fetch", fetch);
    setup(true);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("radio")[1]!);
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    await user.click(screen.getByRole("button", { name: "Reset progress and history" }));
    await user.type(screen.getByLabelText("Type RESET to confirm"), "RESET");
    await user.click(screen.getByRole("button", { name: "Permanently reset" }));
    await screen.findByText("Question 1 of 5");
    acknowledge(
      Response.json({
        mode: "persistent",
        attempt: savedAttempt(oldInput!.attemptId, [gradedResponse(oldInput!)]),
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("Attempts")).toHaveTextContent("0"));
    expect(screen.queryByRole("status", { name: "Answer feedback" })).not.toBeInTheDocument();
    expect(readOutbox(localStorage, owner)).toHaveLength(0);
  });
  it("clears stale device drafts when a reset from another device is acknowledged by refresh", async () => {
    queueAnswer(localStorage, owner, input);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...initial, snapshot: { ...emptySnapshot, generation: 1 } }),
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Refresh snapshot" }));
    await waitFor(() => expect(screen.getByLabelText("Generation")).toHaveTextContent("1"));
    expect(readOutbox(localStorage, owner)).toHaveLength(0);
    expect(screen.getByLabelText("Attempts")).toHaveTextContent("0");
  });
});
