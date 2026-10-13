// @vitest-environment node
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect } from "vitest";
import { manuscriptFixture } from "./fixtures";
import { MANUSCRIPT_CHAPTERS } from "@/lib/curriculum/manuscript-preview/config";
import {
  validateManuscriptSource,
  appendManuscriptChapter,
} from "@/lib/curriculum/v2/manuscript-authoring";
import { publicCollectionsSchema } from "@/lib/curriculum/v2/public";
import { gradingSchema } from "@/lib/curriculum/v2/private";
import { validatePackage } from "@/lib/curriculum/v2/validate";
import { writeDraft } from "@/lib/curriculum/v2/files";
import { media, options } from "../curriculum-v2/fixtures";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
let root: string, f: Awaited<ReturnType<typeof manuscriptFixture>>;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "linguatrack-manuscript-"));
  f = await manuscriptFixture(root, Math.max(...MANUSCRIPT_CHAPTERS.map((c) => c.number)));
}, 30000);
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
it("preserves all older teaching, identity, keys, 80% behavior and negative compatibility decisions through each sequential draft", () => {
  for (const { pkg, source } of f.stages) {
    for (const [name, entities] of Object.entries(source.pkg.public))
      for (const old of entities) {
        const next = pkg.public[name as keyof typeof pkg.public].find((e) => e.id === old.id)!;
        const semantic = (v: unknown): unknown =>
          Array.isArray(v)
            ? v.map(semantic)
            : v && typeof v === "object"
              ? Object.fromEntries(
                  Object.entries(v)
                    .filter(
                      ([k]) =>
                        k !== "revision" && !(old.id === "general-a1" && k === "chapterRefs"),
                    )
                    .map(([k, val]) => [k, semantic(val)]),
                )
              : v;
        expect(semantic(next)).toEqual(semantic(old));
        if (old.kind === "exercise") expect(next).toEqual(old);
      }
    expect(
      pkg.private.grading.exerciseRules.slice(0, source.pkg.private.grading.exerciseRules.length),
    ).toEqual(source.pkg.private.grading.exerciseRules);
    expect(pkg.private.grading.assessmentPolicies[0]!.passPercent).toBe(80);
    expect(pkg.manifest.cefrAwarding).toBe("disabled");
    expect(pkg.manifest.editorialApprovals).toEqual([]);
    expect(pkg.manifest.legacyLocaleExceptions).toHaveLength(55);
    expect(pkg.compatibility.slice(0, source.pkg.compatibility.length)).toEqual(
      source.pkg.compatibility,
    );
    for (const old of source.pkg.compatibility.filter(
      (m) => m.to.contentVersion === source.pkg.manifest.contentVersion,
    )) {
      const inherited = pkg.compatibility.find(
        (m) =>
          m.to.contentVersion === pkg.manifest.contentVersion &&
          JSON.stringify(m.from) === JSON.stringify(old.from),
      )!;
      expect(inherited).toMatchObject({
        completion: old.completion,
        evidence: old.evidence,
        resume: old.resume,
        reviewStatus: "pending",
      });
    }
  }
});
it("validates every numbered source activity, bilingual feedback, exact option mapping and honest self-review/audio status", async () => {
  for (const [index, stage] of f.stages.entries()) {
    const cfg = MANUSCRIPT_CHAPTERS[index]!;
    const markdown = await readFile(
      `content-authoring/A1_Chapter_0${cfg.number}_Full_Lesson_Pack.md`,
      "utf8",
    );
    validateManuscriptSource(markdown, stage.authored, stage.grading, stage.metadata);
    const p = publicCollectionsSchema.parse(stage.authored),
      g = gradingSchema.parse(stage.grading);
    expect(p.lessons).toHaveLength(7);
    expect(p.exercises.filter((e) => e.type === "multiple_choice")).toHaveLength(12);
    expect(p.exercises.filter((e) => e.type === "fill_in_blank")).toHaveLength(9);
    expect(p.lessons.every((l) => l.completionPolicy.type === "self_reported")).toBe(true);
    expect(p.assets).toEqual([]);
    expect(
      p.exercises
        .filter((e) => e.type === "multiple_choice")
        .every((e) => e.tags.coreSkills.length === 0),
    ).toBe(true);
    expect(g.exerciseRules.every((r) => /[\u1000-\u109f]/.test(r.explanation.my))).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(
      /correctOptionIds|acceptedByBlank|graderVersion|PRIVATE TEACHER ANSWER KEY/,
    );
  }
});
it("rejects key/prompt leakage, mismatched examples, revision conflicts and output overwrites", async () => {
  const stage = f.stages[0]!,
    md = await readFile("content-authoring/A1_Chapter_04_Full_Lesson_Pack.md", "utf8");
  const p = publicCollectionsSchema.parse(stage.authored),
    g = gradingSchema.parse(stage.grading);
  const wrong = structuredClone(g);
  const key = wrong.exerciseRules.find((r) => r.type === "multiple_choice")!;
  if (key.type === "multiple_choice") key.correctOptionIds = ["missing"];
  expect(() => validateManuscriptSource(md, p, wrong, stage.metadata)).toThrow(/source-mcq/);
  const wrongExample = structuredClone(g);
  const short = wrongExample.exerciseRules.find((r) => r.type === "fill_in_blank")!;
  if (short.type === "fill_in_blank") short.acceptedByBlank[0]!.variants = ["Wrong"];
  expect(() => validateManuscriptSource(md, p, wrongExample, stage.metadata)).toThrow(/source-key/);
  expect(() =>
    publicCollectionsSchema.parse({
      ...p,
      exercises: [{ ...p.exercises[0], correctOptionIds: ["a"] }],
    }),
  ).toThrow();
  const invalid = structuredClone(stage.pkg);
  invalid.public.chapters.at(-1)!.lessonRefs[0]!.revision = 99;
  expect(() => validatePackage(invalid, { ...options, registry: f.chain.registry })).toThrow();
  await expect(
    writeDraft(join(root, ".curriculum-drafts", "1.6.0"), stage.pkg, media),
  ).rejects.toThrow();
  const duplicate = structuredClone(p);
  duplicate.lessons[0]!.id = "a1-c1-be";
  expect(() =>
    appendManuscriptChapter(stage.source.pkg, duplicate, g, stage.metadata, {
      contentVersion: "1.6.0",
      sourceDigest: stage.source.releaseHash,
      createdAt: stage.pkg.manifest.createdAt,
    }),
  ).toThrow(/identity/);
});
it("supports repeated no-write CLI checks and refuses an existing immutable output", async () => {
  const run = promisify(execFile);
  const cfg = MANUSCRIPT_CHAPTERS[0]!,
    args = [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/curriculum/author-a1-manuscript.ts",
      "--chapter",
      String(cfg.number),
      "--source",
      join(root, ".curriculum-drafts", "1.5.0"),
      ...Array.from({ length: 4 }, (_, i) => [
        "--against",
        join(root, ".curriculum-drafts", `1.${i + 1}.0`),
      ]).flat(),
      "--out",
      join(root, ".curriculum-drafts", "1.6.0"),
    ];
  for (let i = 0; i < 2; i++)
    expect(JSON.parse((await run(process.execPath, [...args, "--check"])).stdout)).toMatchObject({
      activation: false,
      sourcesUnchanged: true,
      readOnlyCheck: true,
      newMcqs: 12,
      readingSelfReview: 5,
      awaitingAudioQuestions: 4,
    });
  await expect(run(process.execPath, args)).rejects.toThrow(/EEXIST/);
}, 30000);
