import "server-only";
import { Pool } from "pg";
import { stagingWriterConfig } from "./staging-environment";
import { saveMcqInTransaction } from "./mcq-writer";
let pool: Pool | undefined;
export async function commitStagingAnswer(ownerId: string, input: unknown) {
  const config = stagingWriterConfig();
  // The only supplied hosted writer adapter is target-restricted, TLS-verified and server-only.
  if (!pool) {
    pool = new Pool(config);
    pool.on("error", () => {}); // Request errors propagate; never log connection credentials.
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role linguatrack_staging_writer");
    await client.query("set local statement_timeout='15s'");
    const receipt = await saveMcqInTransaction(
      {
        query: async <T>(sql: string, params: unknown[]) => ({
          rows: (await client.query(sql, params)).rows as T[],
        }),
      },
      config.projectRef,
      ownerId,
      input,
    );
    await client.query("commit"); // No HTTP saved acknowledgement before this succeeds.
    return receipt;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* original failure remains authoritative */
    }
    throw error;
  } finally {
    client.release();
  }
}
