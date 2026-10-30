import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { SeasonOperationsRepository } from "../application/manage-season-operations.js";
import {
  buildPlayerCardOverallMap,
  buildSeasonTeamStandings,
  type StandingRound,
} from "../domain/season-operations.js";

export class SeasonOperationsPersistenceError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "SeasonOperationsPersistenceError";
  }
}

async function requireAppAdmin(client: PoolClient) {
  const result = await client.query<{ allowed: boolean }>("SELECT public.is_app_admin() AS allowed");
  if (result.rows[0]?.allowed !== true) {
    throw new SeasonOperationsPersistenceError("Acesso negado. Apenas administradores.", 403);
  }
}

async function activeSeasonId(client: PoolClient, leagueId: string) {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM public.seasons WHERE league_id = $1::uuid AND status = 'active' LIMIT 1",
    [leagueId],
  );
  return result.rows[0]?.id || null;
}

export function pgSeasonOperationsRepository(pool: Pool): SeasonOperationsRepository {
  return {
    async findPlayerCardOveralls(actor: Actor, leagueId: string) {
      return withAuthenticatedTransaction(pool, actor, async (client) => {
        const [members, overalls] = await Promise.all([
          client.query<{ player_id: string }>(
            "SELECT player_id FROM public.league_members WHERE league_id = $1::uuid AND is_active = true",
            [leagueId],
          ),
          client.query<Record<string, unknown>>(
            "SELECT * FROM public.get_latest_player_card_overalls_for_league($1::uuid)",
            [leagueId],
          ),
        ]);
        return buildPlayerCardOverallMap(overalls.rows, new Set(members.rows.map((row) => row.player_id)));
      });
    },

    async findTeamStandings(actor: Actor, leagueId: string) {
      return withAuthenticatedTransaction(pool, actor, async (client) => {
        const seasonId = await activeSeasonId(client, leagueId);
        if (!seasonId) return buildSeasonTeamStandings([]);
        const rounds = await client.query<{ id: string }>(
          `SELECT id FROM public.rounds
           WHERE season_id = $1::uuid AND league_id = $2::uuid
             AND round_type = 'official' AND status = 'finished'`,
          [seasonId, leagueId],
        );
        const roundIds = rounds.rows.map((row) => row.id);
        if (!roundIds.length) return buildSeasonTeamStandings([]);
        const [teams, matches] = await Promise.all([
          client.query<{ id: string; round_id: string; name: string; crest_url: string | null }>(
            "SELECT id, round_id, name, crest_url FROM public.teams WHERE round_id = ANY($1::uuid[])",
            [roundIds],
          ),
          client.query<{ id: string; round_id: string; status: string; team_a_id: string; team_b_id: string; score_a: number; score_b: number }>(
            `SELECT id, round_id, status, team_a_id, team_b_id, score_a, score_b
             FROM public.matches WHERE round_id = ANY($1::uuid[])`,
            [roundIds],
          ),
        ]);
        const matchIds = matches.rows.map((row) => row.id);
        const events = matchIds.length ? await client.query<{
          match_id: string; team_id: string; is_own_goal: boolean; player_id: string | null;
          player_name: string | null; assist_player_id: string | null; assist_player_name: string | null;
        }>(
          `SELECT event.match_id, event.team_id, event.is_own_goal, event.player_id,
                  scorer.name AS player_name, event.assist_player_id, assister.name AS assist_player_name
           FROM public.match_events event
           LEFT JOIN public.players scorer ON scorer.id = event.player_id
           LEFT JOIN public.players assister ON assister.id = event.assist_player_id
           WHERE event.match_id = ANY($1::uuid[])`,
          [matchIds],
        ) : { rows: [] };
        const model: StandingRound[] = roundIds.map((roundId) => ({
          teams: teams.rows.filter((team) => team.round_id === roundId),
          matches: matches.rows.filter((match) => match.round_id === roundId).map((match) => ({
            ...match,
            events: events.rows.filter((event) => event.match_id === match.id),
          })),
        }));
        return buildSeasonTeamStandings(model);
      });
    },

    async previewReprocess(actor: Actor, leagueId: string) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          await requireAppAdmin(client);
          const result = await client.query<{ result: unknown }>(
            "SELECT public.preview_reprocess_season($1::uuid) AS result",
            [leagueId],
          );
          return result.rows[0]?.result as Awaited<ReturnType<SeasonOperationsRepository["previewReprocess"]>>;
        });
      } catch (error) {
        if (error instanceof SeasonOperationsPersistenceError) throw error;
        throw new SeasonOperationsPersistenceError(error instanceof Error ? error.message : "Erro ao gerar prévia de reprocessamento.");
      }
    },

    async executeReprocess(actor: Actor, leagueId: string) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          await requireAppAdmin(client);
          const result = await client.query<{ result: unknown }>(
            "SELECT public.reprocess_active_season_v5($1::uuid) AS result",
            [leagueId],
          );
          return result.rows[0]?.result as Awaited<ReturnType<SeasonOperationsRepository["executeReprocess"]>>;
        });
      } catch (error) {
        if (error instanceof SeasonOperationsPersistenceError) throw error;
        throw new SeasonOperationsPersistenceError(error instanceof Error ? error.message : "Erro ao reprocessar temporada.");
      }
    },
  };
}
