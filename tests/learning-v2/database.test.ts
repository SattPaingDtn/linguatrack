// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { localFixture, personalTables } from "./fixtures";
import { summarizeCombinedHistory } from "@/lib/learning/v2/history";
import { inspectD3Prerequisites } from "@/lib/learning/v2/preflight";
let fixture: Awaited<ReturnType<typeof localFixture>>;
beforeAll(async () => {
  fixture = await localFixture(true);
}, 60000);
afterAll(async () => {
  await fixture?.close();
});
describe("D3 isolated PostgreSQL lifecycle", () => {
  it("inspects local prerequisites/ledger and preserves existing v1 accounts and exact snapshots", async () => {
    expect(fixture.preflight.appliedMigrations).toHaveLength(4);
    await fixture.user(fixture.A);
    const history = await fixture.history();
    const before = fixture.legacyBefore as typeof history.legacy;
    expect(history.legacy.attempts).toEqual(before.attempts);
    expect(history.legacy.lessonProgress).toEqual(before.lessonProgress);
    expect(history.legacy.profile).toEqual(before.profile);
    expect(history.resume?.source).toBe("legacy_baseline");
    expect(history.v2.attempts).toEqual([]);
  });
  it("stores repeated attempts, mistakes and snapshots durably across reopen and identity changes", async () => {
    await fixture.seed(fixture.A);
    await fixture.seed(fixture.A, 0, "a");
    await fixture.user(fixture.A);
    const saved = await fixture.history();
    expect(saved.v2.attempts).toHaveLength(2);
    expect(saved.v2.responses.map((r) => r.response)).toEqual(
      expect.arrayContaining([
        { type: "multiple_choice", optionIds: ["a"] },
        { type: "multiple_choice", optionIds: ["b"] },
      ]),
    );
    expect(saved.v2.mistakes).toHaveLength(1);
    expect(saved.v2.review_events).toHaveLength(1);
    expect(summarizeCombinedHistory(saved)).toMatchObject({
      checkedResponses: 2,
      correctResponses: 1,
      recognitionResponses: 2,
      assessmentResults: 0,
      demonstratedCefr: null,
      lessonCompletions: { v1: 1, v2: 1 },
    });
    await fixture.user("", "anon");
    await expect(fixture.history()).rejects.toThrow(/permission denied/);
    await fixture.reopen();
    await fixture.user(fixture.A);
    const reloaded = await fixture.history();
    expect(reloaded.v2).toEqual(saved.v2);
    expect(reloaded.legacy.attempts).toEqual(saved.legacy.attempts);
    await fixture.user(fixture.B);
    expect((await fixture.history()).v2.attempts).toEqual([]);
    await fixture.user(fixture.A);
    expect((await fixture.history()).v2.grades).toEqual(saved.v2.grades);
  });
  it("enforces owner RLS and denies browser writes, private bindings and registry-principal access", async () => {
    await fixture.seed(fixture.B);
    await fixture.user(fixture.A);
    for (const table of personalTables) {
      expect(
        (
          await fixture.db.query(`select * from public.learning_v2_${table} where user_id=$1`, [
            fixture.B,
          ])
        ).rows,
      ).toEqual([]);
      await expect(fixture.db.exec(`delete from public.learning_v2_${table}`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        fixture.db.exec(`insert into public.learning_v2_${table} default values`),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(fixture.db.exec("update public.learning_v2_grades set points=1")).rejects.toThrow(
      /permission denied/,
    );
    await expect(fixture.db.exec("select * from private.learning_v2_bindings")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      fixture.db.exec("select * from curriculum_private.grading_bindings"),
    ).rejects.toThrow(/permission denied/);
    await fixture.admin();
    await fixture.db.exec("set role linguatrack_registry_importer");
    await expect(fixture.db.exec("select * from public.learning_v2_attempts")).rejects.toThrow(
      /permission denied/,
    );
    await expect(fixture.db.exec("select public.learning_history_v2()")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("rejects mismatched exact references, cross-owner parents, stale generations and leaked grading fields", async () => {
    await fixture.user(fixture.A);
    const h = await fixture.history();
    const a = h.v2.attempts[0]!,
      r = h.v2.responses[0]!;
    await fixture.admin();
    await expect(
      fixture.db.query(
        `insert into public.learning_v2_attempts select $1,user_id,generation,release_hash,content_version,lesson_id,999,delivery_kind,delivery_id,delivery_revision,mode,required_exercises,runtime_version,created_at from public.learning_v2_attempts where id=$2`,
        [crypto.randomUUID(), a.id],
      ),
    ).rejects.toThrow(/Exact release reference/);
    await expect(
      fixture.db.query(
        `insert into public.learning_v2_responses select $1,$2,generation,release_hash,attempt_id,exercise_id,exercise_revision,request_hash,response,prompt_snapshot,options_snapshot,evidence_construct,assistance,created_at from public.learning_v2_responses where id=$3`,
        [crypto.randomUUID(), fixture.B, r.id],
      ),
    ).rejects.toThrow(/pinned required|foreign key/);
    await expect(
      fixture.db.query(
        `insert into public.learning_v2_attempts select $1,user_id,99,release_hash,content_version,lesson_id,lesson_revision,delivery_kind,delivery_id,delivery_revision,mode,required_exercises,runtime_version,created_at from public.learning_v2_attempts where id=$2`,
        [crypto.randomUUID(), a.id],
      ),
    ).rejects.toThrow(/Stale learning generation/);
    const g = h.v2.grades[0]!;
    await expect(
      fixture.db.query(
        `insert into public.learning_v2_grades select $1,user_id,generation,release_hash,response_id,id,status,source,points,max_points,is_correct,'{"en":"ok","my":"ok","correctOptionIds":["a"]}',created_at from public.learning_v2_grades where id=$2`,
        [crypto.randomUUID(), g.id],
      ),
    ).rejects.toThrow(/Unsafe feedback/);
    for (const table of [
      "attempts",
      "responses",
      "grades",
      "attempt_results",
      "completion_events",
      "mistakes",
      "review_events",
    ]) {
      await expect(
        fixture.db.exec(`update public.learning_v2_${table} set created_at=now()`),
      ).rejects.toThrow(/append-only/);
    }
    await expect(fixture.db.exec("truncate public.learning_v2_grades cascade")).rejects.toThrow(
      /append-only/,
    );
  });
  it("keeps history readable with inactive channels and does not use answer saves/heartbeats as navigation", async () => {
    await fixture.user(fixture.A);
    const before = await fixture.history();
    await fixture.db.query(
      "select public.touch_position('1.0.0','a1-c1-be','a1-c1-write',$1,1,0)",
      [crypto.randomUUID()],
    );
    expect((await fixture.history()).resume).toEqual(before.resume);
    await fixture.db.query(
      "select public.touch_position('1.0.0','a1-c1-introductions',null,$1,1,0)",
      [crypto.randomUUID()],
    );
    expect((await fixture.history()).resume).toMatchObject({
      schema_version: 1,
      lesson_id: "a1-c1-introductions",
      source: "v1_position_change",
    });
    await fixture.admin();
    const channels = await fixture.db.query("select * from curriculum_private.channels");
    expect(channels.rows).toEqual([
      { channel: "default", enabled: false, active_package_hash: null, epoch: 0 },
    ]);
    await fixture.user(fixture.A);
    expect((await fixture.history()).v2.grades).toEqual(before.v2.grades);
  });
  it("appends audited grade/result corrections without changing original feedback, timestamps or scores", async () => {
    await fixture.user(fixture.A);
    const before = await fixture.history();
    const grade = before.v2.grades.find((g) => !g.is_correct)!,
      response = before.v2.responses.find((r) => r.id === grade.response_id)!;
    const original = before.v2.attempt_results.find((r) => r.attempt_id === response.attempt_id)!;
    await fixture.admin();
    const newGrade = crypto.randomUUID(),
      newResult = crypto.randomUUID();
    await fixture.db.query(
      `insert into public.learning_v2_grades(id,user_id,generation,release_hash,response_id,previous_grade_id,status,source,points,max_points,is_correct,feedback)
      values($1,$2,0,$3,$4,$5,'graded','human',1,1,true,'{"en":"Reviewed correction.","my":"ပြန်လည်စစ်ဆေးပြီး ပြင်ဆင်ထားသည်။"}')`,
      [newGrade, fixture.A, fixture.hash, response.id, grade.id],
    );
    await fixture.db.query(
      `insert into public.learning_v2_attempt_results(id,user_id,generation,release_hash,attempt_id,previous_result_id,points,max_points,correct,total,percentage,runtime_version)
      values($1,$2,0,$3,$4,$5,1,1,1,1,100,'test-human-review')`,
      [newResult, fixture.A, fixture.hash, response.attempt_id, original.id],
    );
    await fixture.user(fixture.A);
    const after = await fixture.history();
    expect(after.v2.grades.find((g) => g.id === grade.id)).toEqual(grade);
    expect(after.v2.attempt_results.find((r) => r.id === original.id)).toEqual(original);
    expect(after.v2.attempt_results.find((r) => r.id === newResult)).toMatchObject({
      previous_result_id: original.id,
      percentage: 100,
      passed: null,
    });
    expect(after.legacy.attempts).toEqual(before.legacy.attempts);
    await fixture.admin();
    expect(
      (
        await fixture.db.query(
          "select principal::text from private.learning_v2_grade_audit where grade_id=$1",
          [newGrade],
        )
      ).rows,
    ).toEqual([{ principal: "postgres" }]);
  });
  it("exports more than the 1000-row REST limit completely and keeps unapproved content inactive", async () => {
    await fixture.admin();
    await fixture.db.query(
      `insert into public.learning_v2_attempts(id,user_id,generation,release_hash,content_version,lesson_id,lesson_revision,delivery_kind,delivery_id,delivery_revision,mode,required_exercises,runtime_version)
      select gen_random_uuid(),$1,0,$2,'9.0.0','fixture-lesson',1,'block','fixture-practice',1,'practice','[{"kind":"exercise","id":"fixture-question","revision":1}]','test-v1' from generate_series(1,1001)`,
      [fixture.B, fixture.hash],
    );
    await fixture.user(fixture.B);
    const exported = await fixture.history();
    const count = (
      await fixture.db.query<{ count: number }>(
        "select count(*)::integer as count from public.learning_v2_attempts",
      )
    ).rows[0]!.count;
    expect(exported.v2.attempts).toHaveLength(count);
    expect(count).toBeGreaterThan(1000);
    expect(exported.complete).toBe(true);
    expect(JSON.stringify(exported)).not.toMatch(
      /correctOptionIds|PRIVATE_FIXTURE_FEEDBACK|grading_bindings/,
    );
  });
  it("extends reset across versions once, retains other owners, rejects old work, and permits old v1 first offline answers", async () => {
    await fixture.user(fixture.B);
    const b = await fixture.history();
    await fixture.user(fixture.A);
    const id = crypto.randomUUID();
    await fixture.db.query("select public.reset_learning($1,'1.0.0',0)", [id]);
    const empty = await fixture.history();
    expect(empty.generation).toBe(1);
    expect(empty.resume).toBeNull();
    expect(empty.legacy.attempts).toEqual([]);
    for (const rows of Object.values(empty.v2)) expect(rows).toEqual([]);
    await expect(fixture.seed(fixture.A, 0)).rejects.toThrow(/Stale learning generation/);
    await fixture.seed(fixture.A, 1);
    await fixture.user(fixture.A);
    const fresh = await fixture.history();
    await fixture.db.query("select public.reset_learning($1,'1.0.0',0)", [id]);
    expect((await fixture.history()).v2).toEqual(fresh.v2);
    await expect(
      fixture.db.query("select public.reset_learning($1,'1.0.0',0)", [crypto.randomUUID()]),
    ).rejects.toThrow(/reset/);
    await expect(
      fixture.db.query(
        "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-1',0)",
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow(/reset/);
    await fixture.user(fixture.B);
    expect((await fixture.history()).v2).toEqual(b.v2);
    const oldOfflineId = crypto.randomUUID();
    await fixture.db.query(
      "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-1',0)",
      [oldOfflineId],
    );
    await fixture.db.query(
      "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-1',0)",
      [oldOfflineId],
    );
    expect(
      (await fixture.history()).legacy.attempts.filter((a) => a.id === oldOfflineId),
    ).toHaveLength(1);
    for (const [q, option] of [
      [2, "option-2"],
      [3, "option-3"],
      [4, "option-1"],
      [5, "option-3"],
    ] as const)
      await fixture.db.query(
        "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz',$2,$3,0)",
        [oldOfflineId, `a1-c1-q${q}`, option],
      );
    expect(
      (await fixture.history()).legacy.attempts.find((a) => a.id === oldOfflineId),
    ).toMatchObject({ percentage: 80, passed: true, status: "completed", contentVersion: "1.0.0" });
  });
  it("account deletion cascades private receipts and public history without deleting curriculum", async () => {
    await fixture.admin();
    await fixture.db.query("delete from auth.users where id=$1", [fixture.A]);
    for (const table of personalTables)
      expect(
        (
          await fixture.db.query(`select * from public.learning_v2_${table} where user_id=$1`, [
            fixture.A,
          ])
        ).rows,
      ).toEqual([]);
    expect(
      (
        await fixture.db.query("select * from private.learning_v2_receipts where user_id=$1", [
          fixture.A,
        ])
      ).rows,
    ).toEqual([]);
    expect((await fixture.db.query("select * from curriculum_private.releases")).rows).toHaveLength(
      1,
    );
    await fixture.user(fixture.B);
    expect((await fixture.history()).v2.attempts.length).toBeGreaterThan(0);
  });
  it("rejects unknown reset versions without deletion and accepts a retained registered v2 version", async () => {
    await fixture.user(fixture.B);
    const before = await fixture.history();
    await expect(
      fixture.db.query("select public.reset_learning($1,'99.99.99',0)", [crypto.randomUUID()]),
    ).rejects.toThrow(/Unknown content version/);
    expect((await fixture.history()).v2).toEqual(before.v2);
    const result = await fixture.db.query<{ value: { generation: number } }>(
      "select public.reset_learning($1,'9.0.0',0) as value",
      [crypto.randomUUID()],
    );
    expect(result.rows[0]!.value.generation).toBe(1);
    expect((await fixture.history()).v2.attempts).toEqual([]);
    expect((await fixture.history()).legacy.attempts).toEqual([]);
  });
});
it("fails prerequisite inspection before any mutation when D2/v1 are absent", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await expect(inspectD3Prerequisites(db)).rejects.toThrow(/prerequisites|schema/);
  } finally {
    await db.close();
  }
});
