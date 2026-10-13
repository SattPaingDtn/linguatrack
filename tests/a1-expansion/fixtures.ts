import { join } from "node:path";
import authored from "../../content-authoring/a1-chapters-02-03/public.json";
import grading from "../../content-authoring/a1-chapters-02-03/grading.json";
import metadata from "../../content-authoring/a1-chapters-02-03/metadata.json";
import { chapterFixture } from "../chapter-preview/fixtures";
import { appendA1Chapters } from "../../src/lib/curriculum/v2/batch-authoring";
import { loadPackageChain, writeDraft } from "../../src/lib/curriculum/v2/files";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import { media, options } from "../curriculum-v2/fixtures";
export { authored, grading, metadata };
export async function expansionFixture(root: string) {
  const ch1 = await chapterFixture(root);
  await writeDraft(join(root, ".curriculum-drafts", "1.4.0"), ch1.pkg, media);
  const directories = ["1.1.0", "1.2.0", "1.3.0", "1.4.0"].map((v) =>
    join(root, ".curriculum-drafts", v),
  );
  const chain = await loadPackageChain(directories, options),
    source = chain.packages.at(-1)!;
  const candidate = appendA1Chapters(source.pkg, authored, grading, metadata, {
    contentVersion: "1.5.0",
    sourceDigest: source.releaseHash,
    createdAt: "2026-10-12T00:00:00.000Z",
  });
  return {
    source,
    chain,
    pkg: validatePackage(candidate, { ...options, registry: chain.registry }),
  };
}
