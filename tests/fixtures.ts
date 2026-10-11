import { randomUUID } from "node:crypto";
import raw from "@/content/v1/curriculum.json";
import { curriculumSchema } from "@/lib/curriculum/schema";
import type { AnswerSubmission, ExerciseResponse, QuizAttempt } from "@/lib/learning/contracts";
export const canonical = curriculumSchema.parse(raw);
export const canonicalQuiz = canonical.courses[0]!.chapters[0]!.lessons[2]!.blocks.find(
  (b) => b.type === "quiz",
)!;
export const input: AnswerSubmission = {
  attemptId: randomUUID(),
  contentVersion: canonical.contentVersion,
  lessonId: "a1-c1-check",
  quizId: canonicalQuiz.id,
  questionId: canonicalQuiz.questions[0]!.id,
  optionId: canonicalQuiz.questions[0]!.correctOptionId,
};
export function gradedResponse(answer: AnswerSubmission): ExerciseResponse {
  const q = canonicalQuiz.questions.find((q) => q.id === answer.questionId)!;
  const selected = q.options.find((o) => o.id === answer.optionId)!;
  const correct = q.options.find((o) => o.id === q.correctOptionId)!;
  return {
    id: randomUUID(),
    questionId: q.id,
    prompt: q.prompt,
    skill: q.skill,
    options: q.options,
    selectedOptionId: selected.id,
    selectedText: selected.text,
    correctOptionId: correct.id,
    correctText: correct.text,
    isCorrect: selected.id === correct.id,
    explanation: q.explanation,
    timestamp: Date.now(),
  };
}
export function savedAttempt(
  id = input.attemptId,
  responses = [gradedResponse(input)],
): QuizAttempt {
  const correct = responses.filter((r) => r.isCorrect).length;
  const finished = responses.length === canonicalQuiz.questions.length;
  return {
    id,
    quizId: canonicalQuiz.id,
    lessonId: input.lessonId,
    contentVersion: canonical.contentVersion,
    title: canonicalQuiz.title,
    correct,
    total: canonicalQuiz.questions.length,
    answered: responses.length,
    percentage: Math.round((correct / 5) * 100),
    passed: finished && correct >= 4,
    timestamp: responses[0]!.timestamp,
    completedAt: finished ? responses.at(-1)!.timestamp : null,
    status: finished ? "completed" : "in_progress",
    answers: Object.fromEntries(responses.map((r) => [r.questionId, r.selectedOptionId])),
    responses,
  };
}
