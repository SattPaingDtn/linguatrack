// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { d4Fixture, input, projectRef, stageTwoQuestionFixture } from "./fixtures";
let f: Awaited<ReturnType<typeof d4Fixture>>;
beforeAll(async () => {
  f = await d4Fixture();
}, 60000);
afterAll(async () => {
  await f?.close();
});
it("commits private server grades, immutable repeated attempts and durable receipts, without changing v1", async () => {
  const correct = input(f.hash),
    wrong = input(f.hash, "b");
  const first = await f.save(f.A, correct),
    second = await f.save(f.A, wrong);
  expect(first).toMatchObject({
    saved: true,
    feedback: { isCorrect: true, points: 1 },
    submission: correct,
  });
  expect(second).toMatchObject({ feedback: { isCorrect: false, points: 0 } });
  expect(JSON.stringify(first)).not.toMatch(/correctOptionIds|gradingRevision|bindingHash/);
  expect(await f.save(f.A, correct)).toEqual(first); // HTTP acknowledgement lost
  await f.user(f.A);
  const h = await f.history();
  expect(h.v2.attempts).toHaveLength(2);
  expect(h.v2.grades).toHaveLength(2);
  expect(h.v2.mistakes).toHaveLength(1);
  expect(h.v2.completion_events).toEqual([]);
  expect(h.v2.attempt_results.map((r) => r.passed)).toEqual([null, null]);
  expect(h.legacy.attempts).toEqual((f.legacyBefore as typeof h.legacy).attempts);
  await f.reopen();
  expect(await f.save(f.A, correct)).toEqual(first);
});
it("rejects conflicting retries, stolen attempt IDs and cross-owner receipts", async () => {
  const submission = input(f.hash);
  const receipt = await f.save(f.A, submission);
  await expect(
    f.save(f.A, { ...submission, response: { type: "multiple_choice", optionIds: ["b"] } }),
  ).rejects.toThrow(/payload conflict/);
  await expect(f.save(f.B, submission)).rejects.toThrow(/unavailable/);
  await expect(f.save(f.B, { ...submission, responseId: crypto.randomUUID() })).rejects.toThrow(
    /Pinned attempt unavailable/,
  );
  await f.user(f.B);
  expect((await f.history()).v2.responses).toEqual([]);
  await f.user(f.A);
  expect((await f.history()).v2.grades.some((g) => g.id === receipt.gradeId)).toBe(true);
});
it("denies grading/context functions and direct learning writes to browser and publisher roles", async () => {
  const submission = input(f.hash);
  await f.user(f.A);
  await expect(
    f.db.query("select private.staging_mcq_context($1,$2,$3::jsonb,$4)", [
      projectRef,
      f.A,
      JSON.stringify(submission),
      "a".repeat(64),
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(
    f.db.query("select private.commit_staging_mcq($1,$2,$3::jsonb,$4,'{}'::jsonb)", [
      projectRef,
      f.A,
      JSON.stringify(submission),
      "a".repeat(64),
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(f.db.exec("insert into public.learning_v2_grades default values")).rejects.toThrow(
    /permission denied/,
  );
  await f.writer();
  await expect(f.db.exec("select * from curriculum_private.grading_bindings")).rejects.toThrow(
    /permission denied/,
  );
  await expect(f.db.exec("select * from public.learning_v2_attempts")).rejects.toThrow(
    /permission denied/,
  );
});
it("rechecks hash-bound approvals, candidate state and cohort gates without activating a channel", async () => {
  await f.admin();
  await f.db.exec("delete from curriculum_private.reviewer_scopes where scope='grading'");
  await expect(f.save(f.A, input(f.hash))).rejects.toThrow(/reviews/);
  await f.admin();
  await f.db.exec(
    "insert into curriculum_private.reviewer_scopes values('registry_test_reviewer','grading')",
  );
  await f.db.query(
    "update private.learning_staging_permissions set allow_new=false where user_id=$1",
    [f.A],
  );
  await expect(f.save(f.A, input(f.hash))).rejects.toThrow(/permission/);
  await f.admin();
  await f.db.query(
    "update private.learning_staging_permissions set allow_new=true where user_id=$1",
    [f.A],
  );
  await expect(f.save(f.A, input("f".repeat(64)))).rejects.toThrow(/permission/);
  await f.admin();
  expect((await f.db.query("select * from curriculum_private.channels")).rows).toEqual([
    { channel: "default", enabled: false, active_package_hash: null, epoch: 0 },
  ]);
});
it("rolls back failed writes atomically and refuses invalid options and forged server grades", async () => {
  await f.user(f.A);
  const before = await f.history();
  await expect(f.save(f.A, input(f.hash, "unknown"))).rejects.toThrow(/valid options/);
  await f.writer();
  const submission = input(f.hash);
  await expect(
    f.db.query("select private.commit_staging_mcq($1,$2,$3::jsonb,$4,$5::jsonb)", [
      projectRef,
      f.A,
      JSON.stringify(submission),
      "a".repeat(64),
      JSON.stringify({ points: 100, isCorrect: true }),
    ]),
  ).rejects.toThrow(/immutable binding/);
  await f.admin();
  await f.db
    .exec(`create function private.fail_d4_receipt() returns trigger language plpgsql as $$ begin raise exception 'injected commit failure'; end $$;
    create trigger fail_test_receipt before insert on private.learning_v2_mcq_receipts for each row execute function private.fail_d4_receipt()`);
  await expect(f.save(f.A, input(f.hash))).rejects.toThrow(/injected commit failure/);
  await f.admin();
  await f.db.exec(
    "drop trigger fail_test_receipt on private.learning_v2_mcq_receipts; drop function private.fail_d4_receipt()",
  );
  await f.user(f.A);
  expect((await f.history()).v2).toEqual(before.v2);
});
it("shared-generation reset orders saves/replays safely and retains the other owner", async () => {
  const old = input(f.hash);
  await f.save(f.A, old);
  await f.save(f.B, input(f.hash));
  await f.user(f.B);
  const b = await f.history();
  await f.user(f.A);
  const reset = crypto.randomUUID();
  await f.db.query("select public.reset_learning($1,'1.0.0',0)", [reset]);
  await expect(f.save(f.A, old)).rejects.toThrow(/Stale learning generation/);
  const fresh = input(f.hash, "a", 1);
  const receipt = await f.save(f.A, fresh);
  await f.user(f.A);
  await f.db.query("select public.reset_learning($1,'1.0.0',0)", [reset]);
  expect(await f.save(f.A, fresh)).toEqual(receipt);
  await f.user(f.B);
  expect((await f.history()).v2).toEqual(b.v2);
});
it("withdraws new starts while a pinned reviewed in-flight attempt can finish", async () => {
  const hash = await stageTwoQuestionFixture(f);
  const first = {
    ...input(hash),
    contentVersion: "9.1.0",
    lesson: { kind: "lesson" as const, id: "multi-fixture-lesson", revision: 1 },
    delivery: { kind: "block" as const, id: "multi-fixture-practice", revision: 1 },
    exercise: { kind: "exercise" as const, id: "multi-fixture-question", revision: 1 },
  };
  const a = await f.save(f.B, first);
  expect(a.resultId).toBeNull();
  await f.admin();
  await f.db.query(
    "update private.learning_staging_permissions set allow_new=false where release_hash=$1",
    [hash],
  );
  await expect(
    f.save(f.B, { ...first, attemptId: crypto.randomUUID(), responseId: crypto.randomUUID() }),
  ).rejects.toThrow(/permission/);
  const second = {
    ...first,
    responseId: crypto.randomUUID(),
    exercise: { ...first.exercise, id: "multi-fixture-question-two" },
  };
  const b = await f.save(f.B, second);
  expect(b.resultId).not.toBeNull();
  expect(await f.save(f.B, first)).toEqual(a);
  await f.user(f.B);
  const history = await f.history();
  expect(history.v2.attempt_results.find((r) => r.id === b.resultId)).toMatchObject({
    correct: 2,
    total: 2,
    passed: null,
  });
});
