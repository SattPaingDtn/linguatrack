import type { Lesson, LearningArea } from "@/lib/curriculum/schema";
import type { QuizAttempt } from "./contracts";
export function calculateProgress(
  lessons: Lesson[],
  completed: string[],
  attempts: QuizAttempt[],
  version: string,
) {
  const completedCount = lessons.filter((lesson) => completed.includes(lesson.id)).length;
  const latest = new Map<string, QuizAttempt["responses"][number]>();
  const validLessons = new Set(lessons.map((lesson) => lesson.id));
  for (const attempt of [...attempts]
    .filter((a) => a.contentVersion === version && validLessons.has(a.lessonId))
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))) {
    for (const response of attempt.responses) {
      const key = `${attempt.quizId}:${response.questionId}`;
      if (!latest.has(key) || latest.get(key)!.timestamp <= response.timestamp)
        latest.set(key, response);
    }
  }
  const areas: LearningArea[] = [
    "listening",
    "speaking",
    "reading",
    "writing",
    "grammar",
    "vocabulary",
  ];
  return {
    completedCount,
    completionPercentage: lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0,
    evidence: Object.fromEntries(
      areas.map((area) => {
        const responses = [...latest.values()].filter((response) => response.skill === area);
        const correct = responses.filter((response) => response.isCorrect).length;
        return [
          area,
          {
            total: responses.length,
            correct,
            percentage: responses.length ? Math.round((correct / responses.length) * 100) : null,
          },
        ];
      }),
    ) as Record<LearningArea, { total: number; correct: number; percentage: number | null }>,
  };
}
