// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { loadChain } = vi.hoisted(() => ({ loadChain: vi.fn() }));
vi.mock("@/lib/curriculum/v2/reader", async (original) => ({
  ...(await original<object>()),
  loadPackageChain: loadChain,
}));
vi.mock("@/lib/learning/server", () => {
  throw new Error("Preview must not import persistence");
});
vi.mock("@/lib/supabase/server", () => {
  throw new Error("Preview must not import Supabase");
});
import { manuscriptFixture } from "./fixtures";
import { MANUSCRIPT_CHAPTERS } from "@/lib/curriculum/manuscript-preview/config";
import {
  getManuscriptCatalog,
  getManuscriptChapter,
  getManuscriptLesson,
  answerManuscript,
  loadManuscriptDraft,
} from "@/lib/curriculum/manuscript-preview/server";
import { manuscriptLessonSchema } from "@/lib/curriculum/manuscript-preview/contracts";
import * as route from "@/app/api/dev-manuscript-preview/answer/route";
let root: string, f: Awaited<ReturnType<typeof manuscriptFixture>>;
beforeAll(async () => {
  loadChain.mockImplementation(
    (
      await vi.importActual<typeof import("@/lib/curriculum/v2/reader")>(
        "@/lib/curriculum/v2/reader",
      )
    ).loadPackageChain,
  );
  root = await mkdtemp(join(tmpdir(), "manuscript-server-"));
  f = await manuscriptFixture(root, Math.max(...MANUSCRIPT_CHAPTERS.map((c) => c.number)));
}, 30000);
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  loadChain.mockImplementation((paths: string[]) => ({
    packages: [
      f.stages.find((s) => s.pkg.manifest.contentVersion === basename(paths.at(-1)!))!.loaded,
    ],
  }));
});
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/dev-manuscript-preview/answer", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("resolves only exact pinned chapter versions and public content; all 12 MCQs check correctly", async () => {
  expect(await getManuscriptCatalog()).toHaveLength(MANUSCRIPT_CHAPTERS.length);
  for (const cfg of MANUSCRIPT_CHAPTERS) {
    const stage = f.stages.find((s) => s.pkg.manifest.contentVersion === cfg.version)!;
    const before = JSON.stringify(stage.pkg);
    const c = await getManuscriptChapter(cfg.slug);
    expect(c.lessons).toHaveLength(7);
    for (const l of c.lessons) {
      const p = await getManuscriptLesson(cfg.slug, l.slug);
      expect(p.contentVersion).toBe(cfg.version);
      expect(p.blocks.map((b) => ({ kind: b.kind, id: b.id, revision: b.revision }))).toEqual(
        p.lesson.blockRefs,
      );
      expect(JSON.stringify(p)).not.toMatch(
        /correctOptionIds|acceptedByBlank|graderVersion|assessmentPolicies|"private"/,
      );
      for (const q of p.questions) {
        const rule = stage.pkg.private.grading.exerciseRules.find(
          (r) => r.exerciseRef.id === q.id,
        )!;
        if (rule.type !== "multiple_choice") throw new Error("MCQ");
        expect(
          await answerManuscript({
            contentVersion: p.contentVersion,
            lessonId: l.id,
            publicDigest: p.publicDigest,
            exercise: { kind: "exercise", id: q.id, revision: q.revision },
            optionId: rule.correctOptionIds[0],
          }),
        ).toMatchObject({
          saved: false,
          simulated: true,
          isCorrect: true,
          explanation: rule.explanation,
        });
      }
    }
    expect(JSON.stringify(stage.pkg)).toBe(before);
  }
});
it("returns one reading example only after a response, with no automatic correctness or score; listening remains disabled", async () => {
  for (const cfg of MANUSCRIPT_CHAPTERS) {
    const c = await getManuscriptChapter(cfg.slug);
    for (const l of c.lessons) {
      const p = await getManuscriptLesson(cfg.slug, l.slug);
      expect(() => manuscriptLessonSchema.parse({ ...p, private: {} })).toThrow();
      for (const q of p.shortResponses) {
        const body = {
          contentVersion: p.contentVersion,
          lessonId: l.id,
          publicDigest: p.publicDigest,
          exercise: { kind: "exercise", id: q.id, revision: q.revision },
          mode: "self_review",
          text: "My own wording may be valid.",
        };
        if (q.tags.areas.includes("listening"))
          await expect(answerManuscript(body)).rejects.toThrow(/Awaiting audio/);
        else {
          const feedback = await answerManuscript(body);
          expect(feedback).toMatchObject({
            saved: false,
            simulated: true,
            selfReviewOnly: true,
            submittedText: body.text,
          });
          expect(feedback).not.toHaveProperty("isCorrect");
          expect(feedback).not.toHaveProperty("score");
          expect(JSON.stringify(feedback)).not.toMatch(/acceptedByBlank|variants|graderVersion/);
          await expect(answerManuscript({ ...body, text: "" })).rejects.toThrow();
        }
      }
    }
  }
});
it("rejects foreign versions/revisions/lessons, oversized/cross-origin requests and bulk private keys", async () => {
  const cfg = MANUSCRIPT_CHAPTERS[0]!,
    p = await getManuscriptLesson(cfg.slug, "review"),
    q = p.questions[0]!;
  const body = {
    contentVersion: p.contentVersion,
    lessonId: p.lesson.id,
    publicDigest: p.publicDigest,
    exercise: { kind: "exercise", id: q.id, revision: 1 },
    optionId: q.options[0]!.id,
  };
  for (const bad of [
    { ...body, contentVersion: "1.5.0" },
    { ...body, lessonId: "a1-c1-check" },
    { ...body, publicDigest: "0".repeat(64) },
    { ...body, optionId: "missing" },
    { ...body, exercise: { ...body.exercise, revision: 99 } },
    { ...body, all: true },
  ])
    await expect(answerManuscript(bad)).rejects.toThrow();
  expect((await route.POST(request(body))).status).toBe(200);
  expect((await route.POST(request(body, "http://evil.example"))).status).toBe(403);
  expect((await route.POST(request({ ...body, text: "x".repeat(5000) }))).status).toBe(413);
});
it("denies production before any file reads or body parsing and rejects altered package hashes", async () => {
  loadChain.mockResolvedValue({
    packages: [{ ...f.stages[0]!.loaded, releaseHash: "0".repeat(64) }],
  });
  await expect(loadManuscriptDraft("1.6.0")).rejects.toThrow(/exact inactive/);
  vi.stubEnv("NODE_ENV", "production");
  loadChain.mockClear();
  for (const call of [
    () => getManuscriptCatalog(),
    () => getManuscriptChapter("home-neighborhood"),
    () => getManuscriptLesson("home-neighborhood", "review"),
    () => answerManuscript({}),
  ])
    await expect(call()).rejects.toThrow(/Not found/);
  expect((await route.POST(request({}))).status).toBe(404);
  for (const fn of [route.GET, route.HEAD, route.PUT, route.PATCH, route.DELETE, route.OPTIONS])
    expect(fn().status).toBe(404);
  expect(loadChain).not.toHaveBeenCalled();
});
