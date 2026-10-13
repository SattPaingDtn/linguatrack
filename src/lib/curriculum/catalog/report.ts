import "server-only";
import type { LegacyCurriculum } from "../v2/bridge";
import type { CurriculumPackage, CompatibilityEntry } from "../v2/package";
import type { PublicEntity } from "../v2/public";
import type { LegacyOrigin } from "../v2/common";
import { versionSchema } from "../v2/common";
import { checkLegacyAttempt, checkLessonCompatibility } from "../v2/compatibility";
import { readHistory, legacyExportSchema } from "../v2/history";
import { fail, fingerprint } from "../v2/json";
import { legacyEntities, refKey } from "../v2/validate";
import { learningSnapshotSchema, type QuizAttempt } from "../../learning/contracts";

type Scope = "completion" | "evidence" | "resume";
type MappingStatus = "approved" | "pending" | "missing" | "stale" | "unsupported";
export type MappingFinding = {
  status: MappingStatus;
  proposedAction: string | null;
  semanticallyCompatible: boolean;
  approved: boolean;
  eligibleForCarry: false;
  reasons: string[];
};

// Compare meaning while ignoring revision/provenance changes; never emit compared payloads.
function semantics(value: unknown): string {
  const strip = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(strip)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(
                ([key]) =>
                  !["revision", "source", "gradingRevision", "policyRevision"].includes(key),
              )
              .map(([key, item]) => [key, strip(item)]),
          )
        : v;
  return fingerprint(strip(value));
}
function blocked(status: MappingStatus, reason: string): MappingFinding {
  return {
    status,
    proposedAction: null,
    semanticallyCompatible: false,
    approved: false,
    eligibleForCarry: false,
    reasons: [reason],
  };
}
function combined(findings: MappingFinding[], extraReasons: string[] = []): MappingFinding {
  const status =
    (["unsupported", "missing", "stale", "pending", "approved"] as const).find((status) =>
      findings.some((f) => f.status === status),
    ) ?? "missing";
  const compatible =
    findings.length > 0 &&
    findings.every((f) => f.semanticallyCompatible) &&
    extraReasons.length === 0;
  return {
    status,
    proposedAction: null,
    semanticallyCompatible: compatible,
    approved: compatible && findings.every((f) => f.approved),
    eligibleForCarry: false,
    reasons: [...new Set([...findings.flatMap((f) => f.reasons), ...extraReasons])],
  };
}

/** Internal offline audit over validated packages and an already authorized/local v1 history.
 * No authentication, network call, grading submission, carry event, or database write occurs.
 * DTOs deliberately omit answer snapshots, private payloads, inventories and mapping prose.
 */
export function buildHistoryCompatibilityReport(
  legacy: LegacyCurriculum,
  baseline: CurriculumPackage,
  candidate: CurriculumPackage,
  rawHistory: unknown,
  snapshotVersion: string,
) {
  if (
    legacy.contentVersion !== "1.0.0" ||
    baseline.manifest.contentVersion !== "1.1.0" ||
    candidate.manifest.contentVersion !== "1.3.0" ||
    candidate.manifest.state !== "draft"
  )
    fail(
      "catalog-report-version",
      "catalog",
      "D1 reports require the v1 baseline and inactive 1.3.0 draft",
    );
  versionSchema.parse(snapshotVersion);
  const history = readHistory(rawHistory, snapshotVersion);
  const originals = legacyEntities(legacy).index;
  const mapping = (
    kind: LegacyOrigin["kind"],
    id: string,
    target: PublicEntity | undefined,
    scope: Scope,
  ): MappingFinding => {
    if (!target) return blocked("missing", "The target entity is absent from this draft");
    const matches = candidate.compatibility.filter(
      (m) =>
        m.from.schemaVersion === 1 &&
        m.from.contentVersion === legacy.contentVersion &&
        m.from.kind === kind &&
        m.from.id === id &&
        !m.from.pointer &&
        m.to.contentVersion === candidate.manifest.contentVersion &&
        refKey(m.to.ref) === refKey(target),
    );
    if (matches.length !== 1)
      return blocked(
        "missing",
        "An unambiguous mapping to this exact target release/revision is required",
      );
    const m: CompatibilityEntry = matches[0]!;
    const original = originals.get(`${kind}:${id}`);
    if (
      !original ||
      m.fingerprints.source !== fingerprint(original) ||
      m.fingerprints.target !== fingerprint(target)
    )
      return blocked(
        "stale",
        "Compatibility fingerprints do not match the exact source and target entities",
      );
    const accepted =
      scope === "completion" ? "carry_forward" : scope === "evidence" ? "equivalent" : "same_ids";
    const compatible = m[scope] === accepted;
    return {
      status: m.reviewStatus,
      proposedAction: m[scope],
      semanticallyCompatible: compatible,
      approved: compatible && m.reviewStatus === "approved",
      eligibleForCarry: false,
      reasons: compatible ? [] : [`The mapping proposes ${m[scope]} rather than ${accepted}`],
    };
  };
  const targetLesson = (id: string) => candidate.public.lessons.find((l) => l.id === id);
  const completion = (id: string, version: string) => {
    if (version !== legacy.contentVersion)
      return blocked("unsupported", "This history version has no supported source catalog");
    const m = mapping("lesson", id, targetLesson(id), "completion");
    return {
      ...combined([m], checkLessonCompatibility(baseline, candidate, id).reasons),
      proposedAction: m.proposedAction,
    };
  };
  const assessment = (attempt: QuizAttempt) => {
    const original = {
      id: attempt.id,
      quizId: attempt.quizId,
      lessonId: attempt.lessonId,
      contentVersion: attempt.contentVersion,
      timestamp: attempt.timestamp,
      completedAt: attempt.completedAt,
      status: attempt.status,
      correct: attempt.correct,
      total: attempt.total,
      answered: attempt.answered,
      percentage: attempt.percentage,
      passed: attempt.passed,
    };
    if (attempt.contentVersion !== legacy.contentVersion)
      return {
        original,
        sourceIntegrity: "unsupported" as const,
        targetAssessment: null,
        compatibility: blocked(
          "unsupported",
          "This attempt's original release is unsupported; retain its historical result",
        ),
        responses: [],
      };
    // Audit against the original source only. Do not rewrite/recalculate returned scores.
    const audit = checkLegacyAttempt(legacy, baseline, baseline, attempt);
    const sourceBlock = baseline.public.blocks.find(
      (b) => b.id === attempt.quizId && b.kind === "block",
    );
    const targetBlock = candidate.public.blocks.find(
      (b) => b.id === attempt.quizId && b.kind === "block",
    );
    const sourceRef = sourceBlock?.type === "quiz" ? sourceBlock.assessmentRef : undefined;
    const targetRef = targetBlock?.type === "quiz" ? targetBlock.assessmentRef : undefined;
    const sourceAssessment = baseline.public.assessments.find(
      (a) => sourceRef && refKey(a) === refKey(sourceRef),
    );
    const targetAssessment = candidate.public.assessments.find(
      (a) => targetRef && refKey(a) === refKey(targetRef),
    );
    const sourcePolicy = baseline.private.grading.assessmentPolicies.find(
      (p) => sourceRef && refKey(p.assessmentRef) === refKey(sourceRef),
    );
    const targetPolicy = candidate.private.grading.assessmentPolicies.find(
      (p) => targetRef && refKey(p.assessmentRef) === refKey(targetRef),
    );
    const extra = [...audit.reasons];
    if (
      !sourceAssessment ||
      !targetAssessment ||
      !sourcePolicy ||
      !targetPolicy ||
      semantics(sourceAssessment) !== semantics(targetAssessment) ||
      semantics(sourcePolicy) !== semantics(targetPolicy)
    )
      extra.push("Assessment delivery, required items or grading policy changed or is absent");
    const item = (id: string) => {
      const source = baseline.public.exercises.find((e) => e.id === id);
      const target = candidate.public.exercises.find((e) => e.id === id);
      const result = mapping("question", id, target, "evidence");
      const oldRule = baseline.private.grading.exerciseRules.find(
        (r) => source && refKey(r.exerciseRef) === refKey(source),
      );
      const newRule = candidate.private.grading.exerciseRules.find(
        (r) => target && refKey(r.exerciseRef) === refKey(target),
      );
      const reasons =
        !source ||
        !target ||
        !oldRule ||
        !newRule ||
        semantics(source) !== semantics(target) ||
        semantics(oldRule) !== semantics(newRule)
          ? ["Exercise or grading semantics changed or are absent"]
          : [];
      return { ...combined([result], reasons), proposedAction: result.proposedAction };
    };
    const findings = sourcePolicy?.requiredItems.map((r) => item(r.id)) ?? [];
    const responses = attempt.responses.map((response) => ({
      responseId: response.id,
      questionId: response.questionId,
      timestamp: response.timestamp,
      originalSkill: response.skill,
      isCorrect: response.isCorrect,
      evidenceKind: "recognition" as const,
      demonstratedCoreSkill: false as const,
      compatibility: item(response.questionId),
    }));
    return {
      original,
      sourceIntegrity: audit.compatible ? ("consistent" as const) : ("inconsistent" as const),
      targetAssessment: targetRef ? { ...targetRef } : null,
      compatibility: combined(findings, extra),
      responses,
    };
  };

  const exportData = legacyExportSchema.safeParse(rawHistory);
  const snapshot = exportData.success ? null : learningSnapshotSchema.parse(rawHistory);
  const resume = history.resume;
  let resumeResult = null;
  if (resume) {
    const lesson = targetLesson(resume.lessonId);
    const lessonFinding =
      resume.contentVersion !== legacy.contentVersion
        ? blocked("unsupported", "Resume belongs to an unsupported original release")
        : mapping("lesson", resume.lessonId, lesson, "resume");
    const findings = [lessonFinding];
    const reasons: string[] = [];
    if (resume.contentVersion === legacy.contentVersion) {
      reasons.push(...checkLessonCompatibility(baseline, candidate, resume.lessonId).reasons);
      if (resume.blockId !== null) {
        const target = candidate.public.blocks.find((b) => b.id === resume.blockId);
        findings.push(mapping("block", resume.blockId, target, "resume"));
        const old = baseline.public.blocks.find((b) => b.id === resume.blockId);
        const sourceLesson = baseline.public.lessons.find((l) => l.id === resume.lessonId);
        if (
          !old ||
          !target ||
          !sourceLesson?.blockRefs.some((r) => refKey(r) === refKey(old)) ||
          !lesson?.blockRefs.some((r) => refKey(r) === refKey(target)) ||
          semantics(old) !== semantics(target)
        )
          reasons.push("The saved anchor is missing, changed, or belongs to another lesson");
      }
    }
    resumeResult = {
      original: {
        ...resume,
        updatedAt: exportData.success
          ? (exportData.data.profile?.updated_at ?? null)
          : snapshot!.profile.updatedAt,
      },
      targetLesson: lesson ? { kind: lesson.kind, id: lesson.id, revision: lesson.revision } : null,
      compatibility: combined(findings, reasons),
    };
  }
  return {
    reportVersion: 1 as const,
    readOnly: true as const,
    hostedCompatibility: "not_verified" as const,
    sourceFormat: exportData.success
      ? ("legacy-export-v1" as const)
      : ("learning-snapshot-v1" as const),
    snapshotVersion,
    generation: history.generation,
    target: {
      schemaVersion: 2 as const,
      contentVersion: candidate.manifest.contentVersion,
      state: "inactive-draft" as const,
      publicationApproval: "unapproved" as const,
    },
    cefrAwarding: "disabled" as const,
    completions: history.completions.map((original) => ({
      original,
      compatibility: completion(original.lessonId, original.contentVersion),
    })),
    assessments: history.attempts.map(assessment),
    resume: resumeResult,
  };
}
export type HistoryCompatibilityReport = ReturnType<typeof buildHistoryCompatibilityReport>;
