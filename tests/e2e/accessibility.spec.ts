import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
test("core learning pages expose accessible controls and readable contrast", async ({
  page,
  isMobile,
}) => {
  for (const path of [
    "/",
    "/courses",
    "/account",
    "/progress",
    "/review",
    "/courses/a1/chapters/first-conversations/lessons/am-is-are",
    "/courses/a1/chapters/first-conversations/lessons/chapter-check",
  ]) {
    await page.goto(path);
    await expect(page.getByText("PHASE 02 · PREVIEW", { exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      `${path}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  }
});
