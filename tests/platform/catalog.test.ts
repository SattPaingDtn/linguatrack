// @vitest-environment node
import { beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { resolve } from "node:path";
import { createLearningCatalog } from "@/lib/platform/catalog";
import { assertExistingDraftPin } from "@/lib/platform/validated-drafts";
import { publicProjection } from "@/lib/curriculum/v2/projection";
import { loadPackageChain } from "@/lib/curriculum/v2/reader";
import { bridge, options } from "../curriculum-v2/fixtures";
import type { CurriculumPackage } from "@/lib/curriculum/v2/package";
let pkg: CurriculumPackage, hash: string;
beforeAll(async () => {
  const chain = await loadPackageChain(
    Array.from({ length: 8 }, (_, i) => resolve(".curriculum-drafts", `1.${i + 1}.0`)),
    options,
  );
  ({ pkg, releaseHash: hash } = chain.packages.at(-1)!);
});
it("resolves all current levels, chapters and exact lesson references without special lesson IDs", () => {
  const catalog = createLearningCatalog(publicProjection(pkg), hash);
  expect(catalog.courses().map((c) => c.level)).toEqual(["A1", "A2", "B1", "B2", "C1"]);
  const a1 = catalog.courses().find((c) => c.level === "A1")!;
  expect(a1.chapters).toHaveLength(6);
  for (const chapter of a1.chapters)
    for (const lesson of chapter.lessons) {
      const dto = catalog.lesson(lesson.ref);
      expect(dto.lesson.id).toBe(lesson.ref.id);
      expect(dto.blocks.map((b) => ({ kind: b.kind, id: b.id, revision: b.revision }))).toEqual(
        dto.lesson.blockRefs,
      );
      expect(lesson.proposedHref).toBe(
        `/courses/${a1.slug}/chapters/${chapter.slug}/lessons/${lesson.slug}`,
      );
      expect(dto.release).toMatchObject({
        releaseHash: hash,
        publication: "unpublished",
        persistence: "not-enabled",
      });
      expect(dto.availability.learning).toBe("not-enabled");
    }
});
it("navigates through chapter boundaries and keeps drafts unapproved", () => {
  const catalog = createLearningCatalog(publicProjection(pkg), hash);
  const a1 = catalog.courses()[0]!,
    first = a1.chapters[0]!.lessons[0]!,
    last = a1.chapters[0]!.lessons.at(-1)!;
  expect(catalog.lesson(first.ref).navigation.previous).toBeNull();
  expect(catalog.lesson(last.ref).navigation.next?.ref).toEqual(a1.chapters[1]!.lessons[0]!.ref);
  const final = a1.chapters.at(-1)!.lessons.at(-1)!;
  expect(catalog.lesson(final.ref).navigation.next).toBeNull();
  expect(pkg.manifest.editorialApprovals).toEqual([]);
});
it("preserves revisions/order, rejects private inputs, missing refs and slug collisions", () => {
  const projection = publicProjection(pkg),
    catalog = createLearningCatalog(projection, hash);
  const pronouns = pkg.public.lessons.find((l) => l.id === "a1-c1-subject-pronouns")!;
  const dto = catalog.lesson({ kind: "lesson", id: pronouns.id, revision: pronouns.revision });
  expect(dto.exercises.filter((e) => e.type === "multiple_choice")).toHaveLength(14);
  expect(() =>
    catalog.lesson({ kind: "lesson", id: pronouns.id, revision: pronouns.revision + 1 }),
  ).toThrow(/reference/);
  expect(() => createLearningCatalog({ ...projection, private: pkg.private }, hash)).toThrow();
  const bad = structuredClone(projection);
  bad.content.courses[0]!.chapterRefs[0]!.revision = 9999;
  expect(() => createLearningCatalog(bad, hash)).toThrow(/reference/);
  const collision = structuredClone(projection);
  const c = collision.content.chapters[0]!;
  const [a, b] = c.lessonRefs.map((r) =>
    collision.content.lessons.find((l) => l.id === r.id && l.revision === r.revision)!,
  ) as [typeof pronouns, typeof pronouns];
  b.slug = a.slug;
  expect(() => createLearningCatalog(collision, hash)).toThrow(/slug/);
});
it("omits conditional/private transcript text and leaves unsourced listening audio pending", () => {
  const sample = bridge(),
    stimulus = sample.public.stimuli.find((s) => s.type === "listening")!;
  if (stimulus.type !== "listening") throw new Error("Expected listening");
  stimulus.transcriptAccess = "after_submission";
  const transcript = sample.public.transcripts.find((t) => t.id === stimulus.transcriptRef.id)!;
  transcript.text = "HIDDEN_TRANSCRIPT_SENTINEL";
  const catalog = createLearningCatalog(publicProjection(sample), "a".repeat(64));
  const l = sample.public.lessons.find((l) =>
    l.blockRefs.some((r) =>
      sample.public.blocks.some((b) => b.id === r.id && b.type === "listening"),
    ),
  )!;
  const dto = catalog.lesson({ kind: "lesson", id: l.id, revision: l.revision });
  expect(JSON.stringify(dto)).not.toMatch(
    /HIDDEN_TRANSCRIPT_SENTINEL|correctOptionIds|acceptedByBlank|markingNotes|gradingRevision/,
  );
  expect(dto.transcripts).toEqual([]);
  const expanded = createLearningCatalog(publicProjection(pkg), hash);
  const scripts = pkg.public.lessons.find((l) => l.id === "a1-c2-family-scripts")!;
  expect(
    expanded.lesson({ kind: "lesson", id: scripts.id, revision: scripts.revision }).availability
      .audio,
  ).toBe("audio-pending");
});
it("returns isolated DTO copies and never carries or edits learning history", () => {
  const catalog = createLearningCatalog(publicProjection(pkg), hash),
    courses = catalog.courses();
  const first = courses[0]!.chapters[0]!.lessons[0]!;
  const dto = catalog.lesson(first.ref),
    before = JSON.stringify(catalog.lesson(first.ref));
  dto.blocks.reverse();
  dto.lesson.slug = "changed";
  courses[0]!.chapters = [];
  expect(JSON.stringify(catalog.lesson(first.ref))).toBe(before);
  expect(catalog.courses()[0]!.chapters.length).toBeGreaterThan(0);
  expect(Object.keys(catalog)).toEqual(["release", "courses", "lesson"]);
});
it("rejects an altered existing draft hash without treating a pin as approval", () => {
  expect(() => assertExistingDraftPin("1.8.0", hash)).not.toThrow();
  expect(() => assertExistingDraftPin("1.8.0", "a".repeat(64))).toThrow(/immutable/);
});
