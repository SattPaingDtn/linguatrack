import { test, expect, type BrowserContext } from "@playwright/test";
import { emptySnapshot, type LearningSnapshot } from "../../src/lib/learning/contracts";
import { gradedResponse, savedAttempt } from "../fixtures";
const root = "/courses/a1/chapters/first-conversations/lessons/";
test("acknowledged progress resumes after reload and in a second browser; retries retain earlier attempts", async ({
  page,
  browser,
  context,
}) => {
  const snapshot: LearningSnapshot = structuredClone(emptySnapshot);
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "learner@example.test" };
  async function wire(target: BrowserContext) {
    await target.route(/\/api\/learning(?:\/[^?]*)?$/, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/learning")
        return route.fulfill({ json: { mode: "persistent", configured: true, user, snapshot } });
      const input = request.postDataJSON();
      if (path.endsWith("/position")) {
        snapshot.profile = {
          lastLessonId: input.lessonId,
          lastBlockId: input.blockId,
          contentVersion: input.contentVersion,
          updatedAt: new Date().toISOString(),
        };
        return route.fulfill({ json: { saved: true } });
      }
      if (path.endsWith("/complete")) {
        if (!snapshot.completed.includes(input.lessonId)) snapshot.completed.push(input.lessonId);
        return route.fulfill({ json: snapshot });
      }
      if (path.endsWith("/answer")) {
        const old = snapshot.attempts.find((a) => a.id === input.attemptId);
        const response =
          old?.responses.find((r) => r.questionId === input.questionId) ?? gradedResponse(input);
        const attempt = savedAttempt(input.attemptId, [
          ...(old?.responses ?? []).filter((r) => r.questionId !== response.questionId),
          response,
        ]);
        snapshot.attempts = [attempt, ...snapshot.attempts.filter((a) => a.id !== attempt.id)];
        if (!response.isCorrect && !snapshot.mistakes.some((m) => m.responseId === response.id))
          snapshot.mistakes.push({ responseId: response.id, reviewedAt: null });
        return route.fulfill({ json: { mode: "persistent", attempt } });
      }
      if (path.endsWith("/mistake")) {
        const reviewedAt = new Date().toISOString();
        snapshot.mistakes = snapshot.mistakes.map((m) =>
          m.responseId === input.responseId ? { ...m, reviewedAt } : m,
        );
        return route.fulfill({ json: { reviewedAt } });
      }
      return route.abort();
    });
  }
  await wire(context);
  await page.goto(`${root}introductions`);
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toBeDisabled();
  await page.goto(`${root}chapter-check`);
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status", { name: "Answer feedback" })).toContainText("Not quite");
  await page.reload();
  await expect(page.getByText("Question 2 of 5")).toBeVisible();
  const second = await browser.newContext({ viewport: page.viewportSize()! });
  await wire(second);
  try {
    const other = await second.newPage();
    await other.goto("http://127.0.0.1:3100/");
    await expect(
      other.getByRole("link", { name: "Continue learning", exact: true }),
    ).toHaveAttribute("href", /chapter-check/);
    await other.getByRole("link", { name: "Continue learning", exact: true }).click();
    await expect(other.getByText("Question 2 of 5")).toBeVisible();
  } finally {
    await second.close();
  }
  const indexes = [1, 2, 1, 2];
  for (let i = 0; i < 4; i++) {
    await page.getByRole("radio").nth(indexes[i]!).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await page.getByRole("button", { name: i === 3 ? "See my result" : "Next question" }).click();
  }
  await expect(page.getByText("4 of 5 correct · Passed")).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("radio").nth(0).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status", { name: "Answer feedback" })).toContainText("That’s right");
  await page.goto("/review");
  await expect(page.getByText("2 attempts · saved history · newest first")).toBeVisible();
  await page.getByLabel("Incorrect answers only").check();
  await page.getByText("Review answers and Burmese explanations").nth(1).click();
  await expect(page.getByText("Your answer: is · Incorrect")).toBeVisible();
  await page.getByRole("button", { name: "Mark explanation reviewed" }).click();
  await expect(page.getByRole("button", { name: "Reviewed", exact: true })).toBeDisabled();
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Demonstrated quiz evidence" })).toBeVisible();
  await expect(page.getByText("Not assessed", { exact: true })).toHaveCount(3);
  await page.reload();
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
  expect(snapshot.attempts).toHaveLength(2);
  expect(snapshot.attempts.find((a) => a.status === "completed")?.responses).toHaveLength(5);
});
test("failed answer saves expose retry and retain the selected option", async ({ page }) => {
  let failed = false;
  await page.route("**/api/learning/answer", async (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        json: { error: "Connection interrupted; retry this answer." },
      });
    }
    return route.continue();
  });
  await page.goto(`${root}chapter-check`);
  await page.getByRole("radio").nth(0).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toContainText(
    "Connection interrupted",
  );
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  await expect(page.getByRole("radio").nth(0)).toBeDisabled();
  await expect(page.getByRole("status", { name: "Answer feedback" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry saving answer" }).click();
  await expect(page.getByRole("status", { name: "Answer feedback" })).toContainText("That’s right");
});
test("initial quiz payload omits private keys and forged server submissions fail", async ({
  page,
  request,
}) => {
  const response = await page.goto(`${root}chapter-check`);
  const html = await response!.text();
  expect(html).not.toContain("Use am with I:");
  expect(html).not.toContain("correctOptionId");
  const denied = await request.post("/api/learning/answer", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      attemptId: crypto.randomUUID(),
      contentVersion: "1.0.0",
      lessonId: "a1-c1-check",
      quizId: "a1-c1-quiz",
      questionId: "a1-c1-q1",
      optionId: "option-1",
      score: 100,
    },
  });
  expect(denied.status()).toBe(400);
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Saved learning starts with Supabase." }),
  ).toBeVisible();
});
