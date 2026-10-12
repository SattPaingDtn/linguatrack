// Backward-compatible authoring API. Application preview code imports reader.ts directly.
export * from "./reader";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { resolve, sep, dirname } from "node:path";
import { canonicalJson, fail } from "./json";
import type { CurriculumPackage } from "./package";
import type { BridgeMedia } from "./bridge";

export async function writeDraft(
  directory: string,
  pkg: CurriculumPackage,
  legacyMedia: ReadonlyMap<string, BridgeMedia>,
) {
  if (pkg.manifest.state !== "draft")
    fail("draft-only", directory, "This bridge can only write a local draft");
  const root = resolve(directory);
  const repo = resolve(process.cwd());
  for (const protectedDir of [
    "src",
    "public",
    "supabase",
    "schemas",
    "node_modules",
    ".git",
    ".next",
  ]) {
    const target = resolve(repo, protectedDir);
    if (root === target || root.startsWith(`${target}${sep}`) || target.startsWith(`${root}${sep}`))
      fail(
        "protected-output",
        root,
        "Bridge output cannot overlap application, v1, migrations, schema or build directories",
      );
  }
  // mkdir without recursive is an exclusive create: existing outputs are never overwritten.
  await mkdir(dirname(root), { recursive: true });
  const canonicalParent = await realpath(dirname(root));
  const canonicalOutput = resolve(canonicalParent, root.split(sep).at(-1)!);
  const canonicalRepo = await realpath(repo);
  for (const protectedDir of [
    "src",
    "public",
    "supabase",
    "schemas",
    "node_modules",
    ".git",
    ".next",
  ]) {
    const target = resolve(canonicalRepo, protectedDir);
    if (
      canonicalOutput === target ||
      canonicalOutput.startsWith(`${target}${sep}`) ||
      target.startsWith(`${canonicalOutput}${sep}`)
    )
      fail(
        "protected-output",
        root,
        "Resolved output cannot overlap protected directories through a symlink",
      );
  }
  await mkdir(root);
  const payloads = new Map<string, unknown>();
  for (const [collection, payload] of Object.entries(pkg.public))
    payloads.set(`public/${collection}.json`, payload);
  for (const [collection, payload] of Object.entries(pkg.private))
    payloads.set(`private/${collection}.json`, payload);
  payloads.set("compatibility.json", pkg.compatibility);
  for (const f of pkg.manifest.files) {
    const abs = resolve(root, f.path);
    await mkdir(dirname(abs), { recursive: true });
    if (f.collection === "media") {
      const asset = pkg.public.assets.find(
        (a) => a.storage.type === "package" && a.storage.path === f.path,
      );
      const bytes = asset?.legacyPublicPath && legacyMedia.get(asset.legacyPublicPath)?.bytes;
      if (!bytes) fail("missing-media", f.path, "Bridge audio bytes are missing");
      await writeFile(abs, bytes, { flag: "wx" });
    } else await writeFile(abs, canonicalJson(payloads.get(f.path)), { flag: "wx" });
  }
  await writeFile(resolve(root, "manifest.json"), canonicalJson(pkg.manifest), { flag: "wx" });
}
