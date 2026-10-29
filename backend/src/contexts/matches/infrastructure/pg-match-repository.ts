import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  CreateMatchInput,
  MatchAdminAuditEntry,
  MatchDetails,
  MatchRepository,
  MatchTimerNotificationClaim,
  MatchTimerState,
  SubstituteMatchPlayerInput,
} from "../application/manage-matches.js";
import type { MatchTimerAction, MatchTimerThreshold } from "../domain/match.js";
import {
  MatchLineupError,
  prepareMatchLineup,
  type MatchLineupSnapshot,
} from "../domain/match-lineup.js";

export class MatchPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "MatchPersistenceError";
  }
}

function translateFailure(cause: unknown): MatchPersistenceError {
  if (cause instanceof MatchPersistenceError) return cause;
  if (cause instanceof MatchLineupError) return new MatchPersistenceError(cause.message, 400);
  const error = cause as Error & { code?: string };
  const message = error.message || "";
  if (/MATCH_FORBIDDEN|Somente administradores|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new MatchPersistenceError("Somente administradores podem realizar esta operação.", 403);
  }
  if (/MATCH_NOT_FOUND|fora da pelada|Partida (não|nao) encontrada/i.test(message)) {
    return new MatchPersistenceError("Partida não encontrada na pelada selecionada.", 404);
  }
  if (/Evento (não|nao) encontrado|Gol (não|nao) encontrado|Substitui(c|ç)(a|ã)o (não|nao) encontrada/i.test(message)) {
    return new MatchPersistenceError(message, 404);
  }
  if (/não está em andamento|nao esta em andamento|rodadas finalizadas|rodada já foi encerrada|já participou|ja participou|outra partida ao vivo|mais recente|gol registrado depois|Encerre a partida/i.test(message)) {
    return new MatchPersistenceError(message, 409);
  }
  if (/time (?:informado )?(?:não|nao) participa|precisa estar|Escolha|Motivo de substitui(?:c|ç)(?:a|ã)o inv[aá]lido|fora da rodada/i.test(message)) {
    return new MatchPersistenceError(message, 400);
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

async function requireMatchInLeague(
  client: PoolClient,
  matchId: string,
  leagueId: string,
): Promise<{ round_id: string; status: string; team_a_id: string; team_b_id: string }> {
  const result = await client.query<{ round_id: string; status: string; team_a_id: string; team_b_id: string }>(
    `SELECT match_item.round_id, match_item.status, match_item.team_a_id, match_item.team_b_id
     FROM public.matches match_item
     JOIN public.rounds round_item ON round_item.id = match_item.round_id
     WHERE match_item.id = $1::uuid AND round_item.league_id = $2::uuid
     LIMIT 1`,
    [matchId, leagueId],
  );
  const match = result.rows[0];
  if (!match) throw new MatchPersistenceError("Partida não encontrada na pelada selecionada.", 404);
  return match;
}

async function requireEventInLeague(
  client: PoolClient,
  eventId: string,
  leagueId: string,
): Promise<{ match_id: string; round_id: string }> {
  const result = await client.query<{ match_id: string; round_id: string }>(
    `SELECT event.match_id, match_item.round_id
     FROM public.match_events event
     JOIN public.matches match_item ON match_item.id = event.match_id
     JOIN public.rounds round_item ON round_item.id = match_item.round_id
     WHERE event.id = $1::uuid AND round_item.league_id = $2::uuid
     LIMIT 1`,
    [eventId, leagueId],
  );
  const event = result.rows[0];
  if (!event) throw new MatchPersistenceError("Evento não encontrado na pelada selecionada.", 404);
  return event;
}

async function systemTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* conexão será descartada pelo pool se necessário */ }
    throw error;
  } finally {
    client.release();
  }
}

function timerAlertColumn(threshold: MatchTimerThreshold) {
  return threshold === "one_minute"
    ? "timer_one_minute_alerted_at"
    : threshold === "thirty_seconds"
      ? "timer_thirty_seconds_alerted_at"
      : "timer_finished_alerted_at";
}

async function claimTimerThreshold(
  client: PoolClient,
  matchId: string,
  threshold: MatchTimerThreshold,
  leagueId?: string,
): Promise<MatchTimerNotificationClaim> {
  const result = await client.query<{
    id: string;
    round_id: string;
    status: string;
    score_a: number;
    score_b: number;
    duration_seconds: number;
    timer_started_at: string | Date | null;
    timer_accumulated_seconds: number;
    alerted_at: string | Date | null;
    team_a_name: string;
    team_b_name: string;
  }>(
    `SELECT match_item.id, match_item.round_id, match_item.status,
            match_item.score_a, match_item.score_b, match_item.duration_seconds,
            match_item.timer_started_at, match_item.timer_accumulated_seconds,
            match_item.${timerAlertColumn(threshold)} AS alerted_at,
            team_a.name AS team_a_name, team_b.name AS team_b_name
     FROM public.matches match_item
     JOIN public.rounds round_item ON round_item.id = match_item.round_id
     JOIN public.teams team_a ON team_a.id = match_item.team_a_id
     JOIN public.teams team_b ON team_b.id = match_item.team_b_id
     WHERE match_item.id = $1::uuid
       AND ($2::uuid IS NULL OR round_item.league_id = $2::uuid)
     FOR UPDATE OF match_item`,
    [matchId, leagueId || null],
  );
  const match = result.rows[0];
  if (!match) throw new MatchPersistenceError("Partida não encontrada na pelada selecionada.", 404);
  if (match.status !== "live" || !match.timer_started_at) return { skipped: true, reason: "inactive" };
  const elapsed = Number(match.timer_accumulated_seconds || 0)
    + Math.max(0, Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000));
  const secondsLeft = Math.max(0, Number(match.duration_seconds || 420) - elapsed);
  const shouldSend = threshold === "one_minute"
    ? secondsLeft <= 64
    : threshold === "thirty_seconds"
      ? secondsLeft <= 34
      : secondsLeft <= 4;
  if (!shouldSend) return { skipped: true, reason: "too_early", secondsLeft };
  if (match.alerted_at) return { skipped: true, reason: "already_alerted", secondsLeft };

  const claimedAt = new Date().toISOString();
  const claimed = await client.query(
    `UPDATE public.matches SET ${timerAlertColumn(threshold)} = $2::timestamptz
     WHERE id = $1::uuid AND ${timerAlertColumn(threshold)} IS NULL`,
    [matchId, claimedAt],
  );
  if (claimed.rowCount !== 1) return { skipped: true, reason: "already_alerted", secondsLeft };
  return {
    secondsLeft,
    claimedAt,
    match: {
      id: match.id,
      round_id: match.round_id,
      score_a: Number(match.score_a || 0),
      score_b: Number(match.score_b || 0),
      team_a: { name: match.team_a_name },
      team_b: { name: match.team_b_name },
    },
  };
}

async function releaseTimerThreshold(
  client: PoolClient,
  matchId: string,
  threshold: MatchTimerThreshold,
  claimedAt: string,
  leagueId?: string,
) {
  await client.query(
    `UPDATE public.matches match_item SET ${timerAlertColumn(threshold)} = NULL
     FROM public.rounds round_item
     WHERE match_item.id = $1::uuid AND round_item.id = match_item.round_id
       AND ($3::uuid IS NULL OR round_item.league_id = $3::uuid)
       AND match_item.${timerAlertColumn(threshold)} = $2::timestamptz`,
    [matchId, claimedAt, leagueId || null],
  );
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

        const teamQuery = `SELECT team.*, COALESCE(jsonb_agg(jsonb_build_object(
              'player_id', team_player.player_id,
              'goalkeeper_order', team_player.goalkeeper_order,
              'players', CASE WHEN player.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', player.id, 'name', player.name, 'nickname', player.nickname,
                'avatar_url', player.avatar_url, 'player_profile', player.player_profile,
                'is_goalkeeper', player.is_goalkeeper
              ) END
            )) FILTER (WHERE team_player.player_id IS NOT NULL), '[]'::jsonb) AS team_players
           FROM public.teams team
           LEFT JOIN public.team_players team_player ON team_player.team_id = team.id
           LEFT JOIN public.players player ON player.id = team_player.player_id
           WHERE team.id = $1::uuid
           GROUP BY team.id`;
        const [teamARes, teamBRes, playersRes, eventsRes, stintsRes, subsRes, roundRes] = await Promise.all([
          client.query(teamQuery, [match.team_a_id]),
          client.query(teamQuery, [match.team_b_id]),
          client.query(
            `SELECT mp.*, row_to_json(p) AS player, row_to_json(original_team) AS original_team
             FROM public.match_players mp
             LEFT JOIN public.players p ON p.id = mp.player_id
             LEFT JOIN public.teams original_team ON original_team.id = mp.original_team_id
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
            `SELECT ms.*, row_to_json(p_out) AS player_out, row_to_json(p_in) AS player_in,
                    row_to_json(original_team) AS player_in_original_team
             FROM public.match_substitutions ms
             LEFT JOIN public.players p_out ON p_out.id = ms.player_out_id
             LEFT JOIN public.players p_in ON p_in.id = ms.player_in_id
             LEFT JOIN public.teams original_team ON original_team.id = ms.player_in_original_team_id
             WHERE ms.match_id = $1::uuid
             ORDER BY ms.created_at DESC`,
            [matchId],
          ),
          client.query(
            `SELECT round_item.*,
                    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'player_id', round_player.player_id,
                      'availability_status', round_player.availability_status,
                      'attendance_status', round_player.attendance_status,
                      'players', row_to_json(player)
                    )) FROM public.round_players round_player
                    LEFT JOIN public.players player ON player.id = round_player.player_id
                    WHERE round_player.round_id = round_item.id), '[]'::jsonb) AS round_players,
                    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'id', team.id, 'name', team.name, 'color', team.color,
                      'crest_url', team.crest_url,
                      'team_players', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                        'player_id', team_player.player_id,
                        'goalkeeper_order', team_player.goalkeeper_order
                      )) FROM public.team_players team_player WHERE team_player.team_id = team.id), '[]'::jsonb)
                    )) FROM public.teams team WHERE team.round_id = round_item.id), '[]'::jsonb) AS teams
             FROM public.rounds round_item
             WHERE round_item.id = $1::uuid`,
            [match.round_id],
          ),
        ]);

        const playerIds = playersRes.rows.map((entry: { player_id?: string }) => entry.player_id).filter(Boolean) as string[];
        const cosmeticsRes = playerIds.length > 0
          ? await client.query<{
              player_id: string;
              banner_asset_key: string | null;
              frame_asset_key: string | null;
              aura_asset_key: string | null;
            }>(
              `SELECT profile.player_id,
                      banner.asset_key AS banner_asset_key,
                      frame.asset_key AS frame_asset_key,
                      aura.asset_key AS aura_asset_key
               FROM public.account_profiles profile
               JOIN public.account_cosmetic_loadouts loadout ON loadout.user_id = profile.user_id
               LEFT JOIN public.fantasy_cosmetics banner ON banner.id = loadout.banner_cosmetic_id
               LEFT JOIN public.fantasy_cosmetics frame ON frame.id = loadout.frame_cosmetic_id
               LEFT JOIN public.fantasy_cosmetics aura ON aura.id = loadout.aura_cosmetic_id
               WHERE profile.player_id = ANY($1::uuid[])`,
              [playerIds],
            )
          : { rows: [] };
        const playerCosmetics = Object.fromEntries(cosmeticsRes.rows.map((entry) => [entry.player_id, {
          bannerAssetKey: entry.banner_asset_key,
          frameKey: entry.frame_asset_key,
          auraKey: entry.aura_asset_key,
        }]));

        return {
          ...match,
          team_a: teamARes.rows[0] || null,
          team_b: teamBRes.rows[0] || null,
          match_players: playersRes.rows,
          match_events: eventsRes.rows,
          match_goalkeeper_stints: stintsRes.rows,
          match_substitutions: subsRes.rows,
          round: roundRes.rows[0] || null,
          player_cosmetics: playerCosmetics,
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
             AND m.timer_started_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.match_players player_entry WHERE player_entry.match_id = m.id)
             AND (SELECT count(*) FROM public.match_goalkeepers goalkeeper WHERE goalkeeper.match_id = m.id) = 2
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
          `SELECT a.id, a.action,
                  COALESCE(a.changed_by_name, changed_player.name, 'Administrador') AS "changedByName",
                  a.payload, a.created_at AS "createdAt"
           FROM public.sports_admin_audit a
           JOIN public.matches m ON m.id = a.match_id
           JOIN public.rounds r ON r.id = m.round_id
           LEFT JOIN public.account_profiles changed_profile ON changed_profile.user_id = a.changed_by
           LEFT JOIN public.players changed_player ON changed_player.id = changed_profile.player_id
           WHERE a.match_id = $1::uuid AND r.league_id = $2::uuid
             AND a.action IN ('goal_corrected', 'goal_assist_corrected', 'goal_event_corrected', 'goal_event_added')
           ORDER BY a.created_at DESC`,
          [matchId, leagueId],
        );
        return res.rows;
      });
    },

    async createMatch(input: CreateMatchInput, leagueId: string, actor: Actor): Promise<{ matchId: string; idempotent: boolean; receipt?: any }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const roundResult = await client.query<{
          number: number;
          status: string;
          formation_mode: string;
          arrival_order_enabled: boolean;
          target_players_per_team: number | null;
          players_per_team: number | null;
        }>(
          `SELECT round_item.number, round_item.status, round_item.formation_mode,
                  round_item.arrival_order_enabled, round_item.target_players_per_team,
                  league.players_per_team
           FROM public.rounds round_item
           JOIN public.leagues league ON league.id = round_item.league_id
           WHERE round_item.id = $1::uuid AND round_item.league_id = $2::uuid`,
          [input.round_id, leagueId],
        );
        const round = roundResult.rows[0];
        if (!round) throw new MatchPersistenceError("Rodada não encontrada na pelada selecionada.", 404);

        const [teamResult, roundPlayerResult, previousMatchResult, loanCountResult] = await Promise.all([
          client.query<{
            id: string;
            name: string;
            position: number;
            fixed_goalkeeper_player_id: string | null;
            player_id: string | null;
            goalkeeper_order: number | null;
            loan_order: number | null;
          }>(
            `SELECT team.id, team.name, team.position, team.fixed_goalkeeper_player_id,
                    team_player.player_id, team_player.goalkeeper_order, team_player.loan_order
             FROM public.teams team
             LEFT JOIN public.team_players team_player ON team_player.team_id = team.id
             WHERE team.round_id = $1::uuid
             ORDER BY team.position, team_player.goalkeeper_order, team_player.player_id`,
            [input.round_id],
          ),
          client.query<{ player_id: string; availability_status: string; attendance_status: string | null }>(
            `SELECT player_id, availability_status, attendance_status
             FROM public.round_players WHERE round_id = $1::uuid`,
            [input.round_id],
          ),
          client.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM public.matches WHERE round_id = $1::uuid",
            [input.round_id],
          ),
          client.query<{ player_id: string; loan_count: string }>(
            `SELECT match_player.player_id, count(*)::text AS loan_count
             FROM public.match_players match_player
             JOIN public.matches match_item ON match_item.id = match_player.match_id
             WHERE match_item.round_id = $1::uuid
               AND match_player.original_team_id IS NOT NULL
               AND match_player.team_id <> match_player.original_team_id
             GROUP BY match_player.player_id`,
            [input.round_id],
          ),
        ]);
        const teamById = new Map<string, MatchLineupSnapshot["teams"][number]>();
        for (const row of teamResult.rows) {
          const team = teamById.get(row.id) || {
            id: row.id,
            name: row.name,
            position: Number(row.position || 0),
            fixedGoalkeeperPlayerId: row.fixed_goalkeeper_player_id,
            players: [],
          };
          if (row.player_id) team.players.push({
            playerId: row.player_id,
            goalkeeperOrder: Number(row.goalkeeper_order || 0),
            loanOrder: Number(row.loan_order || row.goalkeeper_order || team.players.length + 1),
          });
          teamById.set(row.id, team);
        }
        const snapshot: MatchLineupSnapshot = {
          roundNumber: Number(round.number || 0),
          roundStatus: round.status,
          formationMode: round.formation_mode,
          arrivalOrderEnabled: round.arrival_order_enabled === true,
          targetPlayersPerTeam: Math.max(1, Number(round.target_players_per_team || round.players_per_team || 6)),
          previousMatchCount: Number(previousMatchResult.rows[0]?.count || 0),
          teams: [...teamById.values()],
          roundPlayers: roundPlayerResult.rows.map((entry) => ({
            playerId: entry.player_id,
            availabilityStatus: entry.availability_status,
            attendanceStatus: entry.attendance_status,
          })),
          previousLoanCount: new Map(loanCountResult.rows.map((entry) => [entry.player_id, Number(entry.loan_count || 0)])),
        };
        const prepared = prepareMatchLineup(input, snapshot);
        const idempotencyKey = input.idempotency_key?.trim() || randomUUID();
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
            prepared.goalkeeperARotationOrder,
            prepared.goalkeeperBRotationOrder,
            JSON.stringify(prepared.lineup),
            idempotencyKey,
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

    async finishMatch(matchId: string, leagueId: string, actor: Actor) {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const currentResult = await client.query<{
          id: string;
          round_id: string;
          status: string;
          score_a: number;
          score_b: number;
          timer_started_at: string | null;
          timer_accumulated_seconds: number;
          eligibility_elapsed_offset_seconds: number;
          team_a_name: string;
          team_b_name: string;
        }>(
          `SELECT match_item.id, match_item.round_id, match_item.status,
                  match_item.score_a, match_item.score_b, match_item.timer_started_at,
                  match_item.timer_accumulated_seconds, match_item.eligibility_elapsed_offset_seconds,
                  team_a.name AS team_a_name, team_b.name AS team_b_name
           FROM public.matches match_item
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
           JOIN public.teams team_a ON team_a.id = match_item.team_a_id
           JOIN public.teams team_b ON team_b.id = match_item.team_b_id
           WHERE match_item.id = $1::uuid AND round_item.league_id = $2::uuid
           FOR UPDATE OF match_item`,
          [matchId, leagueId],
        );
        const current = currentResult.rows[0];
        if (!current) throw new MatchPersistenceError("Partida não encontrada na pelada selecionada.", 404);
        const alreadyFinished = current.status === "finished";
        const runningSeconds = !alreadyFinished && current.timer_started_at
          ? Math.floor((Date.now() - new Date(current.timer_started_at).getTime()) / 1000)
          : 0;
        const elapsedSeconds = Math.max(0, Number(current.timer_accumulated_seconds || 0) + runningSeconds);
        const officialElapsed = Number(current.eligibility_elapsed_offset_seconds || 0) + elapsedSeconds;
        if (!alreadyFinished) {
          await client.query(
            `UPDATE public.matches
             SET status = 'finished', finished_at = NOW(), timer_started_at = NULL,
                 timer_accumulated_seconds = $2::integer
             WHERE id = $1::uuid`,
            [matchId, elapsedSeconds],
          );
        }
        await client.query(
          `UPDATE public.match_players
           SET left_elapsed_seconds = COALESCE(left_elapsed_seconds, $2::integer), is_active = false
           WHERE match_id = $1::uuid`,
          [matchId, officialElapsed],
        );
        return {
          roundId: current.round_id,
          ...(alreadyFinished ? { alreadyFinished: true } : {}),
          match: {
            id: current.id,
            round_id: current.round_id,
            score_a: Number(current.score_a || 0),
            score_b: Number(current.score_b || 0),
            team_a: { name: current.team_a_name },
            team_b: { name: current.team_b_name },
          },
        };
      });
    },

    async deleteMatch(matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ round_id: string; status: string; round_status: string }>(
          `SELECT match_item.round_id, match_item.status, round_item.status AS round_status
           FROM public.matches match_item
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
           WHERE match_item.id = $1::uuid AND round_item.league_id = $2::uuid
           FOR UPDATE OF match_item`,
          [matchId, leagueId],
        );
        const match = matchRes.rows[0];
        if (!match) throw new MatchPersistenceError("Partida não encontrada na pelada selecionada.", 404);
        if (match.status === "live") throw new MatchPersistenceError("Encerre a partida antes de apagá-la.", 409);
        if (match.round_status === "finished") {
          throw new MatchPersistenceError("A rodada já foi encerrada. Use a correção da rodada para preservar o histórico.", 409);
        }
        await client.query("DELETE FROM public.matches WHERE id = $1::uuid", [matchId]);
        return { roundId: match.round_id };
      });
    },

    async deleteEvent(eventId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string; scoreA: number; scoreB: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const match = await requireMatchInLeague(client, matchId, leagueId);
        const result = await client.query<{ receipt: { round_id: string; score_a: number; score_b: number } }>(
          "SELECT public.delete_match_event($1::uuid, $2::uuid) AS receipt",
          [eventId, matchId],
        );
        const receipt = result.rows[0]?.receipt;
        if (!receipt) throw new MatchPersistenceError("A exclusão do gol não retornou um recibo válido.", 500);
        return { roundId: receipt.round_id || match.round_id, scoreA: receipt.score_a, scoreB: receipt.score_b };
      });
    },

    async correctFinishedGoal(eventId: string, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scope = await requireEventInLeague(client, eventId, leagueId);
        const result = await client.query<{ receipt: { round_id?: string; match_id?: string } }>(
          "SELECT public.correct_finished_goal($1::uuid) AS receipt",
          [eventId],
        );
        const receipt = result.rows[0]?.receipt;
        return { roundId: receipt?.round_id || scope.round_id, matchId: receipt?.match_id || scope.match_id };
      });
    },

    async correctFinishedGoalEvent(eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scope = await requireEventInLeague(client, eventId, leagueId);
        const result = await client.query<{ receipt: { round_id?: string; match_id?: string } }>(
          "SELECT public.correct_finished_goal_event($1::uuid, $2::uuid, $3::uuid) AS receipt",
          [eventId, playerId, assistPlayerId],
        );
        const receipt = result.rows[0]?.receipt;
        return { roundId: receipt?.round_id || scope.round_id, matchId: receipt?.match_id || scope.match_id };
      });
    },

    async addFinishedGoalEvent(matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string, leagueId: string, actor: Actor): Promise<{ roundId: string; matchId: string; warning?: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scope = await requireMatchInLeague(client, matchId, leagueId);
        const result = await client.query<{ receipt: { round_id?: string; match_id?: string } }>(
          "SELECT public.add_finished_goal_event($1::uuid, $2::uuid, $3::uuid, $4::uuid) AS receipt",
          [matchId, teamId, playerId, assistPlayerId],
        );
        const receipt = result.rows[0]?.receipt;
        return { roundId: receipt?.round_id || scope.round_id, matchId: receipt?.match_id || matchId };
      });
    },

    async changeMatchGoalkeeper(matchId: string, teamId: string, playerId: string, elapsedSeconds: number | undefined, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scope = await requireMatchInLeague(client, matchId, leagueId);
        await client.query(
          "SELECT public.change_match_goalkeeper($1::uuid, $2::uuid, $3::uuid, $4::integer)",
          [matchId, teamId, playerId, elapsedSeconds ?? null],
        );
        return { roundId: scope.round_id };
      });
    },

    async setRoundTeamFixedGoalkeeper(roundId: string, teamId: string, playerId: string | null, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const teamResult = await client.query<{ found: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM public.teams team
             JOIN public.rounds round_item ON round_item.id = team.round_id
             WHERE team.id = $1::uuid AND team.round_id = $2::uuid AND round_item.league_id = $3::uuid
               AND ($4::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM public.team_players player_entry
                 WHERE player_entry.team_id = team.id AND player_entry.player_id = $4::uuid
               ))
           ) AS found`,
          [teamId, roundId, leagueId, playerId],
        );
        if (teamResult.rows[0]?.found !== true) {
          throw new MatchPersistenceError("Time ou goleiro fora da rodada selecionada.", 400);
        }
        await client.query("UPDATE public.teams SET fixed_goalkeeper_player_id = $2::uuid WHERE id = $1::uuid", [teamId, playerId]);
        return { roundId };
      });
    },

    async substituteMatchPlayer(input: SubstituteMatchPlayerInput, leagueId: string, actor: Actor): Promise<{ roundId: string; substitutionId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scope = await requireMatchInLeague(client, input.match_id, leagueId);
        if (input.player_in_id) {
          const incomingResult = await client.query<{ formation_mode: string; attendance_status: string | null }>(
            `SELECT round_item.formation_mode, round_player.attendance_status
             FROM public.matches match_item
             JOIN public.rounds round_item ON round_item.id = match_item.round_id
             JOIN public.round_players round_player
               ON round_player.round_id = round_item.id AND round_player.player_id = $2::uuid
             WHERE match_item.id = $1::uuid
             LIMIT 1`,
            [input.match_id, input.player_in_id],
          );
          const incoming = incomingResult.rows[0];
          if (!incoming) throw new MatchPersistenceError("Substituto não encontrado nesta rodada.", 400);
          if (incoming.formation_mode !== "manual" && incoming.attendance_status !== "present") {
            throw new MatchPersistenceError("O substituto ainda não foi marcado como presente.", 400);
          }
        }
        const result = await client.query<{ id: string }>(
          `SELECT public.substitute_match_player(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::boolean
           ) AS id`,
          [input.match_id, input.team_id, input.player_out_id, input.player_in_id || null, input.reason, Boolean(input.mark_injured)],
        );
        const substitutionId = result.rows[0]?.id;
        if (!substitutionId) throw new MatchPersistenceError("A substituição não retornou um identificador.", 500);
        return { roundId: scope.round_id, substitutionId };
      });
    },

    async undoLastMatchSubstitution(substitutionId: string, matchId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scope = await requireMatchInLeague(client, matchId, leagueId);
        const substitution = await client.query<{ found: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM public.match_substitutions WHERE id = $1::uuid AND match_id = $2::uuid) AS found",
          [substitutionId, matchId],
        );
        if (substitution.rows[0]?.found !== true) throw new MatchPersistenceError("Substituição não encontrada nesta partida.", 404);
        await client.query("SELECT public.undo_last_match_substitution($1::uuid)", [substitutionId]);
        return { roundId: scope.round_id };
      });
    },

    async getMatchTimerState(matchId: string, leagueId: string, actor: Actor): Promise<MatchTimerState> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ status: string; duration_seconds: number; timer_started_at: Date | string | null; timer_accumulated_seconds: number }>(
          `SELECT match_item.status, match_item.duration_seconds,
                  match_item.timer_started_at, match_item.timer_accumulated_seconds
           FROM public.matches match_item
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
           WHERE match_item.id = $1::uuid AND round_item.league_id = $2::uuid`,
          [matchId, leagueId],
        );
        const match = matchRes.rows[0];
        if (!match || match.status !== "live") throw new MatchPersistenceError("A partida não está em andamento.", 400);
        return {
          status: match.status,
          durationSeconds: Number(match.duration_seconds || 420),
          accumulatedSeconds: Number(match.timer_accumulated_seconds || 0),
          startedAt: match.timer_started_at ? new Date(match.timer_started_at).toISOString() : null,
        };
      });
    },

    async updateMatchTimer(matchId: string, action: MatchTimerAction, startedAt: string | null, leagueId: string, actor: Actor): Promise<{ timerStartedAt?: string | null; timerAccumulatedSeconds?: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const matchRes = await client.query<{ status: string; timer_started_at: Date | string | null; timer_accumulated_seconds: number }>(
          `SELECT match_item.status, match_item.timer_started_at, match_item.timer_accumulated_seconds
           FROM public.matches match_item
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
           WHERE match_item.id = $1::uuid AND round_item.league_id = $2::uuid
           FOR UPDATE OF match_item`,
          [matchId, leagueId],
        );
        const match = matchRes.rows[0];
        if (!match || match.status !== "live") throw new MatchPersistenceError("A partida não está em andamento.", 400);

        if (action === "start") {
          if (!startedAt) throw new MatchPersistenceError("Horário de início do cronômetro ausente.", 400);
          await client.query("UPDATE public.matches SET timer_started_at = $2::timestamptz WHERE id = $1::uuid", [matchId, startedAt]);
          return { timerStartedAt: startedAt, timerAccumulatedSeconds: Number(match.timer_accumulated_seconds || 0) };
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
          `SELECT match_item.status, match_item.timer_started_at, match_item.timer_accumulated_seconds,
                  match_item.eligibility_elapsed_offset_seconds
           FROM public.matches match_item
           JOIN public.rounds round_item ON round_item.id = match_item.round_id
           WHERE match_item.id = $1::uuid AND round_item.league_id = $2::uuid
           FOR UPDATE OF match_item`,
          [matchId, leagueId],
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
               eligibility_elapsed_offset_seconds = $2,
               timer_one_minute_alerted_at = NULL,
               timer_thirty_seconds_alerted_at = NULL,
               timer_finished_alerted_at = NULL
           WHERE id = $1::uuid`,
          [matchId, offset],
        );

        return { eligibilityOffset: offset };
      });
    },

    async setMatchDuration(matchId: string, durationSeconds: number, leagueId: string, actor: Actor): Promise<{ newDuration: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query<{ duration_seconds: number }>(
          `UPDATE public.matches match_item SET
             duration_seconds = $3::integer,
             timer_one_minute_alerted_at = NULL,
             timer_thirty_seconds_alerted_at = NULL,
             timer_finished_alerted_at = NULL
           FROM public.rounds round_item
           WHERE match_item.id = $1::uuid AND round_item.id = match_item.round_id
             AND round_item.league_id = $2::uuid AND match_item.status = 'live'
           RETURNING match_item.duration_seconds`,
          [matchId, leagueId, durationSeconds],
        );
        const updated = result.rows[0];
        if (!updated) throw new MatchPersistenceError("A partida não está em andamento.", 400);
        return { newDuration: Number(updated.duration_seconds) };
      });
    },

    async notifyMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, leagueId: string, actor: Actor): Promise<MatchTimerNotificationClaim> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        return claimTimerThreshold(client, matchId, threshold, leagueId);
      });
    },

    async releaseMatchTimerThreshold(matchId: string, threshold: MatchTimerThreshold, claimedAt: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await releaseTimerThreshold(client, matchId, threshold, claimedAt, leagueId);
      });
    },

    async dispatchMatchTimerThresholdSystem(matchId: string, threshold: MatchTimerThreshold): Promise<MatchTimerNotificationClaim> {
      try {
        return await systemTransaction(pool, (client) => claimTimerThreshold(client, matchId, threshold));
      } catch (cause) {
        throw translateFailure(cause);
      }
    },

    async releaseMatchTimerThresholdSystem(matchId: string, threshold: MatchTimerThreshold, claimedAt: string): Promise<void> {
      try {
        await systemTransaction(pool, (client) => releaseTimerThreshold(client, matchId, threshold, claimedAt));
      } catch (cause) {
        throw translateFailure(cause);
      }
    },
  };
}
