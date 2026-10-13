import Link from "next/link";
import { Sprout, FlaskConical, ArrowLeft } from "lucide-react";

// Pure presentation. The live session provider is deliberately absent in this shell.
export function PreviewShell({
  children,
  version = "1.3.0",
}: {
  children: React.ReactNode;
  version?: string;
}) {
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 text-white focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-[244px] border-r bg-[#eef2e8] px-7 py-8 lg:block">
        <Link href="/" prefetch={false} className="flex items-center gap-3 text-xl font-bold">
          <span className="rounded-xl bg-primary p-2 text-white">
            <Sprout aria-hidden="true" />
          </span>
          <span>
            LinguaTrack
            <span className="block text-[9px] tracking-[0.27em] text-muted-foreground">
              A C A D E M Y
            </span>
          </span>
        </Link>
        <p className="eyebrow mt-12">Local lesson preview</p>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          An authoring workspace for draft {version}.
        </p>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          Answers and writing stay on this page. Nothing is added to your learning history.
        </p>
        <Link
          href="/courses"
          prefetch={false}
          className="mt-8 flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to my courses
        </Link>
      </aside>
      <div className="lg:ml-[244px]">
        <header className="flex h-[78px] items-center justify-between gap-4 border-b px-5 sm:px-9 xl:px-12">
          <span className="text-sm font-semibold">Lesson preview</span>
          <span className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-[10px] font-semibold">
            <FlaskConical size={14} aria-hidden="true" />
            LOCAL · UNSAVED
          </span>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1530px] px-5 pb-10 pt-8 outline-none sm:px-9 sm:pt-10 xl:px-12"
        >
          {children}
        </main>
        <footer className="px-5 pb-6 text-xs text-muted-foreground sm:px-9 xl:px-12">
          LinguaTrack Academy · English + <span lang="my">မြန်မာ</span> · Inactive draft {version}
        </footer>
      </div>
    </div>
  );
}
