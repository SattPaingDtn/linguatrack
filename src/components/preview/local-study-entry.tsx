import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { A1_PREVIEW_PATH } from "@/lib/curriculum/a1-preview/config";

export function LocalStudyEntry() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <section
      aria-labelledby="local-study-title"
      className="mb-6 rounded-2xl border border-[#dce5ce] bg-[#e9efdd] p-5 sm:p-6"
    >
      <p className="eyebrow">Local learning preview · unsaved</p>
      <h2 id="local-study-title" className="mt-2 text-xl font-semibold">
        Ready to study A1?
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Explore 22 lessons in Chapters 1–3 with English and Burmese explanations. Preview answers
        and progress are not saved. New listening activities await audio.
      </p>
      <Link
        href={A1_PREVIEW_PATH}
        prefetch={false}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white"
      >
        Study A1 lessons <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
