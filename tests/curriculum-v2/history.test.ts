// @vitest-environment node
import { expect, it } from "vitest";
import { emptySnapshot } from "../../src/lib/learning/contracts";
import { readHistory } from "../../src/lib/curriculum/v2/history";
import { submissionSchema } from "../../src/lib/curriculum/v2/submissions";
import { ref } from "../../src/lib/curriculum/v2/common";
import { canonicalJson } from "../../src/lib/curriculum/v2/json";
import { savedAttempt } from "../fixtures";
it("reads the actual Phase 2 learner export without changing dates, responses or generation", () => {
  const uid = crypto.randomUUID();
  const timestamp = "2026-10-11T00:00:00+00:00";
  const exportData = {
    exportVersion: 1,
    exportedAt: timestamp,
    userId: uid,
    profile: {
      id: uid,
      last_lesson_id: "a1-c1-check",
      last_block_id: "a1-c1-quiz",
      content_version: "1.0.0",
      updated_at: timestamp,
      created_at: timestamp,
      learning_generation: 2,
    },
    lessonProgress: [
      {
        user_id: uid,
        content_version: "1.0.0",
        lesson_id: "a1-c1-be",
        completed_at: timestamp,
        completion_source: "self_reported",
      },
    ],
    attempts: [savedAttempt()],
    mistakeReviews: [],
    studySessions: [],
  };
  const before = canonicalJson(exportData);
  const result = readHistory(exportData, "1.0.0");
  expect(result.generation).toBe(2);
  expect(result.completions[0]).toMatchObject({ completedAt: timestamp, lessonId: "a1-c1-be" });
  expect(result.attempts).toEqual(exportData.attempts);
  expect(canonicalJson(exportData)).toBe(before);
  exportData.lessonProgress[0]!.user_id = crypto.randomUUID();
  expect(() => readHistory(exportData, "1.0.0")).toThrow(/history-owner/);
});
it("supports empty post-reset snapshots without recreating old progress", () => {
  const result = readHistory({ ...emptySnapshot, generation: 3 }, "1.0.0");
  expect(result).toEqual({ generation: 3, completions: [], attempts: [], resume: null });
  expect(() => readHistory({ malformed: true }, "1.0.0")).toThrow(/history-schema/);
});
it("defines typed v2 submissions while rejecting forged owner, scores and unknown payloads", () => {
  const request = {
    schemaVersion: 2,
    contentVersion: "1.1.0",
    attemptId: crypto.randomUUID(),
    responseId: crypto.randomUUID(),
    generation: 0,
    delivery: ref("assessment", "a1-c1-assessment"),
    exercise: ref("exercise", "a1-c1-q1"),
    response: { type: "multiple_choice", optionIds: ["option-1"] },
  };
  expect(submissionSchema.safeParse(request).success).toBe(true);
  for (const field of ["owner", "score", "isCorrect", "timestamp"])
    expect(submissionSchema.safeParse({ ...request, [field]: "forged" }).success).toBe(false);
  expect(submissionSchema.safeParse({ ...request, response: { type: "ai_grading" } }).success).toBe(
    false,
  );
});
