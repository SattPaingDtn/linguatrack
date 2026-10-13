import { expect, test } from "@playwright/test";
test("D3 history/export remain disabled and cannot enable learner submissions", async ({
  request,
}) => {
  for (const path of ["/api/learning/history/v2", "/api/learning/export/v2"]) {
    const result = await request.get(path);
    expect(result.status()).toBe(404);
    expect(result.headers()["cache-control"]).toContain("no-store");
    expect(await result.text()).not.toMatch(/correctOptionIds|grading_bindings|"saved":true/);
    expect(
      (await request.post(path, { data: { score: 100, userId: "another-user" } })).status(),
    ).toBe(405);
  }
  expect((await request.post("/api/learning/v2/answer", { data: { score: 100 } })).status()).toBe(
    404,
  );
});
