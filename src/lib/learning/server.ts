import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function learningIdentity() {
  const client = await createSupabaseServerClient();
  if (!client) return { client: null, user: null };
  const { data, error } = await client.auth.getUser();
  const invalidSession =
    error &&
    (error.name === "AuthSessionMissingError" ||
      [
        "bad_jwt",
        "session_not_found",
        "refresh_token_not_found",
        "refresh_token_already_used",
        "user_not_found",
        "user_banned",
      ].includes(error.code ?? ""));
  if (invalidSession) return { client, user: null };
  if (error)
    throw new ApiError(
      "Unable to verify your account. Your answers have not been discarded. Retry when the connection returns.",
      503,
    );
  return { client, user: data.user };
}
export async function requireLearner() {
  const identity = await learningIdentity();
  if (!identity.client || !identity.user)
    throw new ApiError("Sign in to save your learning progress.", 401);
  return { client: identity.client, user: identity.user };
}
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
  if (protocol !== "http" && protocol !== "https") throw new ApiError("Invalid app origin.", 403);
  const origin = new URL(`${protocol}://${host}`);
  if (origin.host !== host || origin.username || origin.password)
    throw new ApiError("Invalid app host.", 403);
  return origin.origin;
}
export async function parseSubmission<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const origin = request.headers.get("Origin");
  if (origin !== requestOrigin(request))
    throw new ApiError("Submission must come from this app.", 403);
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new ApiError("Expected a JSON submission.", 415);
  if (Number(request.headers.get("Content-Length")) > 32768)
    throw new ApiError("Submission is too large.", 413);
  const raw = await request.text();
  if (raw.length > 32768) throw new ApiError("Submission is too large.", 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new ApiError("Submission is not valid JSON.");
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApiError("Invalid submission. Reload the lesson or check the selected answer.");
  return parsed.data;
}
export function apiFailure(error: unknown) {
  const staleGeneration = z.object({ code: z.literal("40001") }).safeParse(error).success;
  const status = error instanceof ApiError ? error.status : staleGeneration ? 409 : 503;
  const message =
    error instanceof ApiError
      ? error.message
      : staleGeneration
        ? "Learning history was reset. Reload to start again; pre-reset answers cannot be saved."
        : "Learning data could not be saved or loaded. Keep this page open and retry; check Supabase configuration and migrations.";
  return Response.json({ error: message }, { status, headers: privateHeaders });
}
