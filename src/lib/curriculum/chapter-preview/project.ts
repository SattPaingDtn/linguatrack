// Shared server-only public projection; no private grading or activation code.
import "server-only";
import type { CurriculumPackage } from "../v2/package";
import type { PublicEntity } from "../v2/public";
import { fingerprint } from "../v2/json";
import { PreviewError, previewEnabled } from "../preview/server";
function requireDevelopment() {
  if (!previewEnabled()) throw new PreviewError("Not found", 404);
}
function exact<T extends PublicEntity>(items: T[], r: { id: string; revision: number }): T {
  const e = items.find((e) => e.id === r.id && e.revision === r.revision);
  if (!e) throw new PreviewError("An exact preview reference is unavailable.", 503);
  return e;
}
export function projectLessonContent(
  pkg: CurriculumPackage,
  chapterId: string,
  slug: string,
  lessonIds: readonly string[],
  audioPending: (id: string) => boolean,
) {
  requireDevelopment();
  const p = pkg.public;
  const chapter = p.chapters.find((c) => c.id === chapterId)!;
  const lesson = chapter.lessonRefs
    .map((r) => exact(p.lessons, r))
    .find((l) => l.slug === slug && lessonIds.some((id) => id === l.id));
  if (!lesson) throw new PreviewError("Not found", 404);
  const blocks = lesson.blockRefs.map((r) => exact(p.blocks, r));
  const objectives = lesson.objectiveRefs.map((r) => exact(p.objectives, r));
  const questions: (typeof p.exercises)[0][] = [];
  const passages: (typeof p.stimuli)[0][] = [];
  const addPassage = (r: { id: string; revision: number }) => {
    const s = exact(p.stimuli, r);
    if (s.type !== "reading") throw new PreviewError("Unsupported passage.", 503);
    if (!passages.some((v) => v.id === s.id)) passages.push(s);
  };
  function addQuestion(r: { id: string; revision: number }) {
    const e = exact(p.exercises, r);
    if (e.type === "reading_comprehension") {
      addPassage(e.stimulusRef);
      for (const child of e.itemRefs) addQuestion(child);
    } else if (e.type === "multiple_choice" && e.selection === "single") {
      if (!questions.some((q) => q.id === e.id)) questions.push(e);
    } else throw new PreviewError("An exercise has no supported local renderer.", 503);
  }
  const audio: { blockId: string; src: "/audio/a1-introductions.wav"; transcript: string }[] = [];
  for (const b of blocks) {
    if (b.type === "exercise_set" || b.type === "quiz")
      for (const r of b.exerciseRefs) addQuestion(r);
    if (b.type === "reading") addPassage(b.stimulusRef);
    if (b.type === "listening") {
      const s = exact(p.stimuli, b.stimulusRef);
      if (s.type !== "listening" || s.transcriptAccess !== "always")
        throw new PreviewError("Only the existing public-transcript audio is supported.", 503);
      const a = exact(p.assets, s.audioRef),
        t = exact(p.transcripts, s.transcriptRef);
      if (a.legacyPublicPath !== "/audio/a1-introductions.wav" || a.storage.type !== "package")
        throw new PreviewError("No verified preview audio is available.", 503);
      audio.push({ blockId: b.id, src: a.legacyPublicPath, transcript: t.text });
    }
  }
  const content = {
    lesson,
    blocks,
    objectives,
    questions,
    passages,
    audio,
    awaitingAudioIds: questions.filter((q) => audioPending(q.id)).map((q) => q.id),
  };
  return { publicDigest: fingerprint(content), ...content };
}
