import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { LeagueMembershipRequestRepository } from "../application/request-league-membership.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class LeagueMembershipRequestPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueMembershipRequestPersistenceError";
  }
}

export function pgLeagueMembershipRequestRepository(pool: Pool): LeagueMembershipRequestRepository {
  return {
    async request(leagueId: string, actor: Actor): Promise<boolean> {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{ requested: boolean }>(
            "SELECT public.request_league_membership_by_id($1::uuid) AS requested",
            [leagueId],
          );
          return result.rows[0]?.requested === true;
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (/Pelada nao encontrada|Pelada não encontrada/i.test(message)) {
          throw new LeagueMembershipRequestPersistenceError("Pelada não encontrada.", 404);
        }
        if (/pelada esta aberta|pelada está aberta/i.test(message)) {
          throw new LeagueMembershipRequestPersistenceError("Esta pelada está aberta para entrada direta.", 409);
        }
        throw new LeagueMembershipRequestPersistenceError("Não foi possível solicitar acesso.", 503);
      }
    },
  };
}
