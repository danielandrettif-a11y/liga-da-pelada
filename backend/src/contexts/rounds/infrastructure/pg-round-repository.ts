import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  AdminRoundPrelist,
  CreateRoundWithTeamsInput,
  DraftWorkspace,
  RoundRepository,
  RoundTeamShufflePreview,
  SaveRoundPrelistInput,
  SaveRoundPrelistResult,
  ServerAdaptiveDrawResult,
  TeamFormationInput,
} from "../application/manage-rounds.js";
import type {
  RoundDetail,
  RoundMatchSetup,
  RoundPlayerAvailability,
  RoundWithCounts,
} from "../domain/round.js";
import { ROUND_VEST_COLORS } from "../domain/round.js";
import {
  isRoundReshuffleMode,
  previewRoundReshuffle,
  type PlayerProfile,
  type PrivateBalanceTag,
} from "../domain/round-team-shuffle.js";

export class RoundPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "RoundPersistenceError";
  }
}

function translateFailure(cause: unknown): RoundPersistenceError {
  if (cause instanceof RoundPersistenceError) return cause;
  const error = cause as Error & { code?: string };
  const message = error.message || "";
  if (/ROUND_FORBIDDEN|Somente administradores|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new RoundPersistenceError("Somente administradores podem realizar esta operação.", 403);
  }
  if (/ROUND_NOT_FOUND|fora da pelada/i.test(message)) {
    return new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
  }
  if (error.code === "23505") {
    return new RoundPersistenceError("Houve um conflito na numeração. Atualize a página e tente novamente.", 409);
  }
  if (/pre-lista|jogador fora|Estadio fora|Convocacao aberta|Temporada ativa|Tipo de rodada|data e horario|capacidade/i.test(message)) {
    return new RoundPersistenceError(message, 400);
  }
  return new RoundPersistenceError(message || "Falha na persistência da rodada.", 500);
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
    throw new RoundPersistenceError("Somente administradores podem realizar esta ação.", 403);
  }
}

export function pgRoundRepository(pool: Pool): RoundRepository {
  return {
    async getRounds(seasonId: string, actor: Actor): Promise<RoundWithCounts[]> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{
          id: string;
          league_id: string;
          season_id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: "draft" | "active" | "finished";
          round_type: "official" | "friendly";
          formation_mode: "auto" | "manual" | "balanced" | "draft";
          target_players_per_team: number | null;
          target_teams_per_round: number | null;
          arrival_order_enabled: boolean;
          preparation_stage: "prelist" | "teams_ready" | "in_progress" | "completed";
          stadium_id: string | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          notes: string | null;
          payment_pix: string | null;
          payment_total: number | null;
          best_goalkeeper_player_id: string | null;
          created_at: string | Date;
          player_count: string | number;
          match_count: string | number;
        }>(
          `SELECT r.*,
                  COUNT(DISTINCT rp.id)::int AS player_count,
                  COUNT(DISTINCT m.id)::int AS match_count
           FROM public.rounds r
           LEFT JOIN public.round_players rp ON rp.round_id = r.id
           LEFT JOIN public.matches m ON m.round_id = r.id
           WHERE r.season_id = $1::uuid
             AND r.preparation_stage = 'teams_ready'
           GROUP BY r.id
           ORDER BY r.date DESC, r.created_at DESC`,
          [seasonId],
        );

        return result.rows.map((row) => ({
          ...row,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          playersCount: Number(row.player_count || 0),
          matchesCount: Number(row.match_count || 0),
          round_players: [{ count: Number(row.player_count || 0) }],
          matches: [{ count: Number(row.match_count || 0) }],
        }));
      });
    },

    async getRound(roundId: string, leagueId: string, actor: Actor): Promise<RoundDetail | null> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{ round: RoundDetail }>(
          `SELECT to_jsonb(r) || jsonb_build_object(
             'round_players', COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object(
                   'player_id', rp.player_id,
                   'availability_status', rp.availability_status,
                   'availability_updated_at', rp.availability_updated_at,
                   'attendance_status', rp.attendance_status,
                   'attendance_order', rp.attendance_order,
                   'attendance_marked_at', rp.attendance_marked_at,
                   'players', to_jsonb(p)
                 ) ORDER BY p.name, p.id
               )
               FROM public.round_players rp
               JOIN public.players p ON p.id = rp.player_id
               WHERE rp.round_id = r.id
             ), '[]'::jsonb),
             'teams', COALESCE((
               SELECT jsonb_agg(
                 to_jsonb(t) || jsonb_build_object(
                   'team_players', COALESCE((
                     SELECT jsonb_agg(
                       jsonb_build_object(
                         'player_id', tp.player_id,
                         'goalkeeper_order', tp.goalkeeper_order,
                         'loan_order', tp.loan_order,
                         'players', to_jsonb(team_player)
                       ) ORDER BY tp.goalkeeper_order NULLS LAST, team_player.name, team_player.id
                     )
                     FROM public.team_players tp
                     JOIN public.players team_player ON team_player.id = tp.player_id
                     WHERE tp.team_id = t.id
                   ), '[]'::jsonb)
                 ) ORDER BY t.position NULLS LAST, t.id
               )
               FROM public.teams t
               WHERE t.round_id = r.id
             ), '[]'::jsonb),
             'matches', COALESCE((
               SELECT jsonb_agg(
                 to_jsonb(m) || jsonb_build_object(
                   'match_events', COALESCE((
                     SELECT jsonb_agg(to_jsonb(event_item) ORDER BY event_item.created_at, event_item.id)
                     FROM public.match_events event_item
                     WHERE event_item.match_id = m.id
                   ), '[]'::jsonb),
                   'match_players', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                       'player_id', match_player.player_id,
                       'team_id', match_player.team_id,
                       'original_team_id', match_player.original_team_id
                     ) ORDER BY match_player.created_at, match_player.player_id)
                     FROM public.match_players match_player
                     WHERE match_player.match_id = m.id
                   ), '[]'::jsonb),
                   'match_goalkeepers', COALESCE((
                     SELECT jsonb_agg(to_jsonb(goalkeeper) ORDER BY goalkeeper.team_id, goalkeeper.player_id)
                     FROM public.match_goalkeepers goalkeeper
                     WHERE goalkeeper.match_id = m.id
                   ), '[]'::jsonb)
                 ) ORDER BY
                   CASE WHEN COALESCE(m.match_order, 0) > 0 THEN 0 ELSE 1 END,
                   CASE WHEN COALESCE(m.match_order, 0) > 0 THEN m.match_order END,
                   COALESCE(m.started_at, m.created_at),
                   m.id
               )
               FROM public.matches m
               WHERE m.round_id = r.id
             ), '[]'::jsonb),
             'callups', COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status) ORDER BY c.created_at, c.id)
               FROM public.callups c
               WHERE c.round_id = r.id
             ), '[]'::jsonb),
             'league', jsonb_build_object(
               'stadium_name', league.stadium_name,
               'stadium_map_url', league.stadium_map_url,
               'event_duration_minutes', league.event_duration_minutes,
               'players_per_team', league.players_per_team
             )
           ) AS round
           FROM public.rounds r
           JOIN public.leagues league ON league.id = r.league_id
           WHERE r.id = $1::uuid AND r.league_id = $2::uuid
           LIMIT 1`,
          [roundId, leagueId],
        );
        return result.rows[0]?.round ?? null;
      });
    },

    async getRoundMatchSetup(roundId: string, leagueId: string, actor: Actor): Promise<RoundMatchSetup | null> {
      return authenticated(pool, actor, async (client) => {
        const result = await client.query<{ setup: RoundMatchSetup }>(
          `SELECT jsonb_build_object(
             'id', r.id,
             'league_id', r.league_id,
             'number', r.number,
             'target_players_per_team', r.target_players_per_team,
             'formation_mode', r.formation_mode,
             'arrival_order_enabled', r.arrival_order_enabled,
             'round_players', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'player_id', rp.player_id,
                 'availability_status', rp.availability_status,
                 'attendance_status', rp.attendance_status
               ) ORDER BY rp.attendance_order NULLS LAST, rp.player_id)
               FROM public.round_players rp
               WHERE rp.round_id = r.id
             ), '[]'::jsonb),
             'teams', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id,
                 'name', t.name,
                 'position', t.position,
                 'color', t.color,
                 'crest_url', t.crest_url,
                 'captain_player_id', t.captain_player_id,
                 'fixed_goalkeeper_player_id', t.fixed_goalkeeper_player_id,
                 'team_players', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                     'player_id', tp.player_id,
                     'goalkeeper_order', tp.goalkeeper_order,
                     'loan_order', tp.loan_order,
                     'players', jsonb_build_object(
                       'id', p.id,
                       'name', p.name,
                       'is_goalkeeper', p.is_goalkeeper
                     )
                   ) ORDER BY tp.goalkeeper_order NULLS LAST, p.name, p.id)
                   FROM public.team_players tp
                   JOIN public.players p ON p.id = tp.player_id
                   WHERE tp.team_id = t.id
                 ), '[]'::jsonb)
               ) ORDER BY t.position NULLS LAST, t.id)
               FROM public.teams t
               WHERE t.round_id = r.id
             ), '[]'::jsonb),
             'matches', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', m.id,
                 'team_a_id', m.team_a_id,
                 'team_b_id', m.team_b_id,
                 'match_order', m.match_order,
                 'started_at', m.started_at,
                 'created_at', m.created_at,
                 'match_players', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                     'player_id', mp.player_id,
                     'team_id', mp.team_id,
                     'original_team_id', mp.original_team_id
                   ) ORDER BY mp.created_at, mp.player_id)
                   FROM public.match_players mp
                   WHERE mp.match_id = m.id
                 ), '[]'::jsonb),
                 'match_goalkeepers', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                     'player_id', mg.player_id,
                     'team_id', mg.team_id,
                     'rotation_order', mg.rotation_order
                   ) ORDER BY mg.team_id, mg.player_id)
                   FROM public.match_goalkeepers mg
                   WHERE mg.match_id = m.id
                 ), '[]'::jsonb)
               ) ORDER BY
                 CASE WHEN COALESCE(m.match_order, 0) > 0 THEN 0 ELSE 1 END,
                 CASE WHEN COALESCE(m.match_order, 0) > 0 THEN m.match_order END,
                 COALESCE(m.started_at, m.created_at),
                 m.id)
               FROM public.matches m
               WHERE m.round_id = r.id
             ), '[]'::jsonb),
             'league', jsonb_build_object('players_per_team', league.players_per_team)
           ) AS setup
           FROM public.rounds r
           JOIN public.leagues league ON league.id = r.league_id
           WHERE r.id = $1::uuid AND r.league_id = $2::uuid
           LIMIT 1`,
          [roundId, leagueId],
        );
        return result.rows[0]?.setup ?? null;
      });
    },

    async getActiveLeague(leagueId: string, actor: Actor) {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{
          id: string;
          players_per_team: number;
          teams_per_round: number;
          match_duration: number;
          stadium_name: string | null;
          stadium_map_url: string | null;
          event_duration_minutes: number;
          preseason_enabled: boolean;
          feature_tier: string;
        }>(
          `SELECT id, players_per_team, teams_per_round, match_duration, stadium_name,
                  stadium_map_url, event_duration_minutes, preseason_enabled, feature_tier
           FROM public.leagues
           WHERE id = $1::uuid LIMIT 1`,
          [leagueId],
        );
        const row = res.rows[0];
        if (!row) throw new RoundPersistenceError("Pelada selecionada não encontrada.", 404);
        return row;
      });
    },

    async createRoundWithTeams(input: CreateRoundWithTeamsInput, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);

        // Insere rodada
        const seasonRes = await client.query<{ id: string }>(
          "SELECT id FROM public.seasons WHERE league_id = $1::uuid AND status = 'active' LIMIT 1",
          [leagueId],
        );
        const seasonId = seasonRes.rows[0]?.id;
        if (!seasonId) throw new RoundPersistenceError("Nenhuma temporada ativa encontrada para a pelada.", 400);

        const roundInsert = await client.query<{ id: string }>(
          `INSERT INTO public.rounds (
             league_id, season_id, date, start_time, round_type, target_players_per_team,
             status, preparation_stage, formation_mode
           ) VALUES (
             $1::uuid, $2::uuid, $3::date, $4::time, $5::text, $6::int,
             'draft', 'teams_ready', 'manual'
           ) RETURNING id`,
          [
            leagueId,
            seasonId,
            input.date,
            input.startTime || "08:00",
            input.roundType,
            input.playersPerTeam,
          ],
        );
        const roundId = roundInsert.rows[0]?.id;
        if (!roundId) throw new RoundPersistenceError("Não foi possível criar a rodada.", 500);

        // Insere times e jogadores
        for (let i = 0; i < input.teams.length; i++) {
          const team = input.teams[i];
          if (!team) continue;
          const teamInsert = await client.query<{ id: string }>(
            `INSERT INTO public.teams (round_id, name, color, crest_url, position, captain_player_id)
             VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::int, $6::uuid)
             RETURNING id`,
            [roundId, team.name, team.color, team.crestUrl || null, i + 1, team.captainPlayerId || null],
          );
          const teamId = teamInsert.rows[0]?.id;
          if (teamId && team.playerIds.length > 0) {
            for (let pIdx = 0; pIdx < team.playerIds.length; pIdx++) {
              const pid = team.playerIds[pIdx];
              await client.query(
                "INSERT INTO public.team_players (team_id, player_id) VALUES ($1::uuid, $2::uuid)",
                [teamId, pid],
              );
              await client.query(
                `INSERT INTO public.round_players (round_id, player_id, availability_status, attendance_status)
                 VALUES ($1::uuid, $2::uuid, 'available', 'pending')
                 ON CONFLICT (round_id, player_id) DO NOTHING`,
                [roundId, pid],
              );
            }
          }
        }

        return { roundId };
      });
    },

    async deleteRound(roundId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query(
          "DELETE FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid",
          [roundId, leagueId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async finishRound(roundId: string, leagueId: string, bestGoalkeeperPlayerId: string | null, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const result = await client.query(
          `UPDATE public.rounds
           SET status = 'finished',
               best_goalkeeper_player_id = $3::uuid,
               updated_at = NOW()
           WHERE id = $1::uuid AND league_id = $2::uuid`,
          [roundId, leagueId, bestGoalkeeperPlayerId],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        }
      });
    },

    async getAdminRoundPrelist(roundId: string, leagueId: string, actor: Actor): Promise<AdminRoundPrelist | null> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{
          id: string;
          league_id: string;
          season_id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: string;
          round_type: string;
          preparation_stage: string;
          created_at: string | Date;
          target_players_per_team: number | null;
          target_teams_per_round: number | null;
          stadium_id: string | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          callup_id: string | null;
          callup_status: string | null;
        }>(
          `SELECT r.id, r.league_id, r.season_id, r.number, r.date, r.start_time,
                  r.status, r.round_type, r.preparation_stage, r.created_at,
                  r.target_players_per_team, r.target_teams_per_round,
                  r.stadium_id, r.stadium_name, r.stadium_map_url,
                  linked_callup.id AS callup_id, linked_callup.status AS callup_status
           FROM public.rounds r
           LEFT JOIN LATERAL (
             SELECT c.id, c.status
             FROM public.callups c
             WHERE c.round_id = r.id AND c.status IN ('open', 'locked')
             ORDER BY c.created_at DESC
             LIMIT 1
           ) linked_callup ON TRUE
           WHERE r.id = $1::uuid
             AND r.league_id = $2::uuid
             AND r.status = 'draft'
             AND r.preparation_stage = 'prelist'
           LIMIT 1`,
          [roundId, leagueId],
        );
        const row = res.rows[0];
        if (!row) return null;

        const playersRes = await client.query<{
          player_id: string;
          id: string;
          name: string;
          nickname: string | null;
          avatar_url: string | null;
          player_profile: string | null;
          is_goalkeeper: boolean;
          member_category: string;
        }>(
          `SELECT rp.player_id, p.id, p.name, p.nickname, p.avatar_url,
                  p.player_profile, p.is_goalkeeper, p.member_category
           FROM public.round_players rp
           JOIN public.players p ON p.id = rp.player_id
           WHERE rp.round_id = $1::uuid
           ORDER BY p.name ASC`,
          [roundId],
        );

        return {
          id: row.id,
          league_id: row.league_id,
          season_id: row.season_id,
          number: row.number,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          start_time: row.start_time,
          status: row.status,
          round_type: row.round_type,
          preparation_stage: row.preparation_stage,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          target_players_per_team: row.target_players_per_team,
          target_teams_per_round: row.target_teams_per_round,
          stadium_id: row.stadium_id,
          stadium_name: row.stadium_name,
          stadium_map_url: row.stadium_map_url,
          playersCount: playersRes.rows.length,
          callupId: row.callup_id,
          callupStatus: row.callup_status,
          round_players: playersRes.rows.map((player) => ({
            player_id: player.player_id,
            players: {
              id: player.id,
              name: player.name,
              nickname: player.nickname,
              avatar_url: player.avatar_url,
              player_profile: player.player_profile,
              is_goalkeeper: Boolean(player.is_goalkeeper),
              member_category: player.member_category,
            },
          })),
        };
      });
    },

    async getAdminRoundPrelists(leagueId: string, actor: Actor): Promise<AdminRoundPrelist[]> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{
          id: string;
          league_id: string;
          season_id: string;
          number: number;
          date: string | Date;
          start_time: string | null;
          status: string;
          round_type: string;
          preparation_stage: string;
          created_at: string | Date;
          target_players_per_team: number | null;
          target_teams_per_round: number | null;
          stadium_id: string | null;
          stadium_name: string | null;
          stadium_map_url: string | null;
          player_count: string | number;
          callup_id: string | null;
          callup_status: string | null;
        }>(
          `SELECT r.id, r.league_id, r.season_id, r.number, r.date, r.start_time,
                  r.status, r.round_type, r.preparation_stage, r.created_at,
                  r.target_players_per_team, r.target_teams_per_round,
                  r.stadium_id, r.stadium_name, r.stadium_map_url,
                  COUNT(rp.id)::int AS player_count,
                  linked_callup.id AS callup_id, linked_callup.status AS callup_status
           FROM public.rounds r
           JOIN public.seasons s ON s.id = r.season_id AND s.status = 'active'
           LEFT JOIN public.round_players rp ON rp.round_id = r.id
           LEFT JOIN LATERAL (
             SELECT c.id, c.status
             FROM public.callups c
             WHERE c.round_id = r.id AND c.status IN ('open', 'locked')
             ORDER BY c.created_at DESC
             LIMIT 1
           ) linked_callup ON TRUE
           WHERE r.league_id = $1::uuid
             AND r.status = 'draft'
             AND r.preparation_stage = 'prelist'
           GROUP BY r.id, linked_callup.id, linked_callup.status
           ORDER BY r.date ASC, r.start_time ASC, r.created_at ASC`,
          [leagueId],
        );

        return res.rows.map((row) => ({
          id: row.id,
          league_id: row.league_id,
          season_id: row.season_id,
          number: row.number,
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
          start_time: row.start_time,
          status: row.status,
          round_type: row.round_type,
          preparation_stage: row.preparation_stage,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          target_players_per_team: row.target_players_per_team,
          target_teams_per_round: row.target_teams_per_round,
          stadium_id: row.stadium_id,
          stadium_name: row.stadium_name,
          stadium_map_url: row.stadium_map_url,
          playersCount: Number(row.player_count || 0),
          callupId: row.callup_id,
          callupStatus: row.callup_status,
          round_players: [],
        }));
      });
    },

    async saveRoundPrelist(input: SaveRoundPrelistInput, leagueId: string, actor: Actor): Promise<SaveRoundPrelistResult> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const leagueResult = await client.query<{
          players_per_team: number;
          teams_per_round: number;
        }>(
          `SELECT players_per_team, teams_per_round
           FROM public.leagues
           WHERE id = $1::uuid AND is_active
           LIMIT 1`,
          [leagueId],
        );
        const league = leagueResult.rows[0];
        if (!league) throw new RoundPersistenceError("Pelada selecionada não encontrada ou inativa.", 404);

        const created = !input.roundId;
        let capacity = Number(league.players_per_team) * Number(league.teams_per_round);
        let effectivePlayerIds = [...new Set(input.playerIds)];
        let effectiveDate = input.date;
        let effectiveRoundType = input.roundType;

        if (input.roundId) {
          const roundResult = await client.query<{
            target_players_per_team: number | null;
            target_teams_per_round: number | null;
          }>(
            `SELECT r.target_players_per_team, r.target_teams_per_round
             FROM public.rounds r
             JOIN public.seasons s ON s.id = r.season_id AND s.status = 'active'
             WHERE r.id = $1::uuid
               AND r.league_id = $2::uuid
               AND r.status = 'draft'
               AND r.preparation_stage = 'prelist'
             LIMIT 1`,
            [input.roundId, leagueId],
          );
          const round = roundResult.rows[0];
          if (!round) throw new RoundPersistenceError("Pré-lista editável da pelada selecionada não encontrada.", 404);
          capacity = Number(round.target_players_per_team || league.players_per_team)
            * Number(round.target_teams_per_round || league.teams_per_round);
        }

        if (input.callupId) {
          const callupResult = await client.query<{
            date: string | Date;
            round_type: "official" | "friendly";
            capacity: number;
          }>(
            `SELECT date, round_type, capacity
             FROM public.callups
             WHERE id = $1::uuid
               AND league_id = $2::uuid
               AND status = 'open'
             FOR UPDATE`,
            [input.callupId, leagueId],
          );
          const callup = callupResult.rows[0];
          if (!callup) throw new RoundPersistenceError("Convocação aberta da pelada selecionada não encontrada.", 404);
          const confirmed = await client.query<{ player_id: string }>(
            `SELECT player_id
             FROM public.callup_entries
             WHERE callup_id = $1::uuid AND status = 'confirmed'
             ORDER BY position, created_at, player_id`,
            [input.callupId],
          );
          effectivePlayerIds = confirmed.rows.map((entry) => entry.player_id);
          effectiveDate = callup.date instanceof Date ? callup.date.toISOString().slice(0, 10) : String(callup.date).slice(0, 10);
          effectiveRoundType = callup.round_type;
          capacity = Number(callup.capacity);
        }

        if (effectivePlayerIds.length > capacity) {
          throw new RoundPersistenceError(`A pré-lista aceita no máximo ${capacity} jogadores.`, 400);
        }

        const result = await client.query<{ save_round_prelist: string }>(
          `SELECT public.save_round_prelist(
             $1::uuid, $2::uuid, $3::date, $4::time, $5::text,
             $6::uuid[], $7::uuid, $8::uuid, $9::text, $10::text
           )`,
          [
            leagueId,
            input.roundId || null,
            effectiveDate,
            input.startTime,
            effectiveRoundType,
            effectivePlayerIds,
            input.callupId || null,
            input.stadiumId || null,
            input.stadiumName || null,
            input.stadiumMapUrl || null,
          ],
        );
        const roundId = result.rows[0]?.save_round_prelist;
        if (!roundId) throw new RoundPersistenceError("Falha ao salvar pré-lista.", 500);
        return {
          roundId: String(roundId),
          effectiveDate,
          effectiveStartTime: input.startTime,
          effectiveRoundType,
          created,
        };
      });
    },

    async setCallupFormat(callupId: string, leagueId: string, format: { playersPerTeam: number; teamsPerRound: number }, actor: Actor): Promise<{ fantasySizePreserved: boolean; fantasyLineupSize: number }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{ fantasy_lineup_size: number; fantasy_size_preserved: boolean }>(
          `SELECT fantasy_lineup_size, fantasy_size_preserved FROM public.set_callup_format($1::uuid, $2::int, $3::int)`,
          [callupId, format.playersPerTeam, format.teamsPerRound],
        );
        const row = res.rows[0];
        return {
          fantasySizePreserved: Boolean(row?.fantasy_size_preserved),
          fantasyLineupSize: Number(row?.fantasy_lineup_size || format.playersPerTeam),
        };
      });
    },

    async setCallupMatchSize(callupId: string, leagueId: string, size: { playersPerTeam: number; teamsPerRound: number }, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT * FROM public.set_callup_format($1::uuid, $2::int, $3::int)",
          [callupId, size.playersPerTeam, size.teamsPerRound],
        );
      });
    },

    async getNextTeamPresetOffset(leagueId: string, roundType: "official" | "friendly", actor: Actor): Promise<{ offset: number }> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{ latest_number: number }>(
          `SELECT COALESCE(MAX(r.number), 0)::int AS latest_number
           FROM public.rounds r
           JOIN public.seasons s ON s.id = r.season_id
           WHERE r.league_id = $1::uuid
             AND s.status = 'active'
             AND r.round_type = $2::text`,
          [leagueId, roundType],
        );
        return { offset: Number(res.rows[0]?.latest_number || 0) % 4 };
      });
    },

    async markRoundTeamArrived(roundId: string, teamId: string, leagueId: string, arrived: boolean, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        if (!arrived) throw new RoundPersistenceError("A confirmação de chegada só aceita o estado presente.", 400);
        await client.query("SELECT public.mark_round_team_arrived($1::uuid, $2::uuid)", [roundId, teamId]);
      });
    },

    async openCallupReplacementVacancy(roundId: string, leagueId: string, outPlayerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT public.open_callup_replacement_vacancy($1::uuid, $2::uuid)",
          [roundId, outPlayerId],
        );
      });
    },

    async previewRoundTeamShuffle(roundId: string, leagueId: string, mode: string, actor: Actor): Promise<RoundTeamShufflePreview> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        if (!isRoundReshuffleMode(mode)) {
          throw new RoundPersistenceError("Tipo de sorteio inválido.", 400);
        }

        const roundResult = await client.query<{ status: string; has_live_match: boolean }>(
          `SELECT r.status,
                  EXISTS (
                    SELECT 1 FROM public.matches m
                    WHERE m.round_id = r.id AND m.status = 'live'
                  ) AS has_live_match
           FROM public.rounds r
           WHERE r.id = $1::uuid AND r.league_id = $2::uuid`,
          [roundId, leagueId],
        );
        const round = roundResult.rows[0];
        if (!round) throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        if (round.status === "finished") throw new RoundPersistenceError("A rodada já foi encerrada.", 409);
        if (round.has_live_match) {
          throw new RoundPersistenceError("Encerre a partida ao vivo antes de preparar uma nova formação.", 409);
        }

        const teamsResult = await client.query<{ id: string }>(
          "SELECT id FROM public.teams WHERE round_id = $1::uuid ORDER BY position ASC",
          [roundId],
        );
        const teamIds = teamsResult.rows.map((team) => team.id);

        const membersResult = await client.query<{
          team_id: string;
          player_id: string;
          is_goalkeeper: boolean;
          player_profile: string | null;
          speed_rating: number | null;
        }>(
          `SELECT tp.team_id, tp.player_id,
                  p.is_goalkeeper,
                  lm.player_profile,
                  lm.speed_rating
           FROM public.team_players tp
           JOIN public.players p ON p.id = tp.player_id
           LEFT JOIN public.league_members lm
             ON lm.league_id = $2::uuid AND lm.player_id = tp.player_id AND lm.is_active = true
           WHERE tp.team_id = ANY($1::uuid[])
           ORDER BY tp.team_id ASC, tp.player_id ASC`,
          [teamIds, leagueId],
        );

        const playerIdsByTeam = new Map(teamIds.map((teamId) => [teamId, [] as string[]]));
        const playerById = new Map(membersResult.rows.map((row) => [row.player_id, row]));
        for (const row of membersResult.rows) {
          playerIdsByTeam.get(row.team_id)!.push(row.player_id);
        }
        const playerIds = teamIds.flatMap((teamId) => playerIdsByTeam.get(teamId) ?? []);
        if (teamIds.length < 2 || playerIds.length < teamIds.length * 2) {
          throw new RoundPersistenceError("São necessários pelo menos dois times completos para criar uma nova formação.", 409);
        }

        const overallResult = await client.query<{ player_id: string; overall: number | string | null }>(
          "SELECT player_id, overall FROM public.get_latest_player_card_overalls_for_league($1::uuid)",
          [leagueId],
        );
        const overallByPlayer = new Map(overallResult.rows.map((row) => [
          row.player_id,
          row.overall === null ? null : Number(row.overall),
        ]));

        const balanceTagByPlayer = new Map<string, PrivateBalanceTag>();
        if (mode === "adaptive") {
          const access = await client.query<{ allowed: boolean }>(
            "SELECT public.can_manage_private_balance_tags() AS allowed",
          );
          if (access.rows[0]?.allowed) {
            const tags = await client.query<{ player_id: string; balance_tag: PrivateBalanceTag }>(
              "SELECT player_id, balance_tag FROM public.player_private_balance_tags WHERE player_id = ANY($1::uuid[])",
              [playerIds],
            );
            for (const row of tags.rows) balanceTagByPlayer.set(row.player_id, row.balance_tag);
          }
        }

        const preview = previewRoundReshuffle({
          players: playerIds.map((playerId) => {
            const player = playerById.get(playerId)!;
            const speed = Number(player.speed_rating);
            const profile = player.player_profile;
            return {
              id: playerId,
              overall: overallByPlayer.get(playerId) ?? null,
              speedRating: speed === 1 || speed === 2 || speed === 3 ? speed : null,
              playerProfile: profile === "defensive" || profile === "midfield" || profile === "offensive"
                ? profile as PlayerProfile
                : null,
              isGoalkeeper: player.is_goalkeeper === true,
              balanceTag: balanceTagByPlayer.get(playerId) ?? null,
            };
          }),
          capacities: teamIds.map((teamId) => playerIdsByTeam.get(teamId)?.length ?? 0),
          mode,
        });

        return {
          success: true,
          mode,
          assignments: teamIds.map((teamId, index) => ({
            teamId,
            playerIds: preview.teams[index] ?? [],
          })),
          summaries: preview.summaries,
          balanceScore: preview.balanceScore,
        };
      });
    },

    async applyRoundTeamShuffle(roundId, leagueId, input, actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        if (!isRoundReshuffleMode(input.mode)) {
          throw new RoundPersistenceError("Tipo de sorteio inválido.", 400);
        }
        if (!input.assignments) {
          if (input.mode !== "random") {
            throw new RoundPersistenceError("Aplique uma prévia aprovada para este tipo de sorteio.", 400);
          }
          await client.query("SELECT public.shuffle_round_teams($1::uuid)", [roundId]);
          return;
        }
        if (input.assignments.length < 2) {
          throw new RoundPersistenceError("A formação precisa conter pelo menos dois times.", 400);
        }
        const assignments = input.assignments.map((assignment) => ({
          team_id: assignment.teamId,
          player_ids: [...new Set(assignment.playerIds)],
        }));
        await client.query(
          "SELECT public.apply_round_team_shuffle($1::uuid, $2::jsonb, $3::text)",
          [roundId, JSON.stringify(assignments), input.mode],
        );
      });
    },

    async applyPermanentRoundTeamFormation(roundId: string, leagueId: string, input: TeamFormationInput, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        if (input.teams.length < 2) {
          throw new RoundPersistenceError("A formação precisa conter pelo menos dois times.", 400);
        }
        const assignments = input.teams.map((team) => ({
          team_id: team.teamId,
          player_ids: [...new Set(team.playerIds)],
        }));
        await client.query(
          "SELECT public.apply_round_team_shuffle($1::uuid, $2::jsonb, 'adaptive'::text)",
          [roundId, JSON.stringify(assignments)],
        );
      });
    },

    async swapRoundTeamPlayers(roundId: string, leagueId: string, playerA: string, playerB: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT public.swap_round_team_players($1::uuid, $2::uuid, $3::uuid)",
          [roundId, playerA, playerB],
        );
      });
    },

    async setRoundAttendanceBulk(roundId: string, leagueId: string, playerIds: string[], actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT public.set_round_attendance_bulk($1::uuid, $2::uuid[])",
          [roundId, [...new Set(playerIds)]],
        );
      });
    },

    async setRoundPlayerAttendance(roundId: string, leagueId: string, playerId: string, present: boolean, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT public.set_round_player_attendance($1::uuid, $2::uuid, $3::boolean)",
          [roundId, playerId, present],
        );
      });
    },

    async setRoundPlayerAvailability(roundId: string, leagueId: string, playerId: string, status: RoundPlayerAvailability, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT public.set_round_player_availability($1::uuid, $2::uuid, $3::text)",
          [roundId, playerId, status],
        );
      });
    },

    async setRoundTeamCaptain(roundId: string, teamId: string, leagueId: string, captainId: string | null, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "SELECT public.set_round_team_captain($1::uuid, $2::uuid, $3::uuid)",
          [roundId, teamId, captainId],
        );
      });
    },

    async setRoundTeamVestColor(roundId: string, teamId: string, leagueId: string, color: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        if (!ROUND_VEST_COLORS.has(color)) throw new RoundPersistenceError("Cor de colete inválida.", 400);
        const result = await client.query(
          "UPDATE public.teams SET color = $3::text WHERE id = $2::uuid AND round_id = $1::uuid",
          [roundId, teamId, color],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw new RoundPersistenceError("Time não encontrado nesta rodada.", 404);
        }
      });
    },

    async transferRoundPlayerIdentity(roundId: string, leagueId: string, fromId: string, toId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.team_players SET player_id = $3::uuid WHERE player_id = $2::uuid AND team_id IN (SELECT id FROM public.teams WHERE round_id = $1::uuid)",
          [roundId, fromId, toId],
        );
        await client.query(
          "UPDATE public.round_players SET player_id = $3::uuid WHERE round_id = $1::uuid AND player_id = $2::uuid",
          [roundId, fromId, toId],
        );
      });
    },

    async zeroPlayerRoundPoints(roundId: string, leagueId: string, playerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.round_players SET points_override = 0 WHERE round_id = $1::uuid AND player_id = $2::uuid",
          [roundId, playerId],
        );
      });
    },

    async addRoundEmergencySubstitute(roundId: string, leagueId: string, input: { name: string; teamId: string }, actor: Actor): Promise<{ playerId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const playerInsert = await client.query<{ id: string }>(
          `INSERT INTO public.players (name, member_category, is_selectable, created_by_user_id)
           VALUES ($1::text, 'guest', true, $2::uuid) RETURNING id`,
          [input.name, actor.userId],
        );
        const playerId = playerInsert.rows[0]?.id;
        if (!playerId) throw new RoundPersistenceError("Falha ao criar atleta substituto.", 500);

        await client.query(
          "INSERT INTO public.team_players (team_id, player_id) VALUES ($1::uuid, $2::uuid)",
          [input.teamId, playerId],
        );
        await client.query(
          "INSERT INTO public.round_players (round_id, player_id, availability_status, attendance_status) VALUES ($1::uuid, $2::uuid, 'available', 'present')",
          [roundId, playerId],
        );
        return { playerId };
      });
    },

    // Draft Operations
    async createTeamDraft(roundId: string, callupId: string | null, leagueId: string, actor: Actor): Promise<{ draftId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.team_drafts (league_id, round_id, callup_id, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'setup')
           RETURNING id`,
          [leagueId, roundId, callupId],
        );
        const draftId = res.rows[0]?.id;
        if (!draftId) throw new RoundPersistenceError("Falha ao criar draft.", 500);
        return { draftId };
      });
    },

    async getDraftWorkspace(draftId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{
          id: string;
          callup_id: string | null;
          round_id: string;
          status: "setup" | "active" | "paused" | "completed" | "confirmed" | "cancelled";
          current_pick: number;
          pause_reason: string | null;
        }>(
          "SELECT id, callup_id, round_id, status, current_pick, pause_reason FROM public.team_drafts WHERE id = $1::uuid AND league_id = $2::uuid",
          [draftId, leagueId],
        );
        const draft = res.rows[0];
        if (!draft) return null;

        return {
          id: draft.id,
          callupId: draft.callup_id,
          roundId: draft.round_id,
          status: draft.status,
          currentPick: Number(draft.current_pick || 1),
          pauseReason: draft.pause_reason,
          isAdmin: true,
          currentPlayerId: null,
          captains: [],
          players: [],
        };
      });
    },

    async getDraftWorkspaceByRound(roundId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null> {
      return authenticated(pool, actor, async (client) => {
        const res = await client.query<{ id: string }>(
          "SELECT id FROM public.team_drafts WHERE round_id = $1::uuid AND league_id = $2::uuid ORDER BY created_at DESC LIMIT 1",
          [roundId, leagueId],
        );
        const draftId = res.rows[0]?.id;
        if (!draftId) return null;
        return this.getDraftWorkspace(draftId, leagueId, actor);
      });
    },

    async startTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query("UPDATE public.team_drafts SET status = 'active', updated_at = NOW() WHERE id = $1::uuid AND league_id = $2::uuid", [draftId, leagueId]);
      });
    },

    async makeTeamDraftPick(draftId: string, leagueId: string, playerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "INSERT INTO public.team_draft_picks (draft_id, player_id, pick_number) VALUES ($1::uuid, $2::uuid, (SELECT COALESCE(MAX(pick_number), 0) + 1 FROM public.team_draft_picks WHERE draft_id = $1::uuid))",
          [draftId, playerId],
        );
      });
    },

    async replaceTeamDraftCaptain(draftId: string, leagueId: string, teamSlot: number, newCaptainId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query(
          "UPDATE public.team_draft_captains SET player_id = $3::uuid WHERE draft_id = $1::uuid AND team_slot = $2::int",
          [draftId, teamSlot, newCaptainId],
        );
      });
    },

    async restartTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await client.query("DELETE FROM public.team_draft_picks WHERE draft_id = $1::uuid", [draftId]);
        await client.query("UPDATE public.team_drafts SET status = 'setup', current_pick = 1, updated_at = NOW() WHERE id = $1::uuid", [draftId]);
      });
    },

    async finalizeTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const res = await client.query<{ round_id: string }>(
          "UPDATE public.team_drafts SET status = 'completed', updated_at = NOW() WHERE id = $1::uuid AND league_id = $2::uuid RETURNING round_id",
          [draftId, leagueId],
        );
        const roundId = res.rows[0]?.round_id;
        if (!roundId) throw new RoundPersistenceError("Draft não encontrado.", 404);
        return { roundId };
      });
    },

    async applyDraftSwap(draftId: string, leagueId: string, playerAId: string, playerBId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
      });
    },

    async drawTeamsAdaptiveOnServer(input: {
      playerIds: string[];
      attendanceOrder?: string[];
      teamCount: number;
      playersPerTeam: number;
    }, leagueId: string, actor: Actor): Promise<ServerAdaptiveDrawResult> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const teams: string[][] = [];
        for (let t = 0; t < input.teamCount; t++) {
          teams.push([]);
        }
        for (let i = 0; i < input.playerIds.length; i++) {
          const teamIdx = i % input.teamCount;
          const pid = input.playerIds[i];
          if (pid) teams[teamIdx]?.push(pid);
        }
        return {
          success: true,
          teams,
          teamSummaries: [],
          balanceScore: 100,
        };
      });
    },
  };
}
