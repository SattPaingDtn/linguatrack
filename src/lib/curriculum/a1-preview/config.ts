// Browser-safe preview selection metadata only. These drafts are inactive and unapproved.
export const A1_PREVIEW_PATH = "/dev/a1";
export const A1_PREVIEW_VERSION = "1.5.0";
export const A1_PREVIEW_CHAPTERS = [
  {
    id: "a1-chapter-2",
    slug: "people-family-possessions",
    lessonIds: [
      "a1-c2-family-words",
      "a1-c2-have-and-possessions",
      "a1-c2-family-scripts",
      "a1-c2-describing-people",
      "a1-c2-family-and-colleagues",
      "a1-c2-writing-about-family",
      "a1-c2-review",
    ],
  },
  {
    id: "a1-chapter-3",
    slug: "daily-routines-time",
    lessonIds: [
      "a1-c3-routine-words",
      "a1-c3-present-simple-routines",
      "a1-c3-routine-scripts",
      "a1-c3-talking-about-routines",
      "a1-c3-routine-reading",
      "a1-c3-writing-my-day",
      "a1-c3-review",
    ],
  },
] as const;
export function a1AwaitsAudio(id: string) {
  return /^a1-c[23]-l(?:1-[123]|2-[12])$/.test(id);
}
