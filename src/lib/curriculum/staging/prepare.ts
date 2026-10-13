import "server-only";
import { resolve } from "node:path";
import { curriculumSchema } from "../schema";
import { LIMITS, refSchema, type Ref } from "../v2/common";
import { FILE_PACKAGE_HASH_ALGORITHM } from "../v2/file-hash";
import { filePackageHash } from "../v2/file-hash";
import { DRAFT_CHAIN_PINS } from "../catalog/contracts";
import { fail, fingerprint, parseJson, sha256 } from "../v2/json";
import { loadPackage, loadPackageChain, readRegularFile } from "../v2/reader";
import { mergeRegistrySnapshots } from "../v2/registry";
import { refKey, legacyEntities, legacyValue, type RegistrySnapshot } from "../v2/validate";
import type { CurriculumPackage } from "../v2/package";

export const STAGING_CAPABILITIES = [
  "legacy-v1-bridge",
  "multiple_choice",
  "package-media",
] as const;
export const REQUIRED_REVIEW_SCOPES = [
  "translation",
  "coverage",
  "grading",
  "compatibility",
] as const;
type Loaded = Awaited<ReturnType<typeof loadPackage>>;
function references(payload: unknown): Ref[] {
  const refs = new Map<string, Ref>();
  const walk = (v: unknown) => {
    const result = refSchema.safeParse(v);
    if (result.success) refs.set(refKey(result.data), result.data);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  // Root is an entity, not a reference. Skip its identity and provenance.
  if (payload && typeof payload === "object")
    for (const [key, value] of Object.entries(payload)) if (key !== "source") walk(value);
  return [...refs.values()];
}
function artifact({ pkg, releaseHash }: Loaded) {
  const row = (payload: unknown) => ({ payload, hash: fingerprint(payload) });
  const entities = [
    ...Object.values(pkg.public)
      .flat()
      .map((payload) => ({ ...row(payload), visibility: "public", refs: references(payload) })),
    ...[...pkg.private.rubrics, ...pkg.private.transcripts].map((payload) => ({
      ...row(payload),
      visibility: "private",
      refs: references(payload),
    })),
  ];
  for (const entity of entities) {
    const rules = pkg.private.grading.exerciseRules.filter(
      (r) => refKey(r.exerciseRef) === refKey(entity.payload as Ref),
    );
    const policies = pkg.private.grading.assessmentPolicies.filter(
      (p) => refKey(p.assessmentRef) === refKey(entity.payload as Ref),
    );
    entity.refs.push(...rules.flatMap(references), ...policies.flatMap(references));
  }
  return {
    hash: releaseHash,
    manifest: pkg.manifest,
    entities,
    grading: pkg.private.grading.exerciseRules.map(row),
    policies: pkg.private.grading.assessmentPolicies.map(row),
    mappings: pkg.compatibility.map(row),
  };
}
type ArchivedArtifact = ReturnType<typeof artifact> & {
  files: { path: string; sha256: string; byteLength: number; base64: string }[];
};
export type ImportPlan = {
  candidateHash: string;
  artifacts: ArchivedArtifact[];
  legacySourceHash: string;
  legacyOrigins: { kind: string; id: string; pointer: string; hash: string }[];
};
export type PreparedImport = {
  plan: ImportPlan;
  manifest: CurriculumPackage["manifest"];
  summary: {
    contentVersion: string;
    packageHash: string;
    hashAlgorithm: string;
    sealed: true;
    active: false;
    entities: number;
    gradingBindings: number;
    compatibilityMappings: number;
    sourceArtifacts: number;
    requiredReviews: typeof REQUIRED_REVIEW_SCOPES;
  };
};

/** Trusted local tooling only. No database/network writes; all bytes are re-read for every action. */
export async function prepareSealedImport(
  directory: string,
  ancestors: string[],
  registry?: RegistrySnapshot,
): Promise<PreparedImport> {
  const bytes = await readRegularFile(
    resolve("src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const legacy = curriculumSchema.parse(parseJson(bytes, "v1 baseline"));
  if (sha256(bytes) !== "eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3")
    fail("legacy-pin", "baseline", "The unchanged 1.0.0 baseline is required");
  const options = { legacy, legacyHash: sha256(bytes), registry };
  const chain = await loadPackageChain(ancestors, options);
  const sourceRegistry = mergeRegistrySnapshots(registry, chain.registry);
  const candidate = await loadPackage(directory, { ...options, registry: sourceRegistry });
  if (candidate.pkg.manifest.state !== "sealed")
    fail("sealed-required", "manifest/state", "Only sealed candidates can enter inactive staging");
  for (const capability of candidate.pkg.manifest.requiredCapabilities)
    if (!(STAGING_CAPABILITIES as readonly string[]).includes(capability))
      fail(
        "staging-capability",
        "manifest/requiredCapabilities",
        "A trusted staging capability is unavailable",
      );
  const loaded = [...chain.packages, candidate];
  for (const item of loaded) {
    const pin = DRAFT_CHAIN_PINS.find((pin) => pin.version === item.pkg.manifest.contentVersion);
    if (pin && pin.hash !== item.releaseHash)
      fail(
        "immutable-draft-pin",
        "manifest/contentVersion",
        "An existing draft version cannot be replaced or resealed",
      );
  }
  let totalBytes = 0;
  const artifacts: ArchivedArtifact[] = [];
  for (const [i, item] of loaded.entries()) {
    const root = resolve([...ancestors, directory][i]!);
    const files: ArchivedArtifact["files"] = [];
    for (const path of ["manifest.json", ...item.pkg.manifest.files.map((file) => file.path)]) {
      const bytes = await readRegularFile(resolve(root, path), LIMITS.assetBytes);
      totalBytes += bytes.length;
      if (totalBytes > 32 * 1024 * 1024)
        fail(
          "staging-archive-budget",
          "files",
          "D2 embedded archives are limited to 32 MiB per plan",
        );
      files.push({
        path,
        sha256: sha256(bytes),
        byteLength: bytes.length,
        base64: bytes.toString("base64"),
      });
    }
    if (filePackageHash(files) !== item.releaseHash)
      fail("archive-race", "files", "Package bytes changed during preparation");
    artifacts.push({ ...artifact(item), files });
  }
  const legacyIndex = legacyEntities(legacy).index;
  const origins = new Map<string, ImportPlan["legacyOrigins"][number]>();
  for (const item of loaded)
    for (const entry of item.pkg.compatibility)
      if (entry.from.schemaVersion === 1) {
        const origin = {
          kind: entry.from.kind,
          id: entry.from.id,
          pointer: entry.from.pointer ?? "",
          hash: fingerprint(legacyValue(legacyIndex, entry.from)),
        };
        origins.set(`${origin.kind}:${origin.id}:${origin.pointer}`, origin);
      }
  const plan = {
    candidateHash: candidate.releaseHash,
    artifacts,
    legacySourceHash: sha256(bytes),
    legacyOrigins: [...origins.values()],
  };
  return {
    plan,
    manifest: candidate.pkg.manifest,
    summary: {
      contentVersion: candidate.pkg.manifest.contentVersion,
      packageHash: candidate.releaseHash,
      hashAlgorithm: FILE_PACKAGE_HASH_ALGORITHM,
      sealed: true,
      active: false,
      entities: plan.artifacts.at(-1)!.entities.length,
      gradingBindings: candidate.pkg.private.grading.exerciseRules.length,
      compatibilityMappings: candidate.pkg.compatibility.length,
      sourceArtifacts: chain.packages.length,
      requiredReviews: REQUIRED_REVIEW_SCOPES,
    },
  };
}
