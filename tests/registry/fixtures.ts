import { PGlite } from "@electric-sql/pglite";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bridge, media, options, translated } from "../curriculum-v2/fixtures";
import { ref } from "../../src/lib/curriculum/v2/common";
import { fingerprint, canonicalJson, sha256 } from "../../src/lib/curriculum/v2/json";
import { loadPackage, writeDraft } from "../../src/lib/curriculum/v2/files";
import { canonical } from "../fixtures";

export const migrationPath = "supabase/migrations/20261012000100_curriculum_registry.sql";
export async function migrate(db: PGlite, withV1 = false, withRegistry = true) {
  // Inspect this isolated instance before applying any migrations.
  const state = await db.query(
    "select tablename from pg_tables where schemaname not in ('pg_catalog','information_schema')",
  );
  if (state.rows.length) throw new Error("Expected empty isolated database");
  await db.exec("create role anon; create role authenticated;");
  if (withV1) {
    await db.exec(
      "create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;",
    );
    for (const file of [
      "20261011000100_learning.sql",
      "20261011000200_curriculum_v1.sql",
      "20261011000300_reset_learning.sql",
    ])
      await db.exec(await readFile(resolve("supabase/migrations", file), "utf8"));
  }
  if (!withRegistry) return;
  await db.exec(await readFile(resolve(migrationPath), "utf8"));
  await provisionRegistryPrincipals(db);
}
export async function provisionRegistryPrincipals(db: PGlite) {
  await db.exec(
    "create role registry_local_importer login noinherit; grant linguatrack_registry_importer to registry_local_importer; create role registry_test_reviewer login noinherit; grant linguatrack_registry_reviewer to registry_test_reviewer;",
  );
}
export async function asPrincipal(
  db: PGlite,
  name:
    "postgres" | "registry_local_importer" | "registry_test_reviewer" | "anon" | "authenticated",
) {
  await db.exec("reset role; set session authorization postgres");
  if (name !== "postgres") await db.exec(`set session authorization ${name}`);
  if (name === "registry_local_importer") await db.exec("set role linguatrack_registry_importer");
  if (name === "registry_test_reviewer") await db.exec("set role linguatrack_registry_reviewer");
}
export async function reviews(
  db: PGlite,
  hash: string,
  scopes = ["translation", "coverage", "grading", "compatibility"],
) {
  await asPrincipal(db, "postgres");
  for (const scope of scopes)
    await db.query(
      "insert into curriculum_private.reviewer_scopes values('registry_test_reviewer',$1) on conflict do nothing",
      [scope],
    );
  await asPrincipal(db, "registry_test_reviewer");
  for (const scope of scopes)
    await db.query("select curriculum_private.record_review($1,$2,'approve',$3)", [
      hash,
      scope,
      crypto.randomUUID(),
    ]);
  await asPrincipal(db, "registry_local_importer");
}

// Test-only fully bilingual package, unrelated to publication of the pending real lesson.
// Files are written solely in temp directories. No real draft approval is changed.
export async function sealedFixture(directory: string, version = "9.0.0") {
  const pkg = bridge();
  const difficulty = {
    targetCefr: "A1" as const,
    band: "introductory" as const,
    estimateSource: "author" as const,
    estimatedMinutes: 1,
  };
  const tags = { areas: ["grammar" as const], coreSkills: [] };
  pkg.public = {
    courses: [
      {
        kind: "course",
        id: "fixture-course",
        revision: 1,
        slug: "fixture-course",
        title: translated,
        description: translated,
        level: "A1",
        track: "general-english",
        status: "available",
        coverageState: "partial",
        outcomeRefs: [ref("objective", "fixture-objective")],
        chapterRefs: [ref("chapter", "fixture-chapter")],
        coverageTargets: [],
      },
    ],
    chapters: [
      {
        kind: "chapter",
        id: "fixture-chapter",
        revision: 1,
        slug: "fixture-chapter",
        title: translated,
        description: translated,
        courseRef: ref("course", "fixture-course"),
        order: 1,
        objectiveRefs: [ref("objective", "fixture-objective")],
        prerequisites: [],
        lessonRefs: [ref("lesson", "fixture-lesson")],
        assessmentRefs: [],
        coverageTargets: [],
      },
    ],
    lessons: [
      {
        kind: "lesson",
        id: "fixture-lesson",
        revision: 1,
        slug: "fixture-lesson",
        title: translated,
        description: translated,
        chapterRef: ref("chapter", "fixture-chapter"),
        tags,
        difficulty,
        objectiveRefs: [ref("objective", "fixture-objective")],
        prerequisites: [],
        blockRefs: [ref("block", "fixture-practice"), ref("block", "fixture-listen")],
        completionPolicy: { type: "self_reported" },
      },
    ],
    blocks: [
      {
        kind: "block",
        id: "fixture-practice",
        revision: 1,
        lessonRef: ref("lesson", "fixture-lesson"),
        title: translated,
        type: "exercise_set",
        exerciseRefs: [ref("exercise", "fixture-question")],
      },
      {
        kind: "block",
        id: "fixture-listen",
        revision: 1,
        lessonRef: ref("lesson", "fixture-lesson"),
        title: translated,
        type: "listening",
        stimulusRef: ref("stimulus", "fixture-stimulus"),
        instruction: translated,
      },
    ],
    objectives: [
      {
        kind: "objective",
        id: "fixture-objective",
        revision: 1,
        statement: translated,
        successCriterion: translated,
        action: "recognize",
        tags,
        difficulty,
        expectedEvidence: ["recognition"],
        descriptorRefs: [],
      },
    ],
    exercises: [
      {
        kind: "exercise",
        id: "fixture-question",
        revision: 1,
        instructions: translated,
        tags,
        difficulty,
        objectiveRefs: [ref("objective", "fixture-objective")],
        type: "multiple_choice",
        prompt: { language: "en", text: "Choose a sentence." },
        selection: "single",
        options: [
          { id: "a", text: { language: "en", text: "I am Su." } },
          { id: "b", text: { language: "en", text: "I is Su." } },
        ],
      },
    ],
    assessments: [],
    stimuli: [
      {
        kind: "stimulus",
        id: "fixture-stimulus",
        revision: 1,
        type: "listening",
        audioRef: ref("asset", "fixture-audio"),
        transcriptRef: ref("transcript", "fixture-transcript"),
        transcriptAccess: "always",
      },
    ],
    transcripts: [
      {
        kind: "transcript",
        id: "fixture-transcript",
        revision: 1,
        language: "en",
        text: "Hello.",
        segments: [],
      },
    ],
    assets: [{ ...pkg.public.assets[0]!, id: "fixture-audio", source: undefined }],
  };
  pkg.private = {
    grading: {
      exerciseRules: [
        {
          exerciseRef: ref("exercise", "fixture-question"),
          gradingRevision: 1,
          graderVersion: "multiple-choice-exact-set-v1",
          maxPoints: 1,
          explanation: { en: "PRIVATE_FIXTURE_FEEDBACK", my: "I နှင့် am ကို သုံးပါ။" },
          type: "multiple_choice",
          scoring: "exact_set",
          correctOptionIds: ["a"],
        },
      ],
      assessmentPolicies: [],
    },
    rubrics: [],
    transcripts: [],
  };
  pkg.manifest.contentVersion = version;
  pkg.manifest.courseRefs = [ref("course", "fixture-course")];
  pkg.manifest.legacyLocaleExceptions = [];
  pkg.manifest.editorialApprovals = [
    {
      ref: ref("lesson", "fixture-lesson"),
      reviewer: "AUTHOR_CLAIM_IS_NOT_AUTHORITY",
      reviewedAt: "2026-10-12T00:00:00.000Z",
      scope: "translation",
    },
  ];
  pkg.manifest.requiredCapabilities = ["legacy-v1-bridge", "multiple_choice", "package-media"];
  pkg.compatibility = [
    {
      from: { schemaVersion: 1, contentVersion: "1.0.0", kind: "lesson", id: "a1-c1-be" },
      to: { contentVersion: version, ref: ref("lesson", "fixture-lesson") },
      completion: "archive_only",
      evidence: "none",
      resume: "restart_with_notice",
      reason: "Fixture only",
      reviewStatus: "approved",
      fingerprints: {
        source: fingerprint(canonical.courses[0]!.chapters[0]!.lessons[1]),
        target: fingerprint(pkg.public.lessons[0]),
      },
    },
  ];
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
  await writeDraft(directory, pkg, media);
  pkg.manifest.state = "sealed";
  await writeFile(resolve(directory, "manifest.json"), canonicalJson(pkg.manifest));
  return loadPackage(directory, options);
}
