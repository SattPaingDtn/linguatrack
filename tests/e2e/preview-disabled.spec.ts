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

test("production refuses the entire chapter preview and stateless chapter grader", async ({
  request,
}) => {
  for (const url of [
    "/dev/chapters/a1-chapter-1",
    "/dev/chapters/a1-chapter-1/introductions",
    "/dev/chapters/a1-chapter-1/our-new-team-members",
  ]) {
    const response = await request.get(url);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toMatch(/a1-c1-pack-r01|correctOptionIds/);
  }
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const result = await request.fetch("/api/dev-chapter-preview/answer", { method });
    expect(result.status()).toBe(404);
    expect(result.headers()["cache-control"]).toBe("no-store");
  }
});

test("production refuses A1 picker, new chapter/lesson pages and all expansion grading methods", async ({
  request,
}) => {
  for (const path of [
    "/dev/a1",
    "/dev/a1/people-family-possessions",
    "/dev/a1/daily-routines-time/chapter-review",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toMatch(/a1-c2-k1|correctOptionIds|a1-c3-k10/);
  }
  for (const method of ["GET", "POST", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
    const response = await request.fetch("/api/dev-a1-preview/answer", { method });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});

test("production refuses manuscript chapter pages and all server-only grading/self-review methods", async ({
  request,
}) => {
  for (const path of [
    "/dev/a1/home-neighborhood",
    "/dev/a1/home-neighborhood/review",
    "/dev/a1/food-drinks-shopping/a-shopping-list",
    "/dev/a1/work-study/can-and-requests",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toMatch(/a1-c4-k1|acceptedByBlank|correctOptionIds/);
  }
  for (const method of ["GET", "POST", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
    const response = await request.fetch("/api/dev-manuscript-preview/answer", { method });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});
