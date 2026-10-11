import { answerSubmissionSchema, quizAttemptSchema } from "@/lib/learning/contracts";
import { validateAnswer } from "@/lib/learning/canonical";
import {
  apiFailure,
  learningIdentity,
  parseSubmission,
  privateHeaders,
  ApiError,
} from "@/lib/learning/server";
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, answerSubmissionSchema);
    let validation;
    try {
      validation = validateAnswer(input);
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : "Invalid answer.");
    }
    const { client, user } = await learningIdentity();
    if (!client || !user)
      return Response.json(
        {
          mode: "preview",
          response: validation.response,
          title: validation.quiz.title,
          total: validation.quiz.questions.length,
          passingPercent: validation.quiz.passingPercent,
        },
        { headers: privateHeaders },
      );
    const { data, error } = await client.rpc("answer_question", {
      p_attempt_id: input.attemptId,
      p_version: input.contentVersion,
      p_lesson_id: input.lessonId,
      p_quiz_id: input.quizId,
      p_question_id: input.questionId,
      p_option_id: input.optionId,
    });
    if (error) throw error;
    return Response.json(
      { mode: "persistent", attempt: quizAttemptSchema.parse(data) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
