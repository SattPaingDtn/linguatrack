import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expansionFixture } from "../a1-expansion/fixtures";
import { loadPackageChain, writeDraft } from "../../src/lib/curriculum/v2/files";
import {
  appendManuscriptChapter,
  validateManuscriptSource,
} from "../../src/lib/curriculum/v2/manuscript-authoring";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import { media, options } from "../curriculum-v2/fixtures";
export async function manuscriptFixture(root: string, maxChapter = 4) {
  const base = await expansionFixture(root);
  await writeDraft(join(root, ".curriculum-drafts", "1.5.0"), base.pkg, media);
  const directories = Array.from({ length: 5 }, (_, i) =>
    join(root, ".curriculum-drafts", `1.${i + 1}.0`),
  );
  let chain = await loadPackageChain(directories, options);
  const stages = [];
  for (let n = 4; n <= maxChapter; n++) {
    const input = resolve("content-authoring/a1-chapters-04-06", `chapter-${n}`);
    const authored: unknown = JSON.parse(await readFile(join(input, "public.json"), "utf8")),
      grading: unknown = JSON.parse(await readFile(join(input, "grading.json"), "utf8")),
      metadata: unknown = JSON.parse(await readFile(join(input, "metadata.json"), "utf8"));
    const source = chain.packages.at(-1)!;
    validateManuscriptSource(
      await readFile(resolve(`content-authoring/A1_Chapter_0${n}_Full_Lesson_Pack.md`), "utf8"),
      authored,
      grading,
      metadata,
    );
    const pkg = validatePackage(
      appendManuscriptChapter(source.pkg, authored, grading, metadata, {
        contentVersion: `1.${n + 2}.0`,
        sourceDigest: source.releaseHash,
        createdAt: "2026-10-12T00:00:00.000Z",
      }),
      { ...options, registry: chain.registry },
    );
    const output = join(root, ".curriculum-drafts", pkg.manifest.contentVersion);
    await writeDraft(output, pkg, media);
    directories.push(output);
    chain = await loadPackageChain(directories, options);
    stages.push({ pkg, source, loaded: chain.packages.at(-1)!, authored, grading, metadata });
  }
  return { base, chain, stages };
}
