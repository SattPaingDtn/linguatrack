import { expect, test } from "@playwright/test";
test("production dashboard and navigation do not link inactive study previews", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Study A1 lessons", exact: true })).toHaveCount(0);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "A1 study previews", exact: true })).toHaveCount(0);
});
