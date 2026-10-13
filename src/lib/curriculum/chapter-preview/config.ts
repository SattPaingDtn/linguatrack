// Public route/version metadata only. No answer keys or private authoring imports.
export const CHAPTER_PREVIEW_PATH = "/dev/chapters/a1-chapter-1";
export const CHAPTER_PREVIEW_VERSION = "1.4.0";
export const CHAPTER_PREVIEW_LESSONS = [
  "a1-c1-introductions",
  "a1-c1-be",
  "a1-c1-subject-pronouns",
  "a1-c1-meet-colleagues",
  "a1-c1-speaking-at-work",
  "a1-c1-new-team",
  "a1-c1-professional-introduction",
  "a1-c1-check",
] as const;
export function awaitsAudio(id: string) {
  return /^a1-c1-pack-l0[1-8]$/.test(id);
}
