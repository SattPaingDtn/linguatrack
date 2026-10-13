import "server-only";
import { resolve } from "node:path";
import { curriculumSchema, publicCurriculumSchema } from "../schema";
import { LIMITS } from "../v2/common";
import { FILE_PACKAGE_HASH_ALGORITHM } from "../v2/file-hash";
import { fail, parseJson, sha256 } from "../v2/json";
import { loadPackageChain, readRegularFile } from "../v2/reader";
import { publicProjection } from "../v2/projection";
import { refKey } from "../v2/validate";
import {
  catalogReferenceSchema,
  catalogReleaseSchema,
  DRAFT_CHAIN_PINS,
  type CatalogReference,
} from "./contracts";
import { legacyPublicEntities, visibleDraftEntities } from "./public-entities";
import { buildHistoryCompatibilityReport } from "./report";

/** Load on explicit server/tooling demand only. Never wired to an existing route or client barrel.
 * projectRoot is a trusted filesystem root, not a URL/request parameter. No disk/network writes.
 */
export async function loadReadOnlyCatalog(projectRoot = process.cwd()) {
  const legacyBytes = await readRegularFile(
    resolve(projectRoot, "src/content/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  const publicBytes = await readRegularFile(
    resolve(projectRoot, "src/content/public/v1/curriculum.json"),
    LIMITS.jsonFileBytes,
  );
  if (
    sha256(legacyBytes) !== "eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3" ||
    sha256(publicBytes) !== "750e8f8f90903773f7387934b5aae8b3977789043a956d33eaf37d18c505836a"
  )
    fail("catalog-v1-pin", "catalog", "The read-only catalog requires the unchanged 1.0.0 files");
  const legacy = curriculumSchema.parse(parseJson(legacyBytes, "v1 canonical"));
  const publicLegacy = publicCurriculumSchema.parse(parseJson(publicBytes, "v1 public"));
  const chain = await loadPackageChain(
    DRAFT_CHAIN_PINS.map((pin) => resolve(projectRoot, ".curriculum-drafts", pin.version)),
    { legacy, legacyHash: sha256(legacyBytes) },
  );
  for (const [i, pin] of DRAFT_CHAIN_PINS.entries()) {
    const loaded = chain.packages[i];
    if (
      !loaded ||
      loaded.releaseHash !== pin.hash ||
      loaded.pkg.manifest.contentVersion !== pin.version ||
      loaded.pkg.manifest.state !== "draft"
    )
      fail(
        "catalog-draft-pin",
        "catalog",
        "The read-only catalog requires the unchanged inactive draft chain",
      );
  }
  const baseline = chain.packages[0]!.pkg;
  const draft = chain.packages[2]!;
  // Strict allowlist projection, then deny hidden/conditional transcripts even to direct lookups.
  const projected = publicProjection(draft.pkg);
  const safeEntities = visibleDraftEntities({ ...draft.pkg, public: projected.content });
  const v1 = new Map(
    legacyPublicEntities(publicLegacy).map(({ kind, entity }) => [`${kind}:${entity.id}`, entity]),
  );
  const v2 = new Map(safeEntities.map((entity) => [refKey(entity), entity]));
  const releases = [
    { schemaVersion: 1 as const, contentVersion: "1.0.0" as const, state: "existing-v1" as const },
    {
      schemaVersion: 2 as const,
      contentVersion: "1.3.0" as const,
      state: "inactive-draft" as const,
      publicationApproval: "unapproved" as const,
      filePackageHash: draft.releaseHash,
      hashAlgorithm: FILE_PACKAGE_HASH_ALGORITHM,
    },
  ];
  return Object.freeze({
    // Return independent DTOs; callers cannot mutate shared validated content.
    releases: () => structuredClone(releases),
    references: (rawRelease: unknown): CatalogReference[] => {
      const release = catalogReleaseSchema.parse(rawRelease);
      return release.schemaVersion === 1
        ? legacyPublicEntities(publicLegacy).map(({ kind, entity }) => ({
            ...release,
            kind,
            id: entity.id,
          }))
        : safeEntities.map((entity) => ({
            ...release,
            ref: { kind: entity.kind, id: entity.id, revision: entity.revision },
          }));
    },
    resolve: (rawReference: unknown) => {
      const reference = catalogReferenceSchema.parse(rawReference);
      const entity =
        reference.schemaVersion === 1
          ? v1.get(`${reference.kind}:${reference.id}`)
          : v2.get(refKey(reference.ref));
      if (!entity)
        fail(
          "catalog-reference",
          "catalog",
          "No visible entity matches this exact release/reference",
        );
      return {
        reference,
        release: structuredClone(reference.schemaVersion === 1 ? releases[0]! : releases[1]!),
        entity: structuredClone(entity),
      };
    },
    reportHistory: (rawHistory: unknown, snapshotVersion: string) =>
      buildHistoryCompatibilityReport(legacy, baseline, draft.pkg, rawHistory, snapshotVersion),
  });
}
export type ReadOnlyCatalog = Awaited<ReturnType<typeof loadReadOnlyCatalog>>;
