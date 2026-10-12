// Read-only package validation. Kept separate from the draft writer for application imports.
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { z } from "zod";
import { LIMITS } from "./common";
import { ContentValidationError, fail, fingerprint, parseJson, sha256 } from "./json";
import { compatibilitySchema, manifestSchema, type CurriculumPackage } from "./package";
import { publicEntitySchemas, type Asset, type PublicCollections } from "./public";
import { gradingSchema, rubricSchema } from "./private";
import { parseWith, registrySnapshot, validatePackage, type ValidationOptions } from "./validate";
import { mergeRegistrySnapshots } from "./registry";
export type MediaVerification = {
  sha256: string;
  byteLength: number;
  contentType: string;
  durationMs?: number;
};
export type FileValidationOptions = ValidationOptions & {
  // Caller supplies a trusted decoder/storage adapter. Packages cannot configure arbitrary URLs.
  verifyManaged?: (asset: Asset) => Promise<MediaVerification>;
  verifyMedia?: (bytes: Uint8Array, asset: Asset) => Promise<MediaVerification>;
};
export async function readRegularFile(path: string, maxBytes: number) {
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    fail("missing-file", path, "Required file does not exist");
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    fail("file-type", path, "Expected a regular file; symlinks are forbidden");
  if (stat.size > maxBytes) fail("file-size", path, `File exceeds ${maxBytes} bytes`);
  return readFile(path);
}
async function inventory(root: string) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    fail("package-directory", root, "Expected a directory, without symlinks");
  const entries: string[] = [];
  let totalEntries = 0;
  const walk = async (path: string, depth: number) => {
    if (depth > LIMITS.depth) fail("directory-depth", path, "Directory nesting limit exceeded");
    for (const item of await readdir(path, { withFileTypes: true })) {
      if (++totalEntries > LIMITS.files)
        fail("file-limit", root, "Package file/directory limit exceeded");
      const abs = resolve(path, item.name);
      if (item.isSymbolicLink())
        fail("symlink", abs, "Symlinks are forbidden in a content package");
      if (item.isDirectory()) await walk(abs, depth + 1);
      else if (item.isFile()) entries.push(relative(root, abs).split(sep).join("/"));
      else fail("file-type", abs, "Unsupported filesystem entry");
    }
  };
  await walk(root, 0);
  return entries;
}
// Built-in PCM WAV decoder validates signatures, chunk bounds, format and decoded duration.
// Other approved formats require a trusted decoder adapter; headers alone do not pass validation.
export function inspectWav(bytes: Uint8Array): MediaVerification {
  const b = Buffer.from(bytes);
  if (
    b.length < 44 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE" ||
    b.readUInt32LE(4) + 8 !== b.length
  )
    fail("media-format", "media", "Expected a complete RIFF/WAVE file");
  let offset = 12;
  let byteRate = 0;
  let align = 0;
  let dataBytes = 0;
  let fmtSeen = false;
  let dataSeen = false;
  while (offset + 8 <= b.length) {
    const kind = b.toString("ascii", offset, offset + 4);
    const length = b.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > b.length) fail("media-format", "media", "WAV chunk exceeds file length");
    if (kind === "fmt ") {
      if (fmtSeen || length < 16 || b.readUInt16LE(offset) !== 1)
        fail("media-format", "media", "Only one PCM WAV format chunk is supported");
      fmtSeen = true;
      const channels = b.readUInt16LE(offset + 2);
      const rate = b.readUInt32LE(offset + 4);
      byteRate = b.readUInt32LE(offset + 8);
      align = b.readUInt16LE(offset + 12);
      const bits = b.readUInt16LE(offset + 14);
      if (
        channels < 1 ||
        channels > 8 ||
        rate < 8000 ||
        rate > 192000 ||
        ![8, 16, 24, 32].includes(bits) ||
        align !== (channels * bits) / 8 ||
        byteRate !== rate * align
      )
        fail("media-format", "media", "Invalid PCM WAV format values");
    }
    if (kind === "data") {
      if (dataSeen) fail("media-format", "media", "Duplicate WAV data chunk");
      dataSeen = true;
      dataBytes = length;
    }
    offset += length + (length % 2);
  }
  if (!fmtSeen || !dataSeen || !dataBytes || dataBytes % align !== 0 || offset !== b.length)
    fail("media-format", "media", "WAV requires complete aligned PCM data");
  return {
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    contentType: "audio/wav",
    durationMs: Math.round((dataBytes / byteRate) * 1000),
  };
}
function checkMedia(actual: MediaVerification, asset: Asset, path: string) {
  if (
    actual.sha256 !== asset.sha256 ||
    actual.byteLength !== asset.byteLength ||
    actual.contentType !== asset.contentType ||
    actual.durationMs !== asset.durationMs
  )
    fail(
      "media-metadata",
      path,
      "Verified bytes, MIME or decoded duration differ from the asset record",
    );
}
export async function loadPackage(directory: string, options: FileValidationOptions = {}) {
  const root = await realpath(directory);
  // Check the supplied path too: realpath must not silently permit a package-root symlink.
  if ((await lstat(resolve(directory))).isSymbolicLink())
    fail("symlink", directory, "Package root cannot be a symlink");
  const actualFiles = await inventory(root);
  const manifestBytes = await readRegularFile(resolve(root, "manifest.json"), LIMITS.jsonFileBytes);
  const manifest = parseWith(
    manifestSchema,
    parseJson(manifestBytes, "manifest.json"),
    "manifest.json",
  );
  const expectedFiles = new Set(["manifest.json", ...manifest.files.map((f) => f.path)]);
  for (const file of actualFiles)
    if (!expectedFiles.has(file))
      fail("unlisted-file", file, "Every package file must be declared in the manifest");
  const pkg: CurriculumPackage = {
    manifest,
    public: {
      courses: [],
      chapters: [],
      lessons: [],
      blocks: [],
      objectives: [],
      exercises: [],
      assessments: [],
      stimuli: [],
      transcripts: [],
      assets: [],
    },
    private: {
      grading: { exerciseRules: [], assessmentPolicies: [] },
      rubrics: [],
      transcripts: [],
    },
    compatibility: [],
  };
  let jsonBytes = manifestBytes.byteLength;
  let mediaBytes = 0;
  const digests: { path: string; sha256: string }[] = [
    { path: "manifest.json", sha256: sha256(manifestBytes) },
  ];
  const media = new Map<string, Uint8Array>();
  const fileLocations = new Map<string, string>();
  const recordLocations = (prefix: string, offset: number, count: number, file: string) => {
    for (let i = 0; i < count; i++) fileLocations.set(`${prefix}/${offset + i}`, `${file}/${i}`);
  };

  for (const file of manifest.files) {
    const abs = resolve(root, file.path);
    if (relative(root, abs).startsWith(`..${sep}`))
      fail("path-traversal", file.path, "File must be inside the package");
    const bytes = await readRegularFile(
      abs,
      file.collection === "media" ? LIMITS.assetBytes : LIMITS.jsonFileBytes,
    );
    const hash = sha256(bytes);
    digests.push({ path: file.path, sha256: hash });
    if (
      (file.sha256 !== null && file.sha256 !== hash) ||
      (file.byteLength !== null && file.byteLength !== bytes.byteLength)
    )
      fail("file-integrity", file.path, "File SHA-256 or byte length differs from the manifest");
    if (file.collection === "media") {
      mediaBytes += bytes.byteLength;
      if (mediaBytes > LIMITS.mediaTotalBytes)
        fail("media-size", file.path, "Total included media exceeds 1 GiB");
      media.set(file.path, bytes);
      continue;
    }
    jsonBytes += bytes.byteLength;
    if (jsonBytes > LIMITS.jsonTotalBytes)
      fail("json-size", file.path, "Total JSON exceeds 128 MiB");
    const raw = parseJson(bytes, file.path);
    if (file.collection === "grading") {
      const grading = parseWith(gradingSchema, raw, file.path);
      recordLocations(
        "/private/grading/exerciseRules",
        pkg.private.grading.exerciseRules.length,
        grading.exerciseRules.length,
        `${file.path}/exerciseRules`,
      );
      recordLocations(
        "/private/grading/assessmentPolicies",
        pkg.private.grading.assessmentPolicies.length,
        grading.assessmentPolicies.length,
        `${file.path}/assessmentPolicies`,
      );
      pkg.private.grading.exerciseRules.push(...grading.exerciseRules);
      pkg.private.grading.assessmentPolicies.push(...grading.assessmentPolicies);
    } else if (file.collection === "rubrics") {
      const values = parseWith(z.array(rubricSchema), raw, file.path);
      recordLocations("/private/rubrics", pkg.private.rubrics.length, values.length, file.path);
      pkg.private.rubrics.push(...values);
    } else if (file.collection === "compatibility") {
      const values = parseWith(compatibilitySchema, raw, file.path);
      recordLocations("/compatibility", pkg.compatibility.length, values.length, file.path);
      pkg.compatibility.push(...values);
    } else if (file.collection === "transcripts" && file.visibility === "private") {
      const values = parseWith(z.array(publicEntitySchemas.transcripts), raw, file.path);
      recordLocations(
        "/private/transcripts",
        pkg.private.transcripts.length,
        values.length,
        file.path,
      );
      pkg.private.transcripts.push(...values);
    } else {
      const key = file.collection as keyof PublicCollections;
      const parsed = parseWith(z.array(publicEntitySchemas[key]), raw, file.path);
      // A single collection schema has just been checked; array union cannot express this correlation.
      recordLocations(`/public/${key}`, pkg.public[key].length, parsed.length, file.path);
      (pkg.public[key] as unknown[]).push(...parsed);
    }
  }
  const releaseHash = fingerprint(
    digests.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  );
  let validated: CurriculumPackage;
  try {
    validated = validatePackage(pkg, { ...options, releaseHash });
  } catch (error) {
    if (!(error instanceof ContentValidationError)) throw error;
    throw new ContentValidationError(
      error.diagnostics.map((d) => {
        const prefix = [...fileLocations.keys()].find(
          (p) => d.path === p || d.path.startsWith(`${p}/`),
        );
        const path = prefix
          ? fileLocations.get(prefix)! + d.path.slice(prefix.length)
          : d.path.startsWith("/manifest")
            ? "manifest.json" + d.path.slice("/manifest".length)
            : d.path;
        return { ...d, path };
      }),
    );
  }
  for (const asset of validated.public.assets) {
    if (asset.storage.type === "package") {
      const bytes = media.get(asset.storage.path);
      if (!bytes) fail("missing-media", asset.storage.path, "Asset bytes are absent");
      const actual =
        asset.contentType === "audio/wav"
          ? inspectWav(bytes)
          : options.verifyMedia
            ? await options.verifyMedia(bytes, asset)
            : fail(
                "media-decoder",
                asset.storage.path,
                `A trusted decoder adapter is required for ${asset.contentType}`,
              );
      checkMedia(actual, asset, asset.storage.path);
    } else {
      if (!options.verifyManaged)
        fail(
          "managed-media-unverified",
          asset.id,
          "Configure a trusted storage adapter to verify immutable managed media; validation cannot skip existence",
        );
      checkMedia(await options.verifyManaged(asset), asset, asset.id);
    }
  }
  for (const path of media.keys())
    if (
      !validated.public.assets.some((a) => a.storage.type === "package" && a.storage.path === path)
    )
      fail("orphan-media", path, "Media file has no asset definition");
  return { pkg: validated, releaseHash };
}
// Validate ancestors oldest-first. No directory, registry or database is modified.
export async function loadPackageChain(
  directories: readonly string[],
  options: FileValidationOptions = {},
) {
  let registry = options.registry;
  const packages: Awaited<ReturnType<typeof loadPackage>>[] = [];
  for (const directory of directories) {
    const loaded = await loadPackage(directory, { ...options, registry });
    packages.push(loaded);
    registry = mergeRegistrySnapshots(registry, registrySnapshot(loaded.pkg, loaded.releaseHash));
  }
  return { packages, registry };
}
