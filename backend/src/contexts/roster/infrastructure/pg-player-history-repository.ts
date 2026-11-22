import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerHistoryRepository } from "../application/get-player-history.js";
import type {
  AwardRound, AwardStat, PlayerHistoryRoundType, PlayerRoundHistorySource,
} from "../domain/player-history.js";

export class PlayerHistoryPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerHistoryPersistenceError";
  }
}

function translateFailure(cause: unknown): PlayerHistoryPersistenceError {
  if (cause instanceof PlayerHistoryPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_HISTORY_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new PlayerHistoryPersistenceError("Você não pertence a esta pelada.", 403);
  }
  return new PlayerHistoryPersistenceError("Não foi possível carregar o histórico do jogador.", 503);
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
  if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_HISTORY_FORBIDDEN");
}

type AwardRoundRow = {
  id: string; number: number | string; date: string | Date; season_id: string; season_number: number | string;
  season_status: "active" | "finished"; best_goalkeeper_player_id: string | null;
};
type AwardStatRow = {
  player_id: string; round_id: string; goals: number | string; assists: number | string; wins: number | string;
  points: number | string; games: number | string; defensive_clean_games: number | string;
  defensive_one_goal_games: number | string; team_goals_conceded: number | string;
  player_profile: string | null; member_category: string | null; is_selectable: boolean;
};

const dateText = (value: string | Date) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

export function pgPlayerHistoryRepository(pool: Pool): PlayerHistoryRepository {
  return {
    listRoundHistory: (leagueId: string, playerId: string, roundType: PlayerHistoryRoundType, actor: Actor) =>
      authenticated(pool, actor, async (client) => {
        await requireLeagueMember(client, leagueId);
        const result = await client.query<PlayerRoundHistorySource>(
          `SELECT stats.id, stats.player_id, stats.round_id, stats.games, stats.wins, stats.draws,
                  stats.losses, stats.goals, stats.assists, stats.points, stats.ranking_points,
                  stats.ranking_position_bonus, stats.goalkeeper_games, stats.goalkeeper_goals,
                  stats.goalkeeper_assists, stats.goalkeeper_own_goals, stats.goals_conceded,
                  stats.clean_sheets, stats.own_goals, stats.defensive_clean_games,
                  stats.defensive_one_goal_games, stats.team_goals_conceded,
                  stats.ranking_defensive_clean_games, stats.ranking_defensive_one_goal_games,
                  stats.player_profile_locked, round_item.number AS round_number,
                  round_item.date AS round_date, round_item.scoring_snapshot
             FROM public.player_round_stats stats
             JOIN public.rounds round_item ON round_item.id = stats.round_id
             JOIN public.seasons season ON season.id = round_item.season_id
            WHERE stats.player_id = $2::uuid AND round_item.league_id = $1::uuid
              AND season.status = 'active' AND round_item.round_type = $3
            ORDER BY round_item.number DESC`,
          [leagueId, playerId, roundType],
        );
        return result.rows;
      }),
    readAwardHistory: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      const roundsResult = await client.query<AwardRoundRow>(
        `SELECT round_item.id, round_item.number, round_item.date, round_item.season_id,
                round_item.best_goalkeeper_player_id, season.number AS season_number,
                season.status AS season_status
           FROM public.rounds round_item
           JOIN public.seasons season ON season.id = round_item.season_id
          WHERE round_item.league_id = $1::uuid AND round_item.status = 'finished'
            AND round_item.round_type = 'official'
          ORDER BY round_item.date DESC`,
        [leagueId],
      );
      if (roundsResult.rows.length === 0) return { rounds: [], stats: [] };
      const statsResult = await client.query<AwardStatRow>(
        `SELECT stats.player_id, stats.round_id, stats.goals, stats.assists, stats.wins,
                stats.points, stats.games, stats.defensive_clean_games,
                stats.defensive_one_goal_games, stats.team_goals_conceded,
                player.player_profile, player.member_category, player.is_selectable
           FROM public.player_round_stats stats
           JOIN public.rounds round_item ON round_item.id = stats.round_id
           JOIN public.players player ON player.id = stats.player_id
          WHERE round_item.league_id = $1::uuid AND round_item.status = 'finished'
            AND round_item.round_type = 'official'`,
        [leagueId],
      );
      return {
        rounds: roundsResult.rows.map((row): AwardRound => ({
          id: row.id, number: Number(row.number), date: dateText(row.date), seasonId: row.season_id,
          seasonNumber: Number(row.season_number), seasonStatus: row.season_status,
          bestGoalkeeperPlayerId: row.best_goalkeeper_player_id,
        })),
        stats: statsResult.rows.map((row): AwardStat => ({
          playerId: row.player_id, roundId: row.round_id, goals: Number(row.goals || 0),
          assists: Number(row.assists || 0), wins: Number(row.wins || 0), points: Number(row.points || 0),
          games: Number(row.games || 0), defensiveCleanGames: Number(row.defensive_clean_games || 0),
          defensiveOneGoalGames: Number(row.defensive_one_goal_games || 0),
          teamGoalsConceded: Number(row.team_goals_conceded || 0), playerProfile: row.player_profile,
          memberCategory: row.member_category, selectable: row.is_selectable,
        })),
      };
    }),
  };
}
