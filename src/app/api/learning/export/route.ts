import { apiFailure, privateHeaders, requireLearner } from "@/lib/learning/server";
export async function GET() {
  try {
    const { client } = await requireLearner();
    const { data, error } = await client.rpc("learning_export", {});
    if (error) throw error;
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="linguatrack-learning-export.json"',
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
