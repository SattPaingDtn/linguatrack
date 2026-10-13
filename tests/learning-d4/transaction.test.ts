// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const driver = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class {
    on() {}
    connect = driver.connect;
  },
}));
vi.mock("@/lib/learning/v2/mcq-writer", () => ({ saveMcqInTransaction: vi.fn() }));
import { saveMcqInTransaction } from "@/lib/learning/v2/mcq-writer";
import { commitStagingAnswer } from "@/lib/learning/v2/staging-database";
import { input, projectRef, stageEnv } from "./fixtures";
const save = vi.mocked(saveMcqInTransaction);
beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(stageEnv)) vi.stubEnv(k, v);
  vi.stubEnv(
    "LINGUATRACK_STAGING_WRITER_DATABASE_URL",
    `postgresql://linguatrack_staging_app:test@db.${projectRef}.supabase.co:5432/postgres`,
  );
  driver.query.mockResolvedValue({ rows: [] });
  driver.connect.mockResolvedValue({ query: driver.query, release: driver.release });
});
afterEach(() => vi.unstubAllEnvs());
it("awaits actual COMMIT before returning the save receipt", async () => {
  const s = input("a".repeat(64));
  const receipt = { saved: true } as Awaited<ReturnType<typeof saveMcqInTransaction>>;
  save.mockResolvedValue(receipt);
  let finish = () => {};
  driver.query.mockImplementation(async (sql: string) => {
    if (sql === "commit")
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return { rows: [] };
  });
  let returned = false;
  const result = commitStagingAnswer(crypto.randomUUID(), s);
  void result.then(() => {
    returned = true;
  });
  await vi.waitFor(() => expect(driver.query).toHaveBeenCalledWith("commit"));
  expect(returned).toBe(false);
  expect(driver.release).not.toHaveBeenCalled();
  finish();
  expect(await result).toBe(receipt);
  expect(driver.release).toHaveBeenCalledOnce();
});
it("rolls back and releases on commit failure, never returning saved success", async () => {
  save.mockResolvedValue({ saved: true } as Awaited<ReturnType<typeof saveMcqInTransaction>>);
  driver.query.mockImplementation(async (sql: string) => {
    if (sql === "commit") throw new Error("injected COMMIT failure");
    return { rows: [] };
  });
  await expect(commitStagingAnswer(crypto.randomUUID(), input("a".repeat(64)))).rejects.toThrow(
    /COMMIT failure/,
  );
  expect(driver.query).toHaveBeenCalledWith("rollback");
  expect(driver.release).toHaveBeenCalledOnce();
});
