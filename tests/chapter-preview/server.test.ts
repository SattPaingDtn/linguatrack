// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { loadChain } = vi.hoisted(() => ({ loadChain: vi.fn() }));
vi.mock("@/lib/curriculum/v2/reader", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPackageChain: loadChain,
}));
vi.mock("@/lib/learning/server", () => {
  throw new Error("Preview cannot use persistence");
});
vi.mock("@/lib/supabase/server", () => {
  throw new Error("Preview cannot use Supabase");
});
import { chapterFixture } from "./fixtures";
import {
  getChapterCatalog,
  getChapterLesson,
  gradeChapterAnswer,
  projectChapterLesson,
} from "@/lib/curriculum/chapter-preview/server";
import { CHAPTER_PREVIEW_LESSONS } from "@/lib/curriculum/chapter-preview/config";
import * as route from "@/app/api/dev-chapter-preview/answer/route";
import Layout from "@/app/dev/chapters/a1-chapter-1/layout";
import { chapterLessonSchema } from "@/lib/curriculum/chapter-preview/contracts";
let root: string, f: Awaited<ReturnType<typeof chapterFixture>>;
beforeAll(async () => {
  const real = await vi.importActual<typeof import("@/lib/curriculum/v2/reader")>(
    "@/lib/curriculum/v2/reader",
  );
  loadChain.mockImplementation(real.loadPackageChain);
  root = await mkdtemp(join(tmpdir(), "linguatrack-chapter-server-"));
  f = await chapterFixture(root);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  loadChain.mockResolvedValue({
    packages: [
      {
        pkg: f.pkg,
        releaseHash: "e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67",
      },
    ],
  });
});
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/dev-chapter-preview/answer", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("resolves all eight lessons with exact references, public-only DTOs and ordered flattened reading questions", async () => {
  const initial = JSON.stringify(f.pkg);
  const catalog = await getChapterCatalog();
  expect(catalog.map((l) => l.id)).toEqual([...CHAPTER_PREVIEW_LESSONS]);
  let count = 0;
  for (const l of catalog) {
    const p = await getChapterLesson(l.slug);
    expect(p.blocks.map((b) => ({ kind: b.kind, id: b.id, revision: b.revision }))).toEqual(
      p.lesson.blockRefs,
    );
    count += p.questions.length;
    for (const key of [
      "correctOptionIds",
      "gradingRevision",
      "assessmentPolicies",
      "compatibility",
      "private",
      "graderVersion",
    ])
      expect(JSON.stringify(p)).not.toContain(`"${key}"`);
  }
  expect(count).toBe(60);
  const p = await getChapterLesson("our-new-team-members");
  expect(p.questions.map((q) => q.id)).toEqual(
    Array.from({ length: 8 }, (_, i) => `a1-c1-pack-r0${i + 1}`),
  );
  expect(p.passages).toHaveLength(2);
  const audio = await getChapterLesson("meet-the-new-colleague");
  expect(audio.audio).toEqual([]);
  expect(audio.awaitingAudioIds).toHaveLength(8);
  expect(JSON.stringify(f.pkg)).toBe(initial);
  expect(() => chapterLessonSchema.parse({ ...p, private: f.pkg.private })).toThrow();
});
it("checks all 52 available answers correctly, emits only one bilingual feedback and never mutates history", async () => {
  const snapshot = JSON.stringify(f.pkg);
  for (const l of await getChapterCatalog()) {
    const p = await getChapterLesson(l.slug);
    for (const q of p.questions.filter((q) => !p.awaitingAudioIds.includes(q.id))) {
      const rule = f.pkg.private.grading.exerciseRules.find((r) => r.exerciseRef.id === q.id)!;
      if (rule.type !== "multiple_choice") throw new Error("Key type");
      const body = {
        contentVersion: p.contentVersion,
        lessonId: l.id,
        publicDigest: p.publicDigest,
        exercise: { kind: "exercise", id: q.id, revision: q.revision },
        optionId: rule.correctOptionIds[0],
      };
      const result = await gradeChapterAnswer(body);
      expect(result).toMatchObject({
        simulated: true,
        saved: false,
        isCorrect: true,
        explanation: rule.explanation,
      });
      expect(JSON.stringify(result)).not.toContain("correctOptionIds");
      expect(
        await gradeChapterAnswer({
          ...body,
          optionId: q.options.find((o) => o.id !== rule.correctOptionIds[0])!.id,
        }),
      ).toMatchObject({ isCorrect: false });
    }
  }
  expect(JSON.stringify(f.pkg)).toBe(snapshot);
});
it("rejects pending audio, wrong lesson, revision, option, digest and bulk key requests", async () => {
  const p = await getChapterLesson("our-new-team-members"),
    q = p.questions[0]!;
  const body = {
    contentVersion: p.contentVersion,
    lessonId: p.lesson.id,
    publicDigest: p.publicDigest,
    exercise: { kind: "exercise", id: q.id, revision: q.revision },
    optionId: q.options[0]!.id,
  };
  for (const invalid of [
    { ...body, lessonId: "a1-c1-be" },
    { ...body, publicDigest: "0".repeat(64) },
    { ...body, optionId: "missing" },
    { ...body, exercise: { ...body.exercise, revision: 99 } },
    { ...body, all: true },
  ])
    await expect(gradeChapterAnswer(invalid)).rejects.toThrow();
  const audio = await getChapterLesson("meet-the-new-colleague");
  await expect(
    gradeChapterAnswer({
      ...body,
      lessonId: audio.lesson.id,
      publicDigest: audio.publicDigest,
      exercise: { kind: "exercise", id: "a1-c1-pack-l01", revision: 1 },
    }),
  ).rejects.toThrow(/Awaiting/);
  const allowed = await route.POST(request(body));
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("cache-control")).toBe("no-store");
  expect((await route.POST(request(body, "http://evil.example"))).status).toBe(403);
  expect((await route.POST(request({ ...body, extra: "x".repeat(5000) }))).status).toBe(413);
});
it("denies production before reading data or request bodies, for routes and direct helpers", async () => {
  vi.stubEnv("NODE_ENV", "production");
  loadChain.mockClear();
  for (const fn of [
    () => getChapterCatalog(),
    () => getChapterLesson("our-new-team-members"),
    () => gradeChapterAnswer({}),
    () => Promise.resolve(projectChapterLesson(f.pkg, "our-new-team-members")),
  ])
    await expect(Promise.resolve().then<unknown>(() => fn())).rejects.toThrow(/Not found/);
  expect((await route.POST(request({}))).status).toBe(404);
  for (const method of [route.GET, route.HEAD, route.OPTIONS, route.PUT, route.PATCH, route.DELETE])
    expect(method().status).toBe(404);
  await expect(Layout({ children: null })).rejects.toThrow();
  expect(loadChain).not.toHaveBeenCalled();
});
it("rejects tampered or activated drafts with redacted errors", async () => {
  loadChain.mockResolvedValue({ packages: [{ pkg: f.pkg, releaseHash: "0".repeat(64) }] });
  await expect(getChapterCatalog()).rejects.toThrow(/exact inactive/);
  expect(
    (
      await route.POST(
        request({
          contentVersion: "1.4.0",
          lessonId: "a1-c1-be",
          publicDigest: "0".repeat(64),
          exercise: { kind: "exercise", id: "a1-c1-pack-g01", revision: 1 },
          optionId: "a1-c1-pack-g01-c",
        }),
      )
    ).status,
  ).toBe(503);
});
