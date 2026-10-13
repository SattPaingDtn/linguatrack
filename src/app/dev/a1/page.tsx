import Link from "next/link";
import { notFound } from "next/navigation";
import { getManuscriptCatalog } from "@/lib/curriculum/manuscript-preview/server";
import { getA1Catalog } from "@/lib/curriculum/a1-preview/server";
export const dynamic = "force-dynamic";
export default async function A1PreviewPicker() {
  if (process.env.NODE_ENV !== "development") notFound();
  let chapters;
  let laterChaptersUnavailable = false;
  try {
    chapters = await getA1Catalog();
  } catch {
    return (
      <section role="alert" className="soft-panel">
        <h1 className="text-xl font-semibold">A1 preview unavailable</h1>
        <p className="mt-4 leading-7">
          Validate the immutable 1.1.0–1.8.0 draft chain. Create each missing draft once with the
          documented authoring commands. No learning data was saved.
        </p>
      </section>
    );
  }
  // Optional later chapters must not block the existing Chapters 1–3 study path.
  try {
    chapters.push(...(await getManuscriptCatalog()));
  } catch {
    laterChaptersUnavailable = true;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/courses"
        prefetch={false}
        className="inline-flex min-h-11 items-center font-semibold underline"
      >
        ← Back to courses
      </Link>
      <p className="eyebrow mt-5">Local · inactive · editorial review pending</p>
      <h1 className="mt-3 text-3xl font-semibold">A1 learning previews</h1>
      <p className="my-5 leading-8 text-muted-foreground">
        Chapters 1–6 have converted teaching content. Chapter 1 keeps its existing 1.4.0 preview;
        Chapters 2 and 3 use draft 1.5.0. Chapters 4–6 use their own pinned drafts 1.6.0–1.8.0.
        Listening scripts await audio. Speaking and writing are ungraded self-practice. Nothing
        saves progress or awards CEFR proficiency.
      </p>
      <p lang="my" className="mb-6 text-muted-foreground" style={{ lineHeight: 1.95 }}>
        အခန်း ၁–၆ ၏ သင်ကြားရေးအကြောင်းအရာများကို စမ်းကြည့်နိုင်သည်။ နားထောင်အသံဖိုင်များကို
        စောင့်ဆိုင်းနေဆဲ ဖြစ်သည်။ ပြောဆိုခြင်းနှင့် ရေးသားခြင်းကို ကိုယ်တိုင် လေ့ကျင့်ရန်သာ ဖြစ်သည်။
        တိုးတက်မှု မသိမ်းပါ၊ CEFR အဆင့် မသတ်မှတ်ပါ။
      </p>
      <div className="mb-6 rounded-2xl border bg-[#e6eddf] p-5">
        <p className="mb-3 leading-7">
          Start with Chapter 1, then follow each lesson’s Learn → Practice → Review steps.
        </p>
        <Link
          href="/dev/chapters/a1-chapter-1"
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 font-semibold text-white"
        >
          Start learning · Chapter 1 →
        </Link>
        <p className="mt-3 text-sm leading-7">
          22 lessons in Chapters 1–3 are available to study. This preview does not save answers or
          progress.
        </p>
      </div>
      {laterChaptersUnavailable && (
        <p role="status" className="mb-6 rounded-xl border p-4 leading-7">
          Chapters 4–6 are unavailable in this local setup. Chapters 1–3 remain available below.
        </p>
      )}
      <ol className="grid gap-5 sm:grid-cols-2">
        {chapters.map((c) => (
          <li key={c.id} className="rounded-2xl border bg-white p-5">
            <p className="eyebrow">
              Chapter {c.order} · {c.lessonCount} lessons · draft {c.version}
            </p>
            <h2 className="mt-3 text-xl font-semibold">
              <Link
                href={c.path}
                prefetch={false}
                className="inline-block py-2 underline underline-offset-4"
              >
                {"en" in c.title ? c.title.en : c.title.text}
              </Link>
            </h2>
            {"my" in c.title && (
              <p lang="my" className="mt-3 text-muted-foreground" style={{ lineHeight: 1.95 }}>
                {c.title.my}
              </p>
            )}
            <p className="mt-4 text-sm font-semibold text-primary">
              Available to study · unsaved preview
            </p>
            <p className="mt-2 text-sm leading-7">
              Listening scripts available; new listening activities await audio.
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-7 rounded-xl border bg-muted p-4 leading-7">
        Chapters 7–12 remain editorial outlines only. They are not finished or unlocked learning
        chapters.
      </p>
    </div>
  );
}
