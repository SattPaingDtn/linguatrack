import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { preview, rules } from "../preview/fixtures";
import { PREVIEW_PATH } from "../../src/lib/curriculum/preview/contracts";
const steps = (page: Page) => page.getByRole("navigation", { name: "Lesson steps" });
const go = (page: Page, name: string) =>
  steps(page)
    .getByRole("button", { name: new RegExp(name) })
    .click();
const review = (page: Page) => page.getByRole("region", { name: "Review", exact: true });
async function openWriting(page: Page) {
  const details = page.locator("[data-preview-writing]");
  if (!((await details.getAttribute("open")) !== null))
    await details.locator("summary").first().click();
  return page.getByRole("textbox", { name: "Your two sentences" });
}
async function axe(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test("all 14 ordered questions use isolated server feedback, survive steps and reset on refresh", async ({
  page,
}) => {
  const learningRequests: string[] = [];
  const posts: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(learning|auth)|supabase\.co/.test(request.url()))
      learningRequests.push(request.url());
    if (request.url().endsWith("/api/dev-preview/answer")) posts.push(request.method());
  });
  await page.addInitScript(() =>
    localStorage.setItem("linguatrack:pending:v1:existing-owner", "existing learner data"),
  );
  const initial = await page.goto(PREVIEW_PATH);
  expect(initial?.status()).toBe(200);
  const html = await initial!.text();
  for (const rule of rules) expect(html).not.toContain(rule.explanation.en);
  expect(html).not.toContain("correctOptionIds");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(preview.lesson.title.en);
  await expect(page.getByText("LOCAL · UNSAVED")).toBeVisible();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await axe(page);
  await go(page, "Practice");
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeFocused();
  const writing = await openWriting(page);
  await writing.fill("I like tea. She is happy.");
  for (const [index, q] of preview.exercises.entries()) {
    const card = page.locator("[data-preview-question]");
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-preview-question", q.id);
    await expect(
      page.getByText(`Question ${index + 1} of 14 · ${index} questions checked`),
    ).toBeVisible();
    const option = q.options.find((o) => o.id === rules[index]!.correctOptionIds[0])!;
    await card.getByRole("radio", { name: option.text.text, exact: true }).check();
    const returned = page.waitForResponse(
      (r) => r.url().endsWith("/api/dev-preview/answer") && r.request().method() === "POST",
    );
    await card.getByRole("button", { name: "Check answer" }).click();
    const graded = await returned;
    expect(graded.status()).toBe(200);
    expect(await graded.json()).toMatchObject({
      simulated: true,
      saved: false,
      isCorrect: true,
      explanation: rules[index]!.explanation,
    });
    await expect(card.getByText(rules[index]!.explanation.en, { exact: true })).toBeVisible();
    await expect(card.getByText(rules[index]!.explanation.my, { exact: true })).toBeVisible();
    if (index < 13) await page.getByRole("button", { name: "Next question" }).click();
  }
  await expect(page.getByRole("button", { name: "Next question" })).toBeDisabled();
  await go(page, "Review");
  await expect(review(page).locator("[data-preview-reviewed]")).toHaveCount(14);
  await expect(
    review(page).getByLabel("Practice summary").getByText("Answered").locator(".."),
  ).toContainText("14");
  await expect(
    review(page).getByLabel("Practice summary").getByText("Correct", { exact: true }).locator(".."),
  ).toContainText("14");
  await expect(
    review(page)
      .getByLabel("Practice summary")
      .getByText("Incorrect", { exact: true })
      .locator(".."),
  ).toContainText("0");
  await axe(page);
  await go(page, "Learn");
  await go(page, "Practice");
  await expect(writing).toHaveValue("I like tea. She is happy.");
  await expect(page.locator("[data-preview-question]")).toHaveAttribute(
    "data-preview-question",
    "a1-c1-pronouns-q14",
  );
  await axe(page);
  expect(posts).toHaveLength(14);
  expect(learningRequests).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  for (const script of await page
    .locator("script[src]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")!))) {
    const asset = await page.request.get(script);
    const source = await asset.text();
    expect(source).not.toContain("correctOptionIds");
    for (const rule of rules) expect(source).not.toContain(rule.explanation.en);
  }
  await page.reload();
  await go(page, "Review");
  await expect(page.getByText("No answers checked yet")).toBeVisible();
  await go(page, "Practice");
  await expect(page.getByText("Question 1 of 14 · 0 questions checked")).toBeVisible();
  await expect(await openWriting(page)).toHaveValue("");
  expect(posts).toHaveLength(14);
  expect(learningRequests).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
});

test("failed checks retain choices; Review retains incorrect and earlier feedback after a retry", async ({
  page,
}) => {
  await page.goto(PREVIEW_PATH);
  await go(page, "Practice");
  for (let i = 0; i < 11; i++) await page.getByRole("button", { name: "Next question" }).click();
  let reject = true;
  await page.route("**/api/dev-preview/answer", async (route) => {
    if (reject) {
      reject = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary preview failure" }),
      });
    } else await route.continue();
  });
  const card = page.locator("[data-preview-question]");
  await card.getByRole("radio", { name: "Am I a student?", exact: true }).check();
  await card.getByRole("button", { name: "Check answer" }).click();
  await expect(card.getByRole("alert")).toContainText("Your selection is still here");
  await go(page, "Learn");
  await go(page, "Practice");
  await expect(card.getByRole("radio", { name: "Am I a student?", exact: true })).toBeChecked();
  await card.getByRole("button", { name: "Check answer" }).click();
  await expect(card.getByRole("status")).toContainText("Keep practising");
  await go(page, "Review");
  await expect(
    review(page).getByText("Your checked answer: Am I a student?", { exact: true }),
  ).toBeVisible();
  await expect(review(page).getByText("Correct answer: I am a student.")).toBeVisible();
  await expect(
    review(page)
      .getByLabel("Practice summary")
      .getByText("Incorrect", { exact: true })
      .locator(".."),
  ).toContainText("1");
  await review(page).getByRole("button", { name: "Revisit question 12" }).click();
  await card.getByRole("button", { name: "Try this question again" }).click();
  await go(page, "Review");
  await expect(
    review(page).getByText("Your checked answer: Am I a student?", { exact: true }),
  ).toBeVisible();
  await review(page).getByRole("button", { name: "Revisit question 12" }).click();
  await card.getByRole("radio", { name: "I am a student.", exact: true }).check();
  await card.getByRole("button", { name: "Check answer" }).click();
  await expect(card.getByRole("status")).toContainText("Correct ·");
  await go(page, "Review");
  await review(page).getByText("Earlier checks (1)").click();
  await expect(review(page).getByText("Check 1 · Your answer: Am I a student?")).toBeVisible();
  await expect(
    review(page).getByLabel("Practice summary").getByText("Correct", { exact: true }).locator(".."),
  ).toContainText("1");
  await expect(
    review(page)
      .getByLabel("Practice summary")
      .getByText("Incorrect", { exact: true })
      .locator(".."),
  ).toContainText("0");
  await axe(page);
});

test("Learn grouping, keyboard steps, fonts, writing comparison and 200% text remain accessible", async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await page.goto(PREVIEW_PATH);
  await page.evaluate(() => document.fonts.ready);
  const groups = page.locator("[data-preview-learn-group]");
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAttribute("open", "");
  await expect(groups.nth(1)).not.toHaveAttribute("open");
  expect(
    await page.locator("#preview-learn section[id]").evaluateAll((nodes) => nodes.map((n) => n.id)),
  ).toEqual(
    preview.blocks.filter((b) => b.type === "grammar" || b.type === "explanation").map((b) => b.id),
  );
  const objective = page.locator("[data-preview-objectives]");
  await objective.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(objective).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(objective).not.toHaveAttribute("open");
  await groups.nth(1).locator("summary").first().click();
  await expect(page.getByRole("region", { name: "Understand the sentence parts" })).toBeVisible();
  for (const width of [320, 768, testInfo.project.name === "desktop" ? 1440 : 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const metrics = await page
      .locator('#a1-c1-pronouns-overview [data-preview-language="my"] p')
      .first()
      .evaluate((node) => {
        const s = getComputedStyle(node);
        return {
          family: s.fontFamily,
          size: parseFloat(s.fontSize),
          leading: parseFloat(s.lineHeight) / parseFloat(s.fontSize),
          loaded: document.fonts.check('17px "Noto Sans Myanmar"', "မြန်မာ"),
        };
      });
    expect(metrics.family).toContain("Noto Sans Myanmar");
    expect(metrics.size).toBeGreaterThanOrEqual(17);
    expect(metrics.leading).toBeGreaterThanOrEqual(1.8);
    expect(metrics.leading).toBeLessThanOrEqual(2);
    expect(metrics.loaded).toBe(true);
    expect(
      await page.locator("[data-preview-bilingual]").evaluateAll((pairs) =>
        pairs.every((pair) => {
          const en = pair.querySelector('[data-preview-language="en"]')!.getBoundingClientRect(),
            my = pair.querySelector('[data-preview-language="my"]')!.getBoundingClientRect();
          return (
            en.height === 0 ||
            (en.bottom <= my.top && my.right <= pair.getBoundingClientRect().right + 1)
          );
        }),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await steps(page)
    .getByRole("button", { name: /Practice/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeFocused();
  await expect(steps(page).getByRole("button", { name: /Practice/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.getByRole("button", { name: "Previous question" })).toBeDisabled();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(
    page.getByRole("group", { name: preview.exercises[1]!.prompt.text }).locator("legend"),
  ).toBeFocused();
  await page.getByRole("button", { name: "Previous question" }).click();
  const writing = await openWriting(page);
  await writing.fill("I like tea. She is happy.");
  await expect(
    page
      .locator("[data-preview-writing] details")
      .getByText("I like tea. She is happy.", { exact: true }),
  ).toBeVisible();
  await axe(page);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await page.setViewportSize({ width: 320, height: 1000 });
  for (const name of ["Learn", "Practice", "Review"]) {
    await go(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await axe(page);
  }
  await expect(page.getByRole("link", { name: /Back to courses/ })).toHaveAttribute(
    "href",
    "/courses",
  );
  expect(runtimeErrors).toEqual([]);
});

test("an in-flight answer remains visible in Review without a second or bulk request", async ({
  page,
}) => {
  await page.goto(PREVIEW_PATH);
  await go(page, "Practice");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/dev-preview/answer", async (route) => {
    calls++;
    await gate;
    await route.continue();
  });
  await page.getByRole("radio", { name: "I", exact: true }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("button", { name: "Checking…" })).toBeDisabled();
  await go(page, "Review");
  await expect(review(page).getByText(/Checking 1 answer/)).toBeVisible();
  release();
  await expect(review(page).getByText("Your checked answer: I", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await review(page).getByRole("button", { name: "Revisit question 1" }).click();
  await expect(page.getByRole("radio", { name: "I", exact: true })).toBeChecked();
  await expect(
    page.locator("[data-preview-question]").getByText(rules[0]!.explanation.my, { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
});
