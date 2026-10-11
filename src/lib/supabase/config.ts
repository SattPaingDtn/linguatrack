export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error("Set both Supabase environment variables before enabling persistence.");
  if (!/^https?:\/\//.test(url)) throw new Error("Supabase URL must be an HTTP(S) URL.");
  return { url, key };
}
