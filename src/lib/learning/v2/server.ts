import "server-only";
import { ApiError, requireLearner } from "../server";
import { combinedHistorySchema } from "./contracts";
export function v2HistoryEnabled() {
  return process.env.LINGUATRACK_V2_HISTORY_ENABLED === "true";
}
export async function readCombinedHistory() {
  // Default off. Merely installing D3 or having a valid draft cannot enable delivery/writes.
  if (!v2HistoryEnabled()) throw new ApiError("Combined history is not enabled.", 404);
  const { client, user } = await requireLearner();
  const { data, error } = await client.rpc("learning_history_v2", {});
  if (error) throw error;
  const result = combinedHistorySchema.parse(data);
  if (result.userId !== user.id) throw new ApiError("History owner mismatch.", 503);
  return result;
}
