import type { Pool, PoolClient } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { SeasonRepository } from "../application/manage-seasons.js";
import {
  buildSeasonSummary,
  SeasonRuleError,
  type RoundType,
  type Season,
  type SeasonPlayerSummary,
  type SeasonSummary,
  type SeasonSummaryContext,
} from "../domain/season.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class SeasonPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "SeasonPersistenceError";
  }
}

type RawSeason = Omit<Season, "started_at" | "ended_at" | "created_at"> & {
  started_at: string | Date;
  ended_at: string | Date | null;
  created_at: string | Date;
};

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSeason(row: RawSeason): Season {
  return {
    ...row,
    started_at: iso(row.started_at),
    ended_at: row.ended_at ? iso(row.ended_at) : null,
    created_at: iso(row.created_at),
  };
}

function translateFailure(cause: unknown): Error {
  if (cause instanceof SeasonRuleError || cause instanceof SeasonPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/SEASON_FORBIDDEN|Acesso restrito|Somente ADM|permission denied|row-level security/i.test(message)) {
    return new SeasonPersistenceError("Somente o ADM desta pelada pode terminar a temporada.", 403);
  }
  if (/SEASON_NOT_FOUND|Nenhuma temporada ativa/i.test(message)) {
    return new SeasonPersistenceError("Temporada ativa não encontrada.", 404);
  }
  if (/Finalize todas as rodadas/i.test(message)) {
    return new SeasonPersistenceError("Finalize todas as rodadas antes de terminar a temporada.", 409);
  }
  return new SeasonPersistenceError("Não foi possível acessar a temporada.", 503);
}

async function authenticated<T>(pool: Pool, actor: Actor, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

export function pgSeasonRepository(pool: Pool): SeasonRepository {
  return {
    getActive: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      const result = await client.query<RawSeason>(
        "SELECT id, league_id, number, status, started_at, ended_at, stats_snapshot, created_at FROM public.seasons WHERE league_id = $1::uuid AND status = 'active' LIMIT 1",
        [leagueId],
      );
      return result.rows[0] ? mapSeason(result.rows[0]) : null;
    }),

    getActiveRoundIds: (leagueId, roundType: RoundType, actor) => authenticated(pool, actor, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT round_item.id
           FROM public.rounds round_item
           JOIN public.seasons season ON season.id = round_item.season_id
          WHERE season.league_id = $1::uuid AND season.status = 'active'
            AND round_item.round_type = $2::text`,
        [leagueId, roundType],
      );
      return result.rows.map((row) => row.id);
    }),

    getLatestFinishedSummary: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      const result = await client.query<{ stats_snapshot: SeasonSummary }>(
        `SELECT stats_snapshot FROM public.seasons
          WHERE league_id = $1::uuid AND status = 'finished' AND stats_snapshot IS NOT NULL
          ORDER BY number DESC LIMIT 1`,
        [leagueId],
      );
      return result.rows[0]?.stats_snapshot || null;
    }),

    finish: (leagueId, actor, endedAt) => authenticated(pool, actor, async (client) => {
      const access = await client.query<{ allowed: boolean }>(
        "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
      );
      if (access.rows[0]?.allowed !== true) throw new Error("SEASON_FORBIDDEN");

      const target = await client.query<{
        league_name: string;
        id: string;
        number: number;
        started_at: string | Date;
      }>(
        `SELECT league.name AS league_name, season.id, season.number, season.started_at
           FROM public.leagues league
           JOIN public.seasons season ON season.league_id = league.id
          WHERE league.id = $1::uuid AND season.status = 'active'
          FOR UPDATE OF season`,
        [leagueId],
      );
      const active = target.rows[0];
      if (!active) throw new Error("SEASON_NOT_FOUND");

      const rounds = await client.query<{ id: string; status: string; round_type: RoundType }>(
        "SELECT id, status, round_type FROM public.rounds WHERE season_id = $1::uuid",
        [active.id],
      );
      const officialRoundIds = rounds.rows.filter((round) => round.round_type === "official").map((round) => round.id);
      let matches: Array<{ status: string; eventCount: number }> = [];
      let participantIds: string[] = [];
      let stats: SeasonPlayerSummary[] = [];

      if (officialRoundIds.length > 0) {
        // A mesma conexão segura a transação e o lock da temporada; execute as
        // consultas em sequência para não disputar o protocolo do PoolClient.
        const matchResult = await client.query<{ status: string; event_count: number }>(
            `SELECT match_item.status, count(event.id)::integer AS event_count
               FROM public.matches match_item
               LEFT JOIN public.match_events event ON event.match_id = match_item.id
              WHERE match_item.round_id = ANY($1::uuid[])
              GROUP BY match_item.id, match_item.status`,
            [officialRoundIds],
          );
        const participantResult = await client.query<{ player_id: string }>(
          "SELECT DISTINCT player_id FROM public.round_players WHERE round_id = ANY($1::uuid[])",
          [officialRoundIds],
        );
        const statsResult = await client.query<{
            id: string; name: string; nickname: string | null;
            games: number; wins: number; draws: number; losses: number;
            goals: number; assists: number; points: string | number;
        }>(
          `SELECT player.id, player.name, player.nickname,
                  stat.games, stat.wins, stat.draws, stat.losses,
                  stat.goals, stat.assists, stat.points
             FROM public.player_round_stats stat
             JOIN public.players player ON player.id = stat.player_id
            WHERE stat.round_id = ANY($1::uuid[])`,
          [officialRoundIds],
        );
        matches = matchResult.rows.map((row) => ({ status: row.status, eventCount: Number(row.event_count) }));
        participantIds = participantResult.rows.map((row) => row.player_id);
        stats = statsResult.rows.map((row) => ({
          id: row.id, name: row.name, nickname: row.nickname,
          games: Number(row.games), wins: Number(row.wins), draws: Number(row.draws), losses: Number(row.losses),
          goals: Number(row.goals), assists: Number(row.assists), points: Number(row.points),
        }));
      }

      const context: SeasonSummaryContext = {
        leagueName: active.league_name,
        season: { id: active.id, number: active.number, started_at: iso(active.started_at) },
        rounds: rounds.rows.map((round) => ({ id: round.id, status: round.status, roundType: round.round_type })),
        matches,
        participantIds,
        stats,
      };
      const summary = buildSeasonSummary(context, endedAt);
      const transition = await client.query<{ new_season_number: number }>(
        "SELECT new_season_number FROM public.finish_season($1::uuid, $2::jsonb)",
        [leagueId, JSON.stringify(summary)],
      );
      const newSeasonNumber = transition.rows[0]?.new_season_number;
      if (typeof newSeasonNumber !== "number" || !Number.isInteger(newSeasonNumber)) {
        throw new Error("Transição de temporada sem resultado.");
      }
      return { summary, newSeasonNumber };
    }),
  };
}
