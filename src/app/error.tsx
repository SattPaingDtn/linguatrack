"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="soft-panel">
      <h1 className="text-2xl font-semibold">Something interrupted this lesson.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Try loading the page again. Session progress may reset if you reload.
      </p>
      <Button onClick={reset} className="mt-5">
        Try again
      </Button>
    </div>
  );
}
