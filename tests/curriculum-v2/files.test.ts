// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { inspectWav, loadPackage, writeDraft } from "../../src/lib/curriculum/v2/files";
import { canonicalJson, sha256 } from "../../src/lib/curriculum/v2/json";
import { jsonSchemas } from "../../src/lib/curriculum/v2/package";
import { publicManifestSchema } from "../../src/lib/curriculum/v2/projection";
import { audio, bridge, options, media } from "./fixtures";
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});
async function draft() {
  const dir = await mkdtemp(resolve(tmpdir(), "linguatrack-v2-test-"));
  temporary.push(dir);
  const packageDir = resolve(dir, "draft");
  await writeDraft(packageDir, bridge(), media);
  return packageDir;
}
const run = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "scripts/curriculum/cli.ts", ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
describe("package files, media and CLI", () => {
  it("generates current JSON Schema 2020-12 definitions from every strict contract", async () => {
    for (const [name, schema] of Object.entries({
      ...jsonSchemas,
      "public-manifest": publicManifestSchema,
    })) {
      const generated = JSON.parse(
        await readFile(resolve(`schemas/curriculum-v2/2.0.0/${name}.schema.json`), "utf8"),
      );
      expect(generated).toMatchObject(z.toJSONSchema(schema, { target: "draft-2020-12" }));
      expect(generated.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    }
  });
  it("validates a complete on-disk draft and reports read-only CLI results", async () => {
    const dir = await draft();
    const before = await readFile(resolve("src/content/v1/curriculum.json"));
    const loaded = await loadPackage(dir, options);
    expect(loaded.pkg).toEqual(bridge());
    expect(JSON.parse(run("validate", dir, "--json"))).toMatchObject({
      valid: true,
      activation: false,
      state: "draft",
    });
    expect(run("validate", dir, "--against", dir)).toContain("Valid draft");
    expect(await readFile(resolve("src/content/v1/curriculum.json"))).toEqual(before);
  }, 30_000);
  it("refuses overwrites, protected outputs, unlisted files, missing media and symlinks", async () => {
    const dir = await draft();
    await expect(writeDraft(dir, bridge(), media)).rejects.toThrow();
    await expect(writeDraft("src/content/v2/new-draft", bridge(), media)).rejects.toThrow(
      /protected-output/,
    );
    await writeFile(resolve(dir, "secret.json"), "{}");
    await expect(loadPackage(dir, options)).rejects.toThrow(/unlisted-file/);
    await rm(resolve(dir, "secret.json"));
    await rm(resolve(dir, "media/a1-introductions.wav"));
    await expect(loadPackage(dir, options)).rejects.toThrow(/missing-file/);
    await symlink(
      resolve("public/audio/a1-introductions.wav"),
      resolve(dir, "media/a1-introductions.wav"),
    );
    await expect(loadPackage(dir, options)).rejects.toThrow(/symlink/);
  });
  it("checks file hashes and decoded WAV format, size and duration", async () => {
    const dir = await draft();
    await writeFile(resolve(dir, "public/exercises.json"), "[]");
    await expect(loadPackage(dir, options)).rejects.toThrow(/file-integrity/);
    expect(inspectWav(audio)).toMatchObject({
      sha256: sha256(audio),
      byteLength: audio.byteLength,
      contentType: "audio/wav",
    });
    expect(() => inspectWav(new Uint8Array(44))).toThrow(/media-format/);
    const invalid = Buffer.from(audio);
    invalid.writeUInt16LE(0, 22);
    expect(() => inspectWav(invalid)).toThrow(/media-format/);
  });
  it("emits descriptive errors with nonzero CLI exit and no secret payload dump", async () => {
    const dir = await draft();
    const manifest = bridge().manifest;
    manifest.files[0]!.path = "../private/grading.json";
    await writeFile(resolve(dir, "manifest.json"), canonicalJson(manifest));
    try {
      run("validate", dir, "--json");
      expect.fail("Invalid CLI input succeeded");
    } catch (e) {
      const err = e as { status: number; stderr: string };
      expect(err.status).toBe(1);
      const output = JSON.parse(err.stderr);
      expect(output).toMatchObject({ valid: false });
      expect(output.diagnostics[0].path).toContain("manifest.json/files/0/path");
    }
  });
});
