import type { PreviewBlock } from "@/lib/curriculum/preview/contracts";
import { BilingualText } from "./bilingual-text";

const sentenceParts = [
  {
    label: "Subject",
    my: "ကတ္တား",
    explanation: {
      en: "Who or what the sentence is about: I, we or she.",
      my: "ဝါကျတွင် ပြောဆိုဖော်ပြသော လူ သို့မဟုတ် အရာ — I၊ we၊ she။",
    },
  },
  {
    label: "Verb",
    my: "ကြိယာ",
    explanation: {
      en: "What the subject does or feels: read or like.",
      my: "ကတ္တား၏ လုပ်ဆောင်မှု သို့မဟုတ် နှစ်သက်မှုကို ဖော်ပြသည် — read၊ like။",
    },
  },
  {
    label: "Object",
    my: "ကံ",
    explanation: {
      en: "What the subject reads or likes: books or tea.",
      my: "ဘယ်အရာကို ဖတ်သလဲ၊ ကြိုက်သလဲ — books၊ tea။",
    },
  },
  {
    label: "Be",
    my: "Be ကြိယာ",
    explanation: {
      en: "Am, is or are connects the subject to a description.",
      my: "Am၊ is၊ are သည် ကတ္တားကို မည်သူဖြစ်ကြောင်း သို့မဟုတ် အခြေအနေဖော်ပြချက်နှင့် ဆက်ပေးသည်။",
    },
  },
  {
    label: "Complement",
    my: "ဖြည့်စွက်ဖော်ပြသည့်အပိုင်း",
    explanation: {
      en: "Describes the subject’s state or identity: happy or a student. It is not an object.",
      my: "ကတ္တား၏ အခြေအနေ သို့မဟုတ် မည်သူဖြစ်ကြောင်းကို ဖော်ပြသည် — happy၊ a student။ ကံ မဟုတ်ပါ။",
    },
  },
];

export function GrammarExamples({ block }: { block: Extract<PreviewBlock, { type: "grammar" }> }) {
  const hasSentenceParts = block.examples.some((example) =>
    example.pattern.startsWith("Subject ["),
  );
  return (
    <div className="mt-6 space-y-6">
      {hasSentenceParts && (
        <section
          aria-labelledby={`${block.id}-parts`}
          className="rounded-xl border bg-background p-4 sm:p-5"
        >
          <h4 id={`${block.id}-parts`} className="mb-5 text-lg font-semibold">
            Understand the sentence parts
          </h4>
          <dl className="space-y-5">
            {sentenceParts.map((part) => (
              <div key={part.label} className="min-w-0 border-b pb-5 last:border-0 last:pb-0">
                <dt className="mb-2 font-semibold">
                  {part.label}{" "}
                  <span lang="my" className="ml-2 text-muted-foreground">
                    {part.my}
                  </span>
                </dt>
                <dd>
                  <BilingualText {...part.explanation} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <ol aria-label={`${block.title.en} examples`} className="space-y-4">
        {block.examples.map((example, index) => (
          <li key={index} className="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pattern {index + 1}
            </p>
            <p className="text-base font-semibold leading-7">{example.pattern}</p>
            <div className="mt-4">
              <BilingualText en={example.example.text} my={example.translation} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
