import type { Pool } from "pg";
import type { GoalRepository } from "../application/register-goal.js";
import type { Actor } from "../../../shared/actor.js";
import type { GoalCommand, GoalReceipt } from "../domain/goal.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

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
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
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
          return receipt;
        });
      } catch (error) {
        throw classifyError(error);
      }
    },
  };
}
