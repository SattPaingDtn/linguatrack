"use client";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { SessionProvider } from "@/components/progress/session-provider";
import { PreviewShell } from "@/components/preview/preview-shell";
import {
  CHAPTER_PREVIEW_PATH,
  CHAPTER_PREVIEW_VERSION,
} from "@/lib/curriculum/chapter-preview/config";
import { A1_PREVIEW_PATH, A1_PREVIEW_VERSION } from "@/lib/curriculum/a1-preview/config";
import { MANUSCRIPT_CHAPTERS } from "@/lib/curriculum/manuscript-preview/config";
import { PREVIEW_PATH } from "@/lib/curriculum/preview/config";

export function ApplicationBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (
    process.env.NODE_ENV === "development" &&
    (pathname === A1_PREVIEW_PATH || pathname.startsWith(`${A1_PREVIEW_PATH}/`))
  )
    return (
      <PreviewShell
        version={
          MANUSCRIPT_CHAPTERS.find((c) => pathname.startsWith(`${A1_PREVIEW_PATH}/${c.slug}`))
            ?.version ?? A1_PREVIEW_VERSION
        }
      >
        {children}
      </PreviewShell>
    );
  // Do not mount the provider: even its normal refresh can reconcile a learner's outbox.
  if (
    process.env.NODE_ENV === "development" &&
    (pathname === CHAPTER_PREVIEW_PATH || pathname.startsWith(`${CHAPTER_PREVIEW_PATH}/`))
  )
    return <PreviewShell version={CHAPTER_PREVIEW_VERSION}>{children}</PreviewShell>;
  if (process.env.NODE_ENV === "development" && pathname === PREVIEW_PATH)
    return <PreviewShell>{children}</PreviewShell>;
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
