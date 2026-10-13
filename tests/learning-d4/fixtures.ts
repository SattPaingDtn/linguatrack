import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sealedFixture, asPrincipal, reviews } from "../registry/fixtures";
import { media } from "../curriculum-v2/fixtures";
import { canonicalJson, fingerprint, sha256 } from "@/lib/curriculum/v2/json";
import { writeDraft } from "@/lib/curriculum/v2/files";
import { prepareSealedImport } from "@/lib/curriculum/staging/prepare";
import { registerCandidate, stageRelease } from "@/lib/curriculum/staging/database";
import type { CurriculumPackage } from "@/lib/curriculum/v2/package";
import { localFixture } from "../learning-v2/fixtures";
import { inspectD3Prerequisites } from "@/lib/learning/v2/preflight";
import { saveMcqInTransaction } from "@/lib/learning/v2/mcq-writer";
import type { McqSubmission } from "@/lib/learning/v2/mcq-contracts";
export const projectRef = "abcdefghijklmnopqrst";
export const protectedRef = "zyxwvutsrqponmlkjihg";
export const stageEnv = {
  LINGUATRACK_RUNTIME_ENV: "staging",
  LINGUATRACK_V2_MCQ_ENABLED: "true",
  LINGUATRACK_STAGING_PROJECT_REF: projectRef,
  LINGUATRACK_PROTECTED_PROJECT_REF: protectedRef,
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable",
};
export function input(hash: string, option = "a", generation = 0): McqSubmission {
  return {
    schemaVersion: 2,
    releaseHash: hash,
    contentVersion: "9.0.0",
    attemptId: crypto.randomUUID(),
    responseId: crypto.randomUUID(),
    generation,
    lesson: { kind: "lesson", id: "fixture-lesson", revision: 1 },
    delivery: { kind: "block", id: "fixture-practice", revision: 1 },
    exercise: { kind: "exercise", id: "fixture-question", revision: 1 },
    response: { type: "multiple_choice", optionIds: [option] },
  };
}
export async function d4Fixture() {
  const f = await localFixture(true);
  await f.admin();
  await inspectD3Prerequisites(f.db);
  const migrationState = await f.db.query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  if (migrationState.rows.length !== 5) throw new Error("Expected isolated D3 migration ledger");
  await f.db.exec(await readFile("supabase/migrations/20261013000200_staging_v2_mcq.sql", "utf8"));
  const disabled = await f.db.query<{ count: number }>(
    "select (select count(*) from private.learning_staging_environment)::integer + (select count(*) from private.learning_staging_permissions)::integer as count",
  );
  if (disabled.rows[0]!.count !== 0) throw new Error("D4 must not seed enabled staging access");
  await f.db.query("insert into supabase_migrations.schema_migrations values('20261013000200')");
  await f.db.exec(
    "create role staging_test_app login noinherit; grant linguatrack_staging_writer to staging_test_app;",
  );
  await f.db.query(
    "insert into private.learning_staging_environment(environment,project_ref,enabled) values('staging',$1,true)",
    [projectRef],
  );
  for (const owner of [f.A, f.B])
    await f.db.query(
      `insert into private.learning_staging_permissions(release_hash,user_id,lesson_id,lesson_revision,delivery_id,delivery_revision,allow_new,allow_finish)
    values($1,$2,'fixture-lesson',1,'fixture-practice',1,true,true)`,
      [f.hash, owner],
    );
  async function writer() {
    await f.admin();
    await f.db.exec(
      "set session authorization staging_test_app; set role linguatrack_staging_writer",
    );
  }
  async function save(owner: string, submission: McqSubmission) {
    await writer();
    return f.db.transaction((tx) =>
      saveMcqInTransaction(
        {
          query: async <T>(sql: string, params: unknown[]) => ({
            rows: (await tx.query(sql, params)).rows as T[],
          }),
        },
        projectRef,
        owner,
        submission,
      ),
    );
  }
  return {
    ...f,
    get db() {
      return f.db;
    },
    writer,
    save,
  };
}

// Independent, temporary two-question fixture to exercise an in-flight attempt.
export async function stageTwoQuestionFixture(f: Awaited<ReturnType<typeof d4Fixture>>) {
  const source = await sealedFixture(join(f.root, "multi-source"), "9.1.0");
  const pkg = JSON.parse(
    JSON.stringify(source.pkg).replaceAll("fixture-", "multi-fixture-"),
  ) as CurriculumPackage;
  const first = pkg.public.exercises[0]!;
  const second = { ...first, id: "multi-fixture-question-two" };
  pkg.public.exercises.push(second);
  const block = pkg.public.blocks[0]!;
  if (block.type !== "exercise_set") throw new Error("Expected fixture practice");
  block.exerciseRefs.push({ kind: "exercise", id: second.id, revision: 1 });
  pkg.private.grading.exerciseRules.push({
    ...pkg.private.grading.exerciseRules[0]!,
    exerciseRef: { kind: "exercise", id: second.id, revision: 1 },
  });
  pkg.compatibility[0]!.fingerprints.target = fingerprint(pkg.public.lessons[0]);
  for (const file of pkg.manifest.files) {
    if (file.collection === "media") continue;
    const payload =
      file.collection === "compatibility"
        ? pkg.compatibility
        : file.visibility === "private"
          ? pkg.private[file.collection as keyof typeof pkg.private]
          : pkg.public[file.collection as keyof typeof pkg.public];
    const bytes = canonicalJson(payload);
    file.sha256 = sha256(bytes);
    file.byteLength = Buffer.byteLength(bytes);
  }
  pkg.manifest.state = "draft";
  const directory = join(f.root, "multi-candidate");
  await writeDraft(directory, pkg, media);
  pkg.manifest.state = "sealed";
  await writeFile(join(directory, "manifest.json"), canonicalJson(pkg.manifest));
  const prepared = await prepareSealedImport(directory, []);
  await asPrincipal(f.db, "registry_local_importer");
  await registerCandidate(f.db, prepared);
  await reviews(f.db, prepared.summary.packageHash);
  await stageRelease(f.db, prepared);
  await f.admin();
  await f.db.query(
    `insert into private.learning_staging_permissions
    (release_hash,user_id,lesson_id,lesson_revision,delivery_id,delivery_revision,allow_new,allow_finish)
    values($1,$2,'multi-fixture-lesson',1,'multi-fixture-practice',1,true,true)`,
    [prepared.summary.packageHash, f.B],
  );
  return prepared.summary.packageHash;
}
