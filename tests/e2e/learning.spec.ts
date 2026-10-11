import { test, expect } from "@playwright/test";
const root = "/courses/a1/chapters/first-conversations/lessons/";
test("learn, pass a quiz, review it, and verify reload clears session progress", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Start your first lesson" }).click();
  await expect(page.getByRole("heading", { name: "Hello, nice to meet you!" })).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", "/audio/a1-introductions.wav");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await page.getByRole("link", { name: "Next: The little verb “to be”" }).click();
  await page
    .getByLabel("Your introduction")
    .fill("Hello! My name is Alex. I am from Canada. I am a student.");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await page.getByRole("link", { name: "Next: Let’s put it all together" }).click();
  await expect(page.getByRole("button", { name: "Mark lesson complete" })).toBeDisabled();
  const answerIndexes = [0, 1, 2, 1, 2];
  for (let index = 0; index < answerIndexes.length; index++) {
    await page.getByRole("radio").nth(answerIndexes[index]!).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByRole("status", { name: "Answer feedback" })).toContainText(
      "That’s right!",
    );
    await page
      .getByRole("button", { name: index === 4 ? "See my result" : "Next question" })
      .click();
  }
  await expect(page.getByText("5 of 5 correct · Passed")).toBeVisible();
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await page.getByRole("link", { name: "View review history" }).click();
  await expect(page.getByText("5/5 correct · Passed")).toBeVisible();
  await page.getByText("Review answers and Burmese explanations").click();
  await expect(page.getByText("Use am with I: “I am a student.”")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your first try belongs here." })).toBeVisible();
  expect(errors).toEqual([]);
});
test("courses, practice filters, unknown routes, and responsive navigation", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "My courses", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } else await page.getByRole("link", { name: "My courses", exact: true }).click();
  await page.getByRole("link", { name: "Preview C1" }).click();
  await expect(page.getByRole("heading", { name: "A glimpse of your next level" })).toBeVisible();
  await page.goto("/practice");
  await page.getByRole("button", { name: "writing", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "sample exercise" })).toHaveText(
    "1 sample exercise",
  );
  await page.getByRole("link", { name: "Practise now" }).click();
  await expect(page.getByLabel("Your introduction")).toBeVisible();
  for (const path of ["/", "/courses", "/courses/a1", `${root}am-is-are`, "/progress"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `${path} must fit viewport`).toBe(false);
  }
  await page.goto(`${root}missing`);
  await expect(page.getByRole("heading", { name: "Let’s find your learning path." })).toBeVisible();
});
