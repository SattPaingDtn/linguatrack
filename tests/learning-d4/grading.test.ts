// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gradePinnedMcq } from "@/lib/learning/v2/mcq-writer";
import authored from "../../content-authoring/a1-subject-pronouns/public.json";
import grading from "../../content-authoring/a1-subject-pronouns/grading.json";
import { input } from "./fixtures";
it("retains all 14 subject-pronoun correct mappings and bilingual explanations without importing the draft", () => {
  expect(authored.exercises).toHaveLength(14);
  for (const question of authored.exercises) {
    const rule = grading.exerciseRules.find((r) => r.exerciseRef.id === question.id)!;
    const s = {
      ...input("a".repeat(64)),
      exercise: { kind: "exercise" as const, id: question.id, revision: question.revision },
      response: { type: "multiple_choice" as const, optionIds: rule.correctOptionIds },
    };
    expect(gradePinnedMcq(question, rule, s)).toMatchObject({
      isCorrect: true,
      points: rule.maxPoints,
      explanation: rule.explanation,
    });
    expect(
      gradePinnedMcq(question, rule, {
        ...s,
        response: {
          ...s.response,
          optionIds: [question.options.find((o) => !rule.correctOptionIds.includes(o.id))!.id],
        },
      }).isCorrect,
    ).toBe(false);
    expect(() =>
      gradePinnedMcq(question, rule, {
        ...s,
        response: {
          ...s.response,
          optionIds: [s.response.optionIds[0]!, s.response.optionIds[0]!],
        },
      }),
    ).toThrow(/valid options/);
  }
});
