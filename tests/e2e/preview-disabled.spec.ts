import { expect, test } from "@playwright/test";
const path = "/dev/lessons/subject-pronouns";
test("production refuses draft preview pages and every grading method", async ({
  page,
  request,
}) => {
  const response = await page.goto(path);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Let’s find your learning path." })).toBeVisible();
  expect(await response!.text()).not.toContain("a1-c1-pronouns-q01");
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const result = await request.fetch("/api/dev-preview/answer", { method });
    expect(result.status()).toBe(404);
    expect(result.headers()["cache-control"]).toBe("no-store");
  }
});
