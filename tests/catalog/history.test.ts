// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildHistoryCompatibilityReport } from "../../src/lib/curriculum/catalog/report";
import { loadReadOnlyCatalog, type ReadOnlyCatalog } from "../../src/lib/curriculum/catalog/server";
import { emptySnapshot } from "../../src/lib/learning/contracts";
import type { CurriculumPackage } from "../../src/lib/curriculum/v2/package";
import { canonicalJson } from "../../src/lib/curriculum/v2/json";
import { canonical, canonicalQuiz, gradedResponse, input, savedAttempt } from "../fixtures";
import { fixtureCatalog } from "./fixtures";

let root: string;
let baseline: CurriculumPackage;
let candidate: CurriculumPackage;
let catalog: ReadOnlyCatalog;
beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "linguatrack-d1-history-"));
  const chain = await fixtureCatalog(root);
  baseline = chain.packages[0]!.pkg;
  candidate = chain.packages[2]!.pkg;
  catalog = await loadReadOnlyCatalog(root);
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
function history() {
  return structuredClone({
    ...structuredClone(emptySnapshot),
    generation: 2,
    completed: ["a1-c1-be", "a1-c1-check"],
    attempts: [
      savedAttempt(
        crypto.randomUUID(),
        canonicalQuiz.questions.map((q, index) =>
          gradedResponse({
            ...input,
            questionId: q.id,
            optionId: index === 0 ? "option-2" : q.correctOptionId,
          }),
        ),
      ),
      savedAttempt(crypto.randomUUID()),
    ],
    profile: {
      contentVersion: "1.0.0",
      lastLessonId: "a1-c1-introductions",
      lastBlockId: "a1-c1-listen",
      updatedAt: "2026-10-11T05:00:00+09:00",
    },
  });
}
const report = (pkg = candidate, snapshot = history()) =>
  buildHistoryCompatibilityReport(canonical, baseline, pkg, snapshot, "1.0.0");
function currentMapping(pkg: CurriculumPackage, id: string) {
  return pkg.compatibility.find(
    (m) =>
      m.from.schemaVersion === 1 &&
      m.from.contentVersion === "1.0.0" &&
      m.from.id === id &&
      m.to.contentVersion === "1.3.0",
  )!;
}
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe("read-only compatibility of historical learning", () => {
  it("preserves original attempts, scores, answers and timestamps without mutating frozen input", () => {
    const source = history();
    const before = canonicalJson(source);
    freeze(source);
    const result = catalog.reportHistory(source, "1.0.0");
    expect(canonicalJson(source)).toBe(before);
    expect(result).toMatchObject({
      readOnly: true,
      hostedCompatibility: "not_verified",
      generation: 2,
      cefrAwarding: "disabled",
      target: { state: "inactive-draft", publicationApproval: "unapproved" },
    });
    expect(result.assessments).toHaveLength(2);
    for (const [i, attempt] of source.attempts.entries()) {
      expect(result.assessments[i]!.original).toMatchObject({
        id: attempt.id,
        percentage: attempt.percentage,
        passed: attempt.passed,
        timestamp: attempt.timestamp,
        completedAt: attempt.completedAt,
        contentVersion: "1.0.0",
      });
      expect(result.assessments[i]!.sourceIntegrity).toBe("consistent");
      expect(result.assessments[i]!.responses.map((r) => r.timestamp)).toEqual(
        attempt.responses.map((r) => r.timestamp),
      );
    }
    expect(result.assessments[0]!.original).toMatchObject({ percentage: 80, passed: true });
    expect(result.resume?.original.updatedAt).toBe(source.profile.updatedAt);
    expect(result.completions[0]!.original.completedAt).toBeNull(); // Snapshots do not contain completion dates.
  });
  it("distinguishes structural compatibility from pending review and publication approval", () => {
    const result = report();
    for (const row of result.completions)
      expect(row.compatibility).toMatchObject({
        status: "pending",
        semanticallyCompatible: true,
        approved: false,
        eligibleForCarry: false,
      });
    expect(result.assessments[0]!.compatibility).toMatchObject({
      status: "pending",
      semanticallyCompatible: true,
      approved: false,
    });
    expect(result.resume!.compatibility).toMatchObject({
      status: "pending",
      semanticallyCompatible: true,
      approved: false,
    });
    const approved = structuredClone(candidate);
    for (const m of approved.compatibility)
      if (m.to.contentVersion === "1.3.0") m.reviewStatus = "approved";
    const reviewed = report(approved);
    expect(reviewed.completions[0]!.compatibility).toMatchObject({
      status: "approved",
      approved: true,
      eligibleForCarry: false,
    });
    expect(reviewed.assessments[0]!.compatibility).toMatchObject({
      status: "approved",
      approved: true,
      eligibleForCarry: false,
    });
    expect(reviewed.target.publicationApproval).toBe("unapproved"); // Mapping flags never authorize activation.
  });
  it("requires mappings to the exact current release, not approved ancestor proposals", () => {
    const missing = structuredClone(candidate);
    missing.compatibility = missing.compatibility.filter(
      (m) =>
        !(
          m.to.contentVersion === "1.3.0" &&
          m.from.schemaVersion === 1 &&
          m.from.id === "a1-c1-be"
        ),
    );
    for (const m of missing.compatibility) m.reviewStatus = "approved";
    expect(report(missing).completions[0]!.compatibility).toMatchObject({
      status: "missing",
      semanticallyCompatible: false,
      approved: false,
    });
    const resumed = history();
    resumed.profile.lastLessonId = "a1-c1-be";
    resumed.profile.lastBlockId = "a1-c1-grammar";
    expect(report(missing, resumed).resume!.compatibility.status).toBe("missing");
  });
  it("requires each question mapping for assessment evidence and each anchor mapping for resume", () => {
    const missing = structuredClone(candidate);
    missing.compatibility = missing.compatibility.filter(
      (m) =>
        !(
          m.to.contentVersion === "1.3.0" &&
          m.from.schemaVersion === 1 &&
          ["a1-c1-q1", "a1-c1-listen"].includes(m.from.id)
        ),
    );
    expect(report(missing).assessments[0]!.compatibility).toMatchObject({
      status: "missing",
      approved: false,
    });
    expect(report(missing).resume!.compatibility).toMatchObject({
      status: "missing",
      approved: false,
    });
    const stale = structuredClone(candidate);
    currentMapping(stale, "a1-c1-be").fingerprints.target = "a".repeat(64);
    expect(report(stale).completions[0]!.compatibility).toMatchObject({
      status: "stale",
      approved: false,
    });
  });
  it("honors current resume restart decisions instead of the earlier same-ID mapping", () => {
    const changed = structuredClone(candidate);
    currentMapping(changed, "a1-c1-introductions").resume = "restart_with_notice";
    currentMapping(changed, "a1-c1-introductions").reviewStatus = "approved";
    expect(report(changed).resume!.compatibility).toMatchObject({
      semanticallyCompatible: false,
      approved: false,
    });
    const wrongAnchor = history();
    wrongAnchor.profile.lastBlockId = "a1-c1-grammar";
    expect(report(candidate, wrongAnchor).resume!.compatibility).toMatchObject({
      semanticallyCompatible: false,
      approved: false,
    });
  });
  it("does not trust approval flags over changed grading, policy or historical snapshots", () => {
    const changed = structuredClone(candidate);
    for (const m of changed.compatibility) m.reviewStatus = "approved";
    changed.private.grading.assessmentPolicies[0]!.passPercent = 60;
    expect(report(changed).assessments[0]!.compatibility).toMatchObject({
      semanticallyCompatible: false,
      approved: false,
    });
    const bad = history();
    bad.attempts[0]!.responses[0]!.explanation.en = "Altered saved explanation";
    bad.attempts[0]!.percentage = 100;
    const result = report(candidate, bad);
    expect(result.assessments[0]!.sourceIntegrity).toBe("inconsistent");
    expect(result.assessments[0]!.original.percentage).toBe(100); // Report anomaly; never repair a saved score.
    expect(result.assessments[0]!.compatibility.approved).toBe(false);
  });
  it("preserves unknown historical versions while declining compatibility", () => {
    const source = history();
    source.attempts[0]!.contentVersion = "0.9.0";
    source.profile.contentVersion = "0.9.0";
    const result = buildHistoryCompatibilityReport(canonical, baseline, candidate, source, "0.9.0");
    expect(result.assessments[0]!.original.contentVersion).toBe("0.9.0");
    expect(result.assessments[0]!.sourceIntegrity).toBe("unsupported");
    expect(result.completions[0]!.compatibility.status).toBe("unsupported");
    expect(result.resume!.compatibility.status).toBe("unsupported");
  });
  it("handles empty reset history and never fabricates dates or completions", () => {
    const result = catalog.reportHistory({ ...emptySnapshot, generation: 8 }, "1.0.0");
    expect(result).toMatchObject({ generation: 8, completions: [], assessments: [], resume: null });
    expect(() => catalog.reportHistory({ malformed: true }, "1.0.0")).toThrow(/history-schema/);
    expect(() => catalog.reportHistory(emptySnapshot, "latest")).toThrow();
  });
  it("reports only recognition evidence without changing legacy writing labels or revealing keys", () => {
    const result = report();
    expect(result.assessments[0]!.responses.at(-1)).toMatchObject({
      originalSkill: "writing",
      evidenceKind: "recognition",
      demonstratedCoreSkill: false,
    });
    const serialized = JSON.stringify(result);
    for (const key of [
      "answers",
      "selectedOptionId",
      "correctOptionId",
      "correctOptionIds",
      "prompt",
      "options",
      "explanation",
      "rubric",
      "private",
      "fingerprints",
    ])
      expect(serialized).not.toContain(`"${key}"`);
    for (const rule of candidate.private.grading.exerciseRules)
      expect(serialized).not.toContain(rule.explanation.en);
  });
  it("preserves exported completion/resume dates and checks cross-owner export rows", () => {
    const userId = crypto.randomUUID();
    const date = "2026-10-11T00:00:00+09:00";
    const exported = {
      exportVersion: 1,
      exportedAt: date,
      userId,
      profile: {
        id: userId,
        last_lesson_id: "a1-c1-be",
        last_block_id: "a1-c1-grammar",
        content_version: "1.0.0",
        updated_at: date,
        created_at: date,
        learning_generation: 2,
      },
      lessonProgress: [
        {
          user_id: userId,
          content_version: "1.0.0",
          lesson_id: "a1-c1-be",
          completed_at: date,
          completion_source: "self_reported",
        },
      ],
      attempts: history().attempts,
      mistakeReviews: [],
      studySessions: [],
    };
    const before = canonicalJson(exported);
    const result = catalog.reportHistory(exported, "1.0.0");
    expect(result.completions[0]!.original).toMatchObject({
      completedAt: date,
      source: "self_reported",
    });
    expect(result.resume!.original.updatedAt).toBe(date);
    expect(canonicalJson(exported)).toBe(before);
    exported.lessonProgress[0]!.user_id = crypto.randomUUID();
    expect(() => catalog.reportHistory(exported, "1.0.0")).toThrow(/history-owner/);
  });
});
