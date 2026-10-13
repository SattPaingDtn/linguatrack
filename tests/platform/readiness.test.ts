// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFile } from "node:fs/promises";
import { d4Fixture } from "../learning-d4/fixtures";
it("executes the inspection inventory read-only against an isolated database without changing history or registry", async () => {
  const f = await d4Fixture();
  try {
    await f.user(f.A);
    const before = await f.history();
    await f.admin();
    const sql = await readFile("scripts/platform/inspect-hosted.sql", "utf8");
    expect(sql).toMatch(/begin read only/);
    expect(sql).not.toMatch(/pg_get_functiondef|rolpassword|grading_bindings\s*;|select \*/);
    await f.db.exec(sql);
    await f.user(f.A);
    const after = await f.history();
    // Export-generation timestamps change on every read; saved record timestamps must not.
    expect({
      ...after,
      exportedAt: undefined,
      legacy: { ...after.legacy, exportedAt: undefined },
    }).toEqual({
      ...before,
      exportedAt: undefined,
      legacy: { ...before.legacy, exportedAt: undefined },
    });
  } finally {
    await f.close();
  }
}, 60000);
