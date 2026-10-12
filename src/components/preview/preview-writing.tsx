"use client";
import { useState } from "react";
import type { PreviewBlock } from "@/lib/curriculum/preview/contracts";
import { BilingualText } from "./bilingual-text";

export function PreviewWriting({ block }: { block: Extract<PreviewBlock, { type: "writing" }> }) {
  const [draft, setDraft] = useState("");
  const id = `${block.id}-draft`;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return (
    <>
      <BilingualText {...block.prompt} />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border bg-background p-4">
          <label htmlFor={id} className="mb-3 block text-base font-semibold">
            Your two sentences
          </label>
          <textarea
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={7}
            maxLength={2000}
            lang="en"
            spellCheck
            aria-describedby={`${id}-hint`}
            className="w-full resize-y rounded-xl border bg-white p-4"
          />
          <p id={`${id}-hint`} className="mt-3 text-sm leading-6 text-muted-foreground">
            {words} words · aim for {block.minWords}–{block.maxWords}. Writing is not submitted,
            saved or automatically graded. Refreshing clears it.
          </p>
          <p lang="my" className="mt-3 text-muted-foreground">
            ကိုယ်တိုင် လေ့ကျင့်ရန်သာ ဖြစ်သည်။ ရေးထားသော ဝါကျများကို ပေးပို့ခြင်း၊ သိမ်းဆည်းခြင်း၊
            အလိုအလျောက် အမှတ်ပေးခြင်း မရှိပါ။ စာမျက်နှာကို ပြန်ဖွင့်လျှင် ပျောက်သွားပါမည်။
          </p>
        </div>
        <details open className="min-w-0 self-start rounded-xl border bg-background px-4">
          <summary className="text-base font-semibold">Compare with an example</summary>
          <div className="border-t pb-4 pt-4">
            <p className="mb-4 whitespace-pre-line rounded-lg bg-white p-4 text-lg leading-8">
              {block.modelAnswer.text}
            </p>
            <BilingualText
              en="This is an example, not the only possible answer. Compare your subject, verb and word order with the model."
              my="ဤဝါကျများသည် ဥပမာသာ ဖြစ်ပြီး ဖြစ်နိုင်သော အဖြေအားလုံး မဟုတ်ပါ။ သင်ရေးထားသော ဝါကျ၏ ကတ္တား၊ ကြိယာနှင့် စကားလုံးအစီအစဉ်ကို ဥပမာနှင့် ယှဉ်ကြည့်ပါ။"
            />
          </div>
        </details>
      </div>
    </>
  );
}
