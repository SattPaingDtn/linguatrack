// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import oldPublic from "../../content-authoring/a1-subject-pronouns/revisions/1.2.0/public.json";
import oldGrading from "../../content-authoring/a1-subject-pronouns/revisions/1.2.0/grading.json";
import authored from "../../content-authoring/a1-subject-pronouns/public.json";
import feedback from "../../content-authoring/a1-subject-pronouns/grading.json";
import { appendGrammarPrototype } from "../../src/lib/curriculum/v2/authoring";
import { revisePronounsLesson } from "../../src/lib/curriculum/v2/editorial";
import { mergeRegistrySnapshots } from "../../src/lib/curriculum/v2/registry";
import { loadPackage, loadPackageChain, writeDraft } from "../../src/lib/curriculum/v2/files";
import { fingerprint, sha256 } from "../../src/lib/curriculum/v2/json";
import { registrySnapshot, validatePackage } from "../../src/lib/curriculum/v2/validate";
import { publicProjection } from "../../src/lib/curriculum/v2/projection";
import { publicCollectionsSchema } from "../../src/lib/curriculum/v2/public";
import {
  checkCompletedLessons,
  checkLegacyAttempt,
  checkResumeCompatibility,
} from "../../src/lib/curriculum/v2/compatibility";
import { calculateProgress } from "../../src/lib/learning/progress";
import type { ExerciseResponse, QuizAttempt } from "../../src/lib/learning/contracts";
import { bridge, media, options, legacy } from "./fixtures";
import { canonical, canonicalQuiz, gradedResponse, input, savedAttempt } from "../fixtures";
const base = bridge();
const source = validatePackage(
  appendGrammarPrototype(base, oldPublic, oldGrading, {
    contentVersion: "1.2.0",
    sourceDigest: fingerprint(base),
    createdAt: "2026-10-12T00:00:00.000Z",
  }),
  { ...options, registry: registrySnapshot(base) },
);
const registry = mergeRegistrySnapshots(registrySnapshot(base), registrySnapshot(source));
const settings = {
  contentVersion: "1.3.0",
  sourceDigest: fingerprint(source),
  createdAt: "2026-10-12T00:00:00.000Z",
};
const edited = () => revisePronounsLesson(source, authored, feedback, settings);
const context = { ...options, registry };
const temp: string[] = [];
afterEach(async () => {
  for (const p of temp.splice(0)) await rm(p, { recursive: true, force: true });
});
describe("controlled pronouns editorial revision", () => {
  it("retains all existing IDs/slugs/history mappings with correctly incremented revisions", () => {
    const before = fingerprint(source);
    const result = validatePackage(edited(), context);
    expect(fingerprint(source)).toBe(before);
    expect(result.manifest).toMatchObject({
      state: "draft",
      contentVersion: "1.3.0",
      cefrAwarding: "disabled",
      basedOn: { contentVersion: "1.2.0", sha256: fingerprint(source) },
    });
    for (const old of Object.values(source.public).flat()) {
      const revised = Object.values(result.public)
        .flat()
        .find((e) => e.id === old.id)!;
      expect(revised.kind).toBe(old.kind);
      if ("slug" in old && "slug" in revised) expect(revised.slug).toBe(old.slug);
      expect(revised.revision).toBe(
        fingerprint(revised) === fingerprint(old) ? old.revision : old.revision + 1,
      );
    }
    expect(result.compatibility.slice(0, source.compatibility.length)).toEqual(
      source.compatibility,
    );
    expect(result.private.grading.exerciseRules.slice(0, 5)).toEqual(
      source.private.grading.exerciseRules.slice(0, 5),
    );
    expect(result.public.assets).toEqual(source.public.assets);
    expect(result.public.courses.slice(1)).toEqual(source.public.courses.slice(1));
    const changedLesson = result.compatibility.find(
      (m) =>
        m.from.schemaVersion === 2 &&
        m.from.contentVersion === "1.2.0" &&
        m.to.ref.id === "a1-c1-subject-pronouns",
    )!;
    expect(changedLesson).toMatchObject({
      completion: "requires_recompletion",
      resume: "restart_with_notice",
      reviewStatus: "pending",
    });
  });
  it("preserves every reviewed answer/key/selection order and changes only q12 distractor wording", () => {
    const result = validatePackage(edited(), context);
    for (const old of oldPublic.exercises) {
      const revised = result.public.exercises.find((e) => e.id === old.id)!;
      if (revised.type !== "multiple_choice") throw new Error("Wrong question format");
      const before = oldGrading.exerciseRules.find((r) => r.exerciseRef.id === old.id)!;
      const after = result.private.grading.exerciseRules.find((r) => r.exerciseRef.id === old.id)!;
      if (after.type !== "multiple_choice") throw new Error("Wrong private rule");
      expect(after.correctOptionIds).toEqual(before.correctOptionIds);
      expect(after.graderVersion).toBe(before.graderVersion);
      expect(after.gradingRevision).toBe(2);
      expect(after.exerciseRef.revision).toBe(2);
      expect(after.maxPoints).toBe(1);
      expect(revised.options.map((o) => o.id)).toEqual(old.options.map((o) => o.id));
      for (const key of before.correctOptionIds)
        expect(revised.options.find((o) => o.id === key)).toEqual(
          old.options.find((o) => o.id === key),
        );
      if (old.id !== "a1-c1-pronouns-q12") {
        expect(revised.prompt).toEqual(old.prompt);
        expect(revised.options).toEqual(old.options);
      } else {
        expect(revised.options[0]?.text.text).toBe("Am I a student?");
        expect(revised.prompt.text).toContain("not a question");
        expect(after.correctOptionIds).toEqual(["option-3"]);
      }
    }
  });
  it("provides text-labelled examples and truly ungraded writing self-practice", () => {
    const result = validatePackage(edited(), context);
    const order = result.public.blocks.find((b) => b.id === "a1-c1-pronouns-word-order")!;
    if (order.type !== "grammar") throw new Error("Wrong block");
    expect(order.examples.map((e) => e.pattern)).toEqual(
      expect.arrayContaining([
        "Subject [I] + Verb [read] + Object [books]",
        "Subject [She] + Be [is] + Complement [happy]",
      ]),
    );
    expect(order.rule.my).toContain("ကတ္တား");
    expect(order.rule.my).toContain("ဖြည့်စွက်ဖော်ပြသည့်အပိုင်း");
    const practice = result.public.blocks.find((b) => b.id === "a1-c1-pronouns-sentence-practice")!;
    expect(practice).toMatchObject({ type: "writing", revision: 1, minWords: 4, maxWords: 30 });
    if (practice.type !== "writing") throw new Error("Wrong self-practice type");
    expect(practice.prompt.en).toContain("ungraded self-practice");
    expect(practice.modelAnswer.text).toBe("I like tea. She is happy.");
    const objective = result.public.objectives.find(
      (o) => o.id === "a1-c1-subject-pronouns-objective-produce",
    )!;
    expect(objective.expectedEvidence).toEqual(["self_practice"]);
    expect(result.private.grading.exerciseRules.some((r) => r.exerciseRef.id === practice.id)).toBe(
      false,
    );
    expect(
      result.public.lessons.find((l) => l.id === "a1-c1-subject-pronouns")?.completionPolicy,
    ).toEqual({ type: "self_reported" });
  });
  it("counts the 14 correct responses as grammar recognition with zero reading/writing proficiency evidence", () => {
    const result = validatePackage(edited(), context);
    const revised = result.public.lessons.find((l) => l.id === "a1-c1-subject-pronouns")!;
    expect(revised.tags.areas).not.toContain("reading");
    expect(revised.tags.coreSkills).not.toContain("reading");
    const questions = result.public.exercises.filter((q) => q.id.startsWith("a1-c1-pronouns-q"));
    const responses: ExerciseResponse[] = questions.map((q) => {
      if (q.type !== "multiple_choice") throw new Error("Non-recognition exercise");
      expect(q.tags).toEqual({ areas: ["grammar"], coreSkills: [] });
      const rule = result.private.grading.exerciseRules.find((r) => r.exerciseRef.id === q.id)!;
      if (rule.type !== "multiple_choice") throw new Error("Wrong rule");
      const chosen = q.options.find((o) => o.id === rule.correctOptionIds[0])!;
      return {
        id: crypto.randomUUID(),
        questionId: q.id,
        prompt: q.prompt.text,
        skill: "grammar",
        options: q.options.map((o) => ({ id: o.id, text: o.text.text })),
        selectedOptionId: chosen.id,
        selectedText: chosen.text.text,
        correctOptionId: chosen.id,
        correctText: chosen.text.text,
        isCorrect: true,
        explanation: rule.explanation,
        timestamp: 1000,
      };
    });
    const attempt: QuizAttempt = {
      id: crypto.randomUUID(),
      quizId: "a1-c1-pronouns-practice",
      lessonId: revised.id,
      contentVersion: "1.3.0",
      title: "Grammar recognition audit",
      correct: 14,
      total: 14,
      answered: 14,
      percentage: 100,
      passed: true,
      timestamp: 1000,
      completedAt: 1000,
      status: "completed",
      answers: Object.fromEntries(responses.map((r) => [r.questionId, r.selectedOptionId])),
      responses,
    };
    // Exercise a real existing progress helper with a synthetic lesson adapter, without activating content.
    const adapted = { ...canonical.courses[0]!.chapters[0]!.lessons[1]!, id: revised.id };
    const progress = calculateProgress([adapted], [revised.id], [attempt], "1.3.0");
    expect(progress.evidence.grammar).toMatchObject({ total: 14, correct: 14 });
    expect(progress.evidence.reading.total).toBe(0);
    expect(progress.evidence.writing.total).toBe(0);
    expect(progress.completedCount).toBe(1);
    const falseReading = edited();
    falseReading.public.chapters[0]!.coverageTargets = [
      {
        area: "reading",
        evidenceKind: "comprehension",
        objectiveRefs: revised.objectiveRefs.slice(0, 3),
        minimumDistinctItems: 1,
      },
    ];
    expect(() => validatePackage(falseReading, context)).toThrow(/coverage/);
    const falseWriting = edited();
    falseWriting.public.chapters[0]!.coverageTargets = [
      {
        area: "writing",
        evidenceKind: "written_production",
        objectiveRefs: [
          { kind: "objective", id: "a1-c1-subject-pronouns-objective-produce", revision: 1 },
        ],
        minimumDistinctItems: 1,
      },
    ];
    expect(() => validatePackage(falseWriting, context)).toThrow(/coverage/);
  });
  it("rejects leaked answer keys, changed mappings, stale grade revisions and deleted identities", () => {
    const result = validatePackage(edited(), context);
    const publicJson = JSON.stringify(publicProjection(result));
    for (const field of [
      "correctOptionIds",
      "correctOptionId",
      "exerciseRules",
      "gradingRevision",
      "private/grading",
      "markingNotes",
    ])
      expect(publicJson).not.toContain(field);
    const leaked = structuredClone(result.public);
    Object.assign(leaked.exercises.at(-1)!, { correctOptionIds: ["option-1"] });
    expect(publicCollectionsSchema.safeParse(leaked).success).toBe(false);
    const wrong = structuredClone(feedback);
    wrong.exerciseRules[0]!.correctOptionIds = ["option-2"];
    expect(() => revisePronounsLesson(source, authored, wrong, settings)).toThrow(/editorial-keys/);
    const stale = structuredClone(feedback);
    stale.exerciseRules[0]!.gradingRevision = 1;
    expect(() => revisePronounsLesson(source, authored, stale, settings)).toThrow(
      /editorial-revision/,
    );
    const deleted = structuredClone(authored);
    deleted.exercises.pop();
    expect(() => revisePronounsLesson(source, deleted, feedback, settings)).toThrow(
      /editorial-deletion|editorial-questions/,
    );
    const rewritten = edited();
    rewritten.compatibility[0]!.fingerprints.target = "0".repeat(64);
    expect(() => validatePackage(rewritten, context)).toThrow(/compatibility-fingerprint/);
  });
  it("keeps legacy saved results and timestamps intact, with no automatic editorial approval", () => {
    const result = validatePackage(edited(), context);
    const partial = savedAttempt();
    const complete = savedAttempt(
      crypto.randomUUID(),
      canonicalQuiz.questions.map((q) =>
        gradedResponse({ ...input, questionId: q.id, optionId: q.correctOptionId }),
      ),
    );
    const before = fingerprint([partial, complete]);
    expect(
      checkCompletedLessons(
        base,
        result,
        base.public.lessons.map((l) => l.id),
      ).every((r) => r.compatible && !r.approved),
    ).toBe(true);
    for (const attempt of [partial, complete])
      expect(checkLegacyAttempt(legacy, base, result, attempt)).toMatchObject({
        compatible: true,
        approved: false,
      });
    expect(
      checkResumeCompatibility(base, result, {
        contentVersion: "1.0.0",
        lessonId: "a1-c1-check",
        blockId: "a1-c1-quiz",
      }),
    ).toMatchObject({ compatible: true });
    expect(fingerprint([partial, complete])).toBe(before);
  });
  it("detects conflicting ancestors and requires both historic releases for reference validation", () => {
    expect(() =>
      validatePackage(edited(), { ...options, registry: registrySnapshot(source) }),
    ).toThrow(/compatibility-version|compatibility-source/);
    const conflict = registrySnapshot(base);
    conflict.entities[0]!.hash = "0".repeat(64);
    expect(() => mergeRegistrySnapshots(registry, conflict)).toThrow(/registry-conflict/);
    expect(mergeRegistrySnapshots(registry, registry)).toEqual(registry);
  });
  it("reproduces a valid on-disk draft and refuses edits/overwrites of any historical package", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "linguatrack-editorial-test-"));
    temp.push(root);
    const first = resolve(root, "1.1.0");
    const second = resolve(root, "1.2.0");
    const third = resolve(root, "1.3.0");
    await writeDraft(first, base, media);
    const loaded = await loadPackage(first, options);
    const diskSource = validatePackage(
      appendGrammarPrototype(loaded.pkg, oldPublic, oldGrading, {
        contentVersion: "1.2.0",
        sourceDigest: loaded.releaseHash,
        createdAt: "2026-10-12T00:00:00.000Z",
      }),
      { ...options, registry: registrySnapshot(loaded.pkg, loaded.releaseHash) },
    );
    await writeDraft(second, diskSource, media);
    const hashes = async (path: string) => {
      const entries: Record<string, string> = {};
      const walk = async (dir: string) => {
        for (const p of await readdir(dir, { withFileTypes: true })) {
          const abs = resolve(dir, p.name);
          if (p.isDirectory()) await walk(abs);
          else entries[abs.slice(path.length)] = sha256(await readFile(abs));
        }
      };
      await walk(path);
      return entries;
    };
    const savedFirst = await hashes(first);
    const savedSecond = await hashes(second);
    const run = (out: string) =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/curriculum/edit-pronouns.ts",
          "--against",
          first,
          "--source",
          second,
          "--out",
          out,
        ],
        { encoding: "utf8", stdio: "pipe" },
      );
    expect(JSON.parse(run(third))).toMatchObject({
      contentVersion: "1.3.0",
      sourcesUnchanged: true,
      activation: false,
      questions: 14,
    });
    const chain = await loadPackageChain([first, second], options);
    await expect(
      loadPackage(third, { ...options, registry: chain.registry }),
    ).resolves.toBeDefined();
    const cli = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/curriculum/cli.ts",
        "validate",
        third,
        "--against",
        first,
        "--against",
        second,
        "--json",
      ],
      { encoding: "utf8", stdio: "pipe" },
    );
    expect(JSON.parse(cli)).toMatchObject({ valid: true, activation: false });
    const thirdHashes = await hashes(third);
    expect(() => run(third)).toThrow();
    expect(await hashes(third)).toEqual(thirdHashes);
    expect(() => run(resolve(first, "nested"))).toThrow();
    expect(() => run(resolve(second, "nested"))).toThrow();
    expect(await hashes(first)).toEqual(savedFirst);
    expect(await hashes(second)).toEqual(savedSecond);
  }, 30_000);
});
