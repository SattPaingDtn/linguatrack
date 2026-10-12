// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import publicInput from "../../content-authoring/a1-subject-pronouns/revisions/1.2.0/public.json";
import gradingInput from "../../content-authoring/a1-subject-pronouns/revisions/1.2.0/grading.json";
import { appendGrammarPrototype } from "../../src/lib/curriculum/v2/authoring";
import { canonicalJson, fingerprint, sha256 } from "../../src/lib/curriculum/v2/json";
import { loadPackage, writeDraft } from "../../src/lib/curriculum/v2/files";
import { registrySnapshot, validatePackage } from "../../src/lib/curriculum/v2/validate";
import {
  checkCompletedLessons,
  checkLegacyAttempt,
  checkResumeCompatibility,
  gradeLegacyBridge,
  legacyAssessmentRef,
} from "../../src/lib/curriculum/v2/compatibility";
import { publicProjection } from "../../src/lib/curriculum/v2/projection";
import { bridge, media, options, legacy } from "./fixtures";
import { canonicalQuiz, gradedResponse, input, savedAttempt } from "../fixtures";
const source = bridge();
const authorOptions = {
  contentVersion: "1.2.0",
  sourceDigest: fingerprint(source),
  createdAt: "2026-10-12T00:00:00.000Z",
};
const context = { ...options, registry: registrySnapshot(source) };
const prototype = () => appendGrammarPrototype(source, publicInput, gradingInput, authorOptions);
const withoutRevisions = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(withoutRevisions)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => !["revision", "policyRevision", "gradingRevision"].includes(k))
            .map(([k, x]) => [k, withoutRevisions(x)]),
        )
      : v;
const temp: string[] = [];
afterEach(async () => {
  for (const dir of temp.splice(0)) await rm(dir, { recursive: true, force: true });
});
describe("A1 grammar content-authoring prototype", () => {
  it("preserves source and old entity content/IDs/slugs while adding one lesson", () => {
    const before = canonicalJson(source);
    const candidate = validatePackage(prototype(), context);
    expect(canonicalJson(source)).toBe(before);
    expect(candidate.manifest).toMatchObject({
      state: "draft",
      contentVersion: "1.2.0",
      basedOn: { schemaVersion: 2, contentVersion: "1.1.0", sha256: fingerprint(source) },
      cefrAwarding: "disabled",
    });
    expect(candidate.public.lessons).toHaveLength(source.public.lessons.length + 1);
    for (const old of Object.values(source.public).flat()) {
      const updated = Object.values(candidate.public)
        .flat()
        .find((e) => e.id === old.id)!;
      expect(updated.kind).toBe(old.kind);
      if (old.kind === "chapter") {
        expect(updated.kind).toBe("chapter");
        if (updated.kind !== "chapter") throw new Error("Wrong entity kind");
        expect(updated.lessonRefs.slice(0, old.lessonRefs.length).map((r) => r.id)).toEqual(
          old.lessonRefs.map((r) => r.id),
        );
        expect(updated.lessonRefs.at(-1)?.id).toBe("a1-c1-subject-pronouns");
        expect(
          withoutRevisions({
            ...updated,
            lessonRefs: old.lessonRefs,
            objectiveRefs: old.objectiveRefs,
          }),
        ).toEqual(withoutRevisions(old));
      } else expect(withoutRevisions(updated)).toEqual(withoutRevisions(old));
    }
    expect(candidate.private.grading.exerciseRules.slice(0, 5)).toEqual(
      source.private.grading.exerciseRules,
    );
    expect(withoutRevisions(candidate.private.grading.assessmentPolicies)).toEqual(
      withoutRevisions(source.private.grading.assessmentPolicies),
    );
    expect(candidate.public.courses.slice(1)).toEqual(source.public.courses.slice(1));
    expect(candidate.public.assets).toEqual(source.public.assets);
  });
  it("retains every original mapping exactly and appends version-scoped mappings", () => {
    const candidate = validatePackage(prototype(), context);
    expect(candidate.compatibility.slice(0, source.compatibility.length)).toEqual(
      source.compatibility,
    );
    expect(candidate.compatibility.length).toBeGreaterThan(source.compatibility.length);
    expect(
      candidate.compatibility
        .filter((m) => m.to.contentVersion === "1.2.0")
        .every((m) => m.reviewStatus === "pending"),
    ).toBe(true);
    const duplicate = prototype();
    duplicate.compatibility.push(duplicate.compatibility.at(-1)!);
    expect(() => validatePackage(duplicate, context)).toThrow(/duplicate/);
    const forged = prototype();
    forged.compatibility[0]!.fingerprints.target = "0".repeat(64);
    expect(() => validatePackage(forged, context)).toThrow(/compatibility-fingerprint/);
    const foreign = prototype();
    foreign.compatibility[0]!.to.contentVersion = "9.9.9";
    expect(() => validatePackage(foreign, context)).toThrow(/compatibility-version/);
    const badParent = prototype();
    badParent.manifest.basedOn.sha256 = "0".repeat(64);
    expect(() => validatePackage(badParent, context)).toThrow(/parent-release/);
  });
  it("authors bilingual teaching, 14 unambiguous private keys and grammar recognition objectives", () => {
    const candidate = validatePackage(prototype(), context);
    const lesson = candidate.public.lessons.find((l) => l.id === "a1-c1-subject-pronouns")!;
    expect(lesson.slug).toBe("subject-pronouns-and-sentences");
    expect(lesson.completionPolicy).toEqual({ type: "self_reported" });
    expect(lesson.prerequisites.every((p) => p.enforcement === "advisory")).toBe(true);
    const expected = [
      "I",
      "You",
      "He",
      "She",
      "It",
      "We",
      "They",
      "am",
      "is",
      "are",
      "are",
      "I am a student.",
      "I read books.",
      "I like tea.",
    ];
    const questions = candidate.public.exercises.filter((e) => e.id.startsWith("a1-c1-pronouns-q"));
    expect(questions).toHaveLength(14);
    expect(
      questions.map((q) => {
        if (q.type !== "multiple_choice") throw new Error("Unsupported prototype exercise");
        const rule = candidate.private.grading.exerciseRules.find(
          (r) => r.exerciseRef.id === q.id,
        )!;
        if (rule.type !== "multiple_choice") throw new Error("Mismatched private rule");
        expect(rule.explanation.my).toMatch(/[\u1000-\u109f]/);
        expect(q.objectiveRefs).toHaveLength(1);
        expect(q.tags.coreSkills).toEqual([]);
        return q.options.find((o) => o.id === rule.correctOptionIds[0])!.text.text;
      }),
    ).toEqual(expected);
    for (const item of [
      ...publicInput.lessons,
      ...publicInput.blocks,
      ...publicInput.objectives,
      ...publicInput.exercises,
    ])
      expect("source" in item).toBe(false);
    const localized: { en: string; my: string }[] = [];
    const collect = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if ("en" in v && "my" in v) localized.push(v as { en: string; my: string });
      for (const child of Object.values(v)) collect(child);
    };
    collect(publicInput);
    collect(gradingInput);
    for (const value of localized) {
      expect(value.en.trim()).not.toBe("");
      expect(value.my).toMatch(/[\u1000-\u109f]/);
      expect(value.my).not.toBe(value.en);
    }
    const serialized = JSON.stringify(publicProjection(candidate));
    expect(serialized).not.toContain("correctOptionIds");
    expect(serialized).not.toContain("private/grading");
  });
  it("keeps legacy completion, repeated/partial attempts, scores, timestamps and resume compatible", () => {
    const candidate = validatePackage(prototype(), context);
    const partial = savedAttempt();
    const complete = savedAttempt(
      crypto.randomUUID(),
      canonicalQuiz.questions.map((q) =>
        gradedResponse({ ...input, questionId: q.id, optionId: q.correctOptionId }),
      ),
    );
    const snapshot = {
      generation: 3,
      completed: source.public.lessons.map((l) => l.id),
      attempts: [partial, complete],
      resume: { contentVersion: "1.0.0", lessonId: "a1-c1-check", blockId: "a1-c1-quiz" },
    };
    const before = fingerprint(snapshot);
    expect(
      checkCompletedLessons(source, candidate, snapshot.completed).every(
        (r) => r.compatible && !r.approved,
      ),
    ).toBe(true);
    for (const attempt of snapshot.attempts)
      expect(checkLegacyAttempt(legacy, source, candidate, attempt)).toMatchObject({
        compatible: true,
        approved: false,
      });
    expect(checkResumeCompatibility(source, candidate, snapshot.resume)).toMatchObject({
      compatible: true,
      approved: false,
    });
    expect(fingerprint(snapshot)).toBe(before);
    const answers = Object.fromEntries(
      canonicalQuiz.questions.map((q) => [q.id, q.correctOptionId]),
    );
    answers[canonicalQuiz.questions[0]!.id] = "option-2";
    expect(
      gradeLegacyBridge(candidate, { ...legacyAssessmentRef, revision: 2 }, answers),
    ).toMatchObject({ percentage: 80, passed: true, total: 5 });
    const changedPolicy = prototype();
    changedPolicy.private.grading.assessmentPolicies[0]!.passPercent = 60;
    expect(checkLegacyAttempt(legacy, source, changedPolicy, complete).compatible).toBe(false);
  });
  it("does not silently replace existing entities or reuse a release version", () => {
    const badAddition = structuredClone(publicInput);
    badAddition.lessons[0]!.id = "a1-c1-be";
    expect(() => appendGrammarPrototype(source, badAddition, gradingInput, authorOptions)).toThrow(
      /identity-conflict/,
    );
    const sameVersion = appendGrammarPrototype(source, publicInput, gradingInput, {
      ...authorOptions,
      contentVersion: "1.1.0",
    });
    expect(() => validatePackage(sameVersion, context)).toThrow(
      /version-conflict|release-conflict/,
    );
  });
  it("copies a validated package on disk, refuses overwrites and protects source descendants", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "linguatrack-author-test-"));
    temp.push(dir);
    const original = resolve(dir, "source");
    const output = resolve(dir, "working");
    await writeDraft(original, source, media);
    const hashTree = async (root: string): Promise<Record<string, string>> => {
      const result: Record<string, string> = {};
      const walk = async (path: string) => {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          const absolute = resolve(path, entry.name);
          if (entry.isDirectory()) await walk(absolute);
          else result[absolute.slice(root.length)] = sha256(await readFile(absolute));
        }
      };
      await walk(root);
      return result;
    };
    const originalBytes = await hashTree(original);
    const run = (out: string) =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/curriculum/author-prototype.ts",
          "--source",
          original,
          "--out",
          out,
        ],
        { encoding: "utf8", stdio: "pipe" },
      );
    expect(JSON.parse(run(output))).toMatchObject({
      contentVersion: "1.2.0",
      sourceUnchanged: true,
      activation: false,
      addedQuestions: 14,
    });
    const loadedSource = await loadPackage(original, options);
    const loadedWorking = await loadPackage(output, {
      ...options,
      registry: registrySnapshot(loadedSource.pkg, loadedSource.releaseHash),
    });
    expect(loadedWorking.pkg.public.lessons).toHaveLength(4);
    expect(await hashTree(original)).toEqual(originalBytes);
    const writtenBytes = await hashTree(output);
    expect(() => run(output)).toThrow();
    expect(await hashTree(output)).toEqual(writtenBytes);
    expect(() => run(resolve(original, "nested"))).toThrow();
    expect(await hashTree(original)).toEqual(originalBytes);
  }, 30_000);
});
