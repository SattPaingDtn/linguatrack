import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import authored from "../../content-authoring/a1-chapters-02-03/public.json";
import privateKeys from "../../content-authoring/a1-chapters-02-03/grading.json";
import metadata from "../../content-authoring/a1-chapters-02-03/metadata.json";
import { A1_PREVIEW_PATH as path } from "../../src/lib/curriculum/a1-preview/config";
const step = (page: Page, label: string) =>
  page
    .getByRole("navigation", { name: "Lesson steps" })
    .getByRole("button", { name: new RegExp(label) })
    .click();
test("A1 picker contains only authored chapters and all 14 lessons render accessibly without writes or private keys", async ({
  page,
}) => {
  test.setTimeout(120000);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(learning|auth)|supabase\.co/.test(r.url())) requests.push(r.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem("linguatrack:pending:v1:a1-regression", "untouched-queue"),
  );
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A1 learning previews");
  await expect(page.locator("main ol > li")).toHaveCount(6);
  await expect(
    page.getByRole("link", { name: "Your first conversations", exact: true }),
  ).toHaveAttribute("href", "/dev/chapters/a1-chapter-1");
  await expect(
    page.getByText(
      "Chapters 7–12 remain editorial outlines only. They are not finished or unlocked learning chapters.",
    ),
  ).toBeVisible();
  const storage = await page.evaluate(() => ({ ...localStorage }));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const chapter of metadata.chapters) {
    await page.goto(`${path}/${chapter.slug}`);
    await expect(page.locator("main ol > li")).toHaveCount(7);
    for (const id of chapter.lessonIds) {
      const lesson = authored.lessons.find((l) => l.id === id)!;
      const response = await page.goto(`${path}/${chapter.slug}/${lesson.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title.en);
      expect(await response!.text()).not.toMatch(
        /correctOptionIds|gradingRevision|graderVersion|assessmentPolicies|PRIVATE ONLY|TEACHER/,
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
  }
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storage);
  for (const src of await page
    .locator("script[src]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")!)))
    expect(await (await page.request.get(src)).text()).not.toMatch(
      /correctOptionIds|batch-authoring|PRIVATE ONLY/,
    );
  expect((await page.request.get(`${path}/hobbies-free-time`)).status()).toBe(404);
});
for (const n of [2, 3])
  for (const type of ["reading", "review"])
    test(`Chapter ${n} ${type}: all questions use private server feedback and memory-only review`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const chapter = metadata.chapters.find((c) => c.number === n)!;
      const lesson = authored.lessons.find(
        (l) =>
          chapter.lessonIds.includes(l.id) &&
          (type === "review" ? l.id.endsWith("-review") : l.tags.areas.includes("reading")),
      )!;
      await page.goto(`${path}/${chapter.slug}/${lesson.slug}`);
      await step(page, "Practice");
      const questions = metadata.chapters
        .find((c) => c.number === n)!
        .questions.filter((q) => q.lessonId === lesson.id);
      for (const [index, map] of questions.entries()) {
        const q = authored.exercises.find((e) => e.id === map.exerciseId)!;
        if (q.type !== "multiple_choice") throw new Error("MCQ required");
        const rule = privateKeys.exerciseRules.find((r) => r.exerciseRef.id === q.id)!;
        const choice = q.options!.find((o) => o.id === rule.correctOptionIds[0])!;
        const card = page.locator("[data-preview-question]");
        await expect(card).toHaveCount(1);
        await expect(card).toHaveAttribute("data-preview-question", q.id);
        await card.getByRole("radio", { name: choice.text.text, exact: true }).check();
        const response = page.waitForResponse((r) =>
          r.url().endsWith("/api/dev-a1-preview/answer"),
        );
        await card.getByRole("button", { name: "Check answer" }).click();
        const returned = await response;
        expect(returned.status()).toBe(200);
        expect(await returned.json()).toMatchObject({
          simulated: true,
          saved: false,
          isCorrect: true,
          explanation: rule.explanation,
        });
        await expect(card.getByText(rule.explanation.my, { exact: true })).toBeVisible();
        if (index < questions.length - 1)
          await page.getByRole("button", { name: "Next question" }).click();
      }
      await step(page, "Review");
      await expect(page.locator("[data-preview-reviewed]")).toHaveCount(questions.length);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await step(page, "Learn");
      await step(page, "Practice");
      await expect(page.locator("[data-preview-question]")).toHaveAttribute(
        "data-preview-question",
        questions.at(-1)!.exerciseId,
      );
      await page.reload();
      await step(page, "Review");
      await expect(page.getByText("No answers checked yet")).toBeVisible();
    });
test("both audio-pending lessons show their scripts and all planned questions without playback or grading", async ({
  page,
}) => {
  for (const chapter of metadata.chapters) {
    const lesson = authored.lessons.find(
      (l) => chapter.lessonIds.includes(l.id) && l.tags.areas.includes("listening"),
    )!;
    await page.goto(`${path}/${chapter.slug}/${lesson.slug}`);
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(
      page.getByText("Audio pending · script-reading preparation", { exact: true }).first(),
    ).toBeVisible();
    await step(page, "Practice");
    await expect(page.getByRole("button", { name: "Check answer" })).toHaveCount(0);
    for (const q of chapter.questions.filter((q) => q.audioStatus === "audio_pending")) {
      const question = authored.exercises.find((e) => e.id === q.exerciseId)!;
      if (question.type !== "multiple_choice") throw new Error("MCQ");
      await expect(
        page.getByRole("heading", {
          name: new RegExp(question.prompt!.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        }),
      ).toBeVisible();
    }
    const status = await page.evaluate(
      async ({ lessonId, id }) =>
        fetch("/api/dev-a1-preview/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contentVersion: "1.5.0",
            lessonId,
            publicDigest: "0".repeat(64),
            exercise: { kind: "exercise", id, revision: 1 },
            optionId: id + "-a",
          }),
        }).then((r) => r.status),
      {
        lessonId: lesson.id,
        id: chapter.questions.find((q) => q.audioStatus === "audio_pending")!.exerciseId,
      },
    );
    expect(status).toBe(409);
  }
});
test("new writing drafts and speaking checks remain unsaved across steps and clear on refresh", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  for (const chapter of metadata.chapters) {
    const lesson = authored.lessons.find(
      (l) => chapter.lessonIds.includes(l.id) && l.tags.areas.includes("writing"),
    )!;
    await page.goto(`${path}/${chapter.slug}/${lesson.slug}`);
    await step(page, "Practice");
    for (const d of await page.locator("#chapter-practice > details").all())
      await d.locator("summary").first().click();
    const editors = page.getByRole("textbox", { name: "Your own sentences" });
    await expect(editors).toHaveCount(3);
    await editors.nth(0).fill("My first draft.");
    await editors.nth(2).fill("My second draft.");
    await step(page, "Review");
    await step(page, "Practice");
    await expect(editors.nth(0)).toHaveValue("My first draft.");
    await expect(editors.nth(2)).toHaveValue("My second draft.");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.reload();
    await step(page, "Practice");
    for (const d of await page.locator("#chapter-practice > details").all())
      await d.locator("summary").first().click();
    await expect(editors.nth(0)).toHaveValue("");
  }
  await page.goto(`${path}/people-family-possessions/describe-people-and-possessions`);
  await step(page, "Practice");
  const task = page.locator("#chapter-practice > details").first();
  await task.locator("summary").first().click();
  await task.locator("details > summary").click();
  const check = task.getByRole("checkbox").first();
  await check.check();
  await step(page, "Review");
  await step(page, "Practice");
  await expect(check).toBeChecked();
  await expect(page.getByRole("button", { name: /record/i })).toHaveCount(0);
  expect(posts).toEqual([]);
});
