import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ApiError,
  apiFailure,
  parseSubmission,
  privateHeaders,
  requestOrigin,
} from "@/lib/learning/server";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("signout") }).strict(),
  z
    .object({
      action: z.literal("signin"),
      email: z.email().max(254),
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("signup"),
      email: z.email().max(254),
      password: z.string().min(8).max(128),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const input = await parseSubmission(request, schema);
    const client = await createSupabaseServerClient();
    if (!client)
      throw new ApiError(
        "Supabase is not configured. Follow the setup guide before creating an account.",
        503,
      );
    if (input.action === "signout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new ApiError("Sign-out failed. Retry when the connection returns.", 503);
      return Response.json(
        { signedIn: false, confirmationRequired: false },
        { headers: privateHeaders },
      );
    }
    if (input.action === "signin") {
      const { data, error } = await client.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error)
        throw new ApiError(
          "Unable to sign in. Check your email, password and email confirmation, then retry.",
          400,
        );
      return Response.json(
        { signedIn: Boolean(data.session), confirmationRequired: false },
        { headers: privateHeaders },
      );
    }
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: new URL("/auth/callback", requestOrigin(request)).toString() },
    });
    if (error)
      throw new ApiError("Account creation failed. Check your details or try again later.", 400);
    return Response.json(
      { signedIn: Boolean(data.session), confirmationRequired: !data.session },
      { headers: privateHeaders },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
