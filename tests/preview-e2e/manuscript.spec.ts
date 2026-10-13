import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { MANUSCRIPT_CHAPTERS } from "../../src/lib/curriculum/manuscript-preview/config";
import { publicCollectionsSchema } from "../../src/lib/curriculum/v2/public";
import { gradingSchema } from "../../src/lib/curriculum/v2/private";
const step = (p: Page, label: string) =>
  p
    .getByRole("navigation", { name: "Lesson steps" })
    .getByRole("button", { name: new RegExp(label) })
    .click();
for (const cfg of MANUSCRIPT_CHAPTERS) {
  const pub = publicCollectionsSchema.parse(
      JSON.parse(
        readFileSync(
          `content-authoring/a1-chapters-04-06/chapter-${cfg.number}/public.json`,
          "utf8",
        ),
      ),
    ),
    rules = gradingSchema.parse(
      JSON.parse(
        readFileSync(
          `content-authoring/a1-chapters-04-06/chapter-${cfg.number}/grading.json`,
          "utf8",
        ),
      ),
    ).exerciseRules;
  test(`Chapter ${cfg.number}: all seven lessons remain accessible, responsive and isolated`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const requests: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/(learning|auth)|supabase\.co/.test(r.url())) requests.push(r.url());
    });
    await page.addInitScript(() =>
      localStorage.setItem("linguatrack:pending:v1:manuscript-owner", "unchanged old answers"),
    );
    await page.goto(`/dev/a1/${cfg.slug}`);
    await expect(page.locator("main ol > li")).toHaveCount(7);
    const storage = await page.evaluate(() => ({ ...localStorage }));
    for (const l of pub.lessons) {
      const response = await page.goto(`/dev/a1/${cfg.slug}/${l.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "en" in l.title ? l.title.en : l.title.text,
      );
      expect(await response!.text()).not.toMatch(
        /correctOptionIds|acceptedByBlank|graderVersion|PRIVATE TEACHER ANSWER KEY/,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await step(page, "Practice");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await page.screenshot({
      path: `test-results/manuscript-${cfg.number}-${info.project.name}.png`,
      fullPage: true,
    });
    for (const src of await page
      .locator("script[src]")
      .evaluateAll((n) => n.map((n) => n.getAttribute("src")!)))
      expect(await (await page.request.get(src)).text()).not.toMatch(
        /correctOptionIds|acceptedByBlank|manuscript-authoring/,
      );
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
  });
  test(`Chapter ${cfg.number}: all 12 MCQs receive correct bilingual feedback and keep page-memory state`, async ({
    page,
  }) => {
    const lesson = pub.lessons.find((l) => l.slug === "review")!;
    await page.goto(`/dev/a1/${cfg.slug}/${lesson.slug}`);
    await step(page, "Practice");
    const qs = pub.exercises.filter((e) => e.type === "multiple_choice");
    expect(qs).toHaveLength(12);
    for (const [i, q] of qs.entries()) {
      if (q.type !== "multiple_choice") throw new Error("MCQ");
      const rule = rules.find((r) => r.exerciseRef.id === q.id)!;
      if (rule.type !== "multiple_choice") throw new Error("Rule");
      const correct = q.options.find((o) => o.id === rule.correctOptionIds[0])!;
      const card = page.locator("[data-preview-question]");
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("data-preview-question", q.id);
      await card.getByRole("radio", { name: correct.text.text, exact: true }).check();
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/dev-manuscript-preview/answer"),
      );
      await card.getByRole("button", { name: "Check answer" }).click();
      const returned = await response;
      expect(returned.status()).toBe(200);
      expect(await returned.json()).toMatchObject({
        saved: false,
        simulated: true,
        isCorrect: true,
        explanation: rule.explanation,
      });
      await expect(card.getByText(rule.explanation.my, { exact: true })).toBeVisible();
      if (i < 11) await page.getByRole("button", { name: "Next question" }).click();
    }
    await step(page, "Review");
    await expect(page.locator("[data-preview-reviewed]")).toHaveCount(12);
    await step(page, "Learn");
    await step(page, "Practice");
    await expect(page.locator("[data-preview-question]")).toHaveAttribute(
      "data-preview-question",
      qs.at(-1)!.id,
    );
    await page.reload();
    await step(page, "Review");
    await expect(page.getByText("No answers checked yet")).toBeVisible();
  });
  test(`Chapter ${cfg.number}: reading offers one private example after responding, never automatic correctness`, async ({
    page,
  }) => {
    const lesson = pub.lessons.find((l) => l.tags.areas.includes("reading"))!;
    await page.goto(`/dev/a1/${cfg.slug}/${lesson.slug}`);
    await step(page, "Practice");
    await expect(page.locator("[data-short-question]")).toHaveCount(5);
    await expect(page.getByText("One example · not an automatic grade")).toHaveCount(0);
    for (const q of pub.exercises.filter(
      (q) => q.type === "fill_in_blank" && q.tags.areas.includes("reading"),
    )) {
      const card = page.locator(`[data-short-question="${q.id}"]`);
      await expect(card.getByRole("button", { name: "Compare with one example" })).toBeDisabled();
      await card.getByRole("textbox", { name: "Your short answer" }).fill("My own short response.");
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/dev-manuscript-preview/answer"),
      );
      await card.getByRole("button", { name: "Compare with one example" }).click();
      const result = await (await response).json();
      expect(result).toMatchObject({
        saved: false,
        selfReviewOnly: true,
        submittedText: "My own short response.",
      });
      expect(result).not.toHaveProperty("isCorrect");
      expect(result).not.toHaveProperty("score");
      expect(JSON.stringify(result)).not.toMatch(/acceptedByBlank|variants/);
      await expect(card.getByText(result.exampleAnswer, { exact: true })).toBeVisible();
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await step(page, "Review");
    await step(page, "Practice");
    await expect(page.getByText("One example · not an automatic grade")).toHaveCount(5);
    await page.reload();
    await step(page, "Practice");
    await expect(page.getByText("One example · not an automatic grade")).toHaveCount(0);
  });
  test(`Chapter ${cfg.number}: audio remains unavailable and writing/speaking are unsaved, ungraded`, async ({
    page,
  }) => {
    const listener = pub.lessons.find((l) => l.tags.areas.includes("listening"))!;
    await page.goto(`/dev/a1/${cfg.slug}/${listener.slug}`);
    await expect(page.locator("audio")).toHaveCount(0);
    await step(page, "Practice");
    await expect(page.locator("[data-short-question]")).toHaveCount(4);
    await expect(
      page.getByRole("button", { name: /Compare with one example|Check answer/ }),
    ).toHaveCount(0);
    const status = await page.evaluate(
      async ({ version, lessonId, id }) =>
        fetch("/api/dev-manuscript-preview/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contentVersion: version,
            lessonId,
            publicDigest: "0".repeat(64),
            exercise: { kind: "exercise", id, revision: 1 },
            mode: "self_review",
            text: "answer",
          }),
        }).then((r) => r.status),
      { version: cfg.version, lessonId: listener.id, id: `a1-c${cfg.number}-l1-1` },
    );
    expect(status).toBe(409);
    const writer = pub.lessons.find((l) => l.tags.areas.includes("writing"))!;
    await page.goto(`/dev/a1/${cfg.slug}/${writer.slug}`);
    await step(page, "Practice");
    for (const d of await page.locator("#chapter-practice > details").all())
      await d.locator("summary").first().click();
    const editors = page.getByRole("textbox", { name: "Your own sentences" });
    await expect(editors).toHaveCount(2);
    await expect(page.getByText("Compare with an example")).toHaveCount(0);
    await editors.nth(0).fill("My first draft.");
    await editors.nth(1).fill("My revised draft.");
    await expect(page.getByText("Compare with an example")).toHaveCount(2);
    await step(page, "Learn");
    await step(page, "Practice");
    await expect(editors.nth(1)).toHaveValue("My revised draft.");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("new self-review controls work by keyboard; failed requests retain the draft for retry", async ({
  page,
}) => {
  const cfg = MANUSCRIPT_CHAPTERS[0]!,
    source = publicCollectionsSchema.parse(
      JSON.parse(
        readFileSync(
          `content-authoring/a1-chapters-04-06/chapter-${cfg.number}/public.json`,
          "utf8",
        ),
      ),
    ),
    lesson = source.lessons.find((l) => l.tags.areas.includes("reading"))!;
  await page.goto(`/dev/a1/${cfg.slug}/${lesson.slug}`);
  const practice = page
    .getByRole("navigation", { name: "Lesson steps" })
    .getByRole("button", { name: /Practice/ });
  await practice.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeFocused();
  const card = page.locator("[data-short-question]").first(),
    input = card.getByRole("textbox", { name: "Your short answer" });
  await input.focus();
  await page.keyboard.type("My response stays here.");
  await page.keyboard.press("Tab");
  const compare = card.getByRole("button", { name: "Compare with one example" });
  await expect(compare).toBeFocused();
  let fail = true;
  await page.route("**/api/dev-manuscript-preview/answer", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Local example unavailable." }),
      });
    } else await route.continue();
  });
  await page.keyboard.press("Enter");
  await expect(card.getByRole("alert")).toContainText("Your draft is still here");
  await expect(input).toHaveValue("My response stays here.");
  await compare.focus();
  await page.keyboard.press("Enter");
  await expect(card.getByText("One example · not an automatic grade")).toBeVisible();
  await expect(input).toHaveValue("My response stays here.");
});
