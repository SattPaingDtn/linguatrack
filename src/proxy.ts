import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  let config;
  try {
    config = getSupabaseConfig();
  } catch {
    return NextResponse.next();
  } // API surfaces configuration errors.
  if (!config) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  // The API independently verifies getUser; proxy only refreshes cookies.
  try {
    await supabase.auth.getClaims();
  } catch {
    /* Do not downgrade an API auth failure to preview. */
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/api/learning/:path*", "/api/auth/:path*", "/auth/:path*"] };
