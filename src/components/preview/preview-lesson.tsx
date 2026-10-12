"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PreviewBlock, PreviewLesson } from "@/lib/curriculum/preview/contracts";
import { BilingualText } from "./bilingual-text";
import { PreviewExercises } from "./preview-exercises";
import { PreviewReview } from "./preview-review";
import { usePreviewPractice } from "./use-preview-practice";
import { PreviewWriting } from "./preview-writing";
import { GrammarExamples } from "./grammar-examples";
import "./preview-reading.css";

function BlockBody({ block }: { block: PreviewBlock }) {
  switch (block.type) {
    case "explanation":
      return (
        <>
          <BilingualText {...block.body} />
          <div className="mt-5 space-y-2 rounded-xl bg-muted p-5">
            {block.examples.map((e, i) => (
              <p key={i} className="text-base font-medium leading-8">
                {e.text}
              </p>
            ))}
          </div>
        </>
      );
    case "grammar":
      return (
        <>
          <BilingualText {...block.rule} />
          <GrammarExamples block={block} />
        </>
      );
    case "writing":
    case "exercise_set":
      return null;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}
export function PreviewLessonView({ preview }: { preview: PreviewLesson }) {
  const { lesson } = preview;
  const [step, setStep] = useState<"learn" | "practice" | "review">("learn");
  const [current, setCurrent] = useState(0);
  const headings = useRef<Partial<Record<typeof step, HTMLHeadingElement | null>>>({});
  const teaching = preview.blocks.filter((b) => b.type === "explanation" || b.type === "grammar");
  const groups = [teaching.slice(0, 2), teaching.slice(2, 4), teaching.slice(4)].filter(
    (g) => g.length,
  );
  const exerciseBlocks = preview.blocks.filter((b) => b.type === "exercise_set");
  const questions = exerciseBlocks.flatMap((block) =>
    block.exerciseRefs.map((ref) => {
      const question = preview.exercises.find(
        (q) => q.id === ref.id && q.revision === ref.revision,
      );
      if (!question) throw new Error(`Missing preview question: ${ref.id}@${ref.revision}`);
      return question;
    }),
  );
  const practice = usePreviewPractice(questions, preview.publicDigest);
  function navigate(next: typeof step) {
    setStep(next);
    requestAnimationFrame(() => headings.current[next]?.focus());
  }
  function revisit(index: number) {
    setCurrent(index);
    navigate("practice");
  }

  return (
    <div data-preview-reading className="mx-auto max-w-4xl">
      <Link
        href="/courses"
        prefetch={false}
        aria-label="Back to courses"
        className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
      >
        ← Back to courses
      </Link>
      <header className="mb-6">
        <p className="eyebrow">A1 · Grammar · {lesson.difficulty.estimatedMinutes} minutes</p>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">
          {lesson.title.en}
        </h1>
        <p lang="my" className="mt-2">
          {lesson.title.my}
        </p>
      </header>
      <details className="mb-5 rounded-xl border border-[#d5dfcf] bg-[#e6eddf] px-4 sm:px-5">
        <summary className="text-sm font-semibold">
          Local preview · draft {preview.contentVersion} · unsaved · clears on refresh
          <span lang="my" className="mt-1 block">
            ပြန်ဖွင့်လျှင် ပျောက်သွားမည်။
          </span>
        </summary>
        <div className="border-t pb-4 pt-4">
          <BilingualText
            en="Practice only. Answers, feedback and writing stay on this page across steps. Leaving or refreshing clears them. Nothing is saved to your account; no completion or proficiency is awarded."
            my="စမ်းလေ့ကျင့်ရန်သာ ဖြစ်သည်။ အဆင့်များ ပြောင်းကြည့်စဉ် အဖြေ၊ ရှင်းလင်းချက်နှင့် ရေးထားသော ဝါကျများကို ဤစာမျက်နှာတွင် ဆက်ကြည့်နိုင်သည်။ စာမျက်နှာမှ ထွက်လျှင် သို့မဟုတ် ပြန်ဖွင့်လျှင် ပျောက်သွားပါမည်။ အကောင့်တွင် မသိမ်းပါ။ သင်ခန်းစာပြီးဆုံးမှု၊ ဘာသာစကားအဆင့်ကို မသတ်မှတ်ပါ။"
          />
        </div>
      </details>
      <nav aria-label="Lesson steps" className="mb-6">
        <ol className="grid grid-cols-3 gap-2">
          {(
            [
              ["learn", "Learn", "လေ့လာရန်"],
              ["practice", "Practice", "လေ့ကျင့်ရန်"],
              ["review", "Review", "ပြန်ကြည့်ရန်"],
            ] as const
          ).map(([value, label, my], i) => (
            <li key={value}>
              <button
                type="button"
                aria-current={step === value ? "step" : undefined}
                aria-controls={`preview-${value}`}
                onClick={() => navigate(value)}
                className={`w-full rounded-xl border px-2 py-3 text-sm font-semibold ${step === value ? "border-primary bg-primary text-white" : "bg-white text-primary"}`}
              >
                <span>
                  {i + 1}. {label}
                </span>
                <span lang="my" className="mt-1 block">
                  {my}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section id="preview-learn" hidden={step !== "learn"} aria-labelledby="preview-learn-heading">
        <h2
          id="preview-learn-heading"
          tabIndex={-1}
          ref={(node) => {
            headings.current.learn = node;
          }}
          className="mb-4 text-xl font-semibold"
        >
          Learn
        </h2>
        <div className="mb-6">
          <BilingualText {...lesson.description} />
        </div>
        <details className="mb-6 rounded-xl border bg-white px-4 sm:px-5" data-preview-objectives>
          <summary className="text-base font-semibold">What you will practise</summary>
          <ul className="space-y-6 border-t pb-5 pt-5">
            {preview.objectives.map((o) => (
              <li key={o.id}>
                <BilingualText {...o.statement} />
              </li>
            ))}
          </ul>
        </details>
        <p className="mb-5 text-base leading-7 text-muted-foreground">
          Explore three short sections in order. You can open a section, pause and come back to it.
        </p>
        <div className="space-y-5">
          {groups.map((blocks, index) => (
            <details
              key={blocks[0]!.id}
              open={index === 0}
              className="rounded-2xl border bg-white px-4 sm:px-5"
              data-preview-learn-group
            >
              <summary className="text-base font-semibold">
                {index + 1}.{" "}
                {["Subject pronouns", "Be and sentence patterns", "Common mistakes"][index]}
              </summary>
              <div className="space-y-5 border-t pb-5 pt-5">
                {blocks.map((block) => (
                  <section
                    key={block.id}
                    id={block.id}
                    aria-labelledby={`${block.id}-title`}
                    className="min-w-0 scroll-mt-6"
                  >
                    <p className="eyebrow mb-2">{block.type}</p>
                    <h3 id={`${block.id}-title`} className="text-xl font-semibold tracking-tight">
                      {block.title.en}
                    </h3>
                    <p lang="my" className="mb-5 mt-2 text-muted-foreground">
                      {block.title.my}
                    </p>
                    <BlockBody block={block} />
                  </section>
                ))}
              </div>
            </details>
          ))}
        </div>
        <Button type="button" className="mt-6" onClick={() => navigate("practice")}>
          Continue to Practice
        </Button>
      </section>
      <section
        id="preview-practice"
        hidden={step !== "practice"}
        aria-labelledby="preview-practice-heading"
      >
        <h2
          id="preview-practice-heading"
          tabIndex={-1}
          ref={(node) => {
            headings.current.practice = node;
          }}
          className="mb-4 text-xl font-semibold"
        >
          Practice
        </h2>
        <div className="soft-panel" id={exerciseBlocks[0]?.id}>
          <PreviewExercises
            questions={questions}
            states={practice.states}
            current={current}
            onNavigate={setCurrent}
            onSelect={practice.select}
            onCheck={practice.check}
            onRetry={practice.retry}
          />
        </div>
        {preview.blocks
          .filter((b) => b.type === "writing")
          .map((block) => (
            <details
              key={block.id}
              className="mt-6 rounded-xl border bg-white px-4 sm:px-5"
              data-preview-writing
            >
              <summary className="text-base font-semibold">
                Writing self-practice · unsaved and ungraded
              </summary>
              <section
                id={block.id}
                aria-labelledby={`${block.id}-title`}
                className="border-t pb-5 pt-5"
              >
                <h3 id={`${block.id}-title`} className="text-xl font-semibold">
                  {block.title.en}
                </h3>
                <p lang="my" className="mb-5 mt-2 text-muted-foreground">
                  {block.title.my}
                </p>
                <PreviewWriting block={block} />
              </section>
            </details>
          ))}
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("learn")}>
            Back to Learn
          </Button>
          <Button type="button" onClick={() => navigate("review")}>
            Continue to Review
          </Button>
        </div>
      </section>
      <section
        id="preview-review"
        hidden={step !== "review"}
        aria-labelledby="preview-review-heading"
      >
        <h2
          id="preview-review-heading"
          tabIndex={-1}
          ref={(node) => {
            headings.current.review = node;
          }}
          className="mb-4 text-xl font-semibold"
        >
          Review
        </h2>
        <div className="soft-panel">
          <PreviewReview questions={questions} states={practice.states} onRevisit={revisit} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => navigate("practice")}
        >
          Back to Practice
        </Button>
      </section>
    </div>
  );
}
