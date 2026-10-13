"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { z } from "zod";
import type { teachingTextSchema } from "@/lib/curriculum/v2/common";
import type { Block } from "@/lib/curriculum/v2/public";
import type { ChapterPreviewLesson } from "@/lib/curriculum/chapter-preview/contracts";
import type { LessonNavigation } from "@/lib/curriculum/preview/lesson-navigation";
import { CHAPTER_PREVIEW_PATH } from "@/lib/curriculum/chapter-preview/config";
import { Button } from "@/components/ui/button";
import { BilingualText } from "./bilingual-text";
import { GrammarExamples } from "./grammar-examples";
import { PreviewWriting } from "./preview-writing";
import { PreviewExercises } from "./preview-exercises";
import { PreviewReview } from "./preview-review";
import { usePreviewPractice } from "./use-preview-practice";
import "./preview-reading.css";
export function displayText(t: z.infer<typeof teachingTextSchema>) {
  if ("en" in t) return t;
  return {
    en: t.language === "en" ? t.text : "Original v1 content",
    my: t.language === "my" ? t.text : "မူလ v1 စာသား · မြန်မာဘာသာပြန်ရန် ကျန်ရှိသည်။",
  };
}
function SpeakingPractice({ block }: { block: Extract<Block, { type: "speaking" }> }) {
  return (
    <>
      <BilingualText {...block.prompt} />
      <p className="my-4 rounded-xl bg-muted p-4 text-sm">
        Speaking self-practice · unsaved and ungraded · no recording
      </p>
      <details className="rounded-xl border px-4">
        <summary className="font-semibold">Example and self-review checklist</summary>
        <p className="whitespace-pre-line border-t py-4 text-lg leading-8">
          {block.modelAnswer.text}
        </p>
        <div className="space-y-3 pb-4">
          {block.checklist.map((c, i) => (
            <label key={i} className="flex items-start gap-3 text-base leading-7">
              <input type="checkbox" className="mt-2 size-4 shrink-0 accent-primary" />
              {c.text}
            </label>
          ))}
        </div>
      </details>
    </>
  );
}
function TeachingBlock({
  block,
  preview,
}: {
  block: Block;
  preview: Omit<ChapterPreviewLesson, "contentVersion"> & { contentVersion: string };
}) {
  switch (block.type) {
    case "explanation":
      return (
        <>
          <BilingualText {...block.body} />
          {block.examples.length > 0 && (
            <div className="mt-4 rounded-xl bg-muted p-4">
              {block.examples.map((e, i) => (
                <p key={i} className="whitespace-pre-line leading-8">
                  {e.text}
                </p>
              ))}
            </div>
          )}
        </>
      );
    case "grammar":
      return (
        <>
          <BilingualText {...block.rule} />
          <GrammarExamples block={{ ...block, title: displayText(block.title) }} />
        </>
      );
    case "vocabulary":
      return (
        <dl className="space-y-5">
          {block.words.map((w, i) => (
            <div key={i} className="rounded-xl border bg-background p-4">
              <dt className="text-lg font-semibold">{w.word}</dt>
              <dd className="mt-2 space-y-3">
                <p className="text-sm text-muted-foreground">{w.pronunciation}</p>
                <BilingualText {...displayText(w.meaning)} />
                <p lang="en" className="rounded-lg bg-white p-3 leading-8">
                  {w.example.text}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      );
    case "reading": {
      const p = preview.passages.find(
        (p) => p.id === block.stimulusRef.id && p.revision === block.stimulusRef.revision,
      )!;
      return (
        <>
          <p
            lang="en"
            className="whitespace-pre-line rounded-xl border bg-background p-5 text-lg leading-9"
          >
            {p.passage.text}
          </p>
          <details className="mt-4 rounded-xl border px-4">
            <summary className="font-semibold">After reading · Burmese support</summary>
            <div className="border-t pb-4 pt-4">
              <BilingualText {...block.explanation} />
            </div>
          </details>
        </>
      );
    }
    case "listening": {
      const a = preview.audio.find((a) => a.blockId === block.id)!;
      return (
        <>
          <BilingualText {...block.instruction} />
          <audio
            controls
            preload="none"
            src={a.src}
            aria-label="Original introduction dialogue"
            className="mt-4 w-full"
          />
          <details className="mt-4 rounded-xl border px-4">
            <summary>Original dialogue transcript · practice support</summary>
            <p className="whitespace-pre-line border-t py-4 text-lg leading-8">{a.transcript}</p>
          </details>
        </>
      );
    }
    default:
      return null;
  }
}
export function ChapterLessonView({
  preview,
  chapterPath = CHAPTER_PREVIEW_PATH,
  endpoint = "/api/dev-chapter-preview/answer",
  pickerPath,
  extraPractice,
  writingRevealAfterDraft = false,
  lessonNavigation,
}: {
  preview: Omit<ChapterPreviewLesson, "contentVersion"> & { contentVersion: string };
  chapterPath?: string;
  endpoint?: string;
  pickerPath?: string;
  extraPractice?: React.ReactNode;
  writingRevealAfterDraft?: boolean;
  lessonNavigation?: LessonNavigation;
}) {
  const [step, setStep] = useState<"learn" | "practice" | "review">("learn");
  const [current, setCurrent] = useState(0);
  const headings = useRef<Partial<Record<typeof step, HTMLHeadingElement | null>>>({});
  const active = preview.questions.filter((q) => !preview.awaitingAudioIds.includes(q.id));
  const practice = usePreviewPractice(active, preview.publicDigest, {
    endpoint,
    contentVersion: preview.contentVersion,
    lessonId: preview.lesson.id,
  });
  const teaching = preview.blocks.filter(
    (b) => !["exercise_set", "quiz", "writing", "speaking"].includes(b.type),
  );
  const groups = Array.from({ length: Math.ceil(teaching.length / 2) }, (_, i) =>
    teaching.slice(i * 2, i * 2 + 2),
  );
  function navigate(next: typeof step) {
    setStep(next);
    requestAnimationFrame(() => headings.current[next]?.focus());
  }
  const title = displayText(preview.lesson.title);
  return (
    <div data-preview-reading className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
        <Link
          href={chapterPath}
          prefetch={false}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          ← Back to Chapter
        </Link>
        {pickerPath && (
          <Link
            href={pickerPath}
            prefetch={false}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Back to Chapter Picker
          </Link>
        )}
        <Link
          href="/courses"
          prefetch={false}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Back to courses
        </Link>
        {preview.lesson.id === "a1-c1-be" && (
          <Link
            href={`${chapterPath}/subject-pronouns-and-sentences`}
            prefetch={false}
            className="inline-flex min-h-11 items-center underline"
          >
            Linked subject pronouns lesson
          </Link>
        )}
      </div>
      <header>
        <p className="eyebrow">A1 · {preview.lesson.tags.areas.join(" / ")}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">{title.en}</h1>
        <p lang="my" className="mt-3 text-muted-foreground">
          {title.my}
        </p>
      </header>
      <div className="my-6 rounded-xl border bg-[#e6eddf] p-4">
        <BilingualText
          en={`Local preview · inactive draft ${preview.contentVersion}. Answers, writing and checklists stay in page memory across steps, then clear on refresh or leaving the lesson. Nothing is saved to your account. No completion, pass or CEFR proficiency is awarded.`}
          my="စမ်းကြည့်ရန်သာ ဖြစ်သည်။ အဆင့်ပြောင်းသော်လည်း အဖြေ၊ စာမူနှင့် စစ်ဆေးစာရင်းများကို ဤစာမျက်နှာတွင် ဆက်ကြည့်နိုင်သည်။ စာမျက်နှာ ပြန်ဖွင့်လျှင် သို့မဟုတ် ထွက်လျှင် ပျောက်သွားမည်။ အကောင့်တွင် မသိမ်းပါ။ ပြီးဆုံးမှု၊ အောင်မြင်မှုနှင့် CEFR အဆင့်ကို မသတ်မှတ်ပါ။"
        />
      </div>
      <nav aria-label="Lesson steps" className="mb-6">
        <ol className="grid grid-cols-3 gap-2">
          {(
            [
              ["learn", "Learn", "လေ့လာရန်"],
              ["practice", "Practice", "လေ့ကျင့်ရန်"],
              ["review", "Review", "ပြန်ကြည့်ရန်"],
            ] as const
          ).map(([key, label, my], i) => (
            <li key={key}>
              <button
                type="button"
                aria-current={step === key ? "step" : undefined}
                aria-controls={`chapter-${key}`}
                onClick={() => navigate(key)}
                className={`w-full rounded-xl border px-2 py-3 text-sm font-semibold ${step === key ? "bg-primary text-white" : "bg-white text-primary"}`}
              >
                {i + 1}. {label}
                <span lang="my" className="mt-1 block">
                  {my}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {(["learn", "practice", "review"] as const).map((s) => (
        <section
          key={s}
          id={`chapter-${s}`}
          hidden={step !== s}
          aria-labelledby={`chapter-${s}-heading`}
        >
          <h2
            id={`chapter-${s}-heading`}
            tabIndex={-1}
            ref={(node) => {
              headings.current[s] = node;
            }}
            className="mb-5 text-xl font-semibold"
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </h2>
          {s === "learn" && (
            <>
              <BilingualText {...preview.lesson.description} />
              <details className="my-6 rounded-xl border bg-white px-4">
                <summary className="font-semibold">What you will practise</summary>
                <ul className="space-y-5 border-t py-5">
                  {preview.objectives.map((o) => (
                    <li key={o.id}>
                      <BilingualText {...displayText(o.statement)} />
                    </li>
                  ))}
                </ul>
              </details>
              <div className="space-y-5">
                {groups.map((group, i) => (
                  <details
                    key={group[0]!.id}
                    open={i === 0}
                    className="rounded-xl border bg-white px-4 sm:px-5"
                  >
                    <summary className="font-semibold">
                      {i + 1}. {displayText(group[0]!.title).en}
                    </summary>
                    <div className="space-y-7 border-t py-5">
                      {group.map((b) => (
                        <section key={b.id} id={b.id} aria-labelledby={`${b.id}-heading`}>
                          <h3 id={`${b.id}-heading`} className="mb-3 text-xl font-semibold">
                            {displayText(b.title).en}
                          </h3>
                          <p lang="my" className="mb-4 text-muted-foreground">
                            {displayText(b.title).my}
                          </p>
                          <TeachingBlock block={b} preview={preview} />
                        </section>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              <Button type="button" className="mt-6" onClick={() => navigate("practice")}>
                Continue to Practice
              </Button>
            </>
          )}
          {s === "practice" && (
            <>
              {preview.passages.length > 0 && (
                <div className="mb-5 space-y-3" aria-label="Reference passages">
                  {preview.passages.map((p, i) => (
                    <details key={p.id} open className="rounded-xl border bg-white px-4">
                      <summary className="font-semibold">Reference passage {i + 1}</summary>
                      <p lang="en" className="whitespace-pre-line border-t py-4 text-lg leading-8">
                        {p.passage.text}
                      </p>
                    </details>
                  ))}
                </div>
              )}
              {active.length > 0 && (
                <div className="soft-panel">
                  <PreviewExercises
                    questions={active}
                    states={practice.states}
                    current={current}
                    onNavigate={setCurrent}
                    onSelect={practice.select}
                    onCheck={practice.check}
                    onRetry={practice.retry}
                  />
                </div>
              )}
              {preview.awaitingAudioIds.length > 0 && (
                <div className="space-y-5 rounded-xl border bg-white p-5">
                  <BilingualText
                    en={`Awaiting audio · all ${preview.awaitingAudioIds.length === 8 ? "eight" : preview.awaitingAudioIds.length} planned questions are shown for editorial preview only. Checking answers is disabled. No listening evidence is awarded.`}
                    my="အသံဖိုင် စောင့်ဆိုင်းဆဲ ဖြစ်သည်။ ဤမေးခွန်းများကို အယ်ဒီတာ စမ်းကြည့်ရန်သာ ပြထားသည်။ အဖြေစစ်ဆေးခြင်း မရနိုင်သေးပါ။ နားထောင်နားလည်နိုင်စွမ်း အထောက်အထားအဖြစ် မသတ်မှတ်ပါ။"
                  />
                  {preview.questions.map((q, i) => (
                    <section key={q.id} aria-labelledby={`${q.id}-heading`}>
                      <h3 id={`${q.id}-heading`} className="font-semibold">
                        {i + 1}. {q.prompt.text}
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {q.options.map((o, j) => (
                          <li key={o.id}>
                            {String.fromCharCode(65 + j)}. {o.text.text}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {preview.blocks
                .filter(
                  (b): b is Extract<Block, { type: "writing" | "speaking" }> =>
                    b.type === "writing" || b.type === "speaking",
                )
                .map((b) => (
                  <details key={b.id} className="mt-5 rounded-xl border bg-white px-4 sm:px-5">
                    <summary className="font-semibold">
                      {displayText(b.title).en} · unsaved and ungraded
                    </summary>
                    <section className="border-t py-5" aria-label={displayText(b.title).en}>
                      <p lang="my" className="mb-5">
                        {displayText(b.title).my}
                      </p>
                      {b.type === "writing" ? (
                        <PreviewWriting
                          block={{ ...b, title: displayText(b.title) }}
                          label="Your own sentences"
                          revealAfterWriting={writingRevealAfterDraft}
                        />
                      ) : (
                        <SpeakingPractice block={b} />
                      )}
                    </section>
                  </details>
                ))}
              {!active.length && !preview.awaitingAudioIds.length && (
                <p className="mt-5 leading-7 text-muted-foreground">
                  Use the self-practice activities above. No automatic grades or saved records.
                </p>
              )}
              {extraPractice}
              <Button type="button" className="mt-6" onClick={() => navigate("review")}>
                Continue to Review
              </Button>
            </>
          )}
          {s === "review" &&
            (active.length > 0 ? (
              <PreviewReview
                questions={active}
                states={practice.states}
                onRevisit={(i) => {
                  setCurrent(i);
                  navigate("practice");
                }}
              />
            ) : (
              <BilingualText
                en="No graded checks for this lesson. Revisit Practice to self-review. No completion or proficiency is awarded."
                my="ဤသင်ခန်းစာတွင် အမှတ်ပေး စစ်ဆေးမှု မရှိပါ။ ကိုယ်တိုင် ပြန်စစ်ရန် လေ့ကျင့်မှုအဆင့်ကို ပြန်ကြည့်ပါ။ ပြီးဆုံးမှု သို့မဟုတ် ကျွမ်းကျင်မှုကို မသတ်မှတ်ပါ။"
              />
            ))}
        </section>
      ))}
      {lessonNavigation && (
        <nav aria-label="Lesson navigation" className="mt-8 rounded-2xl border bg-white p-5">
          <p className="eyebrow">
            Lesson {lessonNavigation.position} of {lessonNavigation.total} · chapter order
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Move on when you are ready. Leaving this lesson clears its unsaved practice.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {lessonNavigation.previous ? (
              <Link
                href={lessonNavigation.previous.href}
                prefetch={false}
                className="min-h-11 rounded-xl border p-4 text-primary underline underline-offset-4"
              >
                <span className="block font-semibold">← Previous Lesson</span>
                <span className="mt-2 block text-sm">{lessonNavigation.previous.title}</span>
              </Link>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">First lesson in this chapter</p>
            )}
            {lessonNavigation.next ? (
              <Link
                href={lessonNavigation.next.href}
                prefetch={false}
                className="min-h-11 rounded-xl border p-4 text-primary underline underline-offset-4"
              >
                <span className="block font-semibold">Next Lesson →</span>
                <span className="mt-2 block text-sm">{lessonNavigation.next.title}</span>
              </Link>
            ) : (
              <Link
                href={chapterPath}
                prefetch={false}
                className="min-h-11 rounded-xl border p-4 text-primary underline underline-offset-4"
              >
                <span className="block font-semibold">Back to Chapter</span>
                <span className="mt-2 block text-sm">
                  Last lesson · choose another lesson or chapter
                </span>
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
