import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TeachingBlock } from "@/components/learning/teaching-block";
import { BilingualContent } from "@/components/learning/bilingual-content";
import {
  blockSchema,
  type Block,
  type Stimulus,
  type Transcript,
} from "@/lib/curriculum/v2/public";
const text = { en: "Read and practise.", my: "ဖတ်ပြီး လေ့ကျင့်ပါ။" };
const base = {
  kind: "block" as const,
  id: "test-block",
  revision: 1,
  lessonRef: { kind: "lesson" as const, id: "test-lesson", revision: 1 },
  title: text,
};
const ref = { kind: "stimulus" as const, id: "test-stimulus", revision: 1 };
const english = { language: "en" as const, text: "I read books." };
const blocks: Block[] = [
  { ...base, type: "explanation", body: text, examples: [english] },
  {
    ...base,
    type: "grammar",
    rule: text,
    examples: [
      {
        pattern: "Subject + Verb + Object",
        example: english,
        translation: "ကျွန်တော် စာအုပ်ဖတ်သည်။",
      },
    ],
  },
  {
    ...base,
    type: "vocabulary",
    words: [{ word: "book", pronunciation: "/bʊk/", meaning: text, example: english }],
  },
  { ...base, type: "reading", stimulusRef: ref, explanation: text },
  { ...base, type: "listening", stimulusRef: ref, instruction: text },
  { ...base, type: "speaking", prompt: text, modelAnswer: english, checklist: [english] },
  { ...base, type: "writing", prompt: text, modelAnswer: english, minWords: 1, maxWords: 10 },
  { ...base, type: "quiz", exerciseRefs: [{ kind: "exercise", id: "test-question", revision: 1 }] },
  {
    ...base,
    type: "exercise_set",
    exerciseRefs: [{ kind: "exercise", id: "test-question", revision: 1 }],
  },
];
afterEach(cleanup);
it("renders every supported teaching block without quiz/storage/network side effects", () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  for (const raw of blocks) {
    const block = blockSchema.parse(raw);
    const view = render(<TeachingBlock block={block} />);
    expect(screen.getByRole("heading", { name: text.en })).toBeVisible();
    expect(screen.queryAllByText(/saved to your account|assessed proficiency|Passed/)).toEqual([]);
    view.unmount();
  }
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});
it("uses English first, Burmese below, readable typography and preserved mixed text", () => {
  const { container } = render(
    <BilingualContent text={{ en: "English + မြန်မာ\nSecond line.", my: "မြန်မာ + English" }} />,
  );
  const paras = container.querySelectorAll("p");
  expect(paras[0]).toHaveAttribute("lang", "en");
  expect(paras[1]).toHaveAttribute("lang", "my");
  expect(paras[0]!.textContent).toBe("English + မြန်မာ\nSecond line.");
  expect(paras[1]!.className).toContain("leading-[1.95]");
  expect(paras[1]!.style.fontFamily).toContain("Noto Sans Myanmar");
});
it("plays only explicitly supplied real-media paths and withholds conditional transcripts", () => {
  const stimulus: Stimulus = {
    kind: "stimulus",
    id: ref.id,
    revision: 1,
    type: "listening",
    audioRef: { kind: "asset", id: "test-audio", revision: 1 },
    transcriptRef: { kind: "transcript", id: "test-transcript", revision: 1 },
    transcriptAccess: "after_submission",
  };
  const transcript: Transcript = {
    kind: "transcript",
    id: "test-transcript",
    revision: 1,
    language: "en",
    text: "HIDDEN_TRANSCRIPT",
    segments: [],
  };
  const view = render(
    <TeachingBlock
      block={blocks[4]!}
      stimulus={stimulus}
      transcript={transcript}
      audioUrl="/audio/a1-introductions.wav"
    />,
  );
  expect(screen.getByLabelText("Lesson audio")).toHaveAttribute(
    "src",
    "/audio/a1-introductions.wav",
  );
  expect(screen.queryByText("HIDDEN_TRANSCRIPT")).toBeNull();
  view.rerender(
    <TeachingBlock
      block={blocks[4]!}
      stimulus={stimulus}
      transcript={transcript}
      audioUrl="https://secret.example/audio"
    />,
  );
  expect(screen.queryByLabelText("Lesson audio")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Audio pending");
});
it("shows a matching public reading passage and fails closed for incorrect revisions", () => {
  const stimulus: Stimulus = {
    kind: "stimulus",
    id: ref.id,
    revision: 1,
    type: "reading",
    passage: english,
    sourceAttribution: "Test",
  };
  const view = render(<TeachingBlock block={blocks[3]!} stimulus={stimulus} />);
  expect(screen.getByText(english.text)).toBeVisible();
  view.rerender(<TeachingBlock block={blocks[3]!} stimulus={{ ...stimulus, revision: 2 }} />);
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
});
it("labels pending controls, unsaved writing and speaking accurately and rejects private fields", () => {
  const view = render(
    <TeachingBlock block={blocks[6]!} activity={<textarea aria-label="Writing draft" />} />,
  );
  expect(screen.getByText(/draft saving is not connected/)).toBeVisible();
  expect(screen.getByLabelText("Writing draft")).toBeVisible();
  view.rerender(<TeachingBlock block={blocks[5]!} />);
  expect(screen.getByText(/recording and persistence are not connected/)).toBeVisible();
  view.rerender(<TeachingBlock block={blocks[8]!} />);
  expect(screen.getByRole("status")).toHaveTextContent("not connected");
  expect(() =>
    render(
      <TeachingBlock block={{ ...blocks[0]!, correctOptionIds: ["secret"] } as unknown as Block} />,
    ),
  ).toThrow();
});
