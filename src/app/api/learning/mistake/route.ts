import { z } from "zod";
import { apiFailure, parseSubmission, privateHeaders, requireLearner } from "@/lib/learning/server";
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, z.object({ responseId: z.uuid() }).strict());
    const { client } = await requireLearner();
    const { error } = await client.rpc("review_mistake", { p_response_id: input.responseId });
    if (error) throw error;
    return Response.json({ reviewedAt: new Date().toISOString() }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error);
  }
}
