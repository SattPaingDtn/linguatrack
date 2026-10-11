import { positionSchema } from "@/lib/learning/contracts";
import { apiFailure, parseSubmission, privateHeaders, requireLearner } from "@/lib/learning/server";
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, positionSchema);
    const { client } = await requireLearner();
    const { error } = await client.rpc("touch_position", {
      p_version: input.contentVersion,
      p_lesson_id: input.lessonId,
      p_block_id: input.blockId,
      p_session_id: input.sessionId,
      p_sequence: input.sequence,
    });
    if (error) throw error;
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error);
  }
}
