import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  AdminRoundPrelist,
  CreateRoundWithTeamsInput,
  DraftWorkspace,
  FinishRoundInput,
  FinishRoundResult,
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
import { drawTeamsAdaptive } from "../domain/adaptive-draw.js";
import {
  calculateDraftBalanceScore,
  findBestDraftSwap,
  summarizeDraftTeams,
  type DraftBalancePlayer,
  type DraftPlayerProfile,
} from "../domain/draft-balance.js";
import {
  drawRoundPlayerOrder,
  ROUND_TEAM_CREST_URLS,
  ROUND_VEST_COLORS,
  validateUnderfilledRoundTeams,
} from "../domain/round.js";
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

type LockedCallup = {
  date: string | Date;
  round_type: "official" | "friendly";
  status: string;
  round_id: string | null;
  players_per_team: number | null;
  teams_per_round: number | null;
};

function translateFailure(cause: unknown): RoundPersistenceError {
  if (cause instanceof RoundPersistenceError) return cause;
  const error = cause as Error & { code?: string };
  const message = error.message || "";
  if (/ROUND_FORBIDDEN|Somente administradores|Acesso restrito|permission denied|row-level security/i.test(message)) {
    return new RoundPersistenceError("Somente administradores podem realizar esta operação.", 403);
  }
  if (/ROUND_NOT_FOUND|fora da pelada|Rodada (não|nao) encontrada/i.test(message)) {
    return new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
  }
  if (/Draft não encontrado/i.test(message)) {
    return new RoundPersistenceError("Draft não encontrado na pelada selecionada.", 404);
  }
  if (/vez de outro capitão/i.test(message)) {
    return new RoundPersistenceError(message, 403);
  }
  if (error.code === "23505") {
    return new RoundPersistenceError("Houve um conflito na numeração. Atualize a página e tente novamente.", 409);
  }
  if (/pre-lista|jogador fora|Estadio fora|Convocacao aberta|Temporada ativa|Tipo de rodada|data e horario|capacidade|Substituto invalido|perfil de destino nao e um atleta ativo|não pertence a esta rodada|nao pertence a rodada/i.test(message)) {
    return new RoundPersistenceError(message, 400);
  }
  if (/Draft|capit(ã|a)o|escolha|jogador não está disponível|lista mudou|rodada já possui times|partida ao vivo|mesma partida|ja participou|ja esta na rodada|Finalize a rodada/i.test(message)) {
    return new RoundPersistenceError(message, 409);
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

async function requireRoundInLeague(client: PoolClient, roundId: string, leagueId: string): Promise<void> {
  const result = await client.query<{ found: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid) AS found",
    [roundId, leagueId],
  );
  if (result.rows[0]?.found !== true) {
    throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
  }
}

async function requireDraftInLeague(client: PoolClient, draftId: string, leagueId: string): Promise<void> {
  const result = await client.query<{ found: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.team_drafts WHERE id = $1::uuid AND league_id = $2::uuid) AS found",
    [draftId, leagueId],
  );
  if (result.rows[0]?.found !== true) {
    throw new RoundPersistenceError("Draft não encontrado na pelada selecionada.", 404);
  }
}

async function readDraftWorkspace(
  client: PoolClient,
  lookup: "callup_id" | "round_id",
  value: string,
  leagueId: string,
  actor: Actor,
): Promise<DraftWorkspace | null> {
  const draftResult = await client.query<{
    id: string;
    callup_id: string | null;
    round_id: string;
    status: DraftWorkspace["status"];
    current_pick: number;
    pause_reason: string | null;
    is_admin: boolean;
    current_player_id: string | null;
  }>(
    `SELECT draft.id, draft.callup_id, draft.round_id, draft.status, draft.current_pick,
            draft.pause_reason, public.is_league_admin($2::uuid) AS is_admin,
            (SELECT profile.player_id FROM public.account_profiles profile
             WHERE profile.user_id = $3::uuid LIMIT 1) AS current_player_id
     FROM public.team_drafts draft
     WHERE draft.${lookup} = $1::uuid AND draft.league_id = $2::uuid
     ORDER BY draft.created_at DESC LIMIT 1`,
    [value, leagueId, actor.userId],
  );
  const draft = draftResult.rows[0];
  if (!draft) return null;

  const playerResult = await client.query<{
    id: string;
    name: string;
    nickname: string | null;
    avatar_url: string | null;
    profile_snapshot: DraftPlayerProfile | null;
    member_profile: DraftPlayerProfile | null;
    overall_snapshot: number | string | null;
    speed_rating_snapshot: number | null;
    captain_team_slot: number | null;
    selection_order: number | null;
    win_rate_snapshot: number | string | null;
    official_rounds_snapshot: number | null;
    pick_team_slot: number | null;
    pick_number: number | null;
  }>(
    `SELECT player.id, player.name, player.nickname, player.avatar_url,
            pool.profile_snapshot, member.player_profile AS member_profile,
            pool.overall_snapshot, pool.speed_rating_snapshot,
            captain.team_slot AS captain_team_slot, captain.selection_order,
            captain.win_rate_snapshot, captain.official_rounds_snapshot,
            pick.team_slot AS pick_team_slot, pick.pick_number
     FROM public.team_draft_players pool
     JOIN public.players player ON player.id = pool.player_id
     LEFT JOIN public.league_members member
       ON member.league_id = $2::uuid AND member.player_id = player.id AND member.is_active
     LEFT JOIN public.team_draft_captains captain
       ON captain.draft_id = pool.draft_id AND captain.captain_player_id = player.id
     LEFT JOIN public.team_draft_picks pick
       ON pick.draft_id = pool.draft_id AND pick.player_id = player.id
     WHERE pool.draft_id = $1::uuid
     ORDER BY player.name, player.id`,
    [draft.id, leagueId],
  );

  const players = playerResult.rows.map((row) => ({
    id: row.id,
    name: row.name || "Jogador",
    nickname: row.nickname || null,
    avatarUrl: row.avatar_url || null,
    profile: row.profile_snapshot || row.member_profile || null,
    overall: row.overall_snapshot === null ? null : Number(row.overall_snapshot),
    stars: row.speed_rating_snapshot === null ? null : Number(row.speed_rating_snapshot),
    teamSlot: row.captain_team_slot || row.pick_team_slot || null,
    isCaptain: row.captain_team_slot !== null,
    pickNumber: row.pick_number || null,
    active: true,
  }));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const captains = playerResult.rows.flatMap((row) => row.captain_team_slot === null ? [] : [{
    teamSlot: row.captain_team_slot,
    selectionOrder: row.selection_order,
    winRate: Number(row.win_rate_snapshot || 0),
    officialRounds: Number(row.official_rounds_snapshot || 0),
    player: playerById.get(row.id)!,
  }]);
  const balancePlayers: DraftBalancePlayer[] = players.flatMap((player) => player.teamSlot === null ? [] : [{
    id: player.id,
    teamSlot: player.teamSlot,
    overall: player.overall,
    speedRating: player.stars,
    profile: player.profile,
    isCaptain: player.isCaptain,
  }]);
  const suggestion = balancePlayers.length > 3 ? findBestDraftSwap(balancePlayers) : null;
  return {
    id: draft.id,
    callupId: draft.callup_id,
    roundId: draft.round_id,
    status: draft.status,
    currentPick: Number(draft.current_pick || 1),
    pauseReason: draft.pause_reason,
    isAdmin: draft.is_admin === true,
    currentPlayerId: draft.current_player_id,
    captains,
    players,
    summaries: summarizeDraftTeams(balancePlayers),
    balanceScore: calculateDraftBalanceScore(balancePlayers),
    suggestion: suggestion ? {
      ...suggestion,
      playerAName: playerById.get(suggestion.playerAId)?.name || "Jogador",
      playerBName: playerById.get(suggestion.playerBId)?.name || "Jogador",
    } : null,
  };
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
          formation_mode: "manual" | "random" | "balanced" | "speed" | "adaptive" | "draft";
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

        const leagueResult = await client.query<{ players_per_team: number; teams_per_round: number }>(
          "SELECT players_per_team, teams_per_round FROM public.leagues WHERE id = $1::uuid LIMIT 1",
          [leagueId],
        );
        const league = leagueResult.rows[0];
        if (!league) throw new RoundPersistenceError("Pelada selecionada não encontrada.", 404);

        const seasonResult = await client.query<{ id: string }>(
          "SELECT id FROM public.seasons WHERE league_id = $1::uuid AND status = 'active' LIMIT 1",
          [leagueId],
        );
        const seasonId = seasonResult.rows[0]?.id;
        if (!seasonId) throw new RoundPersistenceError("Nenhuma temporada ativa encontrada para a pelada.", 400);

        const teams = input.teams.map((team) => ({
          ...team,
          name: team.name.trim(),
          color: /^#[0-9a-f]{6}$/i.test(team.color) ? team.color : "#111827",
          crestUrl: team.crestUrl && ROUND_TEAM_CREST_URLS.has(team.crestUrl) ? team.crestUrl : null,
        }));
        if (teams.some((team) => !team.name)) {
          throw new RoundPersistenceError("Todos os times precisam ter um nome.", 400);
        }
        if (teams.some((team) => team.name.length > 40)) {
          throw new RoundPersistenceError("O nome de cada time deve ter no máximo 40 caracteres.", 400);
        }
        if (new Set(teams.map((team) => team.name.toLocaleLowerCase("pt-BR"))).size !== teams.length) {
          throw new RoundPersistenceError("Use um nome diferente para cada time.", 400);
        }

        const rawPlayerIds = teams.flatMap((team) => team.playerIds);
        const playerIds = [...new Set(rawPlayerIds)];
        if (rawPlayerIds.length !== playerIds.length) {
          throw new RoundPersistenceError("Um jogador não pode aparecer em mais de um time.", 400);
        }
        if (teams.some((team) => team.captainPlayerId && !team.playerIds.includes(team.captainPlayerId))) {
          throw new RoundPersistenceError("O capitão precisa pertencer ao próprio time.", 400);
        }

        let configuredPlayersPerTeam = league.players_per_team;
        let configuredTeamsPerRound = league.teams_per_round;
        let callup: LockedCallup | null = null;

        if (input.callupId) {
          const callupResult = await client.query<LockedCallup>(
            `SELECT date, round_type, status, round_id, players_per_team, teams_per_round
             FROM public.callups
             WHERE id = $1::uuid AND league_id = $2::uuid
             FOR UPDATE`,
            [input.callupId, leagueId],
          );
          callup = callupResult.rows[0] || null;
          if (!callup) throw new RoundPersistenceError("Convocação desta pelada não encontrada.", 404);
          configuredPlayersPerTeam = callup.players_per_team || configuredPlayersPerTeam;
          configuredTeamsPerRound = callup.teams_per_round || configuredTeamsPerRound;
        } else if (input.prelistRoundId) {
          const formatResult = await client.query<{ target_players_per_team: number | null; target_teams_per_round: number | null }>(
            `SELECT target_players_per_team, target_teams_per_round
             FROM public.rounds
             WHERE id = $1::uuid AND league_id = $2::uuid
             FOR UPDATE`,
            [input.prelistRoundId, leagueId],
          );
          const format = formatResult.rows[0];
          if (!format) throw new RoundPersistenceError("Pré-lista desta pelada não encontrada.", 404);
          configuredPlayersPerTeam = format.target_players_per_team || configuredPlayersPerTeam;
          configuredTeamsPerRound = format.target_teams_per_round || configuredTeamsPerRound;
        }

        if (teams.length !== configuredTeamsPerRound) {
          throw new RoundPersistenceError(`Esta convocação usa ${configuredTeamsPerRound} times.`, 400);
        }
        if (!Number.isInteger(input.playersPerTeam) || input.playersPerTeam < 5 || input.playersPerTeam > configuredPlayersPerTeam) {
          throw new RoundPersistenceError("O formato da partida é incompatível com a convocação.", 400);
        }

        const configuredCapacity = configuredPlayersPerTeam * configuredTeamsPerRound;
        const underfilled = playerIds.length < configuredCapacity || input.playersPerTeam < configuredPlayersPerTeam;
        if (underfilled) {
          if (!input.confirmUnderfilled) {
            throw new RoundPersistenceError("Confirme a criação da rodada com menos jogadores.", 400);
          }
          try {
            validateUnderfilledRoundTeams(teams.map((team) => team.playerIds.length), playerIds.length, input.playersPerTeam);
          } catch (cause) {
            throw new RoundPersistenceError(cause instanceof Error ? cause.message : "Distribuição inválida de jogadores.", 400);
          }
        } else if (teams.some((team) => team.playerIds.length > configuredPlayersPerTeam)) {
          throw new RoundPersistenceError(`Cada time pode ter no máximo ${configuredPlayersPerTeam} jogadores.`, 400);
        }

        const attendanceOrder = [...new Set(input.attendanceOrder || [])];
        const minimumPresent = input.playersPerTeam * 2;
        if (attendanceOrder.length > 0) {
          if (playerIds.length < minimumPresent) {
            throw new RoundPersistenceError(`Selecione pelo menos ${minimumPresent} jogadores para sortear por ordem de chegada.`, 400);
          }
          if (attendanceOrder.length < minimumPresent || attendanceOrder.some((id) => !playerIds.includes(id))) {
            throw new RoundPersistenceError(`Marque pelo menos ${minimumPresent} presenças válidas.`, 400);
          }
          const starters = new Set(attendanceOrder.slice(0, minimumPresent));
          const startingTeams = new Set(teams.slice(0, 2).flatMap((team) => team.playerIds));
          if (starters.size !== minimumPresent || startingTeams.size !== minimumPresent
            || [...starters].some((id) => !startingTeams.has(id))) {
            throw new RoundPersistenceError("Os primeiros presentes precisam formar os dois times titulares.", 400);
          }
        }

        const eligibleResult = await client.query<{ id: string }>(
          `SELECT player.id
           FROM public.players player
           JOIN public.league_members member ON member.player_id = player.id
           WHERE member.league_id = $1::uuid AND member.is_active
             AND player.id = ANY($2::uuid[]) AND player.is_selectable
             AND player.member_category IN ('player', 'guest')`,
          [leagueId, playerIds],
        );
        if (eligibleResult.rows.length !== playerIds.length) {
          throw new RoundPersistenceError("A lista contém uma pessoa que não pode participar de partidas.", 400);
        }

        if (callup) {
          if (!["open", "locked"].includes(callup.status)) {
            throw new RoundPersistenceError("A convocação precisa estar aberta ou bloqueada antes de montar a rodada.", 400);
          }
          const confirmedResult = await client.query<{ player_id: string }>(
            `SELECT player_id FROM public.callup_entries
             WHERE callup_id = $1::uuid AND status = 'confirmed'
             ORDER BY player_id`,
            [input.callupId],
          );
          const confirmedIds = confirmedResult.rows.map((row) => row.player_id).sort();
          const callupDate = callup.date instanceof Date ? callup.date.toISOString().slice(0, 10) : String(callup.date).slice(0, 10);
          if (callupDate !== input.date || callup.round_type !== input.roundType
            || confirmedIds.join(",") !== [...playerIds].sort().join(",")) {
            throw new RoundPersistenceError("Use a data, o tipo e todos os confirmados atuais da convocação.", 400);
          }
          if (input.prelistRoundId && callup.round_id !== input.prelistRoundId) {
            throw new RoundPersistenceError("A convocação não está vinculada a esta pré-lista.", 400);
          }
        }

        let stadiumId = input.stadiumId || null;
        let stadiumName = input.stadiumName?.trim() || null;
        let stadiumMapUrl = input.stadiumMapUrl?.trim() || null;
        if (stadiumId) {
          const stadiumResult = await client.query<{ name: string; google_maps_url: string }>(
            `SELECT name, google_maps_url FROM public.stadiums
             WHERE id = $1::uuid AND league_id = $2::uuid AND is_active LIMIT 1`,
            [stadiumId, leagueId],
          );
          const stadium = stadiumResult.rows[0];
          if (!stadium) throw new RoundPersistenceError("Estádio desta pelada não encontrado.", 400);
          stadiumName = stadium.name;
          stadiumMapUrl = stadium.google_maps_url;
        }

        const formationMode = input.formationMode || "manual";
        let roundId: string;
        if (input.prelistRoundId) {
          const prelistResult = await client.query<{
            id: string;
            date: string | Date;
            round_type: string;
            player_ids: string[];
            team_count: number;
          }>(
            `SELECT round_item.id, round_item.date, round_item.round_type,
                    ARRAY(SELECT rp.player_id::text FROM public.round_players rp WHERE rp.round_id = round_item.id ORDER BY rp.player_id) AS player_ids,
                    (SELECT count(*)::int FROM public.teams team WHERE team.round_id = round_item.id) AS team_count
             FROM public.rounds round_item
             WHERE round_item.id = $1::uuid AND round_item.league_id = $2::uuid
               AND round_item.season_id = $3::uuid AND round_item.status = 'draft'
               AND round_item.preparation_stage = 'prelist'
             FOR UPDATE`,
            [input.prelistRoundId, leagueId, seasonId],
          );
          const prelist = prelistResult.rows[0];
          if (!prelist) throw new RoundPersistenceError("Pré-lista editável não encontrada.", 404);
          const prelistDate = prelist.date instanceof Date ? prelist.date.toISOString().slice(0, 10) : String(prelist.date).slice(0, 10);
          if (prelistDate !== input.date || prelist.round_type !== input.roundType
            || prelist.player_ids.join(",") !== [...playerIds].sort().join(",")) {
            throw new RoundPersistenceError("Salve a pré-lista com todos os jogadores antes de montar os times.", 400);
          }
          if (prelist.team_count > 0) throw new RoundPersistenceError("Esta rodada já possui times montados.", 409);
          roundId = prelist.id;
          await client.query(
            `UPDATE public.rounds SET start_time = $2::time, stadium_id = COALESCE($3::uuid, stadium_id),
               stadium_name = COALESCE($4::text, stadium_name), stadium_map_url = COALESCE($5::text, stadium_map_url),
               target_players_per_team = $6::int, target_teams_per_round = $7::int,
               updated_at = NOW()
             WHERE id = $1::uuid`,
            [roundId, input.startTime || "08:00", stadiumId, stadiumName, stadiumMapUrl, input.playersPerTeam, configuredTeamsPerRound],
          );
        } else {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))", [leagueId, `${seasonId}:${input.roundType}`]);
          const numberResult = await client.query<{ next_number: number }>(
            `SELECT COALESCE(MAX(number), 0)::int + 1 AS next_number
             FROM public.rounds
             WHERE league_id = $1::uuid AND season_id = $2::uuid AND round_type = $3::text`,
            [leagueId, seasonId, input.roundType],
          );
          const roundInsert = await client.query<{ id: string }>(
            `INSERT INTO public.rounds (
               league_id, season_id, number, date, start_time, stadium_id, stadium_name, stadium_map_url,
               status, round_type, formation_mode, preparation_stage,
               target_players_per_team, target_teams_per_round
             ) VALUES (
               $1::uuid, $2::uuid, $3::int, $4::date, $5::time, $6::uuid, $7::text, $8::text,
               'draft', $9::text, $10::text, 'teams_ready', $11::int, $12::int
             ) RETURNING id`,
            [leagueId, seasonId, numberResult.rows[0]?.next_number || 1, input.date, input.startTime || "08:00",
              stadiumId, stadiumName, stadiumMapUrl, input.roundType, formationMode, input.playersPerTeam, configuredTeamsPerRound],
          );
          roundId = roundInsert.rows[0]?.id || "";
          if (!roundId) throw new RoundPersistenceError("Não foi possível criar a rodada.", 500);
          await client.query(
            `INSERT INTO public.round_players (round_id, player_id)
             SELECT $1::uuid, player_id FROM unnest($2::uuid[]) AS player_id`,
            [roundId, playerIds],
          );
        }

        const presentPlayerIds = attendanceOrder.length > 0 ? attendanceOrder : playerIds;
        await client.query("SELECT public.set_round_attendance_bulk($1::uuid, $2::uuid[])", [roundId, presentPlayerIds]);

        for (const [index, team] of teams.entries()) {
          const teamResult = await client.query<{ id: string }>(
            `INSERT INTO public.teams (round_id, name, color, crest_url, position, captain_player_id)
             VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::int, $6::uuid)
             RETURNING id`,
            [roundId, team.name, team.color, team.crestUrl, index + 1, team.captainPlayerId || null],
          );
          const teamId = teamResult.rows[0]?.id;
          if (!teamId) throw new RoundPersistenceError(`Não foi possível criar o time ${team.name}.`, 500);
          const goalkeeperOrder = drawRoundPlayerOrder(team.playerIds);
          const loanOrder = new Map(drawRoundPlayerOrder(team.playerIds).map((entry) => [entry.playerId, entry.order]));
          await client.query(
            `INSERT INTO public.team_players (team_id, player_id, goalkeeper_order, loan_order)
             SELECT $1::uuid, item.player_id::uuid, item.goalkeeper_order::int, item.loan_order::int
             FROM jsonb_to_recordset($2::jsonb) AS item(player_id text, goalkeeper_order int, loan_order int)`,
            [teamId, JSON.stringify(goalkeeperOrder.map((entry) => ({
              player_id: entry.playerId,
              goalkeeper_order: entry.order,
              loan_order: underfilled ? loanOrder.get(entry.playerId) : null,
            })))],
          );
        }

        await client.query(
          `UPDATE public.rounds SET preparation_stage = 'teams_ready', formation_mode = $2::text,
             arrival_order_enabled = $3::boolean, updated_at = NOW()
           WHERE id = $1::uuid`,
          [roundId, formationMode, attendanceOrder.length > 0],
        );
        if (input.callupId) {
          const converted = await client.query(
            `UPDATE public.callups SET status = 'converted', round_id = $3::uuid, updated_at = NOW()
             WHERE id = $1::uuid AND league_id = $2::uuid AND status IN ('open', 'locked')`,
            [input.callupId, leagueId, roundId],
          );
          if ((converted.rowCount ?? 0) !== 1) {
            throw new RoundPersistenceError("Não foi possível vincular a convocação à rodada.", 409);
          }
        }

        return { roundId };
      });
    },

    async deleteRound(roundId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const scoped = await client.query<{ found: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid) AS found",
          [roundId, leagueId],
        );
        if (scoped.rows[0]?.found !== true) {
          throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        }
        await client.query("SELECT public.delete_round_cascade($1::uuid)", [roundId]);
      });
    },

    async finishRound(roundId: string, leagueId: string, input: FinishRoundInput, actor: Actor): Promise<FinishRoundResult> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const roundResult = await client.query<{
          status: string;
          created_at: string | Date;
          feature_tier: string;
          full_enabled_at: string | Date | null;
        }>(
          `SELECT r.status, r.created_at, league.feature_tier, league.full_enabled_at
           FROM public.rounds r
           JOIN public.leagues league ON league.id = r.league_id
           WHERE r.id = $1::uuid AND r.league_id = $2::uuid
           FOR UPDATE OF r`,
          [roundId, leagueId],
        );
        const round = roundResult.rows[0];
        if (!round) {
          throw new RoundPersistenceError("Rodada não encontrada na pelada selecionada.", 404);
        }

        let paymentPix = input.paymentPix;
        let recipientId = input.recipientId || null;
        let recipientName = input.recipientName?.trim() || null;
        if (recipientId) {
          const recipientResult = await client.query<{
            id: string;
            name: string;
            pix_key: string;
          }>(
            `SELECT id, name, pix_key
             FROM public.payment_recipients
             WHERE id = $1::uuid AND league_id = $2::uuid AND is_active
             LIMIT 1`,
            [recipientId, leagueId],
          );
          const recipient = recipientResult.rows[0];
          if (!recipient) throw new RoundPersistenceError("O PIX escolhido não está disponível.", 400);
          paymentPix = recipient.pix_key;
          recipientName = recipient.name;
        }

        const fantasyResult = await client.query<{ id: string }>(
          "SELECT id FROM public.fantasy_rounds WHERE round_id = $1::uuid LIMIT 1",
          [roundId],
        );
        const fantasyRound = fantasyResult.rows[0] || null;
        if (round.feature_tier === "complete" && !fantasyRound) {
          const createdAt = new Date(round.created_at).getTime();
          const fullEnabledAt = round.full_enabled_at ? new Date(round.full_enabled_at).getTime() : null;
          if (fullEnabledAt === null || createdAt >= fullEnabledAt) {
            throw new RoundPersistenceError("O Cartola desta rodada não foi criado. Corrija antes de encerrá-la.", 400);
          }
        }

        await client.query(
          `SELECT public.finalize_round_financials(
             $1::uuid, $2::uuid, $3::text, $4::numeric,
             $5::uuid, $6::text, $7::uuid[]
           )`,
          [
            roundId,
            leagueId,
            paymentPix,
            input.paymentTotal,
            recipientId,
            recipientName,
            [...new Set(input.expenseItemIds || [])],
          ],
        );

        let fantasyTest = false;
        if (fantasyRound) {
          const testResult = await client.query<{ found: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM public.fantasy_test_sessions WHERE round_id = $1::uuid) AS found",
            [roundId],
          );
          fantasyTest = testResult.rows[0]?.found === true;
          await client.query(
            fantasyTest
              ? "SELECT public.process_fantasy_test_round($1::uuid)"
              : "SELECT public.process_fantasy_round($1::uuid)",
            [roundId],
          );

          if (!fantasyTest) {
            await client.query("SAVEPOINT optional_round_rewards");
            try {
              await client.query("SELECT public.ensure_fantasy_round_reward_packs($1::uuid)", [roundId]);
              await client.query("RELEASE SAVEPOINT optional_round_rewards");
            } catch {
              await client.query("ROLLBACK TO SAVEPOINT optional_round_rewards");
              await client.query("RELEASE SAVEPOINT optional_round_rewards");
            }
          }
        }

        let archived = false;
        if (round.feature_tier === "quick") {
          await client.query("SAVEPOINT optional_quick_archive");
          try {
            const archiveResult = await client.query<{ archive_quick_league: boolean }>(
              "SELECT public.archive_quick_league($1::uuid)",
              [leagueId],
            );
            archived = archiveResult.rows[0]?.archive_quick_league === true;
            await client.query("RELEASE SAVEPOINT optional_quick_archive");
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT optional_quick_archive");
            await client.query("RELEASE SAVEPOINT optional_quick_archive");
          }
        }

        return {
          archived,
          shouldRefreshOverall: !fantasyTest && round.status !== "finished",
        };
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

    async transferRoundPlayerIdentity(roundId: string, leagueId: string, sourcePlayerId: string, targetPlayerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireRoundInLeague(client, roundId, leagueId);
        await client.query(
          "SELECT public.transfer_round_player_identity($1::uuid, $2::uuid, $3::uuid)",
          [roundId, sourcePlayerId, targetPlayerId],
        );
      });
    },

    async zeroPlayerRoundPoints(roundId: string, leagueId: string, playerId: string, reason: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireRoundInLeague(client, roundId, leagueId);
        await client.query(
          "SELECT public.zero_player_round_points($1::uuid, $2::uuid, $3::text)",
          [roundId, playerId, reason],
        );
      });
    },

    async addRoundEmergencySubstitute(
      roundId: string,
      leagueId: string,
      input: { outPlayerId: string; inPlayerId: string; teamId: string },
      actor: Actor,
    ): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireRoundInLeague(client, roundId, leagueId);
        await client.query(
          "SELECT public.add_round_emergency_substitute($1::uuid, $2::uuid, $3::uuid, $4::uuid)",
          [roundId, input.outPlayerId, input.inPlayerId, input.teamId],
        );
      });
    },

    // Draft Operations
    async createTeamDraft(roundId: string, callupId: string | null, leagueId: string, actor: Actor): Promise<{ draftId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        const captainResult = await client.query<{ id: string }>(
          `WITH target_round AS (
             SELECT id, season_id FROM public.rounds
             WHERE id = $1::uuid AND league_id = $2::uuid
           ), source_players AS (
             SELECT entry.player_id
             FROM public.callup_entries entry
             JOIN public.callups callup ON callup.id = entry.callup_id
             JOIN target_round round_item ON round_item.id = callup.round_id
             WHERE $3::uuid IS NOT NULL AND entry.callup_id = $3::uuid
               AND entry.status = 'confirmed' AND callup.league_id = $2::uuid
             UNION ALL
             SELECT participant.player_id
             FROM public.round_players participant
             JOIN target_round round_item ON round_item.id = participant.round_id
             WHERE $3::uuid IS NULL
           )
           SELECT player.id
           FROM source_players source
           JOIN target_round round_item ON true
           JOIN public.players player ON player.id = source.player_id
           JOIN public.league_members member
             ON member.player_id = player.id AND member.league_id = $2::uuid AND member.is_active
           JOIN public.player_season_stats stats
             ON stats.player_id = player.id AND stats.season_id = round_item.season_id
             AND stats.round_type = 'official' AND stats.rounds_count >= 3
           WHERE player.member_category = 'player' AND player.is_selectable
           ORDER BY random()
           LIMIT 3`,
          [roundId, leagueId, callupId],
        );
        const captainIds = captainResult.rows.map((row) => row.id);
        if (captainIds.length !== 3) {
          throw new RoundPersistenceError("São necessários três jogadores oficiais com pelo menos três rodadas oficiais nesta temporada.", 400);
        }
        const result = await client.query<{ id: string }>(
          "SELECT public.create_team_draft($1::uuid, $2::uuid, $3::uuid[]) AS id",
          [callupId, roundId, captainIds],
        );
        const draftId = result.rows[0]?.id;
        if (!draftId) throw new RoundPersistenceError("Falha ao criar draft.", 500);
        return { draftId };
      });
    },

    async getDraftWorkspace(callupId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null> {
      return authenticated(pool, actor, async (client) => {
        return readDraftWorkspace(client, "callup_id", callupId, leagueId, actor);
      });
    },

    async getDraftWorkspaceByRound(roundId: string, leagueId: string, actor: Actor): Promise<DraftWorkspace | null> {
      return authenticated(pool, actor, async (client) => {
        return readDraftWorkspace(client, "round_id", roundId, leagueId, actor);
      });
    },

    async startTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireDraftInLeague(client, draftId, leagueId);
        await client.query("SELECT public.start_team_draft($1::uuid)", [draftId]);
      });
    },

    async makeTeamDraftPick(draftId: string, leagueId: string, playerId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireDraftInLeague(client, draftId, leagueId);
        await client.query("SELECT public.make_team_draft_pick($1::uuid, $2::uuid)", [draftId, playerId]);
      });
    },

    async replaceTeamDraftCaptain(draftId: string, leagueId: string, teamSlot: number, newCaptainId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireDraftInLeague(client, draftId, leagueId);
        await client.query("SELECT public.replace_team_draft_captain($1::uuid, $2::int, $3::uuid)", [draftId, teamSlot, newCaptainId]);
      });
    },

    async restartTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireDraftInLeague(client, draftId, leagueId);
        await client.query("SELECT public.restart_team_draft($1::uuid)", [draftId]);
      });
    },

    async finalizeTeamDraft(draftId: string, leagueId: string, actor: Actor): Promise<{ roundId: string }> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireDraftInLeague(client, draftId, leagueId);
        const result = await client.query<{ round_id: string }>(
          "SELECT public.finalize_team_draft($1::uuid) AS round_id",
          [draftId],
        );
        const roundId = result.rows[0]?.round_id;
        if (!roundId) throw new RoundPersistenceError("Draft não encontrado.", 404);
        await client.query(
          `UPDATE public.teams team SET
             name = preset.name, color = preset.color, crest_url = preset.crest_url
           FROM (VALUES
             (1, 'Meia Boca Juniors', '#FACC15', '/team-crests/meia-boca-juniors.webp'),
             (2, 'Patético de Madrid', '#F43F5E', '/team-crests/patetico-de-madrid.webp'),
             (3, 'MilamB', '#DC2626', '/team-crests/milamb.webp')
           ) AS preset(position, name, color, crest_url)
           WHERE team.round_id = $1::uuid AND team.position = preset.position`,
          [roundId],
        );
        const players = await client.query<{ player_id: string }>(
          "SELECT player_id FROM public.round_players WHERE round_id = $1::uuid ORDER BY player_id",
          [roundId],
        );
        await client.query(
          "SELECT public.set_round_attendance_bulk($1::uuid, $2::uuid[])",
          [roundId, players.rows.map((row) => row.player_id)],
        );
        return { roundId };
      });
    },

    async applyDraftSwap(draftId: string, leagueId: string, playerAId: string, playerBId: string, actor: Actor): Promise<void> {
      return authenticated(pool, actor, async (client) => {
        await requireLeagueAdmin(client, leagueId);
        await requireDraftInLeague(client, draftId, leagueId);
        await client.query(
          "SELECT public.swap_team_draft_picks($1::uuid, $2::uuid, $3::uuid)",
          [draftId, playerAId, playerBId],
        );
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
        const memberResult = await client.query<{
          player_id: string;
          player_profile: PlayerProfile | null;
          speed_rating: number | null;
        }>(
          `SELECT member.player_id, member.player_profile, member.speed_rating
           FROM public.league_members member
           JOIN public.players player ON player.id = member.player_id
           WHERE member.league_id = $1::uuid AND member.is_active
             AND member.player_id = ANY($2::uuid[]) AND player.is_selectable
             AND player.member_category IN ('player', 'guest')`,
          [leagueId, input.playerIds],
        );
        if (memberResult.rows.length !== input.playerIds.length) {
          throw new RoundPersistenceError("A lista contém uma pessoa que não está elegível nesta liga.", 400);
        }
        const overallResult = await client.query<{ player_id: string; overall: number | string | null }>(
          "SELECT player_id, overall FROM public.get_latest_player_card_overalls_for_league($1::uuid)",
          [leagueId],
        );
        const tagByPlayer = new Map<string, PrivateBalanceTag>();
        const privateAccess = await client.query<{ allowed: boolean }>(
          "SELECT public.can_manage_private_balance_tags() AS allowed",
        );
        if (privateAccess.rows[0]?.allowed === true) {
          const tags = await client.query<{ player_id: string; balance_tag: PrivateBalanceTag }>(
            "SELECT player_id, balance_tag FROM public.player_private_balance_tags WHERE player_id = ANY($1::uuid[])",
            [input.playerIds],
          );
          for (const row of tags.rows) tagByPlayer.set(row.player_id, row.balance_tag);
        }
        const memberByPlayer = new Map(memberResult.rows.map((row) => [row.player_id, row]));
        const overallByPlayer = new Map(overallResult.rows.flatMap((row) =>
          row.overall === null || !Number.isFinite(Number(row.overall)) ? [] : [[row.player_id, Number(row.overall)] as const]));
        const makePlayers = (ids: string[]) => ids.map((id) => {
          const member = memberByPlayer.get(id)!;
          const speed = Number(member.speed_rating);
          const normalizedSpeed: 1 | 2 | 3 | null = speed === 1 || speed === 2 || speed === 3 ? speed : null;
          const profile = member.player_profile;
          return {
            id,
            overall: overallByPlayer.get(id) ?? null,
            speedRating: normalizedSpeed,
            playerProfile: profile === "defensive" || profile === "midfield" || profile === "offensive" ? profile : null,
            balanceTag: tagByPlayer.get(id) ?? null,
          };
        });

        const eligible = new Set(input.playerIds);
        const requestedOrder = [...new Set(input.attendanceOrder || [])].filter((id) => eligible.has(id));
        if (requestedOrder.length) {
          const minimumPresent = Math.min(input.playerIds.length, input.playersPerTeam * 2);
          const fullOrder = requestedOrder.length < minimumPresent
            ? [...requestedOrder, ...input.playerIds.filter((id) => !requestedOrder.includes(id))]
            : requestedOrder;
          const starterIds = fullOrder.slice(0, minimumPresent);
          const starterResult = drawTeamsAdaptive({ players: makePlayers(starterIds), teamCount: 2, playersPerTeam: input.playersPerTeam });
          const starterSet = new Set(starterIds);
          const waitingIds = [
            ...fullOrder.slice(minimumPresent),
            ...input.playerIds.filter((id) => !starterSet.has(id) && !fullOrder.includes(id)),
          ];
          const waitingTeams = Array.from({ length: Math.max(0, input.teamCount - 2) }, (_, index) =>
            waitingIds.slice(index * input.playersPerTeam, (index + 1) * input.playersPerTeam));
          return {
            success: true,
            teams: [...starterResult.teams, ...waitingTeams],
            teamSummaries: starterResult.teamSummaries,
            missingOverallCount: starterResult.missingOverallCount,
            missingSpeedCount: starterResult.missingSpeedCount,
            balanceScore: starterResult.balanceScore,
            attendanceOrder: fullOrder,
          };
        }
        const result = drawTeamsAdaptive({
          players: makePlayers(input.playerIds),
          teamCount: input.teamCount,
          playersPerTeam: input.playersPerTeam,
        });
        return { success: true, ...result, attendanceOrder: [] };
      });
    },
  };
}
