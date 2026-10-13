import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const step = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Lesson steps" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
test("study flow goes picker → chapter → Learn → Practice → Review → next lesson without saving", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(learning|auth)|supabase\.co/.test(r.url())) writes.push(r.url());
  });
  await page.addInitScript(() => localStorage.setItem("linguatrack:pending:v1:study", "unchanged"));
  await page.goto("/dev/a1");
  await page.getByRole("link", { name: /Start learning/ }).click();
  await expect(page).toHaveURL(/\/dev\/chapters\/a1-chapter-1$/);
  await expect(page.getByText(/Available to study/)).toHaveCount(8);
  await expect(page.getByText(/Audio pending · read the scripts/)).toHaveCount(1);
  await page.getByRole("link", { name: /^1\./ }).click();
  await expect(page).toHaveURL(/\/introductions$/);
  const nav = page.getByRole("navigation", { name: "Lesson navigation" });
  await expect(nav.getByRole("link", { name: /Previous Lesson/ })).toHaveCount(0);
  await step(page, "Practice");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator("[data-preview-question]").getByRole("status")).toBeVisible();
  await step(page, "Review");
  await expect(page.locator("[data-preview-reviewed]")).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const next = nav.getByRole("link", { name: /Next Lesson/ });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/am-is-are$/);
  await expect(page.getByRole("region", { name: "Learn", exact: true })).toBeVisible();
  await step(page, "Review");
  await expect(page.getByText("No answers checked yet")).toBeVisible();
  await nav.getByRole("link", { name: /Previous Lesson/ }).click();
  await expect(page).toHaveURL(/\/introductions$/);
  await step(page, "Practice");
  await expect(page.locator("input[type=radio]:checked")).toHaveCount(0);
  await step(page, "Review");
  await expect(page.getByText("No answers checked yet")).toBeVisible();
  await page.getByRole("link", { name: "← Back to Chapter", exact: true }).click();
  await page.getByRole("link", { name: /Back to Chapter Picker/ }).click();
  await expect(page).toHaveURL(/\/dev\/a1$/);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("linguatrack:pending:v1:study"))).toBe(
    "unchanged",
  );
});
test("Chapters 2 and 3 have complete public navigation, audio labels and accessible chapter boundaries", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const slug of ["people-family-possessions", "daily-routines-time"]) {
    await page.goto(`/dev/a1/${slug}`);
    await expect(page.getByText(/Available to study/)).toHaveCount(7);
    await expect(page.getByText(/Audio pending · read the scripts/)).toHaveCount(1);
    const lessonLinks = await page
      .locator("main ol > li h2 a")
      .evaluateAll((links) => links.map((l) => l.getAttribute("href")!));
    for (const [i, href] of lessonLinks.entries()) {
      const response = await page.goto(href);
      expect(response!.status()).toBe(200);
      expect(await response!.text()).not.toMatch(
        /correctOptionIds|gradingRevision|assessmentPolicies/,
      );
      const nav = page.getByRole("navigation", { name: "Lesson navigation" });
      await expect(nav).toContainText(`Lesson ${i + 1} of 7`);
      if (i > 0)
        await expect(nav.getByRole("link", { name: /Previous Lesson/ })).toHaveAttribute(
          "href",
          lessonLinks[i - 1]!,
        );
      if (i < lessonLinks.length - 1)
        await expect(nav.getByRole("link", { name: /Next Lesson/ })).toHaveAttribute(
          "href",
          lessonLinks[i + 1]!,
        );
      else {
        await step(page, "Review");
        await expect(nav.getByRole("link", { name: /Next Lesson/ })).toHaveCount(0);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await nav.getByRole("link", { name: /^Back to Chapter/ }).click();
        await expect(page).toHaveURL(new RegExp(`/dev/a1/${slug}$`));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.getByRole("link", { name: /Back to Chapter Picker/ }).click();
    await expect(page).toHaveURL(/\/dev\/a1$/);
  }
});
