import Link from "next/link";
import { notFound } from "next/navigation";
import { MANUSCRIPT_CHAPTERS } from "@/lib/curriculum/manuscript-preview/config";
import { getManuscriptChapter } from "@/lib/curriculum/manuscript-preview/server";
import { getA1Chapter } from "@/lib/curriculum/a1-preview/server";
import { A1_PREVIEW_PATH, A1_PREVIEW_VERSION } from "@/lib/curriculum/a1-preview/config";
import { PreviewError } from "@/lib/curriculum/preview/server";
import { LessonAvailability } from "@/components/preview/lesson-availability";
export const dynamic = "force-dynamic";
export default async function A1Chapter({ params }: { params: Promise<{ chapterSlug: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { chapterSlug } = await params;
  let c;
  try {
    c = MANUSCRIPT_CHAPTERS.some((c) => c.slug === chapterSlug)
      ? await getManuscriptChapter(chapterSlug)
      : await getA1Chapter(chapterSlug);
  } catch (e) {
    if (e instanceof PreviewError && e.status === 404) notFound();
    return (
      <section role="alert" className="soft-panel">
        <h1 className="text-xl font-semibold">A1 chapter preview unavailable</h1>
        <p className="mt-4 leading-7">
          Check the validated 1.1.0–1.5.0 draft chain. Nothing was saved.
        </p>
      </section>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={A1_PREVIEW_PATH}
        prefetch={false}
        className="inline-flex min-h-11 items-center font-semibold underline"
      >
        ← Back to Chapter Picker
      </Link>
      <p className="eyebrow mt-5">
        Chapter {c.order} · local draft{" "}
        {"version" in c && typeof c.version === "string" ? c.version : A1_PREVIEW_VERSION} · unsaved
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{"en" in c.title ? c.title.en : c.title.text}</h1>
      {"my" in c.title && (
        <p lang="my" className="mt-3" style={{ lineHeight: 1.95 }}>
          {c.title.my}
        </p>
      )}
      <p className="my-5 leading-8 text-muted-foreground">
        {c.description.en} All answers and self-practice clear when you leave or refresh a lesson.
      </p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {c.lessons.map((l, i) => (
          <li key={l.id} className="rounded-2xl border bg-white p-5">
            <p className="eyebrow">{l.areas.join(" / ")}</p>
            <h2 className="mt-3 text-xl font-semibold">
              <Link
                href={`${A1_PREVIEW_PATH}/${c.slug}/${l.slug}`}
                prefetch={false}
                className="inline-block py-2 underline underline-offset-4"
              >
                {i + 1}. {"en" in l.title ? l.title.en : l.title.text}
              </Link>
            </h2>
            {"my" in l.title && (
              <p lang="my" className="mt-3 text-muted-foreground" style={{ lineHeight: 1.95 }}>
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
