import "server-only";
import type { RegistrySnapshot } from "../v2/validate";
import type { PreparedImport } from "./prepare";

// Only the embedded local adapter is supplied in D2. No hosted client or URL connection exists.
export interface RegistryDatabase {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export async function registrySnapshot(database: RegistryDatabase): Promise<RegistrySnapshot> {
  const result = await database.query<{ value: RegistrySnapshot }>(
    "select curriculum_private.registry_snapshot() as value",
  );
  return result.rows[0]!.value;
}
export async function dryRun(database: RegistryDatabase, prepared: PreparedImport) {
  const result = await database.query<{ value: { approved: boolean; scopes: string[] } }>(
    "select curriculum_private.approval_status($1) as value",
    [prepared.summary.packageHash],
  );
  return {
    ...prepared.summary,
    dryRun: true,
    writes: false,
    approvals: result.rows[0]!.value,
    canStage: result.rows[0]!.value.approved,
  };
}
export async function registerCandidate(database: RegistryDatabase, prepared: PreparedImport) {
  await database.query("select curriculum_private.register_candidate($1,$2::jsonb)", [
    prepared.summary.packageHash,
    JSON.stringify(prepared.manifest),
  ]);
  return { ...prepared.summary, registered: true, active: false };
}
export async function stageRelease(database: RegistryDatabase, prepared: PreparedImport) {
  const result = await database.query<{
    value: { packageHash: string; state: "inactive"; activated: false };
  }>("select curriculum_private.stage_release($1::jsonb) as value", [
    JSON.stringify(prepared.plan),
  ]);
  return result.rows[0]!.value;
}
