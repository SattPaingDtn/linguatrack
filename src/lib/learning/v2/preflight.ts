import "server-only";
import type { RegistryDatabase } from "@/lib/curriculum/staging/database";
// Read-only prerequisite inspection. This phase supplies only disposable PGlite callers.
// It is not an authorization or a hosted schema/backup audit.
export async function inspectD3Prerequisites(database: RegistryDatabase) {
  const [functions, tables, columns, policies, ledger] = await Promise.all([
    database.query<{ reset: boolean; guard: boolean; legacyExport: boolean }>(`select
      to_regprocedure('public.reset_learning(uuid,text,integer)') is not null as reset,
      to_regprocedure('private.guard_learning_generation(integer)') is not null as guard,
      to_regprocedure('public.learning_export()') is not null as "legacyExport"`),
    database.query<{
      schema: string;
      name: string;
      rls: boolean;
    }>(`select n.nspname as schema,c.relname as name,c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private','curriculum_private')`),
    database.query<{ generation: boolean }>(`select exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='learning_generation') as generation`),
    database.query<{ count: number }>(
      "select count(*)::integer as count from pg_policies where schemaname='public'",
    ),
    database.query<{ present: boolean }>(
      "select to_regclass('supabase_migrations.schema_migrations') is not null as present",
    ),
  ]);
  const state = {
    functions: functions.rows[0]!,
    tables: tables.rows,
    generation: columns.rows[0]!.generation,
    ownerPolicyCount: policies.rows[0]!.count,
    migrationLedgerPresent: ledger.rows[0]!.present,
  };
  if (
    !state.functions.reset ||
    !state.functions.guard ||
    !state.functions.legacyExport ||
    !state.generation ||
    !state.tables.some(
      (t) => t.schema === "curriculum_private" && t.name === "releases" && t.rls,
    ) ||
    state.ownerPolicyCount < 6
  )
    throw new Error("D3 prerequisites are incomplete; do not apply the migration.");
  const applied = state.migrationLedgerPresent
    ? await database.query<{ version: string }>(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    : { rows: [] };
  return { ...state, appliedMigrations: applied.rows.map((r) => r.version) };
}
