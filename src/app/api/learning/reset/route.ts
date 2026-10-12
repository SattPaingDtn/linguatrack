import { resetSubmissionSchema, learningSnapshotSchema } from "@/lib/learning/contracts";
import { apiFailure, parseSubmission, privateHeaders, requireLearner } from "@/lib/learning/server";
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, resetSubmissionSchema);
    const { client } = await requireLearner();
    const { data, error } = await client.rpc("reset_learning", {
      p_request_id: input.requestId,
      p_version: input.contentVersion,
      p_generation: input.generation,
    });
    if (error) throw error;
    return Response.json(learningSnapshotSchema.parse(data), { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error);
  }
}
