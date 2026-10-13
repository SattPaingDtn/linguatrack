import { apiFailure, privateHeaders } from "@/lib/learning/server";
import { readCombinedHistory } from "@/lib/learning/v2/server";
export async function GET() {
  try {
    return Response.json(await readCombinedHistory(), { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error);
  }
}
