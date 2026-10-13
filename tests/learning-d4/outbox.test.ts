import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  queueMcq,
  readMcqOutbox,
  acknowledgeMcq,
  discardResetMcq,
  syncMcqOutbox,
} from "@/lib/learning/v2/mcq-outbox";
import { input, projectRef } from "./fixtures";
import type { McqReceipt, McqSubmission } from "@/lib/learning/v2/mcq-contracts";
import type { DraftStorage } from "@/lib/learning/outbox";
const A = { ownerId: "00000000-0000-4000-8000-000000000001", projectRef },
  B = { ...A, ownerId: "00000000-0000-4000-8000-000000000002" };
let data: Map<string, string>, storage: DraftStorage;
beforeEach(() => {
  data = new Map([[`linguatrack:pending:v1:${A.ownerId}`, "old-v1-queue"]]);
  storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
});
const receipt = (s: McqSubmission): McqReceipt => ({
  mode: "persistent",
  saved: true,
  ownerId: A.ownerId,
  projectRef,
  requestHash: "a".repeat(64),
  submission: s,
  responseId: s.responseId,
  gradeId: crypto.randomUUID(),
  resultId: null,
  feedback: {
    points: 1,
    maxPoints: 1,
    isCorrect: true,
    explanation: { en: "Correct.", my: "မှန်သည်။" },
    correctAnswer: "I am Su.",
  },
  receivedAt: "2026-10-13T00:00:00Z",
});
it("keeps owner/project queues isolated and never touches v1", () => {
  const s = input("a".repeat(64));
  queueMcq(storage, A, s);
  queueMcq(storage, A, s);
  expect(readMcqOutbox(storage, A)).toEqual([s]);
  expect(readMcqOutbox(storage, B)).toEqual([]);
  expect(readMcqOutbox(storage, { ...A, projectRef: "zyxwvutsrqponmlkjihg" })).toEqual([]);
  expect(data.get(`linguatrack:pending:v1:${A.ownerId}`)).toBe("old-v1-queue");
  expect(() =>
    queueMcq(storage, A, { ...s, response: { type: "multiple_choice", optionIds: ["b"] } }),
  ).toThrow(/already/);
});
it("acknowledges only exact committed owner/response/version/generation payloads", () => {
  const s = input("a".repeat(64));
  queueMcq(storage, A, s);
  for (const r of [
    { ...receipt(s), ownerId: B.ownerId },
    { ...receipt(s), saved: false },
    { ...receipt(s), submission: { ...s, generation: 1 } },
    { ...receipt(s), submission: { ...s, contentVersion: "10.0.0" } },
  ])
    expect(() => acknowledgeMcq(storage, A, r)).toThrow();
  expect(readMcqOutbox(storage, A)).toEqual([s]);
  acknowledgeMcq(storage, A, receipt(s));
  expect(readMcqOutbox(storage, A)).toEqual([]);
});
it("retains answers on offline/auth/database failures and refuses changed-account dispatch", async () => {
  const s = input("a".repeat(64));
  queueMcq(storage, A, s);
  const send = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
  await expect(syncMcqOutbox(storage, A, async () => A, send)).rejects.toThrow(/offline/);
  send.mockResolvedValue(new Response("{}", { status: 401 }));
  await expect(syncMcqOutbox(storage, A, async () => A, send)).rejects.toThrow(/pending/);
  send.mockClear();
  await expect(syncMcqOutbox(storage, A, async () => B, send)).rejects.toThrow(/Account changed/);
  expect(send).not.toHaveBeenCalled();
  expect(readMcqOutbox(storage, A)).toEqual([s]);
  send.mockResolvedValue(new Response(JSON.stringify(receipt(s)), { status: 200 }));
  expect(await syncMcqOutbox(storage, A, async () => A, send)).toHaveLength(1);
  expect(send.mock.calls[0]![1]?.headers).toMatchObject({ "X-Learner-ID": A.ownerId });
  expect(readMcqOutbox(storage, A)).toEqual([]);
});
it("surfaces failed durable storage before dispatch and preserves malformed queues", () => {
  const broken = {
    ...storage,
    setItem: () => {
      throw new Error("quota");
    },
  };
  expect(() => queueMcq(broken, A, input("a".repeat(64)))).toThrow(/storage failed/);
  data.set(`linguatrack:pending:v2:${projectRef}:${A.ownerId}`, "invalid json");
  expect(() => readMcqOutbox(storage, A)).toThrow(/Preserve/);
  expect(data.get(`linguatrack:pending:v2:${projectRef}:${A.ownerId}`)).toBe("invalid json");
});
it("delivers committed feedback even if a later queued answer fails", async () => {
  const first = input("a".repeat(64)),
    second = input("a".repeat(64));
  queueMcq(storage, A, first);
  queueMcq(storage, A, second);
  const returned = receipt(first),
    committed = vi.fn();
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(returned)))
    .mockRejectedValueOnce(new Error("offline"));
  await expect(syncMcqOutbox(storage, A, async () => A, send, committed)).rejects.toThrow(
    /offline/,
  );
  expect(committed).toHaveBeenCalledWith(returned);
  expect(readMcqOutbox(storage, A)).toEqual([second]);
});
it("invalidates pre-reset generations only on a matching owner snapshot", () => {
  const s = input("a".repeat(64)),
    fresh = input("a".repeat(64), "b", 1);
  queueMcq(storage, A, s);
  queueMcq(storage, A, fresh);
  expect(() => discardResetMcq(storage, A, { userId: B.ownerId, generation: 1 })).toThrow(
    /owner mismatch/,
  );
  expect(discardResetMcq(storage, A, { userId: A.ownerId, generation: 1 })).toEqual({
    pending: [fresh],
    discarded: 1,
  });
});
