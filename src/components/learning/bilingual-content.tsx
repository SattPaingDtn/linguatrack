import type { z } from "zod";
import type { teachingTextSchema } from "@/lib/curriculum/v2/common";
export function BilingualContent({ text }: { text: z.infer<typeof teachingTextSchema> }) {
  const english = "en" in text ? text.en : text.text;
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <p lang="en" className="whitespace-pre-line text-base leading-[1.85]">
        {english}
      </p>
      {"my" in text ? (
        <p
          lang="my"
          className="mt-4 border-t pt-4 whitespace-pre-line text-[17px] leading-[1.95]"
          style={{ fontFamily: '"Noto Sans Myanmar", "Myanmar Text", "Padauk", sans-serif' }}
        >
          {text.my}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Burmese translation pending editorial review.
        </p>
      )}
    </div>
  );
}
