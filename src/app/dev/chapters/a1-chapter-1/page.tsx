import Link from "next/link";
import { notFound } from "next/navigation";
import { getChapterCatalog } from "@/lib/curriculum/chapter-preview/server";
import { LessonAvailability } from "@/components/preview/lesson-availability";
import {
  CHAPTER_PREVIEW_PATH,
  CHAPTER_PREVIEW_VERSION,
} from "@/lib/curriculum/chapter-preview/config";
export const dynamic = "force-dynamic";
export default async function ChapterPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  let lessons;
  try {
    lessons = await getChapterCatalog();
  } catch {
    return (
      <div role="alert" className="soft-panel">
        <h1 className="text-xl font-semibold">Local chapter preview unavailable</h1>
        <p className="mt-4 leading-7">
          Validate the unchanged 1.1.0–1.3.0 draft chain, then run npm run
          curriculum:v2:author-chapter to create 1.4.0 once. Never overwrite existing drafts. No
          learning data was saved.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dev/a1"
        prefetch={false}
        className="mr-6 inline-flex min-h-11 items-center font-semibold underline"
      >
        ← Back to Chapter Picker
      </Link>
      <Link
        href="/courses"
        prefetch={false}
        className="inline-flex min-h-11 items-center font-semibold underline"
      >
        ← Back to courses
      </Link>
      <p className="eyebrow mt-5">Local preview · inactive draft {CHAPTER_PREVIEW_VERSION}</p>
      <h1 className="mt-3 text-3xl font-semibold">A1 Chapter 1 · First conversations</h1>
      <p className="my-5 leading-8 text-muted-foreground">
        Seven learning roles, plus the retained subject-pronouns lesson. Nothing here saves progress
        or awards CEFR proficiency. Answers and self-practice clear when you leave or refresh a
        lesson.
      </p>
      <p lang="my" className="mb-6 text-muted-foreground" style={{ lineHeight: 1.9 }}>
        ဤစမ်းကြည့်စာမျက်နှာတွင် တိုးတက်မှု မသိမ်းပါ။ CEFR အဆင့် မသတ်မှတ်ပါ။ သင်ခန်းစာမှ ထွက်လျှင်
        သို့မဟုတ် ပြန်ဖွင့်လျှင် လေ့ကျင့်ထားသော အဖြေနှင့် စာမူများ ပျောက်သွားမည်။
      </p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {lessons.map((l, i) => (
          <li key={l.id} className="rounded-2xl border bg-white p-5">
            <p className="eyebrow">
              {l.id === "a1-c1-subject-pronouns" ? "Linked grammar lesson" : l.areas.join(" / ")}
            </p>
            <h2 className="mt-3 text-xl font-semibold">
              <Link
                href={`${CHAPTER_PREVIEW_PATH}/${l.slug}`}
                prefetch={false}
                className="inline-block py-2 underline underline-offset-4"
              >
                {i + 1}. {"en" in l.title ? l.title.en : l.title.text}
              </Link>
            </h2>
            {"my" in l.title && (
              <p lang="my" className="mt-2 text-muted-foreground" style={{ lineHeight: 1.9 }}>
                {l.title.my}
              </p>
            )}
            <LessonAvailability id={l.id} areas={l.areas} />
          </li>
        ))}
      </ol>
    </div>
  );
}
