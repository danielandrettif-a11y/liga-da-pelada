import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { SpeedRatingRepository } from "../application/manage-speed-ratings.js";
import type { SpeedDrawPlayer, SpeedRating } from "../domain/speed-draw.js";

export class SpeedRatingPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "SpeedRatingPersistenceError";
  }
}

function translateFailure(cause: unknown): SpeedRatingPersistenceError {
  if (cause instanceof SpeedRatingPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/SPEED_RATING_FORBIDDEN|permission denied|row-level security/i.test(message)) {
    return new SpeedRatingPersistenceError("Apenas administradores da pelada podem gerenciar velocidades.", 403);
  }
  if (/SPEED_RATING_MEMBER_NOT_FOUND/i.test(message)) {
    return new SpeedRatingPersistenceError("Jogador não pertence a esta pelada.", 404);
  }
  return new SpeedRatingPersistenceError("Não foi possível acessar as avaliações de velocidade.", 503);
}

async function authenticated<T>(
  pool: Pool,
  actor: Actor,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

async function requireLeagueAdmin(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
  );
  if (access.rows[0]?.allowed !== true) throw new Error("SPEED_RATING_FORBIDDEN");
}

function rating(value: number | string | null): SpeedRating | null {
  const parsed = value === null ? null : Number(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

export function pgSpeedRatingRepository(pool: Pool): SpeedRatingRepository {
  return {
    listRatings: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const result = await client.query<{ player_id: string; speed_rating: number | string | null }>(
        `SELECT player_id, speed_rating
           FROM public.league_members
          WHERE league_id = $1::uuid AND is_active
          ORDER BY player_id`,
        [leagueId],
      );
      return Object.fromEntries(result.rows.map((row) => [row.player_id, rating(row.speed_rating)]));
    }),

    listEligiblePlayers: (leagueId, playerIds, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const result = await client.query<{ player_id: string; speed_rating: number | string | null }>(
        `SELECT member.player_id, member.speed_rating
           FROM public.league_members member
           JOIN public.players player ON player.id = member.player_id
          WHERE member.league_id = $1::uuid AND member.is_active
            AND member.player_id = ANY($2::uuid[])
            AND player.is_selectable
            AND player.member_category IN ('player', 'guest')`,
        [leagueId, playerIds],
      );
      return result.rows.map((row): SpeedDrawPlayer => ({
        id: row.player_id, speedRating: rating(row.speed_rating),
      }));
    }),

    setRating: (leagueId, playerId, speedRating, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueAdmin(client, leagueId);
      const result = await client.query<{ id: string }>(
        `UPDATE public.league_members
            SET speed_rating = $3::smallint
          WHERE league_id = $1::uuid AND player_id = $2::uuid AND is_active
          RETURNING id`,
        [leagueId, playerId, speedRating],
      );
      if (!result.rows[0]) throw new Error("SPEED_RATING_MEMBER_NOT_FOUND");
    }),
  };
}
