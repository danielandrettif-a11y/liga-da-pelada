import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerAwardsRepository } from "../application/get-player-awards.js";

export class PlayerAwardsPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerAwardsPersistenceError";
  }
}

function translateFailure(cause: unknown): PlayerAwardsPersistenceError {
  if (cause instanceof PlayerAwardsPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_AWARDS_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new PlayerAwardsPersistenceError("Você não pertence a esta pelada.", 403);
  }
  return new PlayerAwardsPersistenceError("Não foi possível carregar os prêmios do jogador.", 503);
}

async function authenticated<T>(pool: Pool, actor: Actor, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

async function requireLeagueMember(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_member($1::uuid) AS allowed", [leagueId],
  );
  if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_AWARDS_FORBIDDEN");
}

export function pgPlayerAwardsRepository(pool: Pool): PlayerAwardsRepository {
  const scoped = (actor: Actor, leagueId: string, query: (client: PoolClient) => Promise<unknown>) =>
    authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      return query(client);
    });
  return {
    listMonthlyAwards: (leagueId, playerId, actor) => scoped(actor, leagueId, async (client) =>
      (await client.query(
        "SELECT * FROM public.get_monthly_awards_for_player_in_league($1::uuid, $2::uuid)",
        [leagueId, playerId],
      )).rows),
    listAchievementBelts: (leagueId, playerId, actor) => scoped(actor, leagueId, async (client) =>
      (await client.query<{ belts: unknown }>(
        "SELECT public.get_player_achievement_belts($2::uuid, $1::uuid) AS belts", [leagueId, playerId],
      )).rows[0]?.belts ?? []),
    listMonthlyAwardWinners: (leagueId, periodStart, actor) => scoped(actor, leagueId, async (client) =>
      (await client.query(
        "SELECT * FROM public.get_monthly_award_winners_for_league($1::uuid, $2::date)",
        [leagueId, periodStart],
      )).rows),
  };
}
