// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { loadChain } = vi.hoisted(() => ({ loadChain: vi.fn() }));
vi.mock("@/lib/curriculum/v2/reader", async (original) => ({
  ...(await original<object>()),
  loadPackageChain: loadChain,
}));
vi.mock("@/lib/learning/server", () => {
  throw new Error("A1 preview must not use persistence");
});
vi.mock("@/lib/supabase/server", () => {
  throw new Error("A1 preview must not use Supabase");
});
import { expansionFixture } from "./fixtures";
import {
  getA1Catalog,
  getA1Chapter,
  getA1Lesson,
  gradeA1Answer,
  loadA1Draft,
} from "@/lib/curriculum/a1-preview/server";
import { projectLessonContent } from "@/lib/curriculum/chapter-preview/project";
import { A1_PREVIEW_CHAPTERS, a1AwaitsAudio } from "@/lib/curriculum/a1-preview/config";
import { a1LessonSchema } from "@/lib/curriculum/a1-preview/contracts";
import * as route from "@/app/api/dev-a1-preview/answer/route";
import Layout from "@/app/dev/a1/layout";
let root: string, f: Awaited<ReturnType<typeof expansionFixture>>;
beforeAll(async () => {
  loadChain.mockImplementation(
    (
      await vi.importActual<typeof import("@/lib/curriculum/v2/reader")>(
        "@/lib/curriculum/v2/reader",
      )
    ).loadPackageChain,
  );
  root = await mkdtemp(join(tmpdir(), "a1-preview-"));
  f = await expansionFixture(root);
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
        releaseHash: "994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa",
      },
    ],
  });
});
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/dev-a1-preview/answer", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("shows only authored Chapters 1–3; Chapter 1 stays at its original preview and all 14 new lessons resolve exactly", async () => {
  const before = JSON.stringify(f.pkg);
  const catalog = await getA1Catalog();
  expect(catalog.map((c) => c.order)).toEqual([1, 2, 3]);
  expect(catalog[0]).toMatchObject({
    path: "/dev/chapters/a1-chapter-1",
    version: "1.4.0",
    lessonCount: 8,
  });
  let count = 0;
  for (const cfg of A1_PREVIEW_CHAPTERS) {
    const chapter = await getA1Chapter(cfg.slug);
    expect(chapter.lessons.map((l) => l.id)).toEqual([...cfg.lessonIds]);
    for (const l of chapter.lessons) {
      const p = await getA1Lesson(cfg.slug, l.slug);
      count += p.questions.length;
      expect(p.lesson.chapterRef.id).toBe(cfg.id);
      expect(p.blocks.map((b) => ({ kind: b.kind, id: b.id, revision: b.revision }))).toEqual(
        p.lesson.blockRefs,
      );
      expect(JSON.stringify(p)).not.toMatch(
        /"private"|correctOptionIds|gradingRevision|graderVersion|assessmentPolicies|compatibility|TEACHER/,
      );
      if (l.id.includes("scripts")) {
        expect(p.audio).toEqual([]);
        expect(p.awaitingAudioIds).toHaveLength(5);
      }
      if (l.id.endsWith("reading") || l.id === "a1-c2-family-and-colleagues") {
        expect(p.questions).toHaveLength(5);
        expect(p.passages).toHaveLength(2);
      }
    }
  }
  expect(count).toBe(44);
  expect(JSON.stringify(f.pkg)).toBe(before);
  await expect(getA1Chapter("home-neighborhood")).rejects.toThrow(/Not found/);
  const p = await getA1Lesson("daily-routines-time", "chapter-review");
  expect(() => a1LessonSchema.parse({ ...p, private: f.pkg.private })).toThrow();
});
it("grades all 34 enabled questions with one-question bilingual feedback and no historical mutation", async () => {
  const before = JSON.stringify(f.pkg);
  let checks = 0;
  for (const cfg of A1_PREVIEW_CHAPTERS)
    for (const l of (await getA1Chapter(cfg.slug)).lessons) {
      const p = await getA1Lesson(cfg.slug, l.slug);
      for (const q of p.questions.filter((q) => !p.awaitingAudioIds.includes(q.id))) {
        checks++;
        const r = f.pkg.private.grading.exerciseRules.find((r) => r.exerciseRef.id === q.id)!;
        if (r.type !== "multiple_choice") throw new Error("Rule");
        const body = {
          contentVersion: p.contentVersion,
          lessonId: l.id,
          publicDigest: p.publicDigest,
          exercise: { kind: "exercise", id: q.id, revision: q.revision },
          optionId: r.correctOptionIds[0],
        };
        expect(await gradeA1Answer(body)).toMatchObject({
          simulated: true,
          saved: false,
          isCorrect: true,
          explanation: r.explanation,
        });
        expect(
          await gradeA1Answer({
            ...body,
            optionId: q.options.find((o) => o.id !== r.correctOptionIds[0])!.id,
          }),
        ).toMatchObject({ isCorrect: false });
      }
    }
  expect(checks).toBe(34);
  expect(JSON.stringify(f.pkg)).toBe(before);
});
it("rejects pending audio, wrong version/chapter membership, revisions, digests, options and bulk requests", async () => {
  const p = await getA1Lesson("people-family-possessions", "chapter-review"),
    q = p.questions[0]!;
  const body = {
    contentVersion: "1.5.0",
    lessonId: p.lesson.id,
    publicDigest: p.publicDigest,
    exercise: { kind: "exercise", id: q.id, revision: 1 },
    optionId: q.options[1]!.id,
  };
  for (const bad of [
    { ...body, contentVersion: "1.4.0" },
    { ...body, lessonId: "a1-c3-review" },
    { ...body, lessonId: "a1-c1-check" },
    { ...body, publicDigest: "0".repeat(64) },
    { ...body, optionId: "missing" },
    { ...body, exercise: { ...body.exercise, revision: 99 } },
    { ...body, all: true },
  ])
    await expect(gradeA1Answer(bad)).rejects.toThrow();
  for (const cfg of A1_PREVIEW_CHAPTERS) {
    const chapter = await getA1Chapter(cfg.slug);
    const listen = chapter.lessons.find((l) => l.id.includes("scripts"))!;
    const preview = await getA1Lesson(cfg.slug, listen.slug);
    for (const audio of preview.questions) {
      expect(a1AwaitsAudio(audio.id)).toBe(true);
      await expect(
        gradeA1Answer({
          ...body,
          lessonId: listen.id,
          publicDigest: preview.publicDigest,
          exercise: { kind: "exercise", id: audio.id, revision: audio.revision },
          optionId: audio.options[0]!.id,
        }),
      ).rejects.toThrow(/Audio pending/);
    }
  }
  expect((await route.POST(request(body))).status).toBe(200);
  expect((await route.POST(request(body, "http://evil.example"))).status).toBe(403);
  expect((await route.POST(request({ ...body, extra: "x".repeat(5000) }))).status).toBe(413);
});
it("disables all production entry points before content/body reads and rejects altered draft hashes", async () => {
  loadChain.mockResolvedValue({ packages: [{ pkg: f.pkg, releaseHash: "0".repeat(64) }] });
  await expect(loadA1Draft()).rejects.toThrow(/exact inactive/);
  vi.stubEnv("NODE_ENV", "production");
  loadChain.mockClear();
  for (const call of [
    () => loadA1Draft(),
    () => getA1Catalog(),
    () => getA1Chapter("people-family-possessions"),
    () => getA1Lesson("people-family-possessions", "chapter-review"),
    () => gradeA1Answer({}),
    () => projectLessonContent(f.pkg, "a1-chapter-2", "chapter-review", [], a1AwaitsAudio),
  ])
    await expect(Promise.resolve().then<unknown>(() => call())).rejects.toThrow(/Not found/);
  expect((await route.POST(request({}))).status).toBe(404);
  for (const fn of [route.GET, route.HEAD, route.PUT, route.PATCH, route.DELETE, route.OPTIONS])
    expect(fn().status).toBe(404);
  await expect(Layout({ children: null })).rejects.toThrow();
  expect(loadChain).not.toHaveBeenCalled();
});
