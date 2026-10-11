"use client";
import Link from "next/link";
import { useState } from "react";
import { Info } from "lucide-react";
import { useSession } from "@/components/progress/session-provider";
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  const { mode, loading, configured, error, pendingAnswers, retrySync, refresh } = useSession();
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#dfe6d7] bg-[#edf2e7] px-4 py-3 text-xs leading-relaxed text-[#506347]">
      <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {loading || mode === "loading" ? (
          <p role="status">Loading your learning data…</p>
        ) : (
          <p>
            <strong className="font-semibold">
              {mode === "persistent" ? "Your learning, saved." : "A space to try things out."}
            </strong>{" "}
            {mode === "persistent"
              ? "Answers and completed lessons are saved to your account across devices."
              : compact
                ? "Progress is session only and resets on reload."
                : "Preview progress and quiz history stay in memory. Reloading clears them."}
            {mode === "preview" && (
              <>
                {" "}
                <Link className="underline" href="/account">
                  {configured
                    ? "Sign in to save your progress."
                    : "Supabase setup is required for saved progress."}
                </Link>
              </>
            )}
          </p>
        )}
        {pendingAnswers.length > 0 && (
          <p role="status" className="mt-2 font-semibold">
            {pendingAnswers.length} answer(s) await save confirmation. They are retained on this
            browser for your account. Retry to sync.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2">
            {error}
          </p>
        )}
        {(error || pendingAnswers.length > 0) && (
          <button
            className="mt-2 font-semibold underline"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                if (pendingAnswers.length) await retrySync();
                else await refresh();
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? "Retrying…" : "Retry synchronization"}
          </button>
        )}
      </div>
    </div>
  );
}
