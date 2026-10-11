import { describe, expect, it } from "vitest";
import { availableLessons, curriculum } from "@/lib/curriculum";
import { calculateProgress } from "@/lib/learning/progress";
import { gradedResponse, input, savedAttempt } from "./fixtures";
describe("completion and evidence calculation", () => {
  it("never treats lesson coverage as demonstrated proficiency", () => {
    const result = calculateProgress(
      availableLessons,
      availableLessons.map((l) => l.id),
      [],
      curriculum.contentVersion,
    );
    expect(result.completionPercentage).toBe(100);
    expect(result.evidence.listening.percentage).toBeNull();
    expect(result.evidence.speaking.total).toBe(0);
  });
  it("uses the newest unique response, includes partial attempts and cannot inflate evidence with retries", () => {
    const first = gradedResponse(input);
    first.timestamp = 100;
    const second = { ...first, id: crypto.randomUUID(), timestamp: 200, isCorrect: false };
    const old = savedAttempt(crypto.randomUUID(), [first]);
    old.timestamp = 100;
    const latest = savedAttempt(crypto.randomUUID(), [second]);
    latest.timestamp = 200;
    const result = calculateProgress(
      availableLessons,
      [],
      [latest, old, old],
      curriculum.contentVersion,
    );
    expect(result.evidence.grammar).toEqual({ total: 1, correct: 0, percentage: 0 });
    expect(result.completionPercentage).toBe(0);
  });
  it("excludes other versions and unknown lessons while deduplicating completed IDs", () => {
    const old = { ...savedAttempt(), contentVersion: "0.1.0" };
    const unknown = { ...savedAttempt(), lessonId: "other-lesson" };
    const result = calculateProgress(
      availableLessons,
      ["a1-c1-introductions", "a1-c1-introductions", "unknown"],
      [old, unknown],
      curriculum.contentVersion,
    );
    expect(result.completedCount).toBe(1);
    expect(result.completionPercentage).toBe(33);
    expect(result.evidence.grammar.total).toBe(0);
    expect(calculateProgress([], [], [], curriculum.contentVersion).completionPercentage).toBe(0);
  });
});
