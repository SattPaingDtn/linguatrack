import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { revisePronounsLesson } from "../../src/lib/curriculum/v2/editorial";
import {
  loadPackage,
  loadPackageChain,
  readRegularFile,
  writeDraft,
} from "../../src/lib/curriculum/v2/files";
import { LIMITS } from "../../src/lib/curriculum/v2/common";
import { ContentValidationError, fail, parseJson, sha256 } from "../../src/lib/curriculum/v2/json";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import type { BridgeMedia } from "../../src/lib/curriculum/v2/bridge";
const args = process.argv.slice(2);
const values = (name: string) =>
  args.flatMap((arg, i) => {
    if (arg !== name) return [];
    const value = args[i + 1];
    if (!value || value.startsWith("--")) fail("arguments", name, "Provide a flag value");
    return [value];
  });
async function run() {
  const sourcePath = resolve(values("--source")[0] ?? ".curriculum-drafts/1.2.0");
  const ancestorPaths = values("--against");
  if (!ancestorPaths.length) ancestorPaths.push(".curriculum-drafts/1.1.0");
  const output = resolve(values("--out")[0] ?? ".curriculum-drafts/1.3.0");
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
  for (const path of [...ancestorPaths, sourcePath]) {
    const input = await realpath(path);
    if (
      canonicalOutput === input ||
      canonicalOutput.startsWith(`${input}${sep}`) ||
      input.startsWith(`${canonicalOutput}${sep}`)
    )
      fail(
        "source-protection",
        output,
        "Editorial output cannot overlap an existing validated package",
      );
  }
  const legacyBytes = await readRegularFile(
    resolve("src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const legacy = {
    legacy: parseJson(legacyBytes, "v1/curriculum.json"),
    legacyHash: sha256(legacyBytes),
  };
  const ancestors = await loadPackageChain(ancestorPaths, legacy);
  const chain = await loadPackageChain([sourcePath], { ...legacy, registry: ancestors.registry });
  const source = chain.packages[0]!;
  const authored = parseJson(
    await readRegularFile(
      resolve("content-authoring/a1-subject-pronouns/public.json"),
      LIMITS.jsonFileBytes,
    ),
    "authoring/public.json",
  );
  const rules = parseJson(
    await readRegularFile(
      resolve("content-authoring/a1-subject-pronouns/grading.json"),
      LIMITS.jsonFileBytes,
    ),
    "authoring/grading.json",
  );
  const candidate = validatePackage(
    revisePronounsLesson(source.pkg, authored, rules, {
      contentVersion: values("--version")[0] ?? "1.3.0",
      sourceDigest: source.releaseHash,
      createdAt: "2026-10-12T00:00:00.000Z",
    }),
    { ...legacy, registry: chain.registry },
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
        "editorial-media",
        asset.id,
        "This editorial prototype retains the existing PCM WAV media",
      );
    media.set(asset.legacyPublicPath, {
      bytes: await readFile(resolve(sourcePath, asset.storage.path)),
      durationMs: asset.durationMs,
      contentType: "audio/wav",
    });
  }
  await writeDraft(output, candidate, media);
  const written = await loadPackage(output, { ...legacy, registry: chain.registry });
  const checked = await loadPackageChain([...ancestorPaths, sourcePath], legacy);
  for (const [i, previous] of [...ancestors.packages, source].entries())
    if (checked.packages[i]!.releaseHash !== previous.releaseHash)
      fail("source-changed", sourcePath, "An immutable source changed during editing");
  console.log(
    JSON.stringify(
      {
        contentVersion: written.pkg.manifest.contentVersion,
        draft: output,
        releaseHash: written.releaseHash,
        sourcesUnchanged: true,
        questions: 14,
        newUngradedActivities: 1,
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
