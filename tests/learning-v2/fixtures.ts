import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, asPrincipal, sealedFixture, reviews } from "../registry/fixtures";
import { prepareSealedImport } from "@/lib/curriculum/staging/prepare";
import { registerCandidate, stageRelease } from "@/lib/curriculum/staging/database";
import { inspectD3Prerequisites } from "@/lib/learning/v2/preflight";
import { combinedHistorySchema } from "@/lib/learning/v2/contracts";
export const d3Migration = "supabase/migrations/20261013000100_learning_v2_lifecycle.sql";
export const personalTables = [
  "attempts",
  "responses",
  "grades",
  "attempt_results",
  "completion_events",
  "mistakes",
  "review_events",
  "resume",
  "study_sessions",
];
export async function localFixture(persistent = false) {
  const root = await mkdtemp(join(tmpdir(), "linguatrack-d3-"));
  const directory = persistent ? join(root, "db") : undefined;
  let db = new PGlite(directory);
  await migrate(db, true);
  const A = crypto.randomUUID(),
    B = crypto.randomUUID();
  await asPrincipal(db, "postgres");
  await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
  // Seed real v1 RPC history BEFORE the additive D3 migration.
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [A]);
  const v1Attempt = crypto.randomUUID();
  await db.query(
    "select public.answer_question($1,'1.0.0','a1-c1-check','a1-c1-quiz','a1-c1-q1','option-2',0)",
    [v1Attempt],
  );
  await db.query("select public.complete_lesson('1.0.0','a1-c1-introductions',0)");
  await db.query("select public.touch_position('1.0.0','a1-c1-be','a1-c1-write',$1,1,0)", [
    crypto.randomUUID(),
  ]);
  const legacyBefore = (
    await db.query<{ value: unknown }>("select public.learning_export() as value")
  ).rows[0]!.value;
  await asPrincipal(db, "postgres");
  await db.exec(
    "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key)",
  );
  for (const version of ["20261011000100", "20261011000200", "20261011000300", "20261012000100"])
    await db.query("insert into supabase_migrations.schema_migrations values($1)", [version]);
  const preflight = await inspectD3Prerequisites(db);
  await db.exec(await readFile(d3Migration, "utf8"));
  await db.query("insert into supabase_migrations.schema_migrations values('20261013000100')");
  await sealedFixture(join(root, "candidate"));
  const prepared = await prepareSealedImport(join(root, "candidate"), []);
  await asPrincipal(db, "registry_local_importer");
  await registerCandidate(db, prepared);
  await reviews(db, prepared.summary.packageHash);
  await stageRelease(db, prepared);
  const hash = prepared.summary.packageHash;
  async function user(id: string, role = "authenticated") {
    await asPrincipal(db, "postgres");
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  async function admin() {
    await asPrincipal(db, "postgres");
  }
  async function history() {
    const result = await db.query<{ value: unknown }>(
      "select public.learning_history_v2() as value",
    );
    return combinedHistorySchema.parse(result.rows[0]!.value);
  }
  async function seed(owner = A, generation = 0, option = "b") {
    await admin();
    const attempt = crypto.randomUUID(),
      response = crypto.randomUUID(),
      grade = crypto.randomUUID(),
      mistake = crypto.randomUUID(),
      result = crypto.randomUUID();
    await db.query(
      `insert into public.learning_v2_attempts(id,user_id,generation,release_hash,content_version,lesson_id,lesson_revision,delivery_kind,delivery_id,delivery_revision,mode,required_exercises,runtime_version)
      values($1,$2,$3,$4,'9.0.0','fixture-lesson',1,'block','fixture-practice',1,'practice','[{"kind":"exercise","id":"fixture-question","revision":1}]','test-mcq-v1')`,
      [attempt, owner, generation, hash],
    );
    await db.query(
      `insert into public.learning_v2_responses(id,user_id,generation,release_hash,attempt_id,exercise_id,exercise_revision,request_hash,response,prompt_snapshot,options_snapshot)
      select $1,$2,$3,$4,$5,'fixture-question',1,repeat('a',64),$6::jsonb,e.payload#>>'{prompt,text}',
        (select jsonb_agg(jsonb_build_object('id',o->>'id','text',o#>>'{text,text}')) from jsonb_array_elements(e.payload->'options') o)
      from curriculum_private.entities e where kind='exercise' and entity_id='fixture-question' and revision=1`,
      [
        response,
        owner,
        generation,
        hash,
        attempt,
        JSON.stringify({ type: "multiple_choice", optionIds: [option] }),
      ],
    );
    await db.query(
      `insert into private.learning_v2_bindings(response_id,user_id,generation,release_hash,exercise_id,exercise_revision,grading_hash)
      select $1,$2,$3,$4,'fixture-question',1,payload_hash from curriculum_private.grading_bindings where entity_id='fixture-question'`,
      [response, owner, generation, hash],
    );
    await db.query(
      `insert into private.learning_v2_receipts(response_id,user_id,generation,release_hash,request_hash) values($1,$2,$3,$4,repeat('a',64))`,
      [response, owner, generation, hash],
    );
    await db.query(
      `insert into public.learning_v2_grades(id,user_id,generation,release_hash,response_id,status,source,points,max_points,is_correct,feedback)
      values($1,$2,$3,$4,$5,'graded','automatic',$6,1,$7,'{"en":"Use am with I.","my":"I နှင့် am ကို သုံးပါ။","correctAnswer":"am"}')`,
      [grade, owner, generation, hash, response, option === "a" ? 1 : 0, option === "a"],
    );
    if (option !== "a") {
      await db.query(
        "insert into public.learning_v2_mistakes(id,user_id,generation,release_hash,response_id,grade_id) values($1,$2,$3,$4,$5,$6)",
        [mistake, owner, generation, hash, response, grade],
      );
      await db.query(
        "insert into public.learning_v2_review_events(id,user_id,generation,release_hash,mistake_id,action) values($1,$2,$3,$4,$5,'reviewed')",
        [crypto.randomUUID(), owner, generation, hash, mistake],
      );
    }
    await db.query(
      `insert into public.learning_v2_attempt_results(id,user_id,generation,release_hash,attempt_id,points,max_points,correct,total,percentage,runtime_version)
      values($1,$2,$3,$4,$5,$6,1,$6,1,$7,'test-mcq-v1')`,
      [result, owner, generation, hash, attempt, option === "a" ? 1 : 0, option === "a" ? 100 : 0],
    );
    await db.query(
      "insert into public.learning_v2_completion_events(id,user_id,generation,release_hash,lesson_id,lesson_revision,source) values($1,$2,$3,$4,'fixture-lesson',1,'self_reported') on conflict do nothing",
      [crypto.randomUUID(), owner, generation, hash],
    );
    await db.query(
      `insert into public.learning_v2_resume(user_id,generation,release_hash,lesson_id,lesson_revision,block_id,block_revision,step,session_id,sequence,navigation_order)
      values($1,$2,$3,'fixture-lesson',1,'fixture-practice',1,'review',$4,1,1) on conflict do nothing`,
      [owner, generation, hash, crypto.randomUUID()],
    );
    await db.query(
      "insert into public.learning_v2_study_sessions(id,user_id,generation,active_seconds) values($1,$2,$3,15)",
      [crypto.randomUUID(), owner, generation],
    );
    return { attempt, response, grade, mistake, result };
  }
  return {
    get db() {
      return db;
    },
    A,
    B,
    hash,
    root,
    preflight,
    legacyBefore,
    v1Attempt,
    user,
    admin,
    history,
    seed,
    reopen: async () => {
      await db.close();
      db = new PGlite(directory);
    },
    close: async () => {
      await db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
