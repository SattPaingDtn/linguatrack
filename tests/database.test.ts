// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { learningSnapshotSchema, quizAttemptSchema } from "@/lib/learning/contracts";
const setup = `create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;`;
const version = "1.0.0",
  lesson = "a1-c1-check",
  quiz = "a1-c1-quiz";
const correct = ["option-1", "option-2", "option-3", "option-2", "option-3"];
let db: PGlite;
let userA: string;
let userB: string;
async function migrate(database: PGlite) {
  await database.exec(setup);
  for (const name of ["20261011000100_learning.sql", "20261011000200_curriculum_v1.sql"])
    await database.exec(await readFile(join(process.cwd(), "supabase/migrations", name), "utf8"));
}
async function asUser(uid: string, role = "authenticated", database = db) {
  await database.exec(`reset role; set role ${role};`);
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
async function answer(id: string, number: number, option = correct[number - 1]!) {
  const { rows } = await db.query<{ value: unknown }>(
    "select public.answer_question($1,$2,$3,$4,$5,$6) as value",
    [id, version, lesson, quiz, `a1-c1-q${number}`, option],
  );
  return quizAttemptSchema.parse(rows[0]!.value);
}
async function snapshot() {
  const { rows } = await db.query<{ value: unknown }>(
    "select public.learning_snapshot($1) as value",
    [version],
  );
  return learningSnapshotSchema.parse(rows[0]!.value);
}
beforeAll(async () => {
  db = new PGlite();
  await migrate(db);
}, 30_000);
beforeEach(async () => {
  userA = crypto.randomUUID();
  userB = crypto.randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users(id) values($1),($2)", [userA, userB]);
  await asUser(userA);
});
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL migration and persistence", () => {
  it("keeps complete immutable answer snapshots and idempotently retries lost acknowledgements", async () => {
    const id = crypto.randomUUID();
    const first = await answer(id, 1, "option-2");
    expect(first).toMatchObject({ answered: 1, correct: 0, status: "in_progress" });
    expect(first.responses[0]).toMatchObject({
      selectedText: "is",
      correctText: "am",
      isCorrect: false,
    });
    expect(first.responses[0]!.explanation.my).toMatch(/[\u1000-\u109f]/);
    expect(first.responses[0]!.timestamp).toBeGreaterThan(0);
    expect((await answer(id, 1, "option-2")).responses).toHaveLength(1);
    await expect(answer(id, 1, "option-1")).rejects.toThrow("Checked answers cannot be changed");
    for (let q = 2; q <= 5; q++) await answer(id, q);
    const finished = (await snapshot()).attempts[0]!;
    expect(finished).toMatchObject({
      answered: 5,
      correct: 4,
      percentage: 80,
      passed: true,
      status: "completed",
    });
    expect(finished.completedAt).not.toBeNull();
    await db.exec("reset role");
    await expect(
      db.query("update public.quiz_attempts set correct = 5 where id=$1", [id]),
    ).rejects.toThrow("Completed attempts are immutable");
    await expect(
      db.query("update public.exercise_responses set selected_text='changed' where attempt_id=$1", [
        id,
      ]),
    ).rejects.toThrow("immutable");
  });
  it("appends fresh attempts and retains prior mistakes and results", async () => {
    const one = crypto.randomUUID(),
      two = crypto.randomUUID();
    for (let q = 1; q <= 5; q++)
      await answer(one, q, correct[q - 1] === "option-1" ? "option-2" : "option-1");
    for (let q = 1; q <= 5; q++) await answer(two, q);
    const state = await snapshot();
    expect(state.attempts).toHaveLength(2);
    expect(state.mistakes).toHaveLength(5);
    expect(state.attempts.find((a) => a.id === one)?.percentage).toBe(0);
    expect(state.attempts.find((a) => a.id === two)?.percentage).toBe(100);
    await db.query("select public.review_mistake($1)", [state.mistakes[0]!.responseId]);
    expect((await snapshot()).mistakes.filter((m) => m.reviewedAt)).toHaveLength(1);
  });
  it("gates completion on a passing quiz, preserves completion after a failed retry, and deduplicates it", async () => {
    await expect(
      db.query("select public.complete_lesson($1,$2)", [version, lesson]),
    ).rejects.toThrow("Pass every required quiz");
    const id = crypto.randomUUID();
    for (let q = 1; q <= 5; q++) await answer(id, q);
    await db.query("select public.complete_lesson($1,$2)", [version, lesson]);
    await db.query("select public.complete_lesson($1,$2)", [version, lesson]);
    const retry = crypto.randomUUID();
    await answer(retry, 1, "option-2");
    expect((await snapshot()).completed).toEqual([lesson]);
  });
  it("isolates all personal tables, RPCs and private keys between users and denies anonymous access", async () => {
    const attemptB = crypto.randomUUID();
    await asUser(userB);
    await answer(attemptB, 1, "option-2");
    await db.query("select public.complete_lesson($1,$2)", [version, "a1-c1-introductions"]);
    await db.query("select public.touch_position($1,$2,$3,$4,$5)", [
      version,
      lesson,
      "a1-c1-quiz",
      crypto.randomUUID(),
      1,
    ]);
    const b = await snapshot();
    await asUser(userA);
    for (const table of [
      "profiles",
      "lesson_progress",
      "quiz_attempts",
      "exercise_responses",
      "mistake_reviews",
      "study_sessions",
    ]) {
      const col = table === "profiles" ? "id" : "user_id";
      const { rows } = await db.query(`select * from public.${table} where ${col}=$1`, [userB]);
      expect(rows).toHaveLength(0);
    }
    expect((await snapshot()).attempts).toHaveLength(0);
    await expect(answer(attemptB, 1, "option-2")).rejects.toThrow("Attempt unavailable");
    await expect(
      db.query("select public.review_mistake($1)", [b.mistakes[0]!.responseId]),
    ).rejects.toThrow("Mistake unavailable");
    await expect(db.query("select * from private.lesson_catalog")).rejects.toThrow(
      "permission denied",
    );
    await expect(db.exec("update public.quiz_attempts set percentage=100")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query(
        "insert into public.lesson_progress(user_id,content_version,lesson_id,completion_source) values($1,$2,$3,'quiz')",
        [userB, version, lesson],
      ),
    ).rejects.toThrow("permission denied");
    await asUser("", "anon");
    await expect(db.exec("select * from public.profiles")).rejects.toThrow("permission denied");
    await expect(db.query("select public.learning_snapshot($1)", [version])).rejects.toThrow(
      "permission denied",
    );
  });
  it("validates foreign questions, versions and options without leaving a partial attempt", async () => {
    const id = crypto.randomUUID();
    await expect(answer(id, 1, "missing-option")).rejects.toThrow("Unknown answer option");
    await expect(
      db.query("select public.answer_question($1,$2,$3,$4,$5,$6)", [
        id,
        "9.0.0",
        lesson,
        quiz,
        "a1-c1-q1",
        "option-1",
      ]),
    ).rejects.toThrow("Unknown quiz");
    expect((await snapshot()).attempts).toHaveLength(0);
  });
  it("saves resume sections and ignores out-of-order heartbeats", async () => {
    const session = crypto.randomUUID();
    await db.query("select public.touch_position($1,$2,$3,$4,$5)", [
      version,
      "a1-c1-introductions",
      "a1-c1-listen",
      session,
      10,
    ]);
    await db.query("select public.touch_position($1,$2,$3,$4,$5)", [
      version,
      "a1-c1-introductions",
      "a1-c1-welcome",
      session,
      9,
    ]);
    expect((await snapshot()).profile.lastBlockId).toBe("a1-c1-listen");
    expect((await snapshot()).studySessionCount).toBe(1);
    await expect(
      db.query("select public.touch_position($1,$2,$3,$4,$5)", [
        version,
        lesson,
        "wrong-section",
        session,
        11,
      ]),
    ).rejects.toThrow("Unknown lesson section");
  });
  it("persists records after database close/reopen and exports only the authenticated owner's rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "linguatrack-db-"));
    let persistent = new PGlite(directory);
    try {
      await migrate(persistent);
      await persistent.query("insert into auth.users values($1)", [userA]);
      await asUser(userA, "authenticated", persistent);
      await persistent.query("select public.complete_lesson($1,$2)", [
        version,
        "a1-c1-introductions",
      ]);
      await persistent.close();
      persistent = new PGlite(directory);
      await asUser(userA, "authenticated", persistent);
      const { rows } = await persistent.query<{ value: unknown }>(
        "select public.learning_snapshot($1) as value",
        [version],
      );
      expect(learningSnapshotSchema.parse(rows[0]!.value).completed).toEqual([
        "a1-c1-introductions",
      ]);
      const exported = await persistent.query<{
        value: { userId: string; lessonProgress: unknown[] };
      }>("select public.learning_export() as value");
      expect(exported.rows[0]!.value.userId).toBe(userA);
      expect(exported.rows[0]!.value.lessonProgress).toHaveLength(1);
    } finally {
      await persistent.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
