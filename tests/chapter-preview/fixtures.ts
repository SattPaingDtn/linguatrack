import authored from "../../content-authoring/a1-chapter-01/public.json";
import grading from "../../content-authoring/a1-chapter-01/grading.json";
import mapping from "../../content-authoring/a1-chapter-01/mapping.json";
import { appendChapterPack } from "../../src/lib/curriculum/v2/chapter-authoring";
import { fixtureCatalog } from "../catalog/fixtures";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import { options } from "../curriculum-v2/fixtures";
export { authored, grading, mapping };
export async function chapterFixture(root: string) {
  const chain = await fixtureCatalog(root);
  const source = chain.packages.at(-1)!;
  const candidate = appendChapterPack(source.pkg, authored, grading, mapping, {
    contentVersion: "1.4.0",
    sourceDigest: source.releaseHash,
    createdAt: "2026-10-12T00:00:00.000Z",
  });
  return {
    source,
    chain,
    pkg: validatePackage(candidate, { ...options, registry: chain.registry }),
  };
}
