import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Local A1 expansion preview",
  robots: { index: false, follow: false },
};
export default async function A1PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) notFound();
  return children;
}
