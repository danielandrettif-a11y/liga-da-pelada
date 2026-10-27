import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerStatisticsRepository } from "../application/get-player-statistics.js";
import type {
  PlayerOverallRecord,
  PlayerSeasonTotalsRecord,
  RosterRoundType,
} from "../domain/player-statistics.js";

export class PlayerStatisticsPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerStatisticsPersistenceError";
  }
}

function translateFailure(cause: unknown): PlayerStatisticsPersistenceError {
  if (cause instanceof PlayerStatisticsPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_STATISTICS_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new PlayerStatisticsPersistenceError("Você não pertence a esta pelada.", 403);
  }
  return new PlayerStatisticsPersistenceError("Não foi possível carregar as estatísticas do elenco.", 503);
}

async function authenticated<T>(
  pool: Pool, actor: Actor, operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
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
  if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_STATISTICS_FORBIDDEN");
}

type TotalsRow = {
  player_id: string;
  rounds_count: number | string;
  games: number | string;
  goals: number | string;
  assists: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  points: number | string;
  ranking_points: number | string | null;
};

type OverallRow = {
  player_id: string;
  overall: number | string;
  def_overall: number | string;
  ala_mei_overall: number | string;
  ata_overall: number | string;
  gol_overall: number | string;
};

export function pgPlayerStatisticsRepository(pool: Pool): PlayerStatisticsRepository {
  return {
    listSeasonTotals: (leagueId: string, roundType: RosterRoundType, actor: Actor) =>
      authenticated(pool, actor, async (client) => {
        await requireLeagueMember(client, leagueId);
        const result = await client.query<TotalsRow>(
          `SELECT stats.player_id, stats.rounds_count, stats.games, stats.goals, stats.assists,
                  stats.wins, stats.draws, stats.losses, stats.points, stats.ranking_points
             FROM public.player_season_stats stats
             JOIN public.seasons season ON season.id = stats.season_id
            WHERE season.league_id = $1::uuid AND season.status = 'active'
              AND stats.round_type = $2`,
          [leagueId, roundType],
        );
        return result.rows.map((row): PlayerSeasonTotalsRecord => ({
          playerId: row.player_id,
          rounds: row.rounds_count,
          games: row.games,
          goals: row.goals,
          assists: row.assists,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          points: row.points,
          rankingPoints: row.ranking_points,
        }));
      }),
    listLatestOveralls: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      const result = await client.query<OverallRow>(
        "SELECT * FROM public.get_latest_player_card_overalls_for_league($1::uuid)", [leagueId],
      );
      return result.rows.map((row): PlayerOverallRecord => ({
        playerId: row.player_id,
        overall: row.overall,
        defOverall: row.def_overall,
        alaMeiOverall: row.ala_mei_overall,
        ataOverall: row.ata_overall,
        golOverall: row.gol_overall,
      }));
    }),
  };
}
