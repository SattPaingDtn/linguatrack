import { z } from "zod";
import {
  apiFailure,
  ApiError,
  parseSubmission,
  privateHeaders,
  requireLearner,
} from "@/lib/learning/server";
import { mcqSubmissionSchema } from "@/lib/learning/v2/mcq-contracts";
import { requireStagingTarget, stagingMcqEnabled } from "@/lib/learning/v2/staging-environment";
import { commitStagingAnswer } from "@/lib/learning/v2/staging-database";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!stagingMcqEnabled()) throw new ApiError("V2 MCQ learning is not enabled.", 404);
    requireStagingTarget();
    const input = await parseSubmission(request, mcqSubmissionSchema);
    const { user } = await requireLearner();
    // A reject-only hint prevents a queued A answer being saved under newly switched B cookies.
    const expected = request.headers.get("X-Learner-ID");
    if (!z.uuid().safeParse(expected).success || expected !== user.id)
      throw new ApiError(
        "Your account changed. Sign in to the original account to retry this answer.",
        409,
      );
    return Response.json(await commitStagingAnswer(user.id, input), { headers: privateHeaders });
  } catch (error) {
    const code = z.object({ code: z.string() }).safeParse(error);
    if (code.success && ["23505", "22023", "42501", "54000"].includes(code.data.code))
      return apiFailure(
        new ApiError(
          code.data.code === "23505"
            ? "This answer conflicts with an existing attempt. Keep the queued answer and retry or start a new attempt."
            : "The staging release, account, answer or review permissions are unavailable. Your pending answer has not been discarded.",
          code.data.code === "23505"
            ? 409
            : code.data.code === "22023"
              ? 400
              : code.data.code === "54000"
                ? 429
                : 403,
        ),
      );
    return apiFailure(error);
  }
}
