import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { appendGrammarPrototype } from "../../src/lib/curriculum/v2/authoring";
import { LIMITS } from "../../src/lib/curriculum/v2/common";
import { loadPackage, readRegularFile, writeDraft } from "../../src/lib/curriculum/v2/files";
import { ContentValidationError, fail, parseJson, sha256 } from "../../src/lib/curriculum/v2/json";
import { registrySnapshot, validatePackage } from "../../src/lib/curriculum/v2/validate";
import type { BridgeMedia } from "../../src/lib/curriculum/v2/bridge";
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i >= 0 && (!args[i + 1] || args[i + 1]!.startsWith("--")))
    fail("arguments", name, "Flag needs a value");
  return i < 0 ? undefined : args[i + 1];
};
async function run() {
  const input = resolve(flag("--source") ?? ".curriculum-drafts/1.1.0");
  const output = resolve(flag("--out") ?? ".curriculum-drafts/1.2.0");
  const sourceRoot = await realpath(input);
  let ancestor = output;
  while (true) {
    try {
      await lstat(ancestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      ancestor = dirname(ancestor);
    }
  }
  const canonicalOutput = resolve(await realpath(ancestor), relative(ancestor, output));
  if (
    canonicalOutput === sourceRoot ||
    canonicalOutput.startsWith(`${sourceRoot}${sep}`) ||
    sourceRoot.startsWith(`${canonicalOutput}${sep}`)
  )
    fail(
      "source-protection",
      output,
      "The working copy cannot overlap its immutable source package",
    );
  const bytes = await readRegularFile(
    resolve("src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const legacy = { legacy: parseJson(bytes, "v1/curriculum.json"), legacyHash: sha256(bytes) };
  const source = await loadPackage(input, legacy);
  const registry = registrySnapshot(source.pkg, source.releaseHash);
  const publicContent = parseJson(
    await readRegularFile(
      resolve("content-authoring/a1-subject-pronouns/revisions/1.2.0/public.json"),
      LIMITS.jsonFileBytes,
    ),
    "authoring/public.json",
  );
  const grading = parseJson(
    await readRegularFile(
      resolve("content-authoring/a1-subject-pronouns/revisions/1.2.0/grading.json"),
      LIMITS.jsonFileBytes,
    ),
    "authoring/grading.json",
  );
  const candidate = validatePackage(
    appendGrammarPrototype(source.pkg, publicContent, grading, {
      contentVersion: flag("--version") ?? "1.2.0",
      sourceDigest: source.releaseHash,
      createdAt: "2026-10-12T00:00:00.000Z",
    }),
    { ...legacy, registry },
  );
  const media = new Map<string, BridgeMedia>();
  for (const asset of source.pkg.public.assets) {
    if (
      asset.storage.type !== "package" ||
      asset.contentType !== "audio/wav" ||
      !asset.legacyPublicPath ||
      !asset.durationMs
    )
      fail(
        "prototype-media",
        asset.id,
        "This prototype copies the existing legacy PCM WAV assets only",
      );
    media.set(asset.legacyPublicPath, {
      bytes: await readFile(resolve(sourceRoot, asset.storage.path)),
      durationMs: asset.durationMs,
      contentType: "audio/wav",
    });
  }
  await writeDraft(output, candidate, media);
  const written = await loadPackage(output, { ...legacy, registry });
  const verifiedSource = await loadPackage(input, legacy);
  if (verifiedSource.releaseHash !== source.releaseHash)
    fail(
      "source-changed",
      input,
      "Source changed during authoring; do not use this output until reviewed",
    );
  console.log(
    JSON.stringify(
      {
        draft: output,
        contentVersion: written.pkg.manifest.contentVersion,
        sourceUnchanged: true,
        sourceDigest: source.releaseHash,
        releaseHash: written.releaseHash,
        lessonId: candidate.public.lessons.find(
          (lesson) => !source.pkg.public.lessons.some((old) => old.id === lesson.id),
        )!.id,
        addedQuestions: candidate.public.exercises.length - source.pkg.public.exercises.length,
        activation: false,
      },
      null,
      2,
    ),
  );
}
run().catch((error: unknown) => {
  console.error(
    error instanceof ContentValidationError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error),
  );
  process.exitCode = 1;
});
