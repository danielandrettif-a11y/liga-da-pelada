import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { LeagueLobbyRepository } from "../application/manage-league-membership.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class LeagueLobbyPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueLobbyPersistenceError";
  }
}

function translateLobbyFailure(cause: unknown): LeagueLobbyPersistenceError {
  const message = cause instanceof Error ? cause.message : "";
  if (/Convite invalido|Convite inválido|expirado/i.test(message)) {
    return new LeagueLobbyPersistenceError("Convite inválido ou expirado.", 404);
  }
  if (/nao esta aberta|não está aberta/i.test(message)) {
    return new LeagueLobbyPersistenceError("Esta pelada não está aberta para entrada.", 409);
  }
  if (/Complete seu perfil|perfil de jogador nao esta disponivel|perfil de jogador não está disponível/i.test(message)) {
    return new LeagueLobbyPersistenceError("Complete seu perfil de jogador antes de continuar.", 422);
  }
  if (/nao participa|não participa/i.test(message)) {
    return new LeagueLobbyPersistenceError("Você não participa desta pelada.", 403);
  }
  return new LeagueLobbyPersistenceError("Não foi possível concluir a operação na pelada.", 503);
}

export function pgLeagueLobbyRepository(pool: Pool): LeagueLobbyRepository {
  const authenticated = <T>(actor: Actor, sql: string, params: unknown[], read: (row: Record<string, unknown>) => T) =>
    withAuthenticatedTransaction(pool, actor, async (client) => {
      const result = await client.query(sql, params);
      const row = result.rows[0];
      if (!row) throw new Error("RPC sem resposta.");
      return read(row);
    });

  return {
    async joinOpen(leagueId, actor) {
      try {
        return await authenticated(actor, "SELECT public.join_open_league($1::uuid) AS joined", [leagueId],
          (row) => row.joined === true);
      } catch (error) { throw translateLobbyFailure(error); }
    },
    async toggleFavorite(leagueId, actor) {
      try {
        return await authenticated(actor, "SELECT public.toggle_league_favorite($1::uuid) AS favorite", [leagueId],
          (row) => row.favorite === true);
      } catch (error) { throw translateLobbyFailure(error); }
    },
    async requestByInvite(inviteToken, actor) {
      try {
        return await authenticated(actor,
          "SELECT public.request_league_membership($1::uuid)::text AS league_id", [inviteToken],
          (row) => {
            if (typeof row.league_id !== "string") throw new Error("RPC sem identificador da pelada.");
            return row.league_id;
          });
      } catch (error) { throw translateLobbyFailure(error); }
    },
  };
}
