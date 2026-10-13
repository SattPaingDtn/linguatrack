// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GET as historyGET } from "@/app/api/learning/history/v2/route";
import { GET as exportGET } from "@/app/api/learning/export/v2/route";
import { combinedHistorySchema } from "@/lib/learning/v2/contracts";
const userId = "00000000-0000-4000-8000-000000000001";
function exportData() {
  const time = "2026-10-13T00:00:00.000Z";
  return {
    exportVersion: 2,
    complete: true,
    exportedAt: time,
    userId,
    generation: 0,
    legacy: {
      exportVersion: 1,
      exportedAt: time,
      userId,
      profile: {
        id: userId,
        last_lesson_id: null,
        last_block_id: null,
        content_version: null,
        updated_at: null,
        created_at: time,
        learning_generation: 0,
      },
      lessonProgress: [],
      attempts: [],
      mistakeReviews: [],
      studySessions: [],
    },
    v2: {
      attempts: [],
      responses: [],
      grades: [],
      attempt_results: [],
      completion_events: [],
      mistakes: [],
      review_events: [],
      resume: [],
      study_sessions: [],
    },
    resume: null,
  };
}
const clientMock = vi.mocked(createSupabaseServerClient);
function mockClient(data: unknown, error: unknown = null, owner = userId) {
  const rpc = vi.fn(async () => ({ data, error }));
  clientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc,
  } as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);
  return rpc;
}
afterEach(() => {
  vi.unstubAllEnvs();
});
it("both D3 routes fail closed by default before accessing credentials or a database", async () => {
  vi.stubEnv("LINGUATRACK_V2_HISTORY_ENABLED", "");
  clientMock.mockClear();
  expect((await historyGET()).status).toBe(404);
  expect((await exportGET()).status).toBe(404);
  expect(clientMock).not.toHaveBeenCalled();
});
it("requires verified auth and never downgrades failed persistence to preview/saved success", async () => {
  vi.stubEnv("LINGUATRACK_V2_HISTORY_ENABLED", "true");
  clientMock.mockResolvedValue(null);
  expect((await historyGET()).status).toBe(401);
  mockClient(null, { message: "secret registry payload SHOULD_NOT_LEAK" });
  const response = await historyGET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(/SHOULD_NOT_LEAK|"saved":true/);
});
it("returns only validated owner-scoped committed history and a distinct export format", async () => {
  vi.stubEnv("LINGUATRACK_V2_HISTORY_ENABLED", "true");
  const rpc = mockClient(exportData());
  const read = await historyGET();
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual(exportData());
  expect(rpc).toHaveBeenCalledWith("learning_history_v2", {});
  const downloaded = await exportGET();
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers.get("Cache-Control")).toContain("no-store");
  expect(downloaded.headers.get("Vary")).toBe("Cookie");
  expect(downloaded.headers.get("Content-Disposition")).toContain("export-v2.json");
  expect(combinedHistorySchema.parse(await downloaded.json()).legacy.exportVersion).toBe(1);
});
it("rejects cross-owner, partial exports, malformed snapshots and private key leakage", async () => {
  vi.stubEnv("LINGUATRACK_V2_HISTORY_ENABLED", "true");
  for (const raw of [
    { ...exportData(), userId: "00000000-0000-4000-8000-000000000002" },
    { ...exportData(), complete: false },
    { ...exportData(), correctOptionIds: ["a"] },
    {
      ...exportData(),
      v2: { ...exportData().v2, grades: [{ feedback: { correctOptionIds: ["a"] } }] },
    },
  ]) {
    mockClient(raw);
    const result = await exportGET();
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("correctOptionIds");
  }
  mockClient(exportData(), null, "00000000-0000-4000-8000-000000000002");
  expect((await historyGET()).status).toBe(503);
});
