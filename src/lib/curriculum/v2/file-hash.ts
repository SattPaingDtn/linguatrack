// File-package identity, deliberately distinct from fingerprint(parsedPackage).
import { hashSchema, pathSchema } from "./common";
import { fail, fingerprint } from "./json";

export const FILE_PACKAGE_HASH_ALGORITHM = "sha256-canonical-file-inventory-v1" as const;
export type FileDigest = { path: string; sha256: string };

export function filePackageHash(files: readonly FileDigest[]): string {
  const paths = new Set<string>();
  for (const file of files) {
    if (!pathSchema.safeParse(file.path).success || !hashSchema.safeParse(file.sha256).success)
      fail("file-digest", "inventory", "Expected safe file paths and SHA-256 digests");
    if (paths.has(file.path))
      fail("duplicate-file-digest", "inventory", "File paths must be unique");
    paths.add(file.path);
  }
  if (!paths.has("manifest.json"))
    fail("manifest-digest", "inventory", "Package identity must include manifest.json");
  // Project fields explicitly so caller metadata cannot change the hash domain.
  return fingerprint(
    files
      .map(({ path, sha256 }) => ({ path, sha256 }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  );
}
