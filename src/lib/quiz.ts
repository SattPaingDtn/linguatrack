import type { Question } from "@/lib/curriculum/schema";

export type Answers = Readonly<Record<string, string>>;
export function gradeQuiz(questions: Question[], answers: Answers, passingPercent: number) {
  const correct = questions.filter((q) => answers[q.id] === q.correctOptionId).length;
  const answered = questions.filter((q) => q.options.some((o) => o.id === answers[q.id])).length;
  const percentage = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  return {
    correct,
    total: questions.length,
    answered,
    percentage,
    passed: questions.length > 0 && answered === questions.length && percentage >= passingPercent,
  };
}
