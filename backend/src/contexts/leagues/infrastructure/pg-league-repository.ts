import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { LeagueRepository } from "../application/create-league.js";
import type { NewLeague } from "../domain/league.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class LeaguePersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeaguePersistenceError";
  }
}

export function pgLeagueRepository(pool: Pool): LeagueRepository {
  return {
    async create(league: NewLeague, actor: Actor): Promise<string> {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{ league_id: string }>(
            "SELECT public.create_league_for_user($1::text, $2::text, $3::text) AS league_id",
            [league.name, league.tier, league.visibility],
          );
          const id = result.rows[0]?.league_id;
          if (!id) throw new Error("RPC sem identificador da pelada.");
          return id;
        });
      } catch (cause) {
        const error = cause as Error & { code?: string };
        if (error.code === "23505") throw new LeaguePersistenceError("Já existe uma pelada com esse nome.", 409);
        if (/Complete seu perfil de jogador/i.test(error.message)) {
          throw new LeaguePersistenceError("Complete seu perfil de jogador antes de criar uma pelada.", 422);
        }
        throw new LeaguePersistenceError("Não foi possível criar a pelada.", 503);
      }
    },
  };
}
