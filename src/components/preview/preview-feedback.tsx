import type { PreviewFeedback } from "@/lib/curriculum/preview/contracts";
import { BilingualText } from "./bilingual-text";

export function PreviewAnswerFeedback({
  feedback,
  live = false,
}: {
  feedback: PreviewFeedback;
  live?: boolean;
}) {
  return (
    <div
      role={live ? "status" : undefined}
      className={`rounded-xl p-4 ${feedback.isCorrect ? "bg-[#e9f0e4]" : "bg-[#f9ede8]"}`}
    >
      <p className="text-sm font-semibold">
        {feedback.isCorrect ? "Correct" : "Keep practising"} · simulated result, not saved
      </p>
      <p className="mb-3 mt-2 text-base">Correct answer: {feedback.correctAnswer}</p>
      <BilingualText {...feedback.explanation} />
    </div>
  );
}
