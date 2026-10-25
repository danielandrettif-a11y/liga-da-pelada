import type { Pool } from "pg";
import type { Actor, GoalRepository } from "../application/register-goal.js";
import type { GoalCommand, GoalReceipt } from "../domain/goal.js";

export class GoalPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "GoalPersistenceError";
  }
}

type DatabaseError = Error & { code?: string };

function classifyError(cause: unknown): GoalPersistenceError {
  const error = cause as DatabaseError;
  const message = error?.message || "";
  if (/Acesso restrito ao ADM desta pelada/i.test(message)) {
    return new GoalPersistenceError("Sem permissão nesta pelada.", 403);
  }
  if (/Partida não encontrada/i.test(message)) {
    return new GoalPersistenceError("Partida não encontrada.", 404);
  }
  if (/partida não está em andamento/i.test(message)) {
    return new GoalPersistenceError("A partida não está em andamento.", 409);
  }
  if (/Chave de idempotência reutilizada/i.test(message)) {
    return new GoalPersistenceError("Chave do lance reutilizada com outro conteúdo.", 409);
  }
  if (error?.code === "P0001") {
    return new GoalPersistenceError(message, 422);
  }
  return new GoalPersistenceError("Não foi possível confirmar o gol. Repita com a mesma chave.", 503);
}

export function pgGoalRepository(pool: Pool): GoalRepository {
  return {
    async registerGoal(command: GoalCommand, actor: Actor): Promise<GoalReceipt> {
      const client = await pool.connect();
      let transactionStarted = false;
      try {
        await client.query("BEGIN");
        transactionStarted = true;
        // A conta de conexão deve ter apenas SET ROLE para authenticated, nunca
        // ser usada pelo frontend. SET LOCAL desaparece no COMMIT/ROLLBACK.
        await client.query("SET LOCAL ROLE authenticated");
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
          [actor.userId, JSON.stringify({ sub: actor.userId, role: "authenticated" })],
        );
        const result = await client.query<{ receipt: GoalReceipt }>(
          "SELECT public.register_goal($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::integer, $6::text, $7::boolean) AS receipt",
          [
            command.matchId,
            command.playerId,
            command.teamId,
            command.assistPlayerId || null,
            command.minute ?? null,
            command.idempotencyKey,
            Boolean(command.isOwnGoal),
          ],
        );
        const receipt = result.rows[0]?.receipt;
        if (!receipt?.event_id || !receipt.round_id) throw new Error("Recibo de gol inválido.");
        await client.query("COMMIT");
        transactionStarted = false;
        return receipt;
      } catch (error) {
        if (transactionStarted) {
          try { await client.query("ROLLBACK"); } catch { /* conexão pode ter caído */ }
        }
        throw classifyError(error);
      } finally {
        client.release();
      }
    },
  };
}
