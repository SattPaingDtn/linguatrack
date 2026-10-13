import type { ReactNode } from "react";
import { blockSchema, type Block } from "@/lib/curriculum/v2/public";
import type { LearningLesson } from "@/lib/platform/catalog";
import { BilingualContent } from "./bilingual-content";

type Stimulus = LearningLesson["stimuli"][number];
type Transcript = LearningLesson["transcripts"][number];
/** Reusable public teaching renderer. No preview endpoint, grading, auth or storage behavior. */
export function TeachingBlock({
  block: raw,
  stimulus,
  transcript,
  audioUrl,
  activity,
}: {
  block: Block;
  stimulus?: Stimulus;
  transcript?: Transcript;
  audioUrl?: string;
  activity?: ReactNode;
}) {
  const block = blockSchema.parse(raw);
  let body: ReactNode;
  switch (block.type) {
    case "explanation":
      body = (
        <>
          <BilingualContent text={block.body} />
          <ul className="mt-5 space-y-3">
            {block.examples.map((e, i) => (
              <li key={i} lang="en">
                {e.text}
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case "grammar":
      body = (
        <>
          <BilingualContent text={block.rule} />
          <ol aria-label="Grammar examples" className="mt-5 space-y-4">
            {block.examples.map((e, i) => (
              <li key={i} className="rounded-xl border bg-muted p-4">
                <p className="mb-3 font-semibold">
                  Pattern {i + 1}: {e.pattern}
                </p>
                <BilingualContent text={{ en: e.example.text, my: e.translation }} />
              </li>
            ))}
          </ol>
        </>
      );
      break;
    case "vocabulary":
      body = (
        <dl className="space-y-5">
          {block.words.map((w, i) => (
            <div key={i}>
              <dt className="mb-3 font-semibold" lang="en">
                {w.word} <span className="font-normal">{w.pronunciation}</span>
              </dt>
              <dd>
                <BilingualContent text={w.meaning} />
                <p lang="en" className="mt-3 leading-8">
                  {w.example.text}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      );
      break;
    case "reading":
      body = (
        <>
          {stimulus?.type === "reading" &&
          stimulus.id === block.stimulusRef.id &&
          stimulus.revision === block.stimulusRef.revision ? (
            <p lang="en" className="mb-5 whitespace-pre-line text-base leading-8">
              {stimulus.passage.text}
            </p>
          ) : (
            <p role="status">Reading passage unavailable.</p>
          )}
          <BilingualContent text={block.explanation} />
        </>
      );
      break;
    case "listening": {
      const matches =
        stimulus?.type === "listening" &&
        stimulus.id === block.stimulusRef.id &&
        stimulus.revision === block.stimulusRef.revision;
      const safeUrl = audioUrl && /^\/audio\/[a-z0-9-]+\.(wav|mp3|ogg)$/.test(audioUrl);
      body = (
        <>
          <BilingualContent text={block.instruction} />
          {matches && safeUrl ? (
            <audio
              className="mt-5 w-full"
              controls
              preload="none"
              src={audioUrl}
              aria-label="Lesson audio"
            />
          ) : (
            <p role="status" className="mt-5">
              Audio pending · no assessed listening result.
            </p>
          )}
          {matches &&
            stimulus.transcriptAccess === "always" &&
            transcript?.id === stimulus.transcriptRef.id &&
            transcript.revision === stimulus.transcriptRef.revision && (
              <details className="mt-5">
                <summary className="min-h-11 cursor-pointer font-semibold">Transcript</summary>
                <p lang="en" className="mt-3 whitespace-pre-line leading-8">
                  {transcript.text}
                </p>
              </details>
            )}
        </>
      );
      break;
    }
    case "speaking":
      body = (
        <>
          <BilingualContent text={block.prompt} />
          <p className="mt-5 text-sm text-muted-foreground">
            Ungraded self-practice · recording and persistence are not connected.
          </p>
          <ul className="my-4 space-y-2">
            {block.checklist.map((e, i) => (
              <li key={i} lang="en">
                {e.text}
              </li>
            ))}
          </ul>
          <details>
            <summary className="min-h-11 cursor-pointer font-semibold">
              Model for self-review
            </summary>
            <p lang="en" className="mt-3 leading-8">
              {block.modelAnswer.text}
            </p>
          </details>
        </>
      );
      break;
    case "writing":
      body = (
        <>
          <BilingualContent text={block.prompt} />
          <p className="mt-5 text-sm text-muted-foreground">
            Ungraded self-practice · draft saving is not connected.
          </p>
          {activity}
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Model for self-review
            </summary>
            <p lang="en" className="mt-3 leading-8">
              {block.modelAnswer.text}
            </p>
          </details>
        </>
      );
      break;
    case "quiz":
    case "exercise_set":
      body = activity ?? (
        <p role="status">Exercise controls and saved results are not connected.</p>
      );
      break;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
  return (
    <section
      id={block.id}
      aria-labelledby={`${block.id}-heading`}
      className="soft-panel min-w-0 [overflow-wrap:anywhere]"
    >
      <h3 id={`${block.id}-heading`} className="mb-3 text-lg font-semibold">
        {"en" in block.title ? block.title.en : block.title.text}
      </h3>
      {"my" in block.title && (
        <p
          lang="my"
          className="mb-5 text-[17px] leading-[1.95]"
          style={{ fontFamily: '"Noto Sans Myanmar", "Myanmar Text", "Padauk", sans-serif' }}
        >
          {block.title.my}
        </p>
      )}
      {body}
    </section>
  );
}
