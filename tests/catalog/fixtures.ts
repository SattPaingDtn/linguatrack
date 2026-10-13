import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import oldPublic from "../../content-authoring/a1-subject-pronouns/revisions/1.2.0/public.json";
import oldGrading from "../../content-authoring/a1-subject-pronouns/revisions/1.2.0/grading.json";
import authored from "../../content-authoring/a1-subject-pronouns/public.json";
import grading from "../../content-authoring/a1-subject-pronouns/grading.json";
import { appendGrammarPrototype } from "../../src/lib/curriculum/v2/authoring";
import { revisePronounsLesson } from "../../src/lib/curriculum/v2/editorial";
import { loadPackageChain, writeDraft } from "../../src/lib/curriculum/v2/files";
import { bridge, media, options } from "../curriculum-v2/fixtures";

// Recreate exact validated artifacts exclusively in a test temp directory.
// Tests also work on fresh checkouts without ignored local drafts.
export async function fixtureCatalog(root: string) {
  for (const path of ["src/content/v1/curriculum.json", "src/content/public/v1/curriculum.json"]) {
    const output = resolve(root, path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, await readFile(resolve(path)));
  }
  const directories = ["1.1.0", "1.2.0", "1.3.0"].map((v) =>
    resolve(root, ".curriculum-drafts", v),
  );
  await writeDraft(directories[0]!, bridge(), media);
  const first = await loadPackageChain(directories.slice(0, 1), options);
  await writeDraft(
    directories[1]!,
    appendGrammarPrototype(first.packages[0]!.pkg, oldPublic, oldGrading, {
      contentVersion: "1.2.0",
      sourceDigest: first.packages[0]!.releaseHash,
      createdAt: "2026-10-12T00:00:00.000Z",
    }),
    media,
  );
  const second = await loadPackageChain(directories.slice(0, 2), options);
  await writeDraft(
    directories[2]!,
    revisePronounsLesson(second.packages[1]!.pkg, authored, grading, {
      contentVersion: "1.3.0",
      sourceDigest: second.packages[1]!.releaseHash,
      createdAt: "2026-10-12T00:00:00.000Z",
    }),
    media,
  );
  return loadPackageChain(directories, options);
}
