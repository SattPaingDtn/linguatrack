"use client";
import { useId, useState } from "react";
import type { LessonBlock } from "@/lib/curriculum/schema";
export function WritingExercise({ block }: { block: Extract<LessonBlock, { type: "writing" }> }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return (
    <>
      <p className="text-sm leading-7 text-muted-foreground">{block.prompt.en}</p>
      <p lang="my" className="mt-3 text-xs text-muted-foreground">
        {block.prompt.my}
      </p>
      <label htmlFor={id} className="mb-2 mt-5 block text-xs font-semibold">
        Your introduction
      </label>
      <textarea
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-describedby={`${id}-hint`}
        rows={5}
        maxLength={2000}
        placeholder="Hello! My name is…"
        className="w-full resize-y rounded-xl border bg-background p-4 text-sm leading-7 placeholder:text-muted-foreground"
      />
      <p id={`${id}-hint`} className="mt-2 text-[10px] text-muted-foreground">
        {words} words · aim for {block.minWords}–{block.maxWords} · draft is not saved or graded
      </p>
      <details className="mt-5 rounded-lg bg-muted p-4">
        <summary className="text-xs font-semibold">See an example</summary>
        <p className="mt-3 text-sm leading-7">{block.modelAnswer}</p>
      </details>
    </>
  );
}
