import { describe, expect, it } from "vitest";
import content from "@/content/v1/curriculum.json";
import { curriculumSchema } from "@/lib/curriculum/schema";
const firstChapter = curriculumSchema.parse(content).courses[0]!.chapters[0]!;
import { gradeQuiz } from "@/lib/quiz";
const quiz = firstChapter.lessons[2]!.blocks.find((block) => block.type === "quiz")!;
describe("quiz scoring", () => {
  it("passes at exactly 80%, fails below it, and ignores unrelated keys", () => {
    const answers = Object.fromEntries(quiz.questions.map((q) => [q.id, q.correctOptionId]));
    answers[quiz.questions[0]!.id] = "invalid";
    expect(gradeQuiz(quiz.questions, answers, 80)).toMatchObject({
      percentage: 80,
      answered: 4,
      passed: false,
    });
    answers[quiz.questions[0]!.id] = quiz.questions[0]!.options[1]!.id;
    answers["unrelated"] = "option-1";
    expect(gradeQuiz(quiz.questions, answers, 80)).toMatchObject({
      correct: 4,
      total: 5,
      percentage: 80,
      answered: 5,
      passed: true,
    });
    answers[quiz.questions[1]!.id] = quiz.questions[1]!.options[0]!.id;
    expect(gradeQuiz(quiz.questions, answers, 80)).toMatchObject({ percentage: 60, passed: false });
  });
  it("never passes an empty or unanswered quiz", () => {
    expect(gradeQuiz(quiz.questions, {}, 80)).toMatchObject({ percentage: 0, passed: false });
    expect(gradeQuiz([], {}, 80)).toMatchObject({ total: 0, passed: false });
  });
});
