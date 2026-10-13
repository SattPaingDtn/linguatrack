// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareSealedImport } from "../../src/lib/curriculum/staging/prepare";
import {
  registerCandidate,
  stageRelease,
  registrySnapshot,
} from "../../src/lib/curriculum/staging/database";
import { canonicalJson, sha256 } from "../../src/lib/curriculum/v2/json";
import { fixtureCatalog } from "../catalog/fixtures";
import { DRAFT_CHAIN_PINS } from "../../src/lib/curriculum/catalog/contracts";
import { migrate, asPrincipal, reviews, sealedFixture } from "./fixtures";
let root: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(resolve(tmpdir(), "registry-tools-")));
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
function cli(...args: string[]) {
  return execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve("scripts/curriculum/registry.ts"),
      ...args,
    ],
    { encoding: "utf8", timeout: 30000, stdio: "pipe" },
  );
}
function failure(...args: string[]) {
  try {
    cli(...args);
    expect.fail("Expected command failure");
  } catch (error) {
    const result = error as { status: number; stderr: string };
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("PRIVATE_FIXTURE_FEEDBACK");
    expect(result.stderr).not.toContain("correctOptionIds");
    return JSON.parse(result.stderr);
  }
}
it("tests real local CLI dry-run/register/stage commands, blocked and successful idempotent imports", async () => {
  const dir = resolve(root, "cli-package"),
    storage = resolve(root, "cli-db");
  await sealedFixture(dir);
  expect(JSON.parse(cli("init", "--db", storage))).toMatchObject({
    localOnly: true,
    reviewersProvisioned: false,
  });
  const dry = JSON.parse(cli("dry-run", dir, "--db", storage));
  expect(dry).toMatchObject({ canStage: false, writes: false, sealed: true, active: false });
  expect(JSON.parse(cli("register", dir, "--db", storage))).toMatchObject({
    registered: true,
    active: false,
  });
  expect(failure("stage", dir, "--db", storage).error).toBe("authenticated-reviews-required");
  const db = new PGlite(resolve(storage, "db"));
  try {
    await db.exec(
      "create role registry_test_reviewer login noinherit;grant linguatrack_registry_reviewer to registry_test_reviewer;",
    );
    await reviews(db, dry.packageHash); // Explicit authenticated test sessions; no CLI author identity shortcut.
  } finally {
    await db.close();
  }
  expect(JSON.parse(cli("dry-run", dir, "--db", storage)).canStage).toBe(true);
  expect(JSON.parse(cli("stage", dir, "--db", storage))).toMatchObject({
    state: "inactive",
    activated: false,
  });
  expect(JSON.parse(cli("stage", dir, "--db", storage))).toMatchObject({
    state: "inactive",
    activated: false,
  });
  expect(failure("stage", dir, "--db", storage, "--reviewer", "forged").error).toBe(
    "unsupported-arguments",
  );
  expect(failure("init", "--db", "postgresql://example.test/prod").error).toBe(
    "local-path-required",
  );
  expect(failure("init", "--db", storage).error).toBe("local-registry-operation-failed"); // No reset/reinitialization.
}, 60000);

it("rejects invalid references, public key leakage, altered media and missing/unsupported capabilities before writes", async () => {
  const dir = resolve(root, "invalid-package");
  await sealedFixture(dir);
  const files = [
    "manifest.json",
    "public/exercises.json",
    "public/blocks.json",
    "media/a1-introductions.wav",
  ];
  const originals = new Map(
    await Promise.all(
      files.map(async (path) => [path, await readFile(resolve(dir, path))] as const),
    ),
  );
  async function alter(path: string, value: unknown) {
    const bytes = Buffer.from(canonicalJson(value));
    await writeFile(resolve(dir, path), bytes);
    if (path !== "manifest.json") {
      const manifest = JSON.parse(originals.get("manifest.json")!.toString());
      const f = manifest.files.find((f: { path: string }) => f.path === path);
      f.sha256 = sha256(bytes);
      f.byteLength = bytes.length;
      await writeFile(resolve(dir, "manifest.json"), canonicalJson(manifest));
    }
  }
  async function restore() {
    for (const [path, bytes] of originals) await writeFile(resolve(dir, path), bytes);
  }
  const blocks = JSON.parse(originals.get("public/blocks.json")!.toString());
  blocks[0].exerciseRefs[0].revision = 99;
  await alter("public/blocks.json", blocks);
  await expect(prepareSealedImport(dir, [])).rejects.toThrow(/reference/);
  await restore();
  const exercises = JSON.parse(originals.get("public/exercises.json")!.toString());
  exercises[0].correctOptionIds = ["a"];
  await alter("public/exercises.json", exercises);
  await expect(prepareSealedImport(dir, [])).rejects.toThrow(/schema/);
  await restore();
  await writeFile(resolve(dir, "media/a1-introductions.wav"), Buffer.from("changed"));
  await expect(prepareSealedImport(dir, [])).rejects.toThrow(/file-integrity/);
  await restore();
  const manifest = JSON.parse(originals.get("manifest.json")!.toString());
  manifest.requiredCapabilities = ["legacy-v1-bridge", "package-media"];
  await alter("manifest.json", manifest);
  await expect(prepareSealedImport(dir, [])).rejects.toThrow(/capability/);
  await restore();
  manifest.requiredCapabilities.push("multiple_choice", "matching");
  await alter("manifest.json", manifest);
  await expect(prepareSealedImport(dir, [])).rejects.toThrow(/staging-capability/);
  await restore();
  manifest.state = "draft";
  await alter("manifest.json", manifest);
  await expect(prepareSealedImport(dir, [])).rejects.toThrow(/sealed-required/);
});

it("archives the unchanged draft chain as provenance only, without approving pending entries or making old drafts releases", async () => {
  const fixtureRoot = resolve(root, "ancestor-fixtures");
  await fixtureCatalog(fixtureRoot);
  const ancestors = DRAFT_CHAIN_PINS.map((pin) =>
    resolve(fixtureRoot, ".curriculum-drafts", pin.version),
  );
  const candidate = resolve(root, "source-package");
  await sealedFixture(candidate, "9.1.0");
  const candidateManifestPath = resolve(candidate, "manifest.json");
  const candidateManifest = JSON.parse(await readFile(candidateManifestPath, "utf8"));
  candidateManifest.basedOn = {
    schemaVersion: 2,
    contentVersion: "1.3.0",
    sha256: DRAFT_CHAIN_PINS[2].hash,
  };
  await writeFile(candidateManifestPath, canonicalJson(candidateManifest));
  await expect(prepareSealedImport(candidate, [])).rejects.toThrow(/parent-release/);
  const prepared = await prepareSealedImport(candidate, ancestors);
  const db = new PGlite();
  await migrate(db);
  try {
    await asPrincipal(db, "registry_local_importer");
    await registerCandidate(db, prepared);
    await reviews(db, prepared.summary.packageHash);
    await stageRelease(db, prepared);
    expect((await registrySnapshot(db)).releases.map((r) => r.hash)).toEqual(
      expect.arrayContaining(DRAFT_CHAIN_PINS.map((p) => p.hash)),
    );
    await asPrincipal(db, "postgres");
    expect((await db.query("select count(*) from curriculum_private.releases")).rows[0]).toEqual({
      count: 1,
    });
    expect(
      (
        await db.query(
          "select count(*) from curriculum_private.compatibility_mappings where package_hash=$1 and payload->>'reviewStatus'='pending'",
          [DRAFT_CHAIN_PINS[2].hash],
        )
      ).rows[0],
    ).toEqual({ count: 237 });
    const unchanged = await fixtureCatalogCheck(ancestors);
    expect(unchanged).toEqual(DRAFT_CHAIN_PINS.map((p) => p.hash));
    await expect(prepareSealedImport(ancestors[2]!, ancestors.slice(0, 2))).rejects.toThrow(
      /sealed-required/,
    );
  } finally {
    await db.close();
  }
}, 30000);
async function fixtureCatalogCheck(ancestors: string[]) {
  const { loadPackageChain } = await import("../../src/lib/curriculum/v2/reader");
  const { options } = await import("../curriculum-v2/fixtures");
  return (await loadPackageChain(ancestors, options)).packages.map((p) => p.releaseHash);
}
