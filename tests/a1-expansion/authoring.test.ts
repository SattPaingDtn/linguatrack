// @vitest-environment node
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { expansionFixture, authored, grading, metadata } from "./fixtures";
import {
  parseExpansionQuestions,
  validateBatchSources,
  appendA1Chapters,
} from "../../src/lib/curriculum/v2/batch-authoring";
import { loadPackage, writeDraft, loadPackageChain } from "../../src/lib/curriculum/v2/files";
import { publicCollectionsSchema } from "../../src/lib/curriculum/v2/public";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import { media, options } from "../curriculum-v2/fixtures";
let root: string, f: Awaited<ReturnType<typeof expansionFixture>>, sources: Map<number, string>;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "linguatrack-batch-"));
  f = await expansionFixture(root);
  sources = new Map(
    await Promise.all(
      metadata.chapters.map(async (c) => [c.number, await readFile(c.sourceFile, "utf8")] as const),
    ),
  );
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
describe("local A1 batch conversion", () => {
  it("preserves the actual vocabulary, scripts, passages, speaking tasks and writing models", () => {
    const blocks = publicCollectionsSchema.parse(authored).blocks;
    for (const chapter of metadata.chapters) {
      const publicText = sources
        .get(chapter.number)!
        .split("### Answer key — TEACHER / PRIVATE ONLY")[0]!;
      const parts = publicText.split(/^## Lesson ([1-7]) — (.+)\n/m);
      const sections = new Map<number, string>();
      for (let i = 1; i < parts.length; i += 3) sections.set(Number(parts[i]), parts[i + 2]!);
      const vocabulary = blocks.find((b) => b.id === `a1-c${chapter.number}-vocabulary`)!;
      if (vocabulary.type !== "vocabulary") throw new Error("Vocabulary block missing");
      const rows = [...sections.get(1)!.matchAll(/^\| (.*?) \| (.*?) \| (.*?) \|$/gm)].slice(1);
      expect(
        vocabulary.words.map((w) => [
          w.word,
          "my" in w.meaning ? w.meaning.my : null,
          w.example.text,
        ]),
      ).toEqual(rows.map((r) => [r[1], r[2], r[3]]));
      for (const [number, kind] of [
        [3, "Dialogue"],
        [5, "Passage"],
      ] as const) {
        const groups = sections.get(number)!.split(new RegExp(`^### ${kind} (\\d): (.+)\\n`, "m"));
        for (let i = 1; i < groups.length; i += 3) {
          const body = groups[i + 2]!;
          if (number === 3) {
            const text = [...body.matchAll(/^> (.+)$/gm)].map((m) => m[1]).join("\n");
            const block = blocks.find((b) => b.id === `a1-c${chapter.number}-script-${groups[i]}`)!;
            if (block.type !== "explanation") throw new Error("Script block missing");
            expect(block.body.en).toBe(text);
          } else {
            const text = body.split("**Questions:**")[0]!.trim();
            expect(
              authored.stimuli.find(
                (s) => s.id === `a1-c${chapter.number}-reading-stimulus-${groups[i]}`,
              )!.passage.text,
            ).toBe(text);
          }
        }
      }
      const speaking = [...sections.get(4)!.matchAll(/^\d\. (.+)$/gm)];
      expect(speaking).toHaveLength(3);
      for (const [i, task] of speaking.entries()) {
        const block = blocks.find((b) => b.id === `a1-c${chapter.number}-speaking-task-${i + 1}`)!;
        if (block.type !== "speaking") throw new Error("Speaking task missing");
        expect(block.prompt.en).toContain(task[1]);
      }
      const model = sections
        .get(6)!
        .split("### Model paragraph (one possible answer)")[1]!
        .split("**မြန်မာလို:**")[0]!
        .trim();
      const block = blocks.find((b) => b.id === `a1-c${chapter.number}-writing-first-draft`)!;
      if (block.type !== "writing") throw new Error("Writing model missing");
      expect(block.modelAnswer.text).toBe(model);
      const grammar = blocks.find((b) => b.id === `a1-c${chapter.number}-grammar`)!;
      if (grammar.type !== "grammar") throw new Error("Grammar block missing");
      const original = sections
        .get(2)!
        .split("### Grammar explanation")[1]!
        .split("**မြန်မာလို:**")[0]!
        .trim()
        .replace(/`|\*\*/g, "");
      expect(grammar.rule.en).toBe(
        original.replace(
          "After a singular countable noun, use an article or another determiner:",
          "Before a singular countable noun, use an article or another determiner:",
        ),
      );
    }
  });
  it("keeps all older IDs, slugs, payloads, grades and negative compatibility semantics", () => {
    const source = f.source.pkg;
    for (const [name, items] of Object.entries(source.public))
      for (const old of items) {
        const next = f.pkg.public[name as keyof typeof source.public].find((e) => e.id === old.id)!;
        expect(next).toBeDefined();
        if ("slug" in old) expect(next).toMatchObject({ slug: old.slug });
        // Remove revision counters only; all original teaching fields and reference IDs remain exact.
        const strip = (value: unknown): unknown =>
          Array.isArray(value)
            ? value.map(strip)
            : value && typeof value === "object"
              ? Object.fromEntries(
                  Object.entries(value)
                    .filter(
                      ([k]) =>
                        k !== "revision" && !(old.id === "general-a1" && k === "chapterRefs"),
                    )
                    .map(([k, v]) => [k, strip(v)]),
                )
              : value;
        expect(strip(next)).toEqual(strip(old));
        if (old.kind === "exercise") expect(next).toEqual(old);
      }
    expect(f.pkg.private.grading.exerciseRules.slice(0, 60)).toEqual(
      source.private.grading.exerciseRules,
    );
    expect(f.pkg.private.grading.assessmentPolicies[0]).toEqual({
      ...source.private.grading.assessmentPolicies[0],
      assessmentRef: {
        ...source.private.grading.assessmentPolicies[0]!.assessmentRef,
        revision: 5,
      },
      policyRevision: 5,
    });
    expect(f.pkg.compatibility.slice(0, source.compatibility.length)).toEqual(source.compatibility);
    for (const previous of source.compatibility.filter((m) => m.to.contentVersion === "1.4.0")) {
      const inherited = f.pkg.compatibility.find(
        (m) =>
          m.to.contentVersion === "1.5.0" &&
          JSON.stringify(m.from) === JSON.stringify(previous.from),
      )!;
      expect(inherited).toMatchObject({
        completion: previous.completion,
        evidence: previous.evidence,
        resume: previous.resume,
        reviewStatus: "pending",
      });
    }
    expect(f.pkg.manifest.cefrAwarding).toBe("disabled");
    expect(f.pkg.manifest.editorialApprovals).toEqual([]);
    expect(f.pkg.manifest.legacyLocaleExceptions).toHaveLength(55);
    expect(f.pkg.public.chapters).toHaveLength(3);
    expect(f.pkg.public.lessons).toHaveLength(22);
    expect(f.pkg.public.chapters.filter((c) => c.order > 3)).toEqual([]);
    expect(authored.lessons.every((l) => l.completionPolicy.type === "self_reported")).toBe(true);
    expect(f.pkg.public.courses[0]!.coverageState).toBe("partial");
  });
  it("converts all 44 MCQs with exact options/keys, documented clarifications and Burmese feedback", () => {
    validateBatchSources(sources, authored, grading, metadata);
    for (const chapter of metadata.chapters) {
      const qs = parseExpansionQuestions(sources.get(chapter.number)!);
      expect(qs).toHaveLength(22);
      expect(qs.filter((q) => q.sourceId.startsWith("L"))).toHaveLength(5);
      for (const q of qs) {
        const map = chapter.questions.find((m) => m.sourceId === q.sourceId)!;
        const e = authored.exercises.find((e) => e.id === map.exerciseId)!;
        if (e.type !== "multiple_choice") throw new Error("Question format");
        expect(e.options!.map((o) => o.text.text)).toEqual(q.options);
        const r = grading.exerciseRules.find((r) => r.exerciseRef.id === e.id)!;
        expect(r.correctOptionIds).toEqual([e.options!["ABC".indexOf(q.key)]!.id]);
        expect(r.explanation.my).toMatch(/[\u1000-\u109f]/);
      }
    }
    expect(authored.exercises.filter((e) => e.type === "reading_comprehension")).toHaveLength(4);
    expect(
      authored.exercises
        .filter((e) => /^a1-c[23]-k/.test(e.id))
        .every((e) => e.tags.coreSkills.length === 0),
    ).toBe(true);
    expect(authored.assets).toEqual([]);
    expect(authored.assessments).toEqual([]);
    expect(metadata.chapters.every((c) => c.audioStatus === "audio_pending")).toBe(true);
    const base = JSON.stringify(authored);
    expect(base).not.toMatch(
      /correctOptionIds|gradingRevision|TEACHER|PRIVATE ONLY|Knowledge check\n1\. B/,
    );
  });
  it("rejects changed keys/options, dropped activities, forged audio/evidence and unauthorized clarifications", () => {
    const wrong = structuredClone(grading);
    wrong.exerciseRules[0]!.correctOptionIds = ["a1-c2-l1-1-c"];
    expect(() => validateBatchSources(sources, authored, wrong, metadata)).toThrow(/source-key/);
    const option = structuredClone(authored);
    option.exercises[0]!.options![0]!.text.text = "Changed";
    expect(() => validateBatchSources(sources, option, grading, metadata)).toThrow(
      /source-options/,
    );
    const audio = structuredClone(metadata);
    audio.chapters[0]!.questions[0]!.audioStatus = "not_applicable";
    expect(() => validateBatchSources(sources, authored, grading, audio)).toThrow(/source-audio/);
    const clarification = structuredClone(metadata);
    clarification.clarifications[0]!.authoredText = "New unreviewed prompt";
    expect(() => validateBatchSources(sources, authored, grading, clarification)).toThrow(
      /source-clarification/,
    );
    expect(() =>
      parseExpansionQuestions(
        sources.get(2)!.replace("1. My sister ___ a laptop.", "Deleted question"),
      ),
    ).toThrow(/source-inventory/);
    const duplicate = structuredClone(authored);
    duplicate.lessons[0]!.id = "a1-c1-introductions";
    expect(() =>
      appendA1Chapters(f.source.pkg, duplicate, grading, metadata, {
        contentVersion: "1.5.0",
        sourceDigest: f.source.releaseHash,
        createdAt: f.pkg.manifest.createdAt,
      }),
    ).toThrow(/batch-identity/);
    const bad = structuredClone(f.pkg);
    bad.public.chapters[1]!.lessonRefs[0]!.revision = 99;
    expect(() => validatePackage(bad, { ...options, registry: f.chain.registry })).toThrow(
      /reference/,
    );
  });
  it("produces the pinned immutable draft without changing ancestors or historical data", async () => {
    const directory = join(root, ".curriculum-drafts", "1.5.0");
    await writeDraft(directory, f.pkg, media);
    expect(
      (await loadPackage(directory, { ...options, registry: f.chain.registry })).releaseHash,
    ).toBe("994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa");
    await expect(writeDraft(directory, f.pkg, media)).rejects.toThrow();
    const chain = await loadPackageChain(
      ["1.1.0", "1.2.0", "1.3.0", "1.4.0"].map((v) => join(root, ".curriculum-drafts", v)),
      options,
    );
    expect(chain.packages.map((p) => p.releaseHash)).toEqual(
      f.chain.packages.map((p) => p.releaseHash),
    );
  });
  it("runs the local batch CLI with repeatable check mode and refused overwrite", async () => {
    const args = [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/curriculum/author-a1-batch.ts",
      "--source",
      join(root, ".curriculum-drafts", "1.4.0"),
      ...["1.1.0", "1.2.0", "1.3.0"].flatMap((v) => [
        "--against",
        join(root, ".curriculum-drafts", v),
      ]),
      "--out",
      join(root, ".curriculum-drafts", "cli-1.5.0"),
    ];
    const run = promisify(execFile);
    expect(JSON.parse((await run(process.execPath, args)).stdout)).toMatchObject({
      activation: false,
      newQuestions: 44,
      awaitingAudioQuestions: 10,
      sourcesUnchanged: true,
    });
    for (let i = 0; i < 2; i++)
      expect(JSON.parse((await run(process.execPath, [...args, "--check"])).stdout)).toMatchObject({
        readOnlyCheck: true,
        releaseHash: "994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa",
      });
    await expect(run(process.execPath, args)).rejects.toThrow(/EEXIST/);
  }, 30000);
});
