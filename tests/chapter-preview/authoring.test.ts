// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { chapterFixture, mapping, authored, grading } from "./fixtures";
import {
  appendChapterPack,
  validateChapterSource,
} from "../../src/lib/curriculum/v2/chapter-authoring";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sha256 } from "../../src/lib/curriculum/v2/json";
import { writeDraft, loadPackage, loadPackageChain } from "../../src/lib/curriculum/v2/files";
import { media, options } from "../curriculum-v2/fixtures";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
let root: string, fixture: Awaited<ReturnType<typeof chapterFixture>>;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "linguatrack-chapter-"));
  fixture = await chapterFixture(root);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
describe("inactive complete chapter authoring", () => {
  it("preserves every existing identity, slug, question, key, compatibility entry and pass rule", () => {
    const { pkg, source } = fixture;
    for (const [name, values] of Object.entries(source.pkg.public))
      for (const old of values) {
        const found = pkg.public[name as keyof typeof pkg.public].find((e) => e.id === old.id)!;
        expect(found.kind).toBe(old.kind);
        if ("slug" in old) expect(found).toMatchObject({ slug: old.slug });
        if (old.kind === "exercise") expect(found).toEqual(old);
        else
          expect(found.revision).toBe(
            old.revision +
              (["general-a1", "a1-chapter-1"].includes(old.id) ||
              ["lesson", "block", "assessment"].includes(old.kind)
                ? 1
                : 0),
          );
      }
    expect(pkg.private.grading.exerciseRules.slice(0, 19)).toEqual(
      source.pkg.private.grading.exerciseRules,
    );
    expect(pkg.compatibility.slice(0, source.pkg.compatibility.length)).toEqual(
      source.pkg.compatibility,
    );
    const old = source.pkg.private.grading.assessmentPolicies[0]!,
      next = pkg.private.grading.assessmentPolicies[0]!;
    expect(next).toEqual({
      ...old,
      assessmentRef: { ...old.assessmentRef, revision: old.assessmentRef.revision + 1 },
      policyRevision: old.policyRevision + 1,
    });
    expect(next.passPercent).toBe(80);
    expect(pkg.manifest.state).toBe("draft");
    expect(pkg.manifest.cefrAwarding).toBe("disabled");
    expect(pkg.manifest.legacyLocaleExceptions).toHaveLength(55);
    expect(
      pkg.compatibility
        .filter((m) => m.to.contentVersion === "1.4.0")
        .every((m) => m.reviewStatus === "pending"),
    ).toBe(true);
    const completion = pkg.compatibility.filter(
      (m) =>
        m.from.schemaVersion === 2 &&
        m.from.contentVersion === "1.3.0" &&
        m.to.ref.kind === "lesson",
    );
    expect(
      completion
        .filter((m) => m.completion === "requires_recompletion")
        .map((m) => m.to.ref.id)
        .sort(),
    ).toEqual(["a1-c1-be", "a1-c1-check", "a1-c1-introductions"]);
  });
  it("maps all 41 source questions/options/keys exactly and adds complete bilingual feedback", async () => {
    const bytes = await readFile(mapping.sourceFile);
    expect(sha256(bytes)).toBe(mapping.sourceSha256);
    const text = bytes.toString();
    expect(() => validateChapterSource(text, authored, grading, mapping)).not.toThrow();
    const wrongKey = structuredClone(grading);
    wrongKey.exerciseRules[0]!.correctOptionIds = ["a1-c1-pack-v01-b"];
    expect(() => validateChapterSource(text, authored, wrongKey, mapping)).toThrow(/source-key/);
    const dropped = structuredClone(authored);
    dropped.exercises.shift();
    expect(() => validateChapterSource(text, dropped, grading, mapping)).toThrow(/source-question/);
    const noAudioGate = structuredClone(mapping);
    noAudioGate.questions.find((q) => q.sourceId === "L1")!.awaitingAudio = false;
    expect(() => validateChapterSource(text, authored, grading, noAudioGate)).toThrow(
      /source-inventory/,
    );
    const questions = [
      ...text.matchAll(/\*\*([VGLRT]\d+)\.\*\*\s*([\s\S]*?)(?=\n\n|\n###|\n##|$)/g),
    ];
    const keys = new Map(
      [...text.matchAll(/^\| ([VGLRT]\d+) \| ([ABC]) \|/gm)].map((m) => [m[1], m[2]]),
    );
    expect(questions).toHaveLength(41);
    expect(mapping.questions).toHaveLength(41);
    for (const m of questions) {
      const map = mapping.questions.find((q) => q.sourceId === m[1])!;
      const q = fixture.pkg.public.exercises.find((e) => e.id === map.exerciseId)!;
      if (q.type !== "multiple_choice") throw new Error("Expected MCQ");
      const prose = m[2]!.replaceAll("`", "").replaceAll("\n", " ").trim();
      const parts = prose.split(/\s+A\.\s+/);
      const choices = parts[1]!
        .split(/\s*\|?\s+[BC]\.\s+/)
        .map((s) => s.trim().replace(/\s*\|$/, ""));
      expect(q.prompt.text).toBe(parts[0]);
      expect(q.options.map((o) => o.text.text)).toEqual(choices);
      const rule = fixture.pkg.private.grading.exerciseRules.find(
        (r) => r.exerciseRef.id === q.id,
      )!;
      if (rule.type !== "multiple_choice") throw new Error("Expected MCQ key");
      expect(rule.correctOptionIds).toEqual([map.exerciseId + "-" + keys.get(m[1])!.toLowerCase()]);
      expect(rule.explanation.my).toMatch(/[\u1000-\u109f]/);
    }
    expect(authored.exercises.filter((e) => e.type === "reading_comprehension")).toHaveLength(2);
    expect(
      authored.exercises
        .filter((e) => e.id.startsWith("a1-c1-pack-g"))
        .every((e) => e.tags.coreSkills.length === 0),
    ).toBe(true);
    expect(mapping.questions.filter((q) => q.awaitingAudio)).toHaveLength(8);
    expect(authored.assets).toEqual([]);
    expect(
      authored.lessons
        .filter((l) => l.tags.areas.includes("listening"))
        .every((l) => l.tags.coreSkills.length === 0),
    ).toBe(true);
    expect(
      authored.lessons
        .filter((l) => l.tags.areas.some((a) => ["speaking", "writing"].includes(a)))
        .every((l) => l.completionPolicy.type === "self_reported"),
    ).toBe(true);
    expect(JSON.stringify(authored)).not.toMatch(/correctOptionIds|gradingRevision|graderVersion/);
  });
  it("creates a new package via the CLI, supports repeated read-only checks and refuses overwrites", async () => {
    const output = join(root, ".curriculum-drafts", "cli-1.4.0");
    const args = [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/curriculum/author-chapter.ts",
      "--source",
      join(root, ".curriculum-drafts", "1.3.0"),
      "--against",
      join(root, ".curriculum-drafts", "1.1.0"),
      "--against",
      join(root, ".curriculum-drafts", "1.2.0"),
      "--out",
      output,
    ];
    const run = promisify(execFile);
    expect(JSON.parse((await run(process.execPath, args)).stdout)).toMatchObject({
      sourcesUnchanged: true,
      activation: false,
      newQuestions: 41,
      readOnlyCheck: false,
    });
    for (let i = 0; i < 2; i++)
      expect(JSON.parse((await run(process.execPath, [...args, "--check"])).stdout)).toMatchObject({
        readOnlyCheck: true,
        releaseHash: "e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67",
      });
    await expect(run(process.execPath, args)).rejects.toThrow(/EEXIST/);
  }, 30_000);
  it("writes exclusively and rejects conflicts, reference failures and key leakage", async () => {
    const path = join(root, ".curriculum-drafts", "1.4.0");
    await writeDraft(path, fixture.pkg, media);
    const loaded = await loadPackage(path, { ...options, registry: fixture.chain.registry });
    expect(loaded.releaseHash).toBe(
      "e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67",
    );
    await expect(writeDraft(path, fixture.pkg, media)).rejects.toThrow();
    const chain = await loadPackageChain(
      ["1.1.0", "1.2.0", "1.3.0"].map((v) => join(root, ".curriculum-drafts", v)),
      options,
    );
    expect(chain.packages.map((p) => p.releaseHash)).toEqual(
      fixture.chain.packages.map((p) => p.releaseHash),
    );
    const bad = structuredClone(fixture.pkg);
    bad.public.lessons[0]!.blockRefs[0]!.revision = 999;
    expect(() => validatePackage(bad, { ...options, registry: fixture.chain.registry })).toThrow(
      /reference/,
    );
    expect(() =>
      appendChapterPack(
        fixture.source.pkg,
        { ...authored, blocks: [{ ...authored.blocks[0], correctOptionIds: ["x"] }] },
        grading,
        mapping,
        {
          contentVersion: "1.4.0",
          sourceDigest: fixture.source.releaseHash,
          createdAt: fixture.pkg.manifest.createdAt,
        },
      ),
    ).toThrow();
    const keys = structuredClone(fixture.pkg);
    const rule = keys.private.grading.exerciseRules.at(-1)!;
    if (rule.type === "multiple_choice") rule.correctOptionIds = ["missing"];
    expect(() => validatePackage(keys, { ...options, registry: fixture.chain.registry })).toThrow(
      /answer-key/,
    );
  });
});
