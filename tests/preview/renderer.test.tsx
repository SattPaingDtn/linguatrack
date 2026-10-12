import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("@/components/progress/session-provider", () => ({
  SessionProvider: () => {
    throw new Error("Preview mounted persistent session provider");
  },
}));
import { usePathname } from "next/navigation";
import { ApplicationBoundary } from "@/components/layout/application-boundary";
import { PreviewLessonView } from "@/components/preview/preview-lesson";
import { preview, rules } from "./fixtures";
import { PREVIEW_PATH } from "@/lib/curriculum/preview/contracts";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const step = (label: string) =>
  within(screen.getByRole("navigation", { name: "Lesson steps" })).getByRole("button", {
    name: new RegExp(label),
  });
const form = () =>
  screen
    .getByRole("group", {
      name: preview.exercises.find((q) =>
        document.querySelector(`[data-preview-question="${q.id}"]`),
      )!.prompt.text,
    })
    .closest("form")!;
function result(index = 0, selected = "option-1", isCorrect = true) {
  return {
    simulated: true,
    saved: false,
    exercise: { kind: "exercise", id: preview.exercises[index]!.id, revision: 2 },
    selectedOptionId: selected,
    isCorrect,
    correctAnswer: preview.exercises[index]!.options.find(
      (o) => o.id === rules[index]!.correctOptionIds[0],
    )!.text.text,
    explanation: rules[index]!.explanation,
  };
}
const response = (value = result()) => new Response(JSON.stringify(value), { status: 200 });

it("keeps teaching text and block order in three manageable Learn sections", async () => {
  const user = userEvent.setup();
  const { container } = render(<PreviewLessonView preview={preview} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(preview.lesson.title.en);
  const learn = screen.getByRole("region", { name: "Learn" });
  expect(within(learn).getByText(preview.lesson.description.en)).toBeVisible();
  expect(within(learn).getByText(preview.lesson.description.my)).toHaveAttribute("lang", "my");
  expect(learn.querySelectorAll("[data-preview-learn-group]")).toHaveLength(3);
  const blocks = preview.blocks.filter((b) => b.type === "grammar" || b.type === "explanation");
  expect([...learn.querySelectorAll("section[id]")].map((e) => e.id)).toEqual(
    blocks.map((b) => b.id),
  );
  for (const block of blocks) {
    const text = block.type === "grammar" ? block.rule : block.body;
    const node = container.querySelector(`#${block.id}`)!;
    for (const locale of ["en", "my"] as const)
      expect(
        [...node.querySelector(`[data-preview-language="${locale}"]`)!.querySelectorAll("p")]
          .map((p) => p.textContent)
          .join("\n\n"),
      ).toBe(text[locale]);
  }
  await user.click(screen.getByText("2. Be and sentence patterns"));
  expect(screen.getByText("Subject [I] + Verb [read] + Object [books]")).toBeVisible();
  const guide = screen.getByRole("region", { name: "Understand the sentence parts" });
  for (const term of ["Subject", "Verb", "Object", "Be", "Complement"])
    expect(within(guide).getByText(term, { exact: true })).toBeVisible();
  expect(container.querySelector("table")).toBeNull();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to courses/ })).toHaveAttribute("href", "/courses");
});
it("isolates all steps from account initialization, browser storage and bulk grading", async () => {
  const user = userEvent.setup();
  vi.stubEnv("NODE_ENV", "development");
  vi.mocked(usePathname).mockReturnValue(PREVIEW_PATH);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const storage = vi.spyOn(Storage.prototype, "setItem");
  render(
    <ApplicationBoundary>
      <PreviewLessonView preview={preview} />
    </ApplicationBoundary>,
  );
  expect(screen.getByText("LOCAL · UNSAVED")).toBeVisible();
  await user.click(step("Review"));
  expect(screen.getByText("No answers checked yet")).toBeVisible();
  await user.click(step("Practice"));
  await user.click(step("Learn"));
  expect(fetch).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});
it("shows only one question at a time in exact order with previous/next boundaries and unchecked selections", async () => {
  const user = userEvent.setup();
  const { container } = render(<PreviewLessonView preview={preview} />);
  await user.click(step("Practice"));
  expect(screen.getByRole("button", { name: "Previous question" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: "I" }));
  for (const [i, q] of preview.exercises.entries()) {
    expect(container.querySelectorAll("[data-preview-question]")).toHaveLength(1);
    expect(container.querySelector("[data-preview-question]")).toHaveAttribute(
      "data-preview-question",
      q.id,
    );
    expect(screen.getByText(`Question ${i + 1} of 14 · 0 questions checked`)).toBeVisible();
    if (i < 13) await user.click(screen.getByRole("button", { name: "Next question" }));
  }
  expect(screen.getByRole("button", { name: "Next question" })).toBeDisabled();
  for (let i = 13; i > 0; i--)
    await user.click(screen.getByRole("button", { name: "Previous question" }));
  expect(screen.getByRole("radio", { name: "I" })).toBeChecked();
  await user.click(step("Review"));
  expect(screen.getByText("No answers checked yet")).toBeVisible();
});
it("keeps selection after failed checks, retries securely and retains prior feedback while retrying", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("Network unavailable"))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  render(<PreviewLessonView preview={preview} />);
  await user.click(step("Practice"));
  await user.click(screen.getByRole("radio", { name: "I" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your selection is still here");
  await user.click(step("Learn"));
  await user.click(step("Practice"));
  expect(screen.getByRole("radio", { name: "I" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await within(form()).findByText(rules[0]!.explanation.en)).toBeVisible();
  expect(within(form()).getByText(rules[0]!.explanation.my)).toHaveAttribute("lang", "my");
  expect(fetch.mock.calls.every((c) => c[0] === "/api/dev-preview/answer")).toBe(true);
  expect(fetch.mock.calls[1]![1]).toMatchObject({ credentials: "omit", cache: "no-store" });
  await user.click(screen.getByRole("button", { name: "Try this question again" }));
  expect(within(form()).queryByText(rules[0]!.explanation.en)).not.toBeInTheDocument();
  await user.click(step("Review"));
  expect(screen.getByText(rules[0]!.explanation.en)).toBeVisible();
  expect(
    screen.getByText(
      "You are retrying this question. The last checked result is still shown above.",
    ),
  ).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("retains writing, answered choices and feedback across steps and calculates unique question results", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(response(result(1, "option-1", false)));
  vi.stubGlobal("fetch", fetch);
  render(<PreviewLessonView preview={preview} />);
  await user.click(step("Practice"));
  await user.click(screen.getByText("Writing self-practice · unsaved and ungraded"));
  const writing = screen.getByRole("textbox", { name: "Your two sentences" });
  fireEvent.change(writing, { target: { value: "I like tea. She is happy." } });
  expect(screen.getByText(/Writing is not submitted, saved or automatically graded/)).toBeVisible();
  expect(
    screen.getByText(preview.blocks.filter((b) => b.type === "writing")[0]!.modelAnswer.text, {
      selector: "p",
    }),
  ).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "I" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  await within(form()).findByText(rules[0]!.explanation.en);
  await user.click(screen.getByRole("button", { name: "Next question" }));
  await user.click(screen.getByRole("radio", { name: "He" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  await within(form()).findByText(rules[1]!.explanation.en);
  await user.click(step("Review"));
  const stats = screen.getByLabelText("Practice summary");
  expect(within(stats).getByText("Answered").nextElementSibling).toHaveTextContent("2");
  expect(within(stats).getByText("Correct").nextElementSibling).toHaveTextContent("1");
  expect(within(stats).getByText("Incorrect").nextElementSibling).toHaveTextContent("1");
  await user.click(screen.getByRole("button", { name: "Revisit question 1" }));
  expect(screen.getByRole("radio", { name: "I" })).toBeChecked();
  expect(within(form()).getByText(rules[0]!.explanation.en)).toBeVisible();
  expect(writing).toHaveValue("I like tea. She is happy.");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("keeps earlier returned feedback after a repeated check", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(result(0, "option-2", false)))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  render(<PreviewLessonView preview={preview} />);
  await user.click(step("Practice"));
  await user.click(screen.getByRole("radio", { name: "You" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  await within(form()).findByText(rules[0]!.explanation.en);
  await user.click(screen.getByRole("button", { name: "Try this question again" }));
  await user.click(screen.getByRole("radio", { name: "I" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  await within(form()).findByText(rules[0]!.explanation.en);
  await user.click(step("Review"));
  expect(screen.getByText("Your checked answer: I")).toBeVisible();
  await user.click(screen.getByText("Earlier checks (1)"));
  expect(screen.getByText("Check 1 · Your answer: You")).toBeVisible();
  expect(screen.getByText(/Keep practising/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("finishes an in-flight check after step navigation and prevents double submission", async () => {
  const user = userEvent.setup();
  let finish!: (r: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<PreviewLessonView preview={preview} />);
  await user.click(step("Practice"));
  await user.click(screen.getByRole("radio", { name: "I" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  await user.click(step("Review"));
  expect(screen.getByText(/Checking 1 answer/)).toBeVisible();
  await act(async () => finish(response()));
  await waitFor(() => expect(screen.getByText("Your checked answer: I")).toBeVisible());
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects mismatched feedback and retains the unchecked choice without adding a review result", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(result(1))));
  render(<PreviewLessonView preview={preview} />);
  await user.click(step("Practice"));
  await user.click(screen.getByRole("radio", { name: "I" }));
  await user.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("did not match");
  expect(screen.getByRole("radio", { name: "I" })).toBeChecked();
  await user.click(step("Review"));
  expect(screen.getByText("No answers checked yet")).toBeVisible();
  expect(screen.getByRole("button", { name: "Return to question 1" })).toBeVisible();
});
it("preserves English-first translation order and an accessible objective disclosure", async () => {
  const user = userEvent.setup();
  const { container } = render(<PreviewLessonView preview={preview} />);
  for (const pair of container.querySelectorAll("[data-preview-bilingual]"))
    expect([...pair.children].map((p) => p.getAttribute("lang"))).toEqual(["en", "my"]);
  const objective = screen.getByText(preview.objectives[0]!.statement.en);
  expect(objective).not.toBeVisible();
  await user.click(screen.getByText("What you will practise"));
  expect(objective).toBeVisible();
  await user.click(screen.getByText("What you will practise"));
  expect(objective).not.toBeVisible();
});
