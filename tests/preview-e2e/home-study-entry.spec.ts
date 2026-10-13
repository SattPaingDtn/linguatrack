import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("home and desktop/mobile menus lead into A1 study without exposing private content", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Study A1 lessons", exact: true })).toHaveAttribute(
    "href",
    "/dev/a1",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Study A1 lessons", exact: true }).click();
  await expect(page).toHaveURL(/\/dev\/a1$/);
  await expect(page.getByRole("heading", { name: "A1 learning previews" })).toBeVisible();
  await page.getByRole("link", { name: /Start learning/ }).click();
  await page.getByRole("link", { name: /^1\./ }).click();
  await expect(page).toHaveURL(/\/introductions$/);
  await expect(page.getByRole("navigation", { name: "Lesson steps" })).toBeVisible();
  await page.goto("/");
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByRole("link", { name: "A1 study previews", exact: true }).click();
  await expect(page).toHaveURL(/\/dev\/a1$/);
  await expect(page.getByRole("heading", { name: "A1 learning previews" })).toBeVisible();
});
