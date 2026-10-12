import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PreviewLessonView } from "@/components/preview/preview-lesson";
import { getPreviewLesson, previewEnabled } from "@/lib/curriculum/preview/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Local lesson preview",
  robots: { index: false, follow: false },
};
export default async function SubjectPronounsPreview() {
  if (!previewEnabled()) notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) notFound();
  let preview;
  try {
    preview = await getPreviewLesson();
  } catch {
    preview = undefined;
  }
  if (!preview) {
    return (
      <section className="soft-panel" role="alert">
        <h1 className="text-xl font-semibold">Local draft preview is unavailable</h1>
        <p className="mt-3 text-sm leading-7">
          The validated 1.1.0, 1.2.0 and unchanged 1.3.0 draft packages must exist in
          .curriculum-drafts. Check them with the v2 validator, then reload this page. No answers or
          learning records were saved.
        </p>
      </section>
    );
  }
  return <PreviewLessonView preview={preview} />;
}
