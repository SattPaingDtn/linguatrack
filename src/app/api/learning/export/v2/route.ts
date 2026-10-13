import { apiFailure, privateHeaders } from "@/lib/learning/server";
import { readCombinedHistory } from "@/lib/learning/v2/server";
export async function GET() {
  try {
    const history = await readCombinedHistory();
    return new Response(JSON.stringify(history, null, 2), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="linguatrack-learning-export-v2.json"',
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
