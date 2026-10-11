import { requestOrigin } from "@/lib/learning/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  try {
    const client = await createSupabaseServerClient();
    if (client && code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/", requestOrigin(request)));
    }
  } catch {
    /* Give an actionable error without exposing authentication details. */
  }
  return NextResponse.redirect(new URL("/account?confirmation=failed", requestOrigin(request)));
}
