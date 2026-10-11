import { beforeEach, describe, expect, it } from "vitest";
import { acknowledgeAnswer, queueAnswer, readOutbox } from "@/lib/learning/outbox";
import { input } from "./fixtures";
beforeEach(() => localStorage.clear());
describe("durable pending answers", () => {
  it("survives rereading browser storage, deduplicates retries and isolates owners", () => {
    queueAnswer(localStorage, "owner-a", input);
    queueAnswer(localStorage, "owner-a", input);
    expect(readOutbox(localStorage, "owner-a")).toEqual([input]);
    expect(readOutbox(localStorage, "owner-b")).toEqual([]);
    expect(() => queueAnswer(localStorage, "owner-a", { ...input, optionId: "option-2" })).toThrow(
      "already queued",
    );
    queueAnswer(localStorage, "owner-b", input);
    acknowledgeAnswer(localStorage, "owner-a", input);
    expect(readOutbox(localStorage, "owner-a")).toEqual([]);
    expect(readOutbox(localStorage, "owner-b")).toEqual([input]);
  });
  it("does not clear other pending questions when one is acknowledged", () => {
    const second = { ...input, questionId: "a1-c1-q2" };
    queueAnswer(localStorage, "a", input);
    queueAnswer(localStorage, "a", second);
    acknowledgeAnswer(localStorage, "a", input);
    expect(readOutbox(localStorage, "a")).toEqual([second]);
  });
  it("surfaces corrupt or unavailable storage instead of pretending the answer is protected", () => {
    localStorage.setItem("linguatrack:pending:v1:a", '[{"unexpected":true}]');
    expect(() => readOutbox(localStorage, "a")).toThrow("could not be read");
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    };
    expect(() => queueAnswer(broken, "a", input)).toThrow("quota exceeded");
  });
});
