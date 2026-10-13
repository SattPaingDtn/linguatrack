import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, writeFile, lstat, realpath } from "node:fs/promises";
import { resolve, relative, sep, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { ContentValidationError } from "../../src/lib/curriculum/v2/json";
import { prepareSealedImport } from "../../src/lib/curriculum/staging/prepare";
import {
  dryRun,
  registerCandidate,
  registrySnapshot,
  stageRelease,
} from "../../src/lib/curriculum/staging/database";

const marker = "linguatrack-isolated-registry-v1";
const migration = "supabase/migrations/20261012000100_curriculum_registry.sql";
const [command, ...args] = process.argv.slice(2);
function values(flag: string) {
  return args.flatMap((arg, i) => (arg === flag ? [args[i + 1] ?? ""] : []));
}
async function location() {
  const path = values("--db")[0];
  if (!path || path.includes("://")) throw new Error("local-path-required");
  const supplied = resolve(path);
  const root = resolve(await realpath(dirname(supplied)), basename(supplied));
  const repo = await realpath(process.cwd());
  const temporary = await realpath(tmpdir());
  if (!(
    root.startsWith(temporary + sep) ||
    root === resolve(repo, ".curriculum-registry-local") ||
    root.startsWith(resolve(repo, ".curriculum-registry-local") + sep)
  ))
    throw new Error("isolated-local-path-required");
  for (const name of [
    "src",
    "public",
    "supabase",
    "schemas",
    "node_modules",
    ".git",
    ".next",
    ".next-e2e",
    ".curriculum-drafts",
    "content-authoring",
  ])
    if (
      root === resolve(repo, name) ||
      root.startsWith(resolve(repo, name) + sep) ||
      resolve(repo, name).startsWith(root + sep)
    )
      throw new Error("protected-local-path");
  return root;
}
async function run() {
  if (!["init", "dry-run", "register", "stage"].includes(command ?? ""))
    throw new Error("unsupported-command");
  const allowed = new Set(["--db", "--against"]);
  for (let i = command === "init" ? 0 : 1; i < args.length; i += 2)
    if (!allowed.has(args[i]!) || !args[i + 1] || args[i + 1]!.startsWith("--"))
      throw new Error("unsupported-arguments");
  const root = await location();
  if (command === "init") {
    // Exclusive creation: never reset, migrate, or reuse an arbitrary existing database.
    await mkdir(root);
    const db = new PGlite(resolve(root, "db"));
    try {
      const { rows } = await db.query(
        "select tablename from pg_tables where schemaname not in ('pg_catalog','information_schema')",
      );
      if (rows.length) throw new Error("nonempty-local-database");
      await db.exec("create role anon; create role authenticated;");
      await db.exec(await readFile(resolve(migration), "utf8"));
      await db.exec(
        "create role registry_local_importer login noinherit; grant linguatrack_registry_importer to registry_local_importer;",
      );
      await writeFile(resolve(root, "registry-marker.json"), JSON.stringify({ format: marker }), {
        flag: "wx",
      });
      console.log(
        JSON.stringify({
          localOnly: true,
          initialized: true,
          active: false,
          reviewersProvisioned: false,
        }),
      );
    } finally {
      await db.close();
    }
    return;
  }
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root)
    throw new Error("local-symlink-rejected");
  const metadata = JSON.parse(await readFile(resolve(root, "registry-marker.json"), "utf8"));
  if (metadata.format !== marker || relative(root, resolve(root, "db")).startsWith(".."))
    throw new Error("isolated-registry-required");
  if ((await lstat(resolve(root, "db"))).isSymbolicLink())
    throw new Error("local-symlink-rejected");
  const db = new PGlite(resolve(root, "db"));
  try {
    await db.exec(
      "set session authorization registry_local_importer; set role linguatrack_registry_importer",
    );
    const prepared = await prepareSealedImport(
      args[0]!,
      values("--against"),
      await registrySnapshot(db),
    );
    if (command === "stage" && !(await dryRun(db, prepared)).canStage)
      throw new Error("authenticated-reviews-required");
    const result =
      command === "dry-run"
        ? await dryRun(db, prepared)
        : command === "register"
          ? await registerCandidate(db, prepared)
          : await stageRelease(db, prepared);
    console.log(JSON.stringify({ localOnly: true, ...result }));
  } finally {
    await db.close();
  }
}
run().catch((error: unknown) => {
  // SQL diagnostics may contain offending private JSON tuples. Never print raw DB errors.
  const diagnostics =
    error instanceof ContentValidationError
      ? error.diagnostics.map(({ code, path }) => ({ code, path }))
      : undefined;
  const safe =
    error instanceof Error &&
    [
      "local-path-required",
      "isolated-local-path-required",
      "protected-local-path",
      "unsupported-command",
      "unsupported-arguments",
      "nonempty-local-database",
      "local-symlink-rejected",
      "isolated-registry-required",
      "authenticated-reviews-required",
    ].includes(error.message)
      ? error.message
      : "local-registry-operation-failed";
  console.error(
    JSON.stringify({
      valid: false,
      error: diagnostics ? "content-validation-failed" : safe,
      ...(diagnostics ? { diagnostics } : {}),
    }),
  );
  process.exitCode = 1;
});
