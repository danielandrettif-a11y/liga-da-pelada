import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { LeagueAdminRepository } from "../application/manage-league-admin.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class LeagueAdminPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeagueAdminPersistenceError";
  }
}

function translateAdminFailure(cause: unknown): LeagueAdminPersistenceError {
  const message = cause instanceof Error ? cause.message : "";
  if (/Acesso restrito|Somente ADM|Somente administradores/i.test(message)) {
    return new LeagueAdminPersistenceError("Somente o ADM desta pelada pode concluir a operação.", 403);
  }
  if (/nao encontrad|não encontrad|solicitacao invalida|solicitação inválida/i.test(message)) {
    return new LeagueAdminPersistenceError("Pelada, conta ou solicitação não encontrada.", 404);
  }
  if (/Conta sem perfil/i.test(message)) {
    return new LeagueAdminPersistenceError("A conta ainda não possui perfil de jogador.", 422);
  }
  if (/Visibilidade invalida|Visibilidade inválida/i.test(message)) {
    return new LeagueAdminPersistenceError("Visibilidade inválida.", 400);
  }
  return new LeagueAdminPersistenceError("Não foi possível atualizar a pelada.", 503);
}

export function pgLeagueAdminRepository(pool: Pool): LeagueAdminRepository {
  const execute = async (actor: Actor, sql: string, params: unknown[], field: string) => {
    try {
      return await withAuthenticatedTransaction(pool, actor, async (client) => {
        const result = await client.query<Record<string, unknown>>(sql, params);
        return result.rows[0]?.[field] === true;
      });
    } catch (error) { throw translateAdminFailure(error); }
  };
  return {
    reviewMembershipRequest: (requestId, approve, actor) => execute(actor,
      "SELECT public.review_league_membership($1::uuid, $2::boolean) AS reviewed", [requestId, approve], "reviewed"),
    addAccount: (leagueId, userId, actor) => execute(actor,
      "SELECT public.add_account_to_league($1::uuid, $2::uuid) AS added", [leagueId, userId], "added"),
    setVisibility: (leagueId, visibility, actor) => execute(actor,
      "SELECT public.set_league_visibility($1::uuid, $2::text) AS updated", [leagueId, visibility], "updated"),
  };
}
