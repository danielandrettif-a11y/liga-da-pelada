import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  CreateMatchInput,
  MatchAdminAuditEntry,
  MatchDetails,
  MatchRepository,
  SubstituteMatchPlayerInput,
} from "../application/manage-matches.js";
import type { MatchTimerAction, MatchTimerThreshold } from "../domain/match.js";

export class MatchPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "MatchPersistenceError";
  }
}

function translateFailure(cause: unknown): MatchPersistenceError {
  if (cause instanceof MatchPersistenceError) return cause;
  const error = cause as Error & { code?: string };
  const message = error.message || "";
  if (/MATCH_FORBIDDEN|Somente administradores|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new MatchPersistenceError("Somente administradores podem realizar esta operação.", 403);
  }
  if (/MATCH_NOT_FOUND|fora da pelada/i.test(message)) {
    return new MatchPersistenceError("Partida não encontrada na pelada selecionada.", 404);
  }
  return new MatchPersistenceError(message || "Falha na persistência da partida.", 500);
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
    "SELECT public.is_league_admin($1::uuid) AS allowed",
    [leagueId],
  );
  if (access.rows[0]?.allowed !== true) {
    throw new MatchPersistenceError("Somente administradores podem realizar esta ação.", 403);
  }
}

export function pgMatchRepository(pool: Pool): MatchRepository {
  return {
    async getMatch(matchId: string, leagueId: string, actor: Actor): Promise<MatchDetails | null> {
      return authenticated(pool, actor, async (client) => {
        const matchRes = await client.query<MatchDetails>(
          `SELECT m.*
           FROM public.matches m
           JOIN public.rounds r ON r.id = m.round_id
           WHERE m.id = $1::uuid AND r.league_id = $2::uuid
           LIMIT 1`,
          [matchId, leagueId],
        );
        const match = matchRes.rows[0];
        if (!match) return null;

        const [teamARes, teamBRes, playersRes, eventsRes, stintsRes, subsRes, roundRes] = await Promise.all([
          client.query("SELECT * FROM public.teams WHERE id = $1::uuid", [match.team_a_id]),
          client.query("SELECT * FROM public.teams WHERE id = $1::uuid", [match.team_b_id]),
          client.query(
            `SELECT mp.*, row_to_json(p) as player
             FROM public.match_players mp
             LEFT JOIN public.players p ON p.id = mp.player_id
             WHERE mp.match_id = $1::uuid`,
            [matchId],
          ),
          client.query(
            `SELECT me.*, row_to_json(p) as player, row_to_json(ap) as assist_player
             FROM public.match_events me
             LEFT JOIN public.players p ON p.id = me.player_id
             LEFT JOIN public.players ap ON ap.id = me.assist_player_id
             WHERE me.match_id = $1::uuid
             ORDER BY me.created_at DESC`,
            [matchId],
          ),
          client.query(
            "SELECT * FROM public.match_goalkeeper_stints WHERE match_id = $1::uuid ORDER BY selected_at ASC",
            [matchId],
          ),
          client.query(
            `SELECT ms.*, row_to_json(p_out) as player_out, row_to_json(p_in) as player_in
             FROM public.match_substitutions ms
             LEFT JOIN public.players p_out ON p_out.id = ms.player_out_id
             LEFT JOIN public.players p_in ON p_in.id = ms.player_in_id
             WHERE ms.match_id = $1::uuid
             ORDER BY ms.created_at DESC`,
            [matchId],
          ),
          client.query("SELECT * FROM public.rounds WHERE id = $1::uuid", [match.round_id]),
        ]);

        return {
          ...match,
          team_a: teamARes.rows[0] || null,
          team_b: teamBRes.rows[0] || null,
          match_players: playersRes.rows,
          match_events: eventsRes.rows,
          match_goalkeeper_stints: stintsRes.rows,
          match_substitutions: subsRes.rows,
          round: roundRes.rows[0] || null,
        };
      });
    },

    async findLiveMatchForTeams(roundId: string, teamAId: string, teamBId: string, leagueId: string, actor: Actor): Promise<string | null> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{ id: string }>(
          `SELECT m.id
           FROM public.matches m
           JOIN public.rounds r ON r.id = m.round_id
           WHERE m.round_id = $1::uuid
             AND r.league_id = $4::uuid
             AND m.status = 'live'
             AND ((m.team_a_id = $2::uuid AND m.team_b_id = $3::uuid)
               OR (m.team_a_id = $3::uuid AND m.team_b_id = $2::uuid))
           LIMIT 1`,
          [roundId, teamAId, teamBId, leagueId],
        );
        return res.rows[0]?.id || null;
      });
    },

    async getFinishedMatchAudit(matchId: string, leagueId: string, actor: Actor): Promise<MatchAdminAuditEntry[]> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<MatchAdminAuditEntry>(
          `SELECT a.id, a.action, a.changed_by_name AS "changedByName", a.payload, a.created_at AS "createdAt"
           FROM public.sports_admin_audit a
           JOIN public.matches m ON m.id = a.match_id
           JOIN public.rounds r ON r.id = m.round_id
           WHERE a.match_id = $1::uuid AND r.league_id = $2::uuid
           ORDER BY a.created_at DESC`,
          [matchId, leagueId],
        );
        return res.rows;
      });
    },

    async createMatch(input: CreateMatchInput, leagueId: string, actor: Actor): Promise<{ matchId: string; idempotent: boolean; receipt?: any }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{ receipt: any }>(
          `SELECT public.create_live_match(
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
            $6::int, $7::int, $8::jsonb, $9::text, $10::timestamptz
          ) AS receipt`,
          [
            input.round_id,
            input.team_a_id,
            input.team_b_id,
            input.goalkeeper_a_id,
            input.goalkeeper_b_id,
            null,
            null,
            JSON.stringify(input.replacements || []),
            input.idempotency_key || null,
            input.client_started_at || null,
          ],
        );
        const receipt = res.rows[0]?.receipt;
        if (!receipt?.match_id && !receipt?.id) {
          throw new MatchPersistenceError("A abertura da partida não retornou um recibo válido.", 500);
        }
        return {
          matchId: String(receipt.match_id || receipt.id),
          idempotent: Boolean(receipt.idempotent),
          receipt,
        };
      });
    },

    async finishMatch(matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ round_id: string }>(
          `UPDATE public.matches
           SET status = 'finished', finished_at = NOW(), timer_started_at = NULL
           WHERE id = $1::uuid AND status != 'finished'
           RETURNING round_id`,
          [matchId],
        );
        const roundId = matchRes.rows[0]?.round_id;
        if (!roundId) {
          const findRes = await client.query<{ round_id: string }>("SELECT round_id FROM public.matches WHERE id = $1::uuid", [matchId]);
          return { roundId: findRes.rows[0]?.round_id || "" };
        }
        await client.query("UPDATE public.match_players SET is_active = false WHERE match_id = $1::uuid", [matchId]);
        return { roundId };
      });
    },

    async deleteMatch(matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ round_id: string }>(
          "SELECT round_id FROM public.matches WHERE id = $1::uuid",
          [matchId],
        );
        const roundId = matchRes.rows[0]?.round_id;
        if (!roundId) throw new MatchPersistenceError("Partida não encontrada.", 404);

        await client.query("DELETE FROM public.matches WHERE id = $1::uuid", [matchId]);
        return { roundId };
      });
    },

    async deleteEvent(eventId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string; scoreA: number; scoreB: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const eventRes = await client.query<{ event_type: string; team_id: string }>(
          "SELECT event_type, team_id FROM public.match_events WHERE id = $1::uuid AND match_id = $2::uuid",
          [eventId, matchId],
        );
        const event = eventRes.rows[0];
        await client.query("DELETE FROM public.match_events WHERE id = $1::uuid", [eventId]);

        const matchRes = await client.query<{ round_id: string; team_a_id: string; score_a: number; score_b: number }>(
          "SELECT round_id, team_a_id, score_a, score_b FROM public.matches WHERE id = $1::uuid",
          [matchId],
        );
        const match = matchRes.rows[0];
        let scoreA = match?.score_a || 0;
        let scoreB = match?.score_b || 0;

        if (event?.event_type === "goal") {
          if (event.team_id === match?.team_a_id) {
            scoreA = Math.max(0, scoreA - 1);
          } else {
            scoreB = Math.max(0, scoreB - 1);
          }
          await client.query("UPDATE public.matches SET score_a = $2, score_b = $3 WHERE id = $1::uuid", [matchId, scoreA, scoreB]);
        }

        return { roundId: match?.round_id || "", scoreA, scoreB };
      });
    },

    async correctFinishedGoal(eventId: string, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const eventRes = await client.query<{ match_id: string }>("SELECT match_id FROM public.match_events WHERE id = $1::uuid", [eventId]);
        const matchId = eventRes.rows[0]?.match_id;
        if (!matchId) throw new MatchPersistenceError("Evento não encontrado.", 404);

        await client.query("DELETE FROM public.match_events WHERE id = $1::uuid", [eventId]);
        const matchRes = await client.query<{ round_id: string }>("SELECT round_id FROM public.matches WHERE id = $1::uuid", [matchId]);

        await client.query(
          `INSERT INTO public.sports_admin_audit (match_id, action, changed_by, changed_by_name, payload)
           VALUES ($1::uuid, 'goal_corrected', $2::uuid, 'Administrador', $3::jsonb)`,
          [matchId, actor.userId, JSON.stringify({ eventId, confirmation })],
        );

        return { roundId: matchRes.rows[0]?.round_id || "", matchId };
      });
    },

    async correctFinishedGoalEvent(eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const eventRes = await client.query<{ match_id: string }>("SELECT match_id FROM public.match_events WHERE id = $1::uuid", [eventId]);
        const matchId = eventRes.rows[0]?.match_id;
        if (!matchId) throw new MatchPersistenceError("Evento não encontrado.", 404);

        await client.query(
          "UPDATE public.match_events SET player_id = $2::uuid, assist_player_id = $3::uuid WHERE id = $1::uuid",
          [eventId, playerId, assistPlayerId],
        );
        const matchRes = await client.query<{ round_id: string }>("SELECT round_id FROM public.matches WHERE id = $1::uuid", [matchId]);

        await client.query(
          `INSERT INTO public.sports_admin_audit (match_id, action, changed_by, changed_by_name, payload)
           VALUES ($1::uuid, 'goal_event_corrected', $2::uuid, 'Administrador', $3::jsonb)`,
          [matchId, actor.userId, JSON.stringify({ eventId, playerId, assistPlayerId, confirmation })],
        );

        return { roundId: matchRes.rows[0]?.round_id || "", matchId };
      });
    },

    async addFinishedGoalEvent(matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ round_id: string; team_a_id: string; score_a: number; score_b: number }>(
          "SELECT round_id, team_a_id, score_a, score_b FROM public.matches WHERE id = $1::uuid",
          [matchId],
        );
        const match = matchRes.rows[0];
        if (!match) throw new MatchPersistenceError("Partida não encontrada.", 404);

        await client.query(
          `INSERT INTO public.match_events (match_id, team_id, player_id, assist_player_id, event_type)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'goal')`,
          [matchId, teamId, playerId, assistPlayerId],
        );

        const isTeamA = teamId === match.team_a_id;
        const newScoreA = isTeamA ? match.score_a + 1 : match.score_a;
        const newScoreB = !isTeamA ? match.score_b + 1 : match.score_b;
        await client.query("UPDATE public.matches SET score_a = $2, score_b = $3 WHERE id = $1::uuid", [matchId, newScoreA, newScoreB]);

        await client.query(
          `INSERT INTO public.sports_admin_audit (match_id, action, changed_by, changed_by_name, payload)
           VALUES ($1::uuid, 'goal_event_added', $2::uuid, 'Administrador', $3::jsonb)`,
          [matchId, actor.userId, JSON.stringify({ teamId, playerId, assistPlayerId, confirmation })],
        );

        return { roundId: match.round_id, matchId };
      });
    },

    async changeMatchGoalkeeper(matchId: string, teamId: string, playerId: string, elapsedSeconds: number | undefined, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ round_id: string }>("SELECT round_id FROM public.matches WHERE id = $1::uuid", [matchId]);
        const roundId = matchRes.rows[0]?.round_id;
        if (!roundId) throw new MatchPersistenceError("Partida não encontrada.", 404);

        await client.query(
          `INSERT INTO public.match_goalkeeper_stints (match_id, team_id, player_id, entered_elapsed_seconds)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
          [matchId, teamId, playerId, elapsedSeconds ?? null],
        );

        return { roundId };
      });
    },

    async setRoundTeamFixedGoalkeeper(roundId: string, teamId: string, playerId: string | null, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.teams SET fixed_goalkeeper_player_id = $2::uuid WHERE id = $1::uuid",
          [teamId, playerId],
        );
        return { roundId };
      });
    },

    async substituteMatchPlayer(input: SubstituteMatchPlayerInput, leagueId: string, actor: Actor): Promise<{ roundId: string; substitutionId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ round_id: string }>("SELECT round_id FROM public.matches WHERE id = $1::uuid", [input.match_id]);
        const roundId = matchRes.rows[0]?.round_id;
        if (!roundId) throw new MatchPersistenceError("Partida não encontrada.", 404);

        const subRes = await client.query<{ id: string }>(
          `INSERT INTO public.match_substitutions (match_id, team_id, player_out_id, player_in_id, elapsed_seconds)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
           RETURNING id`,
          [input.match_id, input.team_id, input.player_out_id, input.player_in_id, input.elapsed_seconds ?? null],
        );

        await client.query("UPDATE public.match_players SET is_active = false WHERE match_id = $1::uuid AND player_id = $2::uuid", [input.match_id, input.player_out_id]);
        await client.query(
          `INSERT INTO public.match_players (match_id, team_id, player_id, is_active, is_starter)
           VALUES ($1::uuid, $2::uuid, $3::uuid, true, false)
           ON CONFLICT (match_id, player_id) DO UPDATE SET is_active = true`,
          [input.match_id, input.team_id, input.player_in_id],
        );

        return { roundId, substitutionId: subRes.rows[0]?.id || "" };
      });
    },

    async undoLastMatchSubstitution(substitutionId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const subRes = await client.query<{ player_out_id: string; player_in_id: string }>(
          "SELECT player_out_id, player_in_id FROM public.match_substitutions WHERE id = $1::uuid AND match_id = $2::uuid",
          [substitutionId, matchId],
        );
        const sub = subRes.rows[0];
        if (!sub) throw new MatchPersistenceError("Substituição não encontrada.", 404);

        await client.query("DELETE FROM public.match_substitutions WHERE id = $1::uuid", [substitutionId]);
        await client.query("UPDATE public.match_players SET is_active = true WHERE match_id = $1::uuid AND player_id = $2::uuid", [matchId, sub.player_out_id]);
        await client.query("UPDATE public.match_players SET is_active = false WHERE match_id = $1::uuid AND player_id = $2::uuid", [matchId, sub.player_in_id]);

        const matchRes = await client.query<{ round_id: string }>("SELECT round_id FROM public.matches WHERE id = $1::uuid", [matchId]);
        return { roundId: matchRes.rows[0]?.round_id || "" };
      });
    },

    async updateMatchTimer(matchId: string, action: MatchTimerAction, leagueId: string, actor: Actor): Promise<{ timerStartedAt?: string | null; timerAccumulatedSeconds?: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ status: string; timer_started_at: Date | string | null; timer_accumulated_seconds: number }>(
          "SELECT status, timer_started_at, timer_accumulated_seconds FROM public.matches WHERE id = $1::uuid",
          [matchId],
        );
        const match = matchRes.rows[0];
        if (!match || match.status !== "live") throw new MatchPersistenceError("A partida não está em andamento.", 400);

        if (action === "start") {
          const startedAt = new Date().toISOString();
          await client.query("UPDATE public.matches SET timer_started_at = $2 WHERE id = $1::uuid", [matchId, startedAt]);
          return { timerStartedAt: startedAt };
        } else {
          let accumulated = match.timer_accumulated_seconds || 0;
          if (match.timer_started_at) {
            const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
            accumulated += Math.max(0, elapsed);
          }
          await client.query("UPDATE public.matches SET timer_accumulated_seconds = $2, timer_started_at = NULL WHERE id = $1::uuid", [matchId, accumulated]);
          return { timerAccumulatedSeconds: accumulated };
        }
      });
    },

    async resetMatchTimer(matchId: string, leagueId: string, actor: Actor): Promise<{ eligibilityOffset: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ status: string; timer_started_at: Date | string | null; timer_accumulated_seconds: number; eligibility_elapsed_offset_seconds: number }>(
          "SELECT status, timer_started_at, timer_accumulated_seconds, eligibility_elapsed_offset_seconds FROM public.matches WHERE id = $1::uuid",
          [matchId],
        );
        const match = matchRes.rows[0];
        if (!match || match.status !== "live") throw new MatchPersistenceError("A partida não está em andamento.", 400);

        let displayed = match.timer_accumulated_seconds || 0;
        if (match.timer_started_at) {
          displayed += Math.max(0, Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000));
        }
        const offset = (match.eligibility_elapsed_offset_seconds || 0) + displayed;

        await client.query(
          `UPDATE public.matches
           SET timer_accumulated_seconds = 0,
               timer_started_at = NULL,
               eligibility_elapsed_offset_seconds = $2
           WHERE id = $1::uuid`,
          [matchId, offset],
        );

        return { eligibilityOffset: offset };
      });
    },

    async addMatchExtraTime(matchId: string, extraSeconds: number, leagueId: string, actor: Actor): Promise<{ newDuration: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ duration_seconds: number }>("SELECT duration_seconds FROM public.matches WHERE id = $1::uuid", [matchId]);
        const current = matchRes.rows[0]?.duration_seconds || 420;
        const newDuration = Math.max(60, current + extraSeconds);

        await client.query("UPDATE public.matches SET duration_seconds = $2 WHERE id = $1::uuid", [matchId, newDuration]);
        return { newDuration };
      });
    },

    async notifyMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, leagueId: string, actor: Actor): Promise<{ sent?: boolean; skipped?: boolean; reason?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const alertCol = threshold === "one_minute"
          ? "timer_one_minute_alerted_at"
          : threshold === "thirty_seconds"
            ? "timer_thirty_seconds_alerted_at"
            : "timer_finished_alerted_at";

        const updateRes = await client.query(
          `UPDATE public.matches
           SET ${alertCol} = NOW()
           WHERE id = $1::uuid AND status = 'live' AND ${alertCol} IS NULL
           RETURNING id`,
          [matchId],
        );

        if (updateRes.rowCount === 0) {
          return { skipped: true, reason: "already_alerted_or_inactive" };
        }
        return { sent: true };
      });
    },

    async dispatchMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, leagueId: string, actor: Actor): Promise<{ sent?: boolean; skipped?: boolean; reason?: string }> {
      return this.notifyMatchTimerThreshold(matchId, threshold, leagueId, actor);
    },
  };
}
