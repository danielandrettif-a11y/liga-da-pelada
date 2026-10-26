import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { QuickMatchRepository } from "../application/create-quick-match.js";
import type { QuickMatchInput, QuickMatchSession } from "../domain/quick-match.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class QuickMatchPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "QuickMatchPersistenceError";
  }
}

function isSession(value: unknown): value is QuickMatchSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return [item.league_id, item.callup_id, item.round_id].every((id) => typeof id === "string" && id.length > 0);
}

export function pgQuickMatchRepository(pool: Pool): QuickMatchRepository {
  return {
    async create(input: QuickMatchInput, actor: Actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{ session: unknown }>(
            "SELECT public.create_quick_match_session($1::date, $2::time, $3::text, $4::text, $5::integer, $6::integer) AS session",
            [input.date, input.startTime, input.fieldName, input.mapUrl, input.playersPerTeam, input.teamsPerRound],
          );
          const session = result.rows[0]?.session;
          if (!isSession(session)) throw new Error("RPC sem identificadores da sessão rápida.");
          return session;
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (/dia e o horário|nome do campo|link válido|Formato da partida inválido/i.test(message)) {
          throw new QuickMatchPersistenceError("Dados da partida rápida inválidos.", 400);
        }
        if (/Complete seu perfil de jogador/i.test(message)) {
          throw new QuickMatchPersistenceError("Complete seu perfil de jogador antes de criar a partida.", 422);
        }
        throw new QuickMatchPersistenceError("Não foi possível criar a partida rápida.", 503);
      }
    },
  };
}
