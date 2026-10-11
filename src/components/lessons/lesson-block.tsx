import type { LessonBlock as Block } from "@/lib/curriculum/schema";
import { MultipleChoiceQuiz } from "@/components/exercises/multiple-choice-quiz";
import { WritingExercise } from "@/components/exercises/writing-exercise";
import { Headphones, Mic } from "lucide-react";

function BilingualText({ en, my }: { en: string; my: string }) {
  return (
    <>
      <p className="text-sm leading-7 text-muted-foreground">{en}</p>
      <p lang="my" className="mt-3 text-xs text-muted-foreground">
        {my}
      </p>
    </>
  );
}
function BlockBody({ block }: { block: Block }) {
  switch (block.type) {
    case "explanation":
      return (
        <>
          <BilingualText {...block.body} />
          <div className="mt-5 space-y-2 rounded-xl bg-muted p-5">
            {block.examples.map((example) => (
              <p key={example} className="text-sm font-medium">
                {example}
              </p>
            ))}
          </div>
        </>
      );
    case "grammar":
      return (
        <>
          <BilingualText {...block.rule} />
          <div
            role="region"
            aria-label="Grammar examples; scroll horizontally on small screens"
            tabIndex={0}
            className="mt-5 overflow-x-auto rounded-xl border"
          >
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Grammar patterns, examples, and Burmese translations
              </caption>
              <thead className="bg-[#eef2e7]">
                <tr>
                  <th scope="col" className="p-4">
                    Pattern
                  </th>
                  <th scope="col" className="p-4">
                    Example
                  </th>
                  <th scope="col" className="p-4">
                    Burmese meaning
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {block.examples.map((example) => (
                  <tr key={example.pattern}>
                    <th scope="row" className="min-w-32 p-4 font-medium">
                      {example.pattern}
                    </th>
                    <td className="min-w-36 p-4">{example.example}</td>
                    <td lang="my" className="min-w-44 p-4 text-muted-foreground">
                      {example.translation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    case "vocabulary":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.words.map((word) => (
            <article key={word.word} className="rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-lg font-semibold">{word.word}</h3>
                <span className="text-[10px] text-muted-foreground">{word.pronunciation}</span>
              </div>
              <p lang="my" className="mt-2 text-xs text-muted-foreground">
                {word.meaning}
              </p>
              <p className="mt-3 border-t pt-3 text-xs">{word.example}</p>
            </article>
          ))}
        </div>
      );
    case "reading":
      return (
        <>
          <div className="mb-5 whitespace-pre-line rounded-xl bg-[#eef2e7] p-5 text-sm leading-8">
            {block.passage}
          </div>
          <BilingualText {...block.explanation} />
        </>
      );
    case "listening":
      return (
        <>
          <BilingualText {...block.instruction} />
          <div className="mt-5 rounded-xl bg-[#f1f3f8] p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <Headphones size={15} aria-hidden="true" />A first introduction · sample audio
            </p>
            <audio
              controls
              preload="none"
              src={block.audio}
              aria-label="Listen to Su introduce herself"
              className="w-full"
            >
              Your browser does not support audio. <a href={block.audio}>Download the audio</a>.
            </audio>
          </div>
          <details className="mt-4 rounded-lg border p-4">
            <summary className="text-xs font-medium">Read the transcript</summary>
            <p className="mt-3 text-sm leading-7">{block.transcript}</p>
          </details>
        </>
      );
    case "speaking":
      return (
        <>
          <BilingualText {...block.prompt} />
          <div className="mt-5 rounded-xl bg-[#f8eee4] p-5">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <Mic size={15} aria-hidden="true" />
              Try saying this out loud
            </p>
            <p className="mt-3 text-lg leading-8">{block.modelAnswer}</p>
          </div>
          <fieldset className="mt-5 space-y-3">
            <legend className="mb-3 text-xs font-semibold">
              Self-check · not assessed or saved
            </legend>
            {block.checklist.map((item) => (
              <label key={item} className="flex items-start gap-3 text-xs">
                <input type="checkbox" className="size-4 shrink-0 accent-[#294e3c]" />
                {item}
              </label>
            ))}
          </fieldset>
        </>
      );
    case "writing":
      return <WritingExercise block={block} />;
    case "quiz":
      return null;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}
export function LessonContentBlock({
  block,
  lessonId,
  requestedAttempt,
}: {
  block: Block;
  lessonId: string;
  requestedAttempt?: string;
}) {
  if (block.type === "quiz")
    return (
      <section id={block.id} className="scroll-mt-6" aria-label={block.title}>
        <MultipleChoiceQuiz quiz={block} lessonId={lessonId} requestedAttempt={requestedAttempt} />
      </section>
    );
  return (
    <section id={block.id} aria-labelledby={`${block.id}-title`} className="soft-panel scroll-mt-6">
      <p className="eyebrow mb-2 text-[9px]">
        {block.type === "explanation" ? "LEARN THE BASICS" : block.type}
      </p>
      <h2 id={`${block.id}-title`} className="mb-5 text-xl font-semibold tracking-tight">
        {block.title}
      </h2>
      <BlockBody block={block} />
    </section>
  );
}
