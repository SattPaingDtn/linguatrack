import { mistakeSubmissionSchema } from "@/lib/learning/contracts";
import { apiFailure, parseSubmission, privateHeaders, requireLearner } from "@/lib/learning/server";
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, mistakeSubmissionSchema);
    const { client } = await requireLearner();
    const { error } = await client.rpc("review_mistake", {
      p_response_id: input.responseId,
      p_generation: input.generation,
    });
    if (error) throw error;
    return Response.json({ reviewedAt: new Date().toISOString() }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error);
  }
}
