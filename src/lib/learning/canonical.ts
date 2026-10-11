import "server-only";
import content from "@/content/v1/curriculum.json";
import { curriculumSchema } from "@/lib/curriculum/schema";
import type { AnswerSubmission, ExerciseResponse } from "./contracts";
const canonical = curriculumSchema.parse(content);
export function validateAnswer(input: AnswerSubmission): {
  quiz: Extract<
    (typeof canonical.courses)[number]["chapters"][number]["lessons"][number]["blocks"][number],
    { type: "quiz" }
  >;
  response: ExerciseResponse;
} {
  if (input.contentVersion !== canonical.contentVersion)
    throw new Error("Content version changed. Reload this lesson before submitting.");
  const lesson = canonical.courses
    .flatMap((course) => course.chapters.flatMap((chapter) => chapter.lessons))
    .find((item) => item.id === input.lessonId);
  const quiz = lesson?.blocks.find((block) => block.type === "quiz" && block.id === input.quizId);
  if (!quiz || quiz.type !== "quiz") throw new Error("Unknown quiz for this lesson.");
  const question = quiz.questions.find((q) => q.id === input.questionId);
  const option = question?.options.find((o) => o.id === input.optionId);
  if (!question || !option) throw new Error("Unknown question or answer option.");
  return {
    quiz,
    response: {
      id: crypto.randomUUID(),
      questionId: question.id,
      prompt: question.prompt,
      skill: question.skill,
      options: question.options,
      selectedOptionId: option.id,
      selectedText: option.text,
      correctOptionId: question.correctOptionId,
      correctText: question.options.find((o) => o.id === question.correctOptionId)!.text,
      isCorrect: option.id === question.correctOptionId,
      explanation: question.explanation,
      timestamp: Date.now(),
    },
  };
}
