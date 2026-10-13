import { combinedHistorySchema } from "./contracts";
// Read-only projection. Never transforms v1 rows into v2 or carries pending mappings.
export function summarizeCombinedHistory(raw: unknown) {
  const history = combinedHistorySchema.parse(raw);
  const superseded = new Set(history.v2.grades.map((g) => g.previous_grade_id).filter(Boolean));
  const decisions = history.v2.grades.filter((g) => !superseded.has(g.id) && g.status === "graded");
  return {
    generation: history.generation,
    lessonCompletions: {
      v1: history.legacy.lessonProgress.length,
      v2: history.v2.completion_events.length,
    },
    attempts: { v1: history.legacy.attempts.length, v2: history.v2.attempts.length },
    checkedResponses: decisions.length,
    correctResponses: decisions.filter((g) => g.is_correct).length,
    recognitionResponses: history.v2.responses.filter((r) => r.evidence_construct === "recognition")
      .length,
    assessmentResults: history.v2.attempt_results.filter((r) => r.passed !== null).length,
    demonstratedCefr: null,
    resume: history.resume,
  };
}
