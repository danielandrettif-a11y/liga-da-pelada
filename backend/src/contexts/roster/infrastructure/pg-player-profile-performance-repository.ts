import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { PlayerProfilePerformanceRepository } from "../application/get-player-profile-performance.js";
import type { ClubGoalEvent, MatchParticipation } from "../domain/player-profile-performance.js";

export class PlayerProfilePerformancePersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PlayerProfilePerformancePersistenceError";
  }
}

function translateFailure(cause: unknown): PlayerProfilePerformancePersistenceError {
  if (cause instanceof PlayerProfilePerformancePersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PLAYER_PROFILE_FORBIDDEN|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new PlayerProfilePerformancePersistenceError("Você não pertence a esta pelada.", 403);
  }
  return new PlayerProfilePerformancePersistenceError("Não foi possível carregar o desempenho do jogador.", 503);
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

async function requireLeagueMember(client: PoolClient, leagueId: string): Promise<void> {
  const access = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_member($1::uuid) AS allowed", [leagueId],
  );
  if (access.rows[0]?.allowed !== true) throw new Error("PLAYER_PROFILE_FORBIDDEN");
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function pgPlayerProfilePerformanceRepository(pool: Pool): PlayerProfilePerformanceRepository {
  return {
    listParticipations: (leagueId, playerId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      const result = await client.query<{
        entered_elapsed_seconds: number | string;
        left_elapsed_seconds: number | string | null;
        started_at: string | Date | null;
        finished_at: string | Date | null;
        timer_started_at: string | Date | null;
        timer_accumulated_seconds: number | string;
        round_type: "official" | "friendly";
      }>(
        `SELECT participant.entered_elapsed_seconds, participant.left_elapsed_seconds,
                match_item.started_at, match_item.finished_at, match_item.timer_started_at,
                match_item.timer_accumulated_seconds, round_item.round_type
           FROM public.match_players participant
           JOIN public.matches match_item ON match_item.id = participant.match_id
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
          WHERE participant.player_id = $2::uuid AND round_item.league_id = $1::uuid`,
        [leagueId, playerId],
      );
      return result.rows.map((row): MatchParticipation => ({
        enteredElapsedSeconds: Number(row.entered_elapsed_seconds || 0),
        leftElapsedSeconds: row.left_elapsed_seconds === null ? null : Number(row.left_elapsed_seconds),
        startedAt: iso(row.started_at),
        finishedAt: iso(row.finished_at),
        timerStartedAt: iso(row.timer_started_at),
        timerAccumulatedSeconds: Number(row.timer_accumulated_seconds || 0),
        roundType: row.round_type,
      }));
    }),

    listGoalEvents: (leagueId, playerId, actor) => authenticated(pool, actor, async (client) => {
      await requireLeagueMember(client, leagueId);
      const result = await client.query<{
        team_id: string;
        team_name: string;
        team_color: string;
        crest_url: string | null;
        round_type: "official" | "friendly";
      }>(
        `SELECT team.id AS team_id, team.name AS team_name, team.color AS team_color,
                team.crest_url, round_item.round_type
           FROM public.match_events event
           JOIN public.teams team ON team.id = event.team_id
           JOIN public.matches match_item ON match_item.id = event.match_id
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
          WHERE event.player_id = $2::uuid AND event.event_type = 'goal'
            AND round_item.league_id = $1::uuid`,
        [leagueId, playerId],
      );
      return result.rows.map((row): ClubGoalEvent => ({
        teamId: row.team_id,
        teamName: row.team_name,
        teamColor: row.team_color,
        crestUrl: row.crest_url,
        roundType: row.round_type,
      }));
    }),
  };
}
