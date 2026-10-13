// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareSealedImport, type PreparedImport } from "../../src/lib/curriculum/staging/prepare";
import {
  registrySnapshot,
  dryRun,
  registerCandidate,
  stageRelease,
} from "../../src/lib/curriculum/staging/database";
import {
  migrate,
  asPrincipal,
  reviews,
  sealedFixture,
  migrationPath,
  provisionRegistryPrincipals,
} from "./fixtures";

let root: string;
let prepared: PreparedImport;
beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "registry-integration-"));
  await sealedFixture(resolve(root, "package"));
  prepared = await prepareSealedImport(resolve(root, "package"), []);
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
async function database() {
  const db = new PGlite();
  await migrate(db);
  await asPrincipal(db, "registry_local_importer");
  return db;
}

describe("isolated inactive registry migration and import", () => {
  it("dry-runs without writes and stages atomically/idempotently after hash-bound independent reviews", async () => {
    const db = await database();
    try {
      expect(await registrySnapshot(db)).toEqual({
        releases: [],
        entities: [],
        grading: [],
        policies: [],
      });
      expect(await dryRun(db, prepared)).toMatchObject({
        writes: false,
        canStage: false,
        active: false,
      });
      await registerCandidate(db, prepared);
      await expect(stageRelease(db, prepared)).rejects.toThrow(
        "Authenticated candidate reviews required",
      );
      await reviews(db, prepared.summary.packageHash, ["translation"]);
      expect((await dryRun(db, prepared)).canStage).toBe(false); // One approval cannot cover all scopes.
      await reviews(db, prepared.summary.packageHash);
      const result = await stageRelease(db, prepared);
      expect(result).toEqual({
        packageHash: prepared.summary.packageHash,
        state: "inactive",
        activated: false,
      });
      const before = await registrySnapshot(db);
      const validatedAgain = await prepareSealedImport(resolve(root, "package"), [], before);
      expect(await stageRelease(db, validatedAgain)).toEqual(result);
      expect(await registrySnapshot(db)).toEqual(before);
      await asPrincipal(db, "postgres");
      expect((await db.query("select * from curriculum_private.channels")).rows).toEqual([
        { channel: "default", enabled: false, active_package_hash: null, epoch: 0 },
      ]);
      expect(
        (await db.query("select count(*) from curriculum_private.import_events")).rows[0],
      ).toEqual({ count: 1 });
      const archived = await db.query<{ contents: Uint8Array }>(
        "select contents from curriculum_private.artifact_files where path='media/a1-introductions.wav'",
      );
      expect(Buffer.from(archived.rows[0]!.contents)).toEqual(
        await readFile(resolve(root, "package/media/a1-introductions.wav")),
      );
    } finally {
      await db.close();
    }
  }, 30000);
  it("rejects forged author flags, reviewer spoofing, wrong scopes and reused review receipts", async () => {
    const db = await database();
    try {
      await registerCandidate(db, prepared); // Fixture deliberately claims an author approval.
      await expect(
        db.query("select curriculum_private.record_review($1,'translation','approve',$2)", [
          prepared.summary.packageHash,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow(/permission denied/);
      await asPrincipal(db, "registry_test_reviewer");
      await db.query("select set_config('request.jwt.claim.sub','forged-reviewer',false)");
      await expect(
        db.query("select curriculum_private.record_review($1,'translation','approve',$2)", [
          prepared.summary.packageHash,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow(/Assigned independent/);
      await reviews(db, prepared.summary.packageHash, ["translation"]);
      await asPrincipal(db, "registry_test_reviewer");
      const id = crypto.randomUUID();
      const params = [prepared.summary.packageHash, "translation", "approve", id];
      const first = await db.query("select curriculum_private.record_review($1,$2,$3,$4)", params);
      expect(
        await db.query("select curriculum_private.record_review($1,$2,$3,$4)", params),
      ).toEqual(first);
      await expect(
        db.query("select curriculum_private.record_review($1,$2,'reject',$3)", [
          prepared.summary.packageHash,
          "translation",
          id,
        ]),
      ).rejects.toThrow("Review request conflict");
      await expect(
        db.query("select curriculum_private.record_review($1,'grading','approve',$2)", [
          prepared.summary.packageHash,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow(/Assigned independent/);
      await expect(
        db.query("select curriculum_private.record_review($1,'translation','approve',$2)", [
          "a".repeat(64),
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow(/foreign key/);
      await asPrincipal(db, "registry_local_importer");
      expect((await dryRun(db, prepared)).canStage).toBe(false);
    } finally {
      await db.close();
    }
  }, 30000);
  it("honors review rejection and revoked scope, and never transfers approval to a different hash", async () => {
    const db = await database();
    try {
      await registerCandidate(db, prepared);
      await reviews(db, prepared.summary.packageHash);
      await asPrincipal(db, "registry_test_reviewer");
      await db.query("select curriculum_private.record_review($1,'grading','reject',$2)", [
        prepared.summary.packageHash,
        crypto.randomUUID(),
      ]);
      await asPrincipal(db, "registry_local_importer");
      expect((await dryRun(db, prepared)).canStage).toBe(false);
      await expect(stageRelease(db, prepared)).rejects.toThrow(/Authenticated/);
      await reviews(db, prepared.summary.packageHash);
      await asPrincipal(db, "postgres");
      await db.exec("delete from curriculum_private.reviewer_scopes where scope='grading'");
      await asPrincipal(db, "registry_local_importer");
      expect((await dryRun(db, prepared)).canStage).toBe(false);
      const altered = structuredClone(prepared);
      altered.summary.packageHash = "b".repeat(64);
      expect((await dryRun(db, altered)).canStage).toBe(false);
    } finally {
      await db.close();
    }
  }, 30000);
  it("denies browser roles all private keys, writes, review RPCs, and activation attempts", async () => {
    const db = await database();
    try {
      await registerCandidate(db, prepared);
      await reviews(db, prepared.summary.packageHash);
      await stageRelease(db, prepared);
      for (const principal of ["anon", "authenticated"] as const) {
        await asPrincipal(db, principal);
        for (const sql of [
          "select * from curriculum_private.grading_bindings",
          "select * from curriculum_private.artifact_files",
          "select curriculum_private.registry_snapshot()",
          "select curriculum_private.approval_status('a')",
          "update curriculum_private.channels set enabled=true",
          "insert into curriculum_private.reviewer_scopes values('authenticated','grading')",
        ])
          await expect(db.query(sql)).rejects.toThrow(/permission denied/);
      }
      await asPrincipal(db, "registry_local_importer");
      await expect(db.exec("select * from curriculum_private.grading_bindings")).rejects.toThrow(
        /permission denied/,
      );
      await asPrincipal(db, "postgres");
      await expect(db.exec("update curriculum_private.channels set enabled=true")).rejects.toThrow(
        /immutable/,
      );
      await expect(
        db.exec("insert into curriculum_private.channels values('unsafe',true,null,0)"),
      ).rejects.toThrow(/check constraint/);
      const rls = await db.query<{ count: number }>(
        "select count(*) from pg_tables where schemaname='curriculum_private' and rowsecurity",
      );
      expect(rls.rows[0]!.count).toBe(17);
    } finally {
      await db.close();
    }
  }, 30000);
  it("prevents updates, deletes, truncation and same-version/hash payload conflicts", async () => {
    const db = await database();
    try {
      await registerCandidate(db, prepared);
      await reviews(db, prepared.summary.packageHash);
      await stageRelease(db, prepared);
      const altered = structuredClone(prepared);
      altered.summary.packageHash = "c".repeat(64);
      await expect(registerCandidate(db, altered)).rejects.toThrow(
        /Candidate version\/hash conflict/,
      );
      const changed = structuredClone(prepared);
      changed.plan.artifacts[0]!.grading[0]!.payload = { secret: "changed" };
      await expect(stageRelease(db, changed)).rejects.toThrow(
        /Release version\/hash or payload conflict/,
      );
      await asPrincipal(db, "postgres");
      for (const sql of [
        "update curriculum_private.entities set payload='{}'",
        "delete from curriculum_private.grading_bindings",
        "truncate curriculum_private.artifacts cascade",
        "update curriculum_private.review_events set decision='approve'",
      ])
        await expect(db.exec(sql)).rejects.toThrow(/immutable/);
      expect((await db.query("select count(*) from curriculum_private.releases")).rows[0]).toEqual({
        count: 1,
      });
    } finally {
      await db.close();
    }
  }, 30000);
  it("rolls back mid-import FK/media errors without leaving partial registry records", async () => {
    const db = await database();
    try {
      await registerCandidate(db, prepared);
      await reviews(db, prepared.summary.packageHash);
      const invalid = structuredClone(prepared);
      invalid.plan.artifacts[0]!.entities[0]!.refs.push({
        kind: "lesson",
        id: "missing-entity",
        revision: 1,
      });
      await expect(stageRelease(db, invalid)).rejects.toThrow(/foreign key/);
      expect((await registrySnapshot(db)).releases).toEqual([]);
      const broken = structuredClone(prepared);
      broken.plan.artifacts[0]!.files[0]!.base64 = Buffer.from("altered").toString("base64");
      await expect(stageRelease(db, broken)).rejects.toThrow(/check constraint/);
      expect((await registrySnapshot(db)).entities).toEqual([]);
      await stageRelease(db, prepared);
      expect((await registrySnapshot(db)).releases).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 30000);
  it("leaves old v1 learning records, scores, isolation and reset behavior intact after the forward migration", async () => {
    const db = new PGlite();
    try {
      await migrate(db, true, false);
      const owner = crypto.randomUUID(),
        other = crypto.randomUUID();
      await db.query("insert into auth.users values($1),($2)", [owner, other]);
      await asPrincipal(db, "authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
      await db.query("select public.complete_lesson('1.0.0','a1-c1-introductions')");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      const attempt = crypto.randomUUID();
      const saved = await db.query(
        "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-1') as value",
        [attempt],
      );
      await asPrincipal(db, "postgres");
      expect((await db.query("select count(*) from public.exercise_responses")).rows[0]).toEqual({
        count: 1,
      });
      await db.exec(await readFile(resolve(migrationPath), "utf8"));
      await provisionRegistryPrincipals(db);
      await asPrincipal(db, "registry_local_importer");
      await registerCandidate(db, prepared);
      await reviews(db, prepared.summary.packageHash);
      await stageRelease(db, prepared);
      await asPrincipal(db, "authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      expect(
        await db.query(
          "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-1') as value",
          [attempt],
        ),
      ).toEqual(saved);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
      expect((await db.query("select * from public.quiz_attempts")).rows).toEqual([]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      await db.query("select public.reset_learning($1,'1.0.0',0)", [crypto.randomUUID()]);
      expect((await db.query("select * from public.quiz_attempts")).rows).toEqual([]);
      await expect(
        db.query(
          "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-1',0)",
          [attempt],
        ),
      ).rejects.toThrow(/reset/);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
      expect((await db.query("select lesson_id from public.lesson_progress")).rows).toEqual([
        { lesson_id: "a1-c1-introductions" },
      ]);
      await asPrincipal(db, "registry_local_importer");
      expect((await registrySnapshot(db)).releases).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 30000);
  it("contains no learning table alteration or exposed activation function in the additive migration", async () => {
    const sql = await readFile(resolve(migrationPath), "utf8");
    expect(sql).not.toMatch(
      /(?:alter|drop|delete from|update)\s+(?:table\s+)?(?:public|private|auth)\./i,
    );
    expect(sql).not.toMatch(/create function public\./i);
  });
  it("rejects a changed grading binding under the same exercise revision across release versions", async () => {
    const db = await database();
    try {
      await registerCandidate(db, prepared);
      await reviews(db, prepared.summary.packageHash);
      await stageRelease(db, prepared);
      const directory = resolve(root, "changed-binding");
      await sealedFixture(directory, "9.2.0");
      const gradingPath = resolve(directory, "private/grading.json");
      const grading = JSON.parse(await readFile(gradingPath, "utf8"));
      grading.exerciseRules[0].correctOptionIds = ["b"];
      const { canonicalJson, sha256 } = await import("../../src/lib/curriculum/v2/json");
      const { writeFile } = await import("node:fs/promises");
      const bytes = canonicalJson(grading);
      await writeFile(gradingPath, bytes);
      const manifestPath = resolve(directory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const file = manifest.files.find((f: { path: string }) => f.path === "private/grading.json");
      file.sha256 = sha256(bytes);
      file.byteLength = Buffer.byteLength(bytes);
      await writeFile(manifestPath, canonicalJson(manifest));
      await expect(prepareSealedImport(directory, [], await registrySnapshot(db))).rejects.toThrow(
        /grading-conflict/,
      );
      const unsafe = await prepareSealedImport(directory, []);
      await registerCandidate(db, unsafe);
      await reviews(db, unsafe.summary.packageHash);
      await expect(stageRelease(db, unsafe)).rejects.toThrow(/Immutable grading binding conflict/);
      expect((await registrySnapshot(db)).releases).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 30000);
  it("keeps privileged functions on an empty search path and tooling out of the application module graph", async () => {
    const db = await database();
    try {
      await asPrincipal(db, "postgres");
      const functions = await db.query<{ proconfig: string[]; prosecdef: boolean }>(
        "select proconfig,prosecdef from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='curriculum_private' and proname in ('register_candidate','record_review','stage_release','registry_snapshot','approval_status')",
      );
      expect(functions.rows).toHaveLength(5);
      for (const fn of functions.rows) {
        expect(fn.prosecdef).toBe(true);
        expect(fn.proconfig).toContain('search_path=""');
      }
      for (const file of [
        "src/lib/curriculum/staging/prepare.ts",
        "src/lib/curriculum/staging/database.ts",
      ])
        expect(await readFile(resolve(file), "utf8")).toMatch(/^import "server-only";/);
      for (const file of [
        "src/lib/curriculum/index.ts",
        "src/lib/curriculum/catalog/server.ts",
        "src/lib/curriculum/preview/server.ts",
      ])
        expect(await readFile(resolve(file), "utf8")).not.toMatch(/from .*staging\//);
      expect(await readFile(resolve("supabase/config.toml"), "utf8")).not.toContain(
        '"curriculum_private"',
      );
    } finally {
      await db.close();
    }
  }, 30000);
});
