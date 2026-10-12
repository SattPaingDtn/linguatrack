import { curriculumSchema } from "../schema";
import type { QuizAttempt } from "../../learning/contracts";
import { gradeQuiz } from "../../quiz";
import { fingerprint } from "./json";
import { ref, type Ref } from "./common";
import { type CurriculumPackage } from "./package";
import { refKey } from "./validate";
export type CompatibilityResult = { compatible: boolean; reasons: string[]; approved: boolean };
// Compare a fresh deterministic bridge with a candidate, including private semantics and routes.
// No data writes, carried completion events, CEFR awards, or history mutation occur here.
export function checkLessonCompatibility(
  baseline: CurriculumPackage,
  candidate: CurriculumPackage,
  lessonId: string,
): CompatibilityResult {
  const reasons: string[] = [];
  const old = baseline.public.lessons.find((l) => l.id === lessonId);
  const next = candidate.public.lessons.find((l) => l.id === lessonId);
  if (!old || !next)
    return {
      compatible: false,
      reasons: ["Lesson is absent from baseline or candidate"],
      approved: false,
    };
  const ignoredMeta = (value: unknown) => {
    const walk = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .filter(
                  ([k]) => !["revision", "source", "gradingRevision", "policyRevision"].includes(k),
                )
                .map(([k, x]) => [k, walk(x)]),
            )
          : v;
    return fingerprint(walk(value));
  };
  if (ignoredMeta(old) !== ignoredMeta(next))
    reasons.push(
      "Lesson content, slug, objectives, order, prerequisites or completion policy changed",
    );
  const related = (pkg: CurriculumPackage) => {
    const lesson = pkg.public.lessons.find((l) => l.id === lessonId)!;
    const chapter = pkg.public.chapters.find((c) => refKey(c) === refKey(lesson.chapterRef));
    const course =
      chapter && pkg.public.courses.find((c) => refKey(c) === refKey(chapter.courseRef));
    const blocks = lesson.blockRefs.map((r) =>
      pkg.public.blocks.find((b) => refKey(b) === refKey(r)),
    );
    const exerciseIds = blocks.flatMap((b) =>
      b?.type === "quiz" || b?.type === "exercise_set" ? b.exerciseRefs.map((r) => r.id) : [],
    );
    const stimuli = blocks.flatMap((b) =>
      b?.type === "reading" || b?.type === "listening"
        ? pkg.public.stimuli.filter((s) => refKey(s) === refKey(b.stimulusRef))
        : [],
    );
    const listening = stimuli.filter((s) => s.type === "listening");
    const objectives = lesson.objectiveRefs.map((r) =>
      pkg.public.objectives.find((o) => refKey(o) === refKey(r)),
    );
    const assessmentId =
      lesson.completionPolicy.type === "assessment_pass"
        ? lesson.completionPolicy.assessmentRef.id
        : null;
    return {
      route: {
        courseId: course?.id,
        courseSlug: course?.slug,
        chapterId: chapter?.id,
        chapterSlug: chapter?.slug,
        lessonSlug: lesson.slug,
      },
      blocks,
      objectives,
      stimuli,
      transcripts: listening.map((s) =>
        [...pkg.public.transcripts, ...pkg.private.transcripts].find(
          (t) => refKey(t) === refKey(s.transcriptRef),
        ),
      ),
      assets: listening.map((s) => pkg.public.assets.find((a) => refKey(a) === refKey(s.audioRef))),
      exercises: exerciseIds.map((id) => pkg.public.exercises.find((e) => e.id === id)),
      rules: exerciseIds.map((id) =>
        pkg.private.grading.exerciseRules.find((r) => r.exerciseRef.id === id),
      ),
      assessment: pkg.public.assessments.find((a) => a.id === assessmentId) ?? null,
      policy:
        pkg.private.grading.assessmentPolicies.find((p) => p.assessmentRef.id === assessmentId) ??
        null,
    };
  };
  if (ignoredMeta(related(baseline)) !== ignoredMeta(related(candidate)))
    reasons.push("Route, block, question/options, media, objective or grading semantics changed");
  const mapping = candidate.compatibility.find(
    (m) =>
      m.from.schemaVersion === 1 &&
      m.from.kind === "lesson" &&
      m.from.id === lessonId &&
      m.from.contentVersion === baseline.manifest.basedOn.contentVersion &&
      m.to.contentVersion === candidate.manifest.contentVersion &&
      refKey(m.to.ref) === refKey(next),
  );
  if (
    !mapping ||
    mapping.completion !== "carry_forward" ||
    mapping.fingerprints.target !== fingerprint(next) ||
    mapping.fingerprints.source !==
      baseline.compatibility.find(
        (m) => m.from.schemaVersion === 1 && m.from.kind === "lesson" && m.from.id === lessonId,
      )?.fingerprints.source
  )
    reasons.push("Missing or stale explicit completion compatibility mapping");
  return {
    compatible: reasons.length === 0,
    reasons,
    approved: reasons.length === 0 && mapping?.reviewStatus === "approved",
  };
}
export function checkCompletedLessons(
  baseline: CurriculumPackage,
  candidate: CurriculumPackage,
  completed: readonly string[],
) {
  return completed.map((lessonId) => ({
    lessonId,
    ...checkLessonCompatibility(baseline, candidate, lessonId),
  }));
}
export function checkResumeCompatibility(
  baseline: CurriculumPackage,
  candidate: CurriculumPackage,
  position: { contentVersion: string; lessonId: string; blockId: string | null },
): CompatibilityResult {
  const result = checkLessonCompatibility(baseline, candidate, position.lessonId);
  if (position.contentVersion !== baseline.manifest.basedOn.contentVersion)
    result.reasons.push("Resume is pinned to a different legacy release");
  const resumeMapping = candidate.compatibility.find(
    (m) =>
      m.from.schemaVersion === 1 && m.from.kind === "lesson" && m.from.id === position.lessonId,
  );
  if (resumeMapping?.resume !== "same_ids")
    result.reasons.push(
      "Resume requires an explicit restart notice rather than carrying this anchor",
    );
  const lesson = candidate.public.lessons.find((l) => l.id === position.lessonId);
  if (position.blockId !== null && !lesson?.blockRefs.some((r) => r.id === position.blockId))
    result.reasons.push("Saved block anchor is absent from this lesson");
  return {
    ...result,
    compatible: result.reasons.length === 0,
    approved: result.approved && result.reasons.length === 0,
  };
}
export function checkLegacyAttempt(
  raw: unknown,
  baseline: CurriculumPackage,
  candidate: CurriculumPackage,
  attempt: QuizAttempt,
): CompatibilityResult {
  const legacy = curriculumSchema.parse(raw);
  const reasons: string[] = [];
  const lesson = legacy.courses
    .flatMap((c) => c.chapters.flatMap((ch) => ch.lessons))
    .find((l) => l.id === attempt.lessonId);
  const quiz = lesson?.blocks.find((b) => b.type === "quiz" && b.id === attempt.quizId);
  const completion = checkLessonCompatibility(baseline, candidate, attempt.lessonId);
  reasons.push(...completion.reasons);
  if (
    attempt.contentVersion !== legacy.contentVersion ||
    baseline.manifest.basedOn.contentVersion !== legacy.contentVersion ||
    !quiz ||
    quiz.type !== "quiz"
  )
    return {
      compatible: false,
      reasons: [...reasons, "Attempt release/lesson/quiz does not match the legacy baseline"],
      approved: false,
    };
  if (attempt.title !== quiz.title)
    reasons.push("Historical attempt title differs from the original quiz");
  const seen = new Set<string>();
  for (const response of attempt.responses) {
    const q = quiz.questions.find((q) => q.id === response.questionId);
    const selected = q?.options.find((o) => o.id === response.selectedOptionId);
    const correct = q?.options.find((o) => o.id === q.correctOptionId);
    if (seen.has(response.questionId)) reasons.push("Attempt contains duplicate final responses");
    seen.add(response.questionId);
    if (
      !q ||
      !selected ||
      !correct ||
      response.prompt !== q.prompt ||
      response.skill !== q.skill ||
      fingerprint(response.options) !== fingerprint(q.options) ||
      response.correctOptionId !== q.correctOptionId ||
      response.selectedText !== selected.text ||
      response.correctText !== correct.text ||
      response.isCorrect !== (selected.id === correct.id) ||
      fingerprint(response.explanation) !== fingerprint(q.explanation) ||
      attempt.answers[response.questionId] !== selected.id
    )
      reasons.push(
        `Historical response ${response.questionId} differs from its original grading snapshot`,
      );
  }
  const score = gradeQuiz(quiz.questions, attempt.answers, quiz.passingPercent);
  if (
    Object.keys(attempt.answers).length !== seen.size ||
    attempt.total !== score.total ||
    attempt.correct !== score.correct ||
    attempt.answered !== score.answered ||
    attempt.percentage !== score.percentage ||
    attempt.passed !== score.passed ||
    (attempt.status === "completed") !== (score.answered === score.total) ||
    (attempt.completedAt !== null) !== (attempt.status === "completed")
  )
    reasons.push("Historical attempt totals/finalization disagree with its saved responses");
  return {
    compatible: reasons.length === 0,
    reasons,
    approved: completion.approved && reasons.length === 0,
  };
}
// Bridge grading oracle for equivalence tests and offline audits; no submission API is activated.
export function gradeLegacyBridge(
  pkg: CurriculumPackage,
  assessment: Ref<"assessment">,
  answers: Readonly<Record<string, string>>,
) {
  const policy = pkg.private.grading.assessmentPolicies.find(
    (p) => refKey(p.assessmentRef) === refKey(assessment),
  );
  if (!policy || policy.aggregation !== "legacy-rounded-percent-v1")
    throw new Error("Expected a legacy-rounded-percent-v1 policy");
  let correct = 0;
  let answered = 0;
  for (const r of policy.requiredItems) {
    const exercise = pkg.public.exercises.find((e) => refKey(e) === refKey(r));
    const rule = pkg.private.grading.exerciseRules.find(
      (rule) => refKey(rule.exerciseRef) === refKey(r),
    );
    if (
      exercise?.type !== "multiple_choice" ||
      rule?.type !== "multiple_choice" ||
      exercise.selection !== "single"
    )
      throw new Error("Invalid legacy bridge exercise/rule");
    const selected = answers[exercise.id];
    if (exercise.options.some((o) => o.id === selected)) {
      answered++;
      if (rule.correctOptionIds[0] === selected) correct++;
    }
  }
  const total = policy.requiredItems.length;
  const percentage = total ? Math.round((correct / total) * 100) : 0;
  return {
    correct,
    total,
    answered,
    percentage,
    passed: total > 0 && answered === total && percentage >= policy.passPercent,
  };
}
export const legacyAssessmentRef = ref("assessment", "a1-c1-assessment");
