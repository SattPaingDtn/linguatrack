import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { emptySnapshot, type LearningSnapshot } from "../../src/lib/learning/contracts";
import { input, savedAttempt, gradedResponse } from "../fixtures";

test("reset confirmation, failed-save retry and fresh learning work on desktop and mobile", async ({
  page,
}) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "learner@example.test" };
  let snapshot: LearningSnapshot = {
    ...structuredClone(emptySnapshot),
    completed: ["a1-c1-introductions"],
    attempts: [savedAttempt()],
  };
  const resetBodies: unknown[] = [];
  await page.route(/\/api\/learning(?:\/[^?]*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/learning")
      return route.fulfill({ json: { mode: "persistent", configured: true, user, snapshot } });
    const body = route.request().postDataJSON();
    if (path.endsWith("/reset")) {
      resetBodies.push(body);
      if (resetBodies.length === 1)
        return route.fulfill({ status: 503, json: { error: "Reset connection interrupted." } });
      snapshot = { ...structuredClone(emptySnapshot), generation: 1 };
      return route.fulfill({ json: snapshot });
    }
    if (path.endsWith("/answer")) {
      expect(body.generation).toBe(1);
      const attempt = savedAttempt(body.attemptId, [gradedResponse(body)]);
      snapshot.attempts = [attempt];
      return route.fulfill({ json: { mode: "persistent", attempt } });
    }
    if (path.endsWith("/position")) {
      expect(body.generation).toBe(1);
      return route.fulfill({ json: { saved: true } });
    }
    return route.abort();
  });
  await page.goto("/progress");
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
  await page.evaluate(
    ({ owner, answer }) => {
      localStorage.setItem(`linguatrack:pending:v1:${owner}`, JSON.stringify([answer]));
      localStorage.setItem("linguatrack:pending:v1:other-account", JSON.stringify([answer]));
    },
    { owner: user.id, answer: input },
  );
  await page.getByRole("button", { name: "Reset progress and history" }).click();
  await expect(page.getByRole("button", { name: "Permanently reset" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(resetBodies).toHaveLength(0);
  await page.getByRole("button", { name: "Reset progress and history" }).click();
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Permanently reset" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Reset connection interrupted");
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      (owner) => localStorage.getItem(`linguatrack:pending:v1:${owner}`),
      user.id,
    ),
  ).not.toBeNull();
  await page.getByRole("button", { name: "Retry reset" }).click();
  await expect(page.getByText("Your progress and review history have been reset.")).toBeVisible();
  await expect(page.getByText("0 / 3", { exact: true })).toBeVisible();
  expect(resetBodies[1]).toEqual(resetBodies[0]);
  expect(
    await page.evaluate(
      (owner) => localStorage.getItem(`linguatrack:pending:v1:${owner}`),
      user.id,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("linguatrack:pending:v1:other-account")),
  ).not.toBeNull();
  await page.reload();
  await expect(page.getByText("0 / 3", { exact: true })).toBeVisible();
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Your first try belongs here." })).toBeVisible();
  await page.goto("/courses/a1/chapters/first-conversations/lessons/chapter-check");
  await expect(page.getByText("Question 1 of 5")).toBeVisible();
  await page.getByRole("radio").nth(0).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status", { name: "Answer feedback" })).toContainText("That’s right");
  await page.goto("/review");
  await expect(page.getByText("1 attempt · saved history · newest first")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset progress and history" })).toBeVisible();
});
