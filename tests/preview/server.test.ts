// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { loadChain, nextHeaders, notFound } = vi.hoisted(() => ({
  loadChain: vi.fn(),
  nextHeaders: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("@/lib/curriculum/v2/reader", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPackageChain: loadChain,
}));
vi.mock("next/headers", () => ({ headers: nextHeaders }));
vi.mock("next/navigation", () => ({ notFound }));
// Any accidental use of the learning service or Supabase fails this suite immediately.
vi.mock("@/lib/learning/server", () => {
  throw new Error("Preview must not import learning persistence");
});
vi.mock("@/lib/supabase/server", () => {
  throw new Error("Preview must not import Supabase");
});
import { getPreviewLesson, gradePreviewAnswer } from "@/lib/curriculum/preview/server";
import * as route from "@/app/api/dev-preview/answer/route";
import Page from "@/app/dev/lessons/subject-pronouns/page";
import { previewLessonSchema } from "@/lib/curriculum/preview/contracts";
import { answer, loadedDraft, preview, rules } from "./fixtures";
function request(body: unknown, origin = "http://localhost:3000", host?: string) {
  return new Request("http://localhost:3000/api/dev-preview/answer", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", ...(host ? { host } : {}) },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  loadChain.mockResolvedValue(loadedDraft());
  nextHeaders.mockResolvedValue(new Headers({ host: "localhost:3000" }));
});
afterEach(() => vi.unstubAllEnvs());
describe("isolated development preview server", () => {
  it("resolves exact ordered references and projects only public bilingual content", async () => {
    const payload = await getPreviewLesson();
    expect(payload).toEqual(preview);
    expect(payload.blocks.map((b) => [b.id, b.revision])).toEqual(
      preview.lesson.blockRefs.map((b) => [b.id, b.revision]),
    );
    expect(payload.exercises).toHaveLength(14);
    const serialized = JSON.stringify(payload);
    for (const key of [
      "private",
      "gradingRevision",
      "correctOptionIds",
      "assessmentPolicies",
      "compatibility",
    ])
      expect(serialized).not.toContain(`"${key}"`);
    for (const rule of rules) expect(serialized).not.toContain(rule.explanation.en);
  });
  it("rejects key leakage, unsupported blocks and incomplete translations", () => {
    expect(() => previewLessonSchema.parse({ ...preview, private: { grading: rules } })).toThrow();
    expect(() =>
      previewLessonSchema.parse({
        ...preview,
        exercises: [{ ...preview.exercises[0], correctOptionIds: ["option-1"] }],
      }),
    ).toThrow();
    expect(() =>
      previewLessonSchema.parse({ ...preview, blocks: [{ ...preview.blocks[0], type: "quiz" }] }),
    ).toThrow();
    expect(() =>
      previewLessonSchema.parse({
        ...preview,
        lesson: { ...preview.lesson, title: { en: "Only English" } },
      }),
    ).toThrow();
  });
  it("rejects missing exact references and altered or activated drafts", async () => {
    const missing = loadedDraft();
    missing.packages[0]!.pkg.public.blocks.splice(0, 1);
    loadChain.mockResolvedValueOnce(missing);
    await expect(getPreviewLesson()).rejects.toThrow("reference is missing");
    const drift = loadedDraft();
    drift.packages[0]!.releaseHash = "f".repeat(64);
    loadChain.mockResolvedValueOnce(drift);
    await expect(getPreviewLesson()).rejects.toThrow("unchanged");
    const active = loadedDraft();
    active.packages[0]!.pkg.manifest.state = "sealed";
    loadChain.mockResolvedValueOnce(active);
    await expect(getPreviewLesson()).rejects.toThrow("unchanged");
  });
  it("grades all 42 options against the 14 unchanged private keys and reveals only submitted feedback", async () => {
    for (const [i, rule] of rules.entries()) {
      for (const option of preview.exercises[i]!.options) {
        const feedback = await gradePreviewAnswer(answer(i, option.id));
        expect(feedback).toMatchObject({
          simulated: true,
          saved: false,
          isCorrect: rule.correctOptionIds.includes(option.id),
          explanation: rule.explanation,
        });
        expect(feedback.correctAnswer).toBe(
          preview.exercises[i]!.options.find((o) => o.id === rule.correctOptionIds[0])!.text.text,
        );
        expect(JSON.stringify(feedback)).not.toContain("correctOptionIds");
      }
    }
    const response = await route.POST(request(answer()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain(rules[1]!.explanation.en);
  });
  it("rejects forged scores, owner overrides, stale revisions, foreign lessons and invalid choices", async () => {
    for (const body of [
      { ...answer(), score: 100 },
      { ...answer(), userId: "someone" },
      { ...answer(), lessonId: "a1-c1-be" },
      { ...answer(), optionId: "not-an-option" },
      { ...answer(), exercise: { ...answer().exercise, revision: 1 } },
    ])
      expect((await route.POST(request(body))).status).toBe(400);
    expect((await route.POST(request({ ...answer(), publicDigest: "a".repeat(64) }))).status).toBe(
      409,
    );
  });
  it("requires local same-origin JSON, bounds streaming payloads and handles validation outages", async () => {
    expect((await route.POST(request(answer(), "https://attacker.example"))).status).toBe(403);
    expect(
      (await route.POST(request(answer(), "http://preview.example", "preview.example"))).status,
    ).toBe(403);
    expect(
      (await route.POST(request(answer(), "http://127.0.0.1:3000", "127.0.0.1:3000"))).status,
    ).toBe(200);
    expect(
      (
        await route.POST(
          new Request("http://localhost:3000/api/dev-preview/answer", {
            method: "POST",
            headers: { origin: "http://localhost:3000", "Content-Type": "text/plain" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(415);
    expect((await route.POST(request({ padding: "x".repeat(5000) }))).status).toBe(413);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadChain.mockRejectedValueOnce(new Error("private grading details must not escape"));
    const response = await route.POST(request(answer()));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private grading details");
    log.mockRestore();
  });
  it("blocks every supported HTTP method, page and direct grader in production before loading drafts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const method of [
      route.POST,
      route.GET,
      route.HEAD,
      route.OPTIONS,
      route.PUT,
      route.PATCH,
      route.DELETE,
    ])
      expect((await method(request(answer()))).status).toBe(404);
    await expect(Page()).rejects.toThrow("404");
    await expect(getPreviewLesson()).rejects.toThrow("Not found");
    await expect(gradePreviewAnswer(answer())).rejects.toThrow("Not found");
    expect(loadChain).not.toHaveBeenCalled();
    expect(nextHeaders).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "test");
    expect((await route.POST(request(answer()))).status).toBe(404);
  });
  it("blocks the preview page on remote hosts and presents a safe missing-draft state locally", async () => {
    nextHeaders.mockResolvedValueOnce(new Headers({ host: "preview.example" }));
    await expect(Page()).rejects.toThrow("404");
    expect(loadChain).not.toHaveBeenCalled();
    loadChain.mockRejectedValueOnce(new Error("missing draft"));
    const page = await Page();
    expect(page.props.role).toBe("alert");
  });
});
