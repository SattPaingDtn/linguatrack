import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { curriculumSchema } from "../../src/lib/curriculum/schema";
import { loadPackageChain } from "../../src/lib/curriculum/v2/reader";
import { publicProjection } from "../../src/lib/curriculum/v2/projection";
import { ContentValidationError, sha256 } from "../../src/lib/curriculum/v2/json";
import { createLearningCatalog } from "../../src/lib/platform/catalog";
import { assertExistingDraftPin } from "../../src/lib/platform/validated-drafts";

async function main() {
  if (process.argv.length > 2) throw new Error("This read-only command takes no arguments.");
  const bytes = await readFile("src/content/v1/curriculum.json");
  const legacyHash = sha256(bytes);
  if (legacyHash !== "eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3")
    throw new Error("Unchanged v1 baseline required.");
  const versions = (await readdir(".curriculum-drafts", { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => {
      const aa = a.split(".").map(Number),
        bb = b.split(".").map(Number);
      return aa[0]! - bb[0]! || aa[1]! - bb[1]! || aa[2]! - bb[2]!;
    });
  const chain = await loadPackageChain(
    versions.map((v) => resolve(".curriculum-drafts", v)),
    {
      legacy: curriculumSchema.parse(JSON.parse(bytes.toString())),
      legacyHash,
    },
  );
  if (!chain.packages.length) throw new Error("No versioned drafts found.");
  for (const loaded of chain.packages)
    assertExistingDraftPin(loaded.pkg.manifest.contentVersion, loaded.releaseHash);
  const latest = chain.packages.at(-1)!;
  const catalog = createLearningCatalog(publicProjection(latest.pkg), latest.releaseHash);
  const exerciseTypes: Record<string, number> = {};
  for (const exercise of latest.pkg.public.exercises)
    exerciseTypes[exercise.type] = (exerciseTypes[exercise.type] ?? 0) + 1;
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        databaseContacted: false,
        learnerAccessEnabled: false,
        releases: chain.packages.map(({ pkg, releaseHash }) => ({
          contentVersion: pkg.manifest.contentVersion,
          releaseHash,
          state: pkg.manifest.state,
          publishedByThisTool: false,
          pendingLocaleExceptions: pkg.manifest.legacyLocaleExceptions.filter(
            (e) => e.reviewStatus !== "approved",
          ).length,
          pendingCandidateMappings: pkg.compatibility.filter(
            (e) =>
              e.to.contentVersion === pkg.manifest.contentVersion && e.reviewStatus !== "approved",
          ).length,
          authenticatedReviewStatus: "not-queried-author-claims-ignored",
        })),
        latest: catalog.release(),
        courses: catalog.courses().map((c) => ({
          level: c.level,
          id: c.ref.id,
          slug: c.slug,
          status: c.status,
          chapters: c.chapters.map((ch) => ({
            id: ch.ref.id,
            slug: ch.slug,
            lessons: ch.lessons.map((l) => {
              const dto = catalog.lesson(l.ref);
              return {
                id: l.ref.id,
                revision: l.ref.revision,
                slug: l.slug,
                proposedHref: l.proposedHref,
                blockTypes: dto.blocks.map((b) => b.type),
                exerciseCount: dto.exercises.length,
                availability: dto.availability,
              };
            }),
          })),
        })),
        exerciseTypes,
        remaining: [
          "local authenticated main-site adapter",
          "v2 interactive exercise controls",
          "writing draft saves",
          "owner-scoped local recording storage",
          "assessment runtime",
          "hosted schema/restore verification",
          "independent reviews",
          "authorized activation",
        ],
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  // Do not print raw tuples, author text, grading rules or credentials in diagnostic output.
  console.error(
    JSON.stringify({
      valid: false,
      error: "platform-read-only-audit-failed",
      ...(error instanceof ContentValidationError
        ? { diagnostics: error.diagnostics.map(({ code, path }) => ({ code, path })) }
        : {}),
    }),
  );
  process.exitCode = 1;
});
