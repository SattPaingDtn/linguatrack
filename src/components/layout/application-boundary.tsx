"use client";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { SessionProvider } from "@/components/progress/session-provider";
import { PreviewShell } from "@/components/preview/preview-shell";
import { PREVIEW_PATH } from "@/lib/curriculum/preview/config";

export function ApplicationBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Do not mount the provider: even its normal refresh can reconcile a learner's outbox.
  if (process.env.NODE_ENV === "development" && pathname === PREVIEW_PATH)
    return <PreviewShell>{children}</PreviewShell>;
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
