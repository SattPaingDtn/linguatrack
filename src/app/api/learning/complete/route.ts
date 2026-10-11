import { completionSchema, learningSnapshotSchema } from "@/lib/learning/contracts";
import { apiFailure, parseSubmission, privateHeaders, requireLearner } from "@/lib/learning/server";
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, completionSchema);
    const { client } = await requireLearner();
    const { data, error } = await client.rpc("complete_lesson", {
      p_version: input.contentVersion,
      p_lesson_id: input.lessonId,
    });
    if (error) throw error;
    return Response.json(learningSnapshotSchema.parse(data), { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error);
  }
}
