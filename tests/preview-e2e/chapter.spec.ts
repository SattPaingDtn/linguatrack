import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import publicContent from "../../content-authoring/a1-chapter-01/public.json";
import privateKeys from "../../content-authoring/a1-chapter-01/grading.json";
import mapping from "../../content-authoring/a1-chapter-01/mapping.json";
import { CHAPTER_PREVIEW_PATH as path } from "../../src/lib/curriculum/chapter-preview/config";
const step = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Lesson steps" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
const lessons = [
  ["introductions", "a1-c1-introductions"],
  ["am-is-are", "a1-c1-be"],
  ["subject-pronouns-and-sentences", "a1-c1-subject-pronouns"],
  ...publicContent.lessons.map((l) => [l.slug, l.id]),
  ["chapter-check", "a1-c1-check"],
];
test("chapter catalog and every lesson render without persistence, overflow or private keys", async ({
  page,
}) => {
  test.setTimeout(120000);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(learning|auth)|supabase\.co/.test(r.url())) writes.push(r.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem("linguatrack:pending:v1:chapter-test", "original-outbox"),
  );
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A1 Chapter 1");
  await expect(page.locator("main ol > li")).toHaveCount(8);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const storage = await page.evaluate(() => ({ ...localStorage }));
  for (const [slug] of lessons) {
    const response = await page.goto(`${path}/${slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await response!.text()).not.toMatch(
      /correctOptionIds|gradingRevision|graderVersion|assessmentPolicies/,
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
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
  for (const src of await page
    .locator("script[src]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")!))) {
    expect(await (await page.request.get(src)).text()).not.toMatch(
      /correctOptionIds|chapter-authoring|private\/grading/,
    );
  }
});
for (const [slug, id] of [
  ["introductions", "a1-c1-introductions"],
  ["am-is-are", "a1-c1-be"],
  ["our-new-team-members", "a1-c1-new-team"],
  ["chapter-check", "a1-c1-check"],
]) {
  test(`${slug}: every new question returns correct bilingual feedback and retains it across steps`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(`${path}/${slug}`);
    await step(page, "Practice");
    const qs = mapping.questions.filter((q) => q.lessonId === id);
    const existingCount = id === "a1-c1-check" ? 5 : 0;
    for (let i = 0; i < existingCount; i++)
      await page.getByRole("button", { name: "Next question" }).click();
    for (const [index, map] of qs.entries()) {
      const q = publicContent.exercises.find((e) => e.id === map.exerciseId)!;
      if (q.type !== "multiple_choice") throw new Error("Expected MCQ");
      const rule = privateKeys.exerciseRules.find((r) => r.exerciseRef.id === q.id)!;
      const card = page.locator("[data-preview-question]");
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("data-preview-question", q.id);
      const answer = q.options!.find((o) => o.id === rule.correctOptionIds[0])!;
      await card.getByRole("radio", { name: answer.text.text, exact: true }).check();
      const returned = page.waitForResponse((r) =>
        r.url().endsWith("/api/dev-chapter-preview/answer"),
      );
      await card.getByRole("button", { name: "Check answer" }).click();
      const feedback = await returned;
      expect(feedback.status()).toBe(200);
      expect(await feedback.json()).toMatchObject({
        simulated: true,
        saved: false,
        isCorrect: true,
        explanation: rule.explanation,
      });
      await expect(card.getByText(rule.explanation.my, { exact: true })).toBeVisible();
      if (index < qs.length - 1) await page.getByRole("button", { name: "Next question" }).click();
    }
    await step(page, "Review");
    await expect(page.locator("[data-preview-reviewed]")).toHaveCount(qs.length);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await step(page, "Learn");
    await step(page, "Practice");
    await expect(page.locator("[data-preview-question]")).toHaveAttribute(
      "data-preview-question",
      qs.at(-1)!.exerciseId,
    );
    await page.reload();
    await step(page, "Review");
    await expect(page.getByText("No answers checked yet")).toBeVisible();
  });
}
test("awaiting-audio questions cannot be graded and no fake playback is shown", async ({
  page,
}) => {
  await page.goto(`${path}/meet-the-new-colleague`);
  await expect(page.locator("audio")).toHaveCount(0);
  await step(page, "Practice");
  await expect(page.getByRole("button", { name: "Check answer" })).toHaveCount(0);
  await expect(page.getByText("1. What is the new colleague's name?")).toBeVisible();
  await expect(page.getByText("8. What is Ken's job?")).toBeVisible();
  const result = await page.evaluate(async () =>
    fetch("/api/dev-chapter-preview/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentVersion: "1.4.0",
        lessonId: "a1-c1-meet-colleagues",
        publicDigest: "0".repeat(64),
        exercise: { kind: "exercise", id: "a1-c1-pack-l01", revision: 1 },
        optionId: "a1-c1-pack-l01-a",
      }),
    }).then((r) => r.status),
  );
  expect(result).toBe(409);
});
test("writing keeps separate unsaved drafts across steps; speaking has self-review without recording", async ({
  page,
}) => {
  const submissions: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") submissions.push(r.url());
  });
  await page.goto(`${path}/my-first-professional-introduction`);
  await step(page, "Practice");
  for (const d of await page.locator("#chapter-practice > details").all())
    await d.locator("summary").first().click();
  const editors = page.getByRole("textbox", { name: "Your own sentences" });
  await expect(editors).toHaveCount(3);
  await editors.nth(1).fill("Hello. My name is Aye. I live in Tokyo.");
  await editors.nth(2).fill("Hello. My name is Aye. I am from Myanmar.");
  await step(page, "Review");
  await step(page, "Practice");
  await expect(editors.nth(1)).toHaveValue("Hello. My name is Aye. I live in Tokyo.");
  await expect(editors.nth(2)).toHaveValue("Hello. My name is Aye. I am from Myanmar.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await step(page, "Practice");
  for (const d of await page.locator("#chapter-practice > details").all())
    await d.locator("summary").first().click();
  await expect(editors.nth(1)).toHaveValue("");
  await page.goto(`${path}/introduce-yourself-at-work`);
  await step(page, "Practice");
  const first = page.locator("#chapter-practice > details").first();
  await first.locator("summary").first().click();
  await first.locator("details > summary").click();
  const check = first.getByRole("checkbox").first();
  await check.check();
  await step(page, "Learn");
  await step(page, "Practice");
  await expect(check).toBeChecked();
  await expect(page.getByRole("button", { name: /record/i })).toHaveCount(0);
  expect(submissions).toEqual([]);
});
