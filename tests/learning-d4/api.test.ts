// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/learning/v2/staging-database", () => ({ commitStagingAnswer: vi.fn() }));
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { commitStagingAnswer } from "@/lib/learning/v2/staging-database";
import { POST } from "@/app/api/learning/v2/answer/route";
import { requireStagingTarget, stagingWriterConfig } from "@/lib/learning/v2/staging-environment";
import { stageEnv, input, projectRef, protectedRef } from "./fixtures";
import type { McqReceipt } from "@/lib/learning/v2/mcq-contracts";
const owner = "00000000-0000-4000-8000-000000000001";
const clientMock = vi.mocked(createSupabaseServerClient),
  saveMock = vi.mocked(commitStagingAnswer);
afterEach(() => {
  vi.unstubAllEnvs();
});
function enable() {
  for (const [k, v] of Object.entries(stageEnv)) vi.stubEnv(k, v);
  clientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
  } as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);
}
function request(raw: unknown, expectedOwner = owner, origin = "http://localhost:3200") {
  return new Request("http://localhost:3200/api/learning/v2/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "X-Learner-ID": expectedOwner },
    body: JSON.stringify(raw),
  });
}
it("is unavailable by default/in production before auth or SQL access", async () => {
  vi.stubEnv("LINGUATRACK_RUNTIME_ENV", "production");
  vi.stubEnv("LINGUATRACK_V2_MCQ_ENABLED", "true");
  clientMock.mockClear();
  saveMock.mockClear();
  expect((await POST(request(input("a".repeat(64))))).status).toBe(404);
  expect(clientMock).not.toHaveBeenCalled();
  expect(saveMock).not.toHaveBeenCalled();
});
it("rejects spoofed score/owner, invalid origin, no auth and mismatched account cookies", async () => {
  enable();
  const s = input("a".repeat(64));
  expect((await POST(request({ ...s, score: 100 }))).status).toBe(400);
  expect((await POST(request({ ...s, ownerId: owner }))).status).toBe(400);
  expect((await POST(request(s, owner, "https://other.example"))).status).toBe(403);
  clientMock.mockResolvedValue(null);
  expect((await POST(request(s))).status).toBe(401);
  enable();
  expect((await POST(request(s, crypto.randomUUID()))).status).toBe(409);
  expect(saveMock).not.toHaveBeenCalled();
});
it("does not produce saved success before the writer commits or on SQL errors", async () => {
  enable();
  let release: (v: McqReceipt) => void = () => {};
  saveMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const submission = input("a".repeat(64));
  const response = POST(request(submission));
  let finished = false;
  void response.then(() => {
    finished = true;
  });
  await vi.waitFor(() => expect(saveMock).toHaveBeenCalled());
  expect(finished).toBe(false);
  release({
    mode: "persistent",
    saved: true,
    ownerId: owner,
    projectRef,
    requestHash: "b".repeat(64),
    submission,
    responseId: submission.responseId,
    gradeId: crypto.randomUUID(),
    resultId: null,
    feedback: {
      points: 1,
      maxPoints: 1,
      isCorrect: true,
      explanation: { en: "Correct.", my: "မှန်ပါတယ်။" },
      correctAnswer: "I",
    },
    receivedAt: new Date().toISOString(),
  });
  const success = await response;
  expect(success.status).toBe(200);
  expect((await success.json()).saved).toBe(true);
  expect(success.headers.get("Cache-Control")).toContain("no-store");
  saveMock.mockRejectedValue({ code: "40001", message: "SECRET_DB_DETAIL" });
  const result = await POST(request(input("a".repeat(64))));
  expect(result.status).toBe(409);
  expect(await result.text()).not.toMatch(/SECRET_DB_DETAIL|"saved":true/);
});
it("rejects same-project/admin/insecure writer configs without connecting", () => {
  expect(() =>
    requireStagingTarget({ ...stageEnv, LINGUATRACK_PROTECTED_PROJECT_REF: projectRef }),
  ).toThrow(/distinct/);
  const good = `postgresql://linguatrack_staging_app:test@db.${projectRef}.supabase.co:5432/postgres`;
  expect(
    stagingWriterConfig({ ...stageEnv, LINGUATRACK_STAGING_WRITER_DATABASE_URL: good }).ssl
      .rejectUnauthorized,
  ).toBe(true);
  for (const url of [
    good.replace("linguatrack_staging_app", "postgres"),
    good.replace(projectRef, protectedRef),
    good + "?sslmode=no-verify",
    good.replace(":5432", ":6543"),
  ])
    expect(() =>
      stagingWriterConfig({ ...stageEnv, LINGUATRACK_STAGING_WRITER_DATABASE_URL: url }),
    ).toThrow();
});
