// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/learning/server", () => {
  throw new Error("D1 cannot import persistence");
});
vi.mock("@/lib/supabase/server", () => {
  throw new Error("D1 cannot import Supabase");
});
import { loadReadOnlyCatalog, type ReadOnlyCatalog } from "../../src/lib/curriculum/catalog/server";
import { DRAFT_CHAIN_PINS } from "../../src/lib/curriculum/catalog/contracts";
import { visibleDraftEntities } from "../../src/lib/curriculum/catalog/public-entities";
import { ref } from "../../src/lib/curriculum/v2/common";
import { canonicalJson, fingerprint, sha256 } from "../../src/lib/curriculum/v2/json";
import {
  filePackageHash,
  FILE_PACKAGE_HASH_ALGORITHM,
} from "../../src/lib/curriculum/v2/file-hash";
import { registrySnapshot } from "../../src/lib/curriculum/v2/validate";
import { fixtureCatalog } from "./fixtures";
import { canonical } from "../fixtures";
import type { CurriculumPackage } from "../../src/lib/curriculum/v2/package";

let root: string;
let catalog: ReadOnlyCatalog;
let pkg: CurriculumPackage;
beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "linguatrack-d1-"));
  const chain = await fixtureCatalog(root);
  expect(chain.packages.map((p) => p.releaseHash)).toEqual(DRAFT_CHAIN_PINS.map((p) => p.hash));
  pkg = chain.packages[2]!.pkg;
  catalog = await loadReadOnlyCatalog(root);
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
const legacyRef = (kind: string, id: string) => ({
  schemaVersion: 1,
  contentVersion: "1.0.0",
  kind,
  id,
});
const draftRef = (kind: Parameters<typeof ref>[0], id: string, revision: number) => ({
  schemaVersion: 2,
  contentVersion: "1.3.0",
  ref: ref(kind, id, revision),
});

describe("read-only dual-version catalog", () => {
  it("resolves every original ID, slug and ordered quiz option through both versions", () => {
    for (const course of canonical.courses) {
      expect(catalog.resolve(legacyRef("course", course.id)).entity).toMatchObject({
        id: course.id,
        slug: course.slug,
      });
      const target = pkg.public.courses.find((c) => c.id === course.id)!;
      expect(catalog.resolve(draftRef("course", course.id, target.revision)).entity).toMatchObject({
        id: course.id,
        slug: course.slug,
      });
      for (const chapter of course.chapters) {
        expect(catalog.resolve(legacyRef("chapter", chapter.id)).entity).toMatchObject({
          slug: chapter.slug,
        });
        for (const lesson of chapter.lessons) {
          expect(catalog.resolve(legacyRef("lesson", lesson.id)).entity).toMatchObject({
            slug: lesson.slug,
          });
          const target = pkg.public.lessons.find((l) => l.id === lesson.id)!;
          expect(
            catalog.resolve(draftRef("lesson", lesson.id, target.revision)).entity,
          ).toMatchObject({ slug: lesson.slug });
          for (const block of lesson.blocks) {
            expect(catalog.resolve(legacyRef("block", block.id)).entity.id).toBe(block.id);
            const target = pkg.public.blocks.find((b) => b.id === block.id)!;
            expect(catalog.resolve(draftRef("block", block.id, target.revision)).entity.id).toBe(
              block.id,
            );
            if (block.type === "quiz")
              for (const q of block.questions) {
                expect(catalog.resolve(legacyRef("question", q.id)).entity).toMatchObject({
                  options: q.options,
                });
                const resolved = catalog.resolve(draftRef("exercise", q.id, 1)).entity;
                expect(
                  "type" in resolved &&
                    resolved.type === "multiple_choice" &&
                    resolved.options.map((o) => ({ id: o.id, text: o.text.text })),
                ).toEqual(q.options);
              }
          }
        }
      }
    }
    expect(catalog.resolve(draftRef("lesson", "a1-c1-subject-pronouns", 2)).entity).toMatchObject({
      slug: "subject-pronouns-and-sentences",
    });
  });
  it("requires exact release, format, kind and revision, with no latest/fallback alias", () => {
    for (const invalid of [
      { ...legacyRef("lesson", "a1-c1-be"), contentVersion: "1.3.0" },
      { ...draftRef("lesson", "a1-c1-be", 3), contentVersion: "latest" },
      draftRef("lesson", "a1-c1-be", 1),
      draftRef("block", "a1-c1-be", 3),
      legacyRef("lesson", "a1-c1-subject-pronouns"),
      { ...draftRef("lesson", "a1-c1-subject-pronouns", 2), path: "private/grading.json" },
    ])
      expect(() => catalog.resolve(invalid)).toThrow();
    expect(() => catalog.references({ schemaVersion: 2, contentVersion: "1.2.0" })).toThrow();
    expect(catalog.releases()[1]).toMatchObject({
      state: "inactive-draft",
      publicationApproval: "unapproved",
      hashAlgorithm: FILE_PACKAGE_HASH_ALGORITHM,
    });
    expect(catalog.resolve(draftRef("lesson", "a1-c1-subject-pronouns", 2)).release).toMatchObject({
      state: "inactive-draft",
      publicationApproval: "unapproved",
    });
  });
  it("returns detached public entities and no keys, grading feedback or internal inventories", () => {
    const values = [1, 2].flatMap((schemaVersion) =>
      catalog
        .references({ schemaVersion, contentVersion: schemaVersion === 1 ? "1.0.0" : "1.3.0" })
        .map((r) => catalog.resolve(r)),
    );
    const serialized = JSON.stringify(values);
    for (const key of [
      "correctOptionId",
      "correctOptionIds",
      "assessmentPolicies",
      "gradingRevision",
      "acceptedPairs",
      "acceptedOrders",
      "markingNotes",
      "legacyLocaleExceptions",
      "compatibility",
    ])
      expect(serialized).not.toContain(`"${key}"`);
    for (const rule of pkg.private.grading.exerciseRules)
      expect(serialized).not.toContain(rule.explanation.en);
    expect(() => catalog.resolve(draftRef("rubric", "private-rubric", 1))).toThrow(
      /catalog-reference/,
    );
    const result = catalog.resolve(draftRef("lesson", "a1-c1-subject-pronouns", 2));
    result.entity.id = "caller-mutation";
    expect(catalog.resolve(draftRef("lesson", "a1-c1-subject-pronouns", 2)).entity.id).toBe(
      "a1-c1-subject-pronouns",
    );
  });
  it("denies conditional/reviewer-only and unreferenced transcripts, including public collection entries", () => {
    const altered = structuredClone(pkg);
    const listening = altered.public.stimuli.find((s) => s.type === "listening")!;
    if (listening.type !== "listening") throw new Error("Missing fixture");
    const transcript = altered.public.transcripts[0]!;
    for (const access of ["after_submission", "reviewer_only"] as const) {
      listening.transcriptAccess = access;
      expect(visibleDraftEntities(altered)).not.toContainEqual(transcript);
    }
    listening.transcriptAccess = "always";
    expect(visibleDraftEntities(altered)).toContainEqual(transcript);
    altered.public.transcripts.push({ ...transcript, id: "orphan-transcript" });
    expect(visibleDraftEntities(altered).some((e) => e.id === "orphan-transcript")).toBe(false);
    altered.private.transcripts.push({ ...transcript, id: "private-transcript" });
    expect(visibleDraftEntities(altered).some((e) => e.id === "private-transcript")).toBe(false);
  });
  it("fails closed on changed/missing pinned files without altering them", async () => {
    const path = resolve(root, "src/content/public/v1/curriculum.json");
    const original = await readFile(path);
    await writeFile(path, "{}");
    await expect(loadReadOnlyCatalog(root)).rejects.toThrow(/catalog-v1-pin/);
    await writeFile(path, original);
    const manifestPath = resolve(root, ".curriculum-drafts/1.3.0/manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString());
    manifest.createdAt = "2026-10-13T00:00:00.000Z";
    await writeFile(manifestPath, canonicalJson(manifest));
    await expect(loadReadOnlyCatalog(root)).rejects.toThrow(/catalog-draft-pin/);
    await writeFile(manifestPath, manifestBytes);
    await expect(loadReadOnlyCatalog(resolve(root, "missing"))).rejects.toThrow(/missing-file/);
  });
});

describe("exact file-package hash identity", () => {
  it("matches all existing validated pins including manifest bytes, not parsed-object fingerprints", async () => {
    for (const pin of DRAFT_CHAIN_PINS) {
      const directory = resolve(root, ".curriculum-drafts", pin.version);
      const manifestBytes = await readFile(resolve(directory, "manifest.json"));
      const manifest = JSON.parse(manifestBytes.toString());
      const entries = [{ path: "manifest.json", sha256: sha256(manifestBytes) }];
      for (const f of manifest.files)
        entries.push({ path: f.path, sha256: sha256(await readFile(resolve(directory, f.path))) });
      const before = canonicalJson(entries);
      expect(filePackageHash(entries)).toBe(pin.hash);
      expect(filePackageHash([...entries].reverse())).toBe(pin.hash);
      expect(canonicalJson(entries)).toBe(before);
      entries[0]!.sha256 = "a".repeat(64);
      expect(filePackageHash(entries)).not.toBe(pin.hash);
    }
    expect(fingerprint(pkg)).not.toBe(DRAFT_CHAIN_PINS[2].hash);
    expect(registrySnapshot(pkg, DRAFT_CHAIN_PINS[2].hash).releases[0]!.hash).toBe(
      DRAFT_CHAIN_PINS[2].hash,
    );
  });
  it("rejects duplicate/unsafe digests and inventories omitting the manifest", () => {
    const manifest = { path: "manifest.json", sha256: "a".repeat(64) };
    expect(() => filePackageHash([manifest, manifest])).toThrow(/duplicate-file-digest/);
    expect(() => filePackageHash([{ ...manifest, path: "../manifest.json" }])).toThrow(
      /file-digest/,
    );
    expect(() => filePackageHash([{ ...manifest, sha256: "not-a-hash" }])).toThrow(/file-digest/);
    expect(() => filePackageHash([{ ...manifest, path: "public/lessons.json" }])).toThrow(
      /manifest-digest/,
    );
  });
});
