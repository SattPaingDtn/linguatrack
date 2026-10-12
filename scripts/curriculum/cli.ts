import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { format, resolveConfig } from "prettier";
import { curriculumSchema } from "../../src/lib/curriculum/schema";
import { convertV1, type BridgeMedia } from "../../src/lib/curriculum/v2/bridge";
import { LIMITS } from "../../src/lib/curriculum/v2/common";
import {
  loadPackage,
  loadPackageChain,
  inspectWav,
  readRegularFile,
  writeDraft,
} from "../../src/lib/curriculum/v2/files";
import {
  canonicalJson,
  ContentValidationError,
  fail,
  parseJson,
  sha256,
} from "../../src/lib/curriculum/v2/json";
import { jsonSchemas } from "../../src/lib/curriculum/v2/package";
import { publicManifestSchema } from "../../src/lib/curriculum/v2/projection";
import { parseWith, validatePackage } from "../../src/lib/curriculum/v2/validate";
import {
  checkCompletedLessons,
  checkLegacyAttempt,
  checkResumeCompatibility,
} from "../../src/lib/curriculum/v2/compatibility";
import { readHistory } from "../../src/lib/curriculum/v2/history";
const root = process.cwd();
const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const baselinePath = resolve(root, flag("--baseline") ?? "src/content/v1/curriculum.json");
async function baseline() {
  const bytes = await readRegularFile(baselinePath, LIMITS.jsonFileBytes);
  return {
    legacy: parseWith(curriculumSchema, parseJson(bytes, baselinePath), baselinePath),
    legacyHash: sha256(bytes),
  };
}
async function mediaFor(legacy: Awaited<ReturnType<typeof baseline>>["legacy"]) {
  const media = new Map<string, BridgeMedia>();
  for (const b of legacy.courses.flatMap((c) =>
    c.chapters.flatMap((ch) => ch.lessons.flatMap((l) => l.blocks)),
  ))
    if (b.type === "listening") {
      const bytes = await readRegularFile(
        resolve(root, "public", b.audio.slice(1)),
        LIMITS.assetBytes,
      );
      if (!b.audio.endsWith(".wav"))
        fail(
          "legacy-media-decoder",
          b.audio,
          "This bridge CLI supports PCM WAV; provide a reviewed decoder adapter for other legacy formats",
        );
      const decoded = inspectWav(bytes);
      media.set(b.audio, { bytes, durationMs: decoded.durationMs!, contentType: "audio/wav" });
    }
  return media;
}
async function run() {
  if (command === "schemas") {
    const output = resolve(root, "schemas/curriculum-v2/2.0.0");
    await mkdir(output, { recursive: true });
    for (const [name, schema] of Object.entries({
      ...jsonSchemas,
      "public-manifest": publicManifestSchema,
    })) {
      const path = resolve(output, `${name}.schema.json`);
      const canonical = canonicalJson({
        ...z.toJSONSchema(schema, { target: "draft-2020-12" }),
        $id: `urn:linguatrack:curriculum:${name}:2.0.0`,
        $comment:
          "Generated from strict Zod contracts. Also run the semantic package validator; refinements/graph rules are not expressible in JSON Schema.",
      });
      const json = await format(canonical, { ...(await resolveConfig(path)), parser: "json" });
      if (args.includes("--check")) {
        if ((await readFile(path, "utf8")) !== json)
          fail(
            "schema-drift",
            path,
            "Run npm run curriculum:v2:schemas and commit generated definitions",
          );
      } else await writeFile(path, json);
    }
    console.log(
      args.includes("--check")
        ? "Generated JSON Schemas are current."
        : "Generated JSON Schemas for contract 2.0.0.",
    );
    return;
  }
  if (command !== "bridge" && command !== "validate" && command !== "compatibility")
    fail(
      "usage",
      "arguments",
      "Use bridge --out <new-directory>, validate <package-directory> [--against <previous-package>], or compatibility <package-directory> --history <local-snapshot.json>",
    );
  const data = await baseline();
  if (command === "bridge") {
    const output = flag("--out");
    if (!output)
      fail("usage", "--out", "Choose a new directory outside src/, public/ and supabase/");
    const media = await mediaFor(data.legacy);
    const pkg = validatePackage(
      convertV1(data.legacy, {
        sourceHash: data.legacyHash,
        media,
        contentVersion: flag("--version"),
      }),
      data,
    );
    await writeDraft(output, pkg, media);
    await loadPackage(output, data);
    console.log(
      `Draft only: ${resolve(output)}\n${pkg.public.lessons.length} preserved lessons, ${pkg.public.exercises.length} preserved questions. No release activation or database operation.`,
    );
    return;
  }
  const directory = args[0];
  if (!directory || directory.startsWith("--"))
    fail("usage", "arguments", "Provide a package directory");
  const ancestors = args.flatMap((arg, i) => {
    if (arg !== "--against") return [];
    const path = args[i + 1];
    if (!path || path.startsWith("--"))
      fail(
        "usage",
        "--against",
        "Provide ancestor directories oldest-first, repeating --against for each version",
      );
    return [path];
  });
  const chain = await loadPackageChain(ancestors, data);
  const { pkg, releaseHash } = await loadPackage(directory, { ...data, registry: chain.registry });
  if (command === "compatibility") {
    const history = flag("--history");
    if (!history)
      fail(
        "usage",
        "--history",
        "Provide an existing learner export or local LearningSnapshot JSON (keep personal exports out of Git)",
      );
    const snapshot = readHistory(
      parseJson(await readRegularFile(resolve(history), LIMITS.jsonFileBytes), history),
      data.legacy.contentVersion,
    );
    const bridge = validatePackage(
      convertV1(data.legacy, { sourceHash: data.legacyHash, media: await mediaFor(data.legacy) }),
      data,
    );
    const result = {
      reportOnly: true,
      generation: snapshot.generation,
      completed: snapshot.completions.map((completion) => ({
        ...completion,
        ...checkCompletedLessons(bridge, pkg, [completion.lessonId])[0]!,
        ...(completion.contentVersion !== data.legacy.contentVersion
          ? {
              compatible: false,
              approved: false,
              reasons: [
                "Completion belongs to a different legacy release; retain its original record",
              ],
            }
          : {}),
      })),
      attempts: snapshot.attempts.map((attempt) => ({
        attemptId: attempt.id,
        ...checkLegacyAttempt(data.legacy, bridge, pkg, attempt),
      })),
      resume: snapshot.resume ? checkResumeCompatibility(bridge, pkg, snapshot.resume) : null,
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      result.completed.some((x) => !x.compatible) ||
      result.attempts.some((x) => !x.compatible) ||
      result.resume?.compatible === false
    )
      process.exitCode = 1;
  } else
    console.log(
      args.includes("--json")
        ? JSON.stringify({
            valid: true,
            state: pkg.manifest.state,
            contentVersion: pkg.manifest.contentVersion,
            releaseHash,
            activation: false,
          })
        : `Valid ${pkg.manifest.state} package ${pkg.manifest.contentVersion} (${pkg.public.lessons.length} lessons).\nIntegrity, references, private keys and compatibility checked. No activation or database operation.`,
    );
}
run().catch((error: unknown) => {
  const diagnostics =
    error instanceof ContentValidationError
      ? error.diagnostics
      : [
          {
            code: "io",
            path: "package",
            message: error instanceof Error ? error.message : String(error),
          },
        ];
  console.error(
    args.includes("--json")
      ? JSON.stringify({ valid: false, diagnostics })
      : diagnostics.map((d) => `${d.path} [${d.code}] ${d.message}`).join("\n"),
  );
  process.exitCode = 1;
});
