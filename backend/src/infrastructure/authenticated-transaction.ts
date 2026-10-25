import type { Pool, PoolClient } from "pg";
import type { Actor } from "../shared/actor.js";

/**
 * Executa uma operação PostgreSQL sob os claims verificados pelo Auth local.
 * A conta do pool precisa poder SET ROLE authenticated, sem ser superusuária.
 */
export async function withAuthenticatedTransaction<T>(
  pool: Pool,
  actor: Actor,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let inTransaction = false;
  let discardConnection = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
      [actor.userId, JSON.stringify({ sub: actor.userId, role: "authenticated" })],
    );
    const result = await operation(client);
    await client.query("COMMIT");
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); } catch { discardConnection = true; }
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}
