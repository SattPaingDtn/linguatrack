"use client";
import { useId, useState } from "react";
import { AlertDialog } from "radix-ui";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "./session-provider";

export function ResetProgress() {
  const { mode, loading, resetting, resetProgress, completed, attempts, pendingAnswers } =
    useSession();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputId = useId();
  if (mode !== "persistent") return null;
  async function confirm() {
    if (confirmation !== "RESET" || resetting) return;
    setError(null);
    try {
      await resetProgress();
      setOpen(false);
      setConfirmation("");
      setSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reset could not be confirmed. Retry.");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AlertDialog.Root
        open={open}
        onOpenChange={(value) => {
          if (resetting) return;
          setOpen(value);
          if (value) {
            setConfirmation("");
            setError(null);
            setSuccess(false);
          }
        }}
      >
        <AlertDialog.Trigger asChild>
          <Button variant="outline" disabled={loading || resetting} className="rounded-lg text-xs">
            <RotateCcw aria-hidden="true" />
            Reset progress and history
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content
            className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl"
            onEscapeKeyDown={(event) => {
              if (resetting) event.preventDefault();
            }}
          >
            <AlertDialog.Title className="text-xl font-semibold">
              Reset your learning data?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
              Permanently delete all completed lessons, quiz attempts, answers, mistake reviews,
              study sessions and resume position for your account across every curriculum version.
              This cannot be undone. Your account and lesson content are kept. Export your learning
              data from My progress before continuing if you want a copy.
            </AlertDialog.Description>
            <p className="mt-3 text-xs text-muted-foreground">
              Currently loaded: {completed.length} completed lessons · {attempts.length} attempts.
              Pending answers from before the reset, including {pendingAnswers.length} on this
              device, will be discarded.
            </p>
            <label htmlFor={inputId} className="mt-5 block text-sm font-medium">
              Type RESET to confirm
            </label>
            <input
              id={inputId}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={resetting}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" disabled={resetting}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button
                variant="destructive"
                onClick={confirm}
                disabled={confirmation !== "RESET" || resetting}
              >
                {resetting ? "Resetting…" : error ? "Retry reset" : "Permanently reset"}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {success && (
        <p role="status" className="text-xs text-muted-foreground">
          Your progress and review history have been reset.
        </p>
      )}
    </div>
  );
}
