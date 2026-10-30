import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { RoundStatisticsRepository } from "../application/manage-round-statistics.js";
import {
  buildRoundStatistics,
  calculateRoundStatRows,
  parseRoundRankingRoleWeights,
  type FriendlyStatsEntry,
  type RoundCalculationContext,
  type StatisticsPlayer,
} from "../domain/round-statistics.js";
import { normalizeBQScoringSnapshot } from "../domain/scoring-policy.js";

export class RoundStatisticsPersistenceError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "RoundStatisticsPersistenceError";
  }
}

async function requireLeagueAdmin(client: PoolClient, leagueId: string) {
  const result = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed",
    [leagueId],
  );
  if (result.rows[0]?.allowed !== true) {
    throw new RoundStatisticsPersistenceError("Somente administradores podem recalcular estatísticas.", 403);
  }
}

function playerFromView(row: Record<string, unknown>): StatisticsPlayer {
  return {
    id: String(row.player_id),
    name: String(row.player_name || ""),
    nickname: typeof row.player_nickname === "string" ? row.player_nickname : null,
    avatar_url: typeof row.player_avatar_url === "string" ? row.player_avatar_url : null,
    player_profile: typeof row.player_profile === "string" ? row.player_profile : null,
    is_goalkeeper: Boolean(row.player_is_goalkeeper),
    member_category: typeof row.player_member_category === "string" ? row.player_member_category : null,
    is_selectable: row.player_is_selectable !== false,
  };
}

async function loadCalculationContext(
  client: PoolClient,
  leagueId: string,
  roundId: string,
): Promise<RoundCalculationContext> {
  const roundResult = await client.query<any>(
    `SELECT id, league_id, date, number, created_at, status, round_type,
            suppress_goalkeeper_rewards, scoring_version, scoring_snapshot
     FROM public.rounds
     WHERE id = $1::uuid AND league_id = $2::uuid
     LIMIT 1`,
    [roundId, leagueId],
  );
  if (!roundResult.rows[0]) throw new RoundStatisticsPersistenceError("Rodada não encontrada nesta pelada.", 404);
  const round = roundResult.rows[0];

  const [roundPlayersResult, matchesResult] = await Promise.all([
    client.query<any>(
      `SELECT player_id, player_profile_locked, profile_decision_source,
              profile_appearance_number, profile_def_overall, profile_ata_overall
       FROM public.round_players WHERE round_id = $1::uuid`,
      [roundId],
    ),
    client.query<any>(
      `SELECT id, status, team_a_id, team_b_id, score_a, score_b, duration_seconds,
              timer_accumulated_seconds, eligibility_elapsed_offset_seconds
       FROM public.matches WHERE round_id = $1::uuid`,
      [roundId],
    ),
  ]);
  const playerIds = roundPlayersResult.rows.map((row: any) => row.player_id);
  const matchIds = matchesResult.rows.map((row: any) => row.id);
  const empty = { rows: [] as any[] };
  const [eventsResult, participantsResult, goalkeepersResult, stintsResult, membersResult, overridesResult] = await Promise.all([
    matchIds.length ? client.query<any>(
      `SELECT match_id, event_type, player_id, assist_player_id, team_id,
              goalkeeper_a_player_id, goalkeeper_b_player_id, is_own_goal
       FROM public.match_events WHERE match_id = ANY($1::uuid[])`, [matchIds],
    ) : Promise.resolve(empty),
    matchIds.length ? client.query<any>(
      `SELECT match_id, player_id, team_id, result_eligible, scoring_eligible
       FROM public.match_players WHERE match_id = ANY($1::uuid[])`, [matchIds],
    ) : Promise.resolve(empty),
    matchIds.length ? client.query<any>(
      `SELECT match_id, player_id, team_id FROM public.match_goalkeepers
       WHERE match_id = ANY($1::uuid[])`, [matchIds],
    ) : Promise.resolve(empty),
    matchIds.length ? client.query<any>(
      `SELECT match_id, player_id, team_id, entered_elapsed_seconds, left_elapsed_seconds, selected_at
       FROM public.match_goalkeeper_stints WHERE match_id = ANY($1::uuid[])`, [matchIds],
    ) : Promise.resolve(empty),
    playerIds.length ? client.query<any>(
      `SELECT player.id, player.name, player.avatar_url, player.member_category, player.is_selectable,
              membership.player_profile, membership.overall_traits
       FROM public.league_members membership
       JOIN public.players player ON player.id = membership.player_id
       WHERE membership.league_id = $1::uuid AND membership.is_active = true
         AND membership.player_id = ANY($2::uuid[])`, [leagueId, playerIds],
    ) : Promise.resolve(empty),
    client.query<any>(
      `SELECT player_id FROM public.player_round_stat_overrides
       WHERE round_id = $1::uuid AND override_type = 'zero_points'`, [roundId],
    ),
  ]);

  const scoring = normalizeBQScoringSnapshot(round.scoring_snapshot);
  const frozenRoleWeights = new Map<string, ReturnType<typeof parseRoundRankingRoleWeights>>();
  const playersWithPriorOfficialRound = new Set<string>();
  const overallPositions = new Map<string, { DEF: number; ALA_MEI: number; ATA: number }>();
  if (Number(scoring.version) < 11 && playerIds.length) {
    const [frozenResult, historyResult, overallResult] = await Promise.all([
      client.query<any>(
        `SELECT player_id, ranking_role_weights FROM public.player_round_stats
         WHERE round_id = $1::uuid AND player_id = ANY($2::uuid[])`, [roundId, playerIds],
      ),
      client.query<any>(
        `SELECT stats.player_id, previous.id, previous.date, previous.created_at
         FROM public.player_round_stats stats
         JOIN public.rounds previous ON previous.id = stats.round_id
         WHERE stats.league_id = $1::uuid AND stats.player_id = ANY($2::uuid[]) AND stats.games > 0
           AND previous.id != $3::uuid AND previous.round_type = 'official' AND previous.status = 'finished'
           AND (previous.date, previous.created_at, previous.id) < ($4::date, $5::timestamptz, $3::uuid)`,
        [leagueId, playerIds, roundId, round.date, round.created_at],
      ),
      client.query<any>("SELECT * FROM public.get_latest_player_card_overalls_for_league($1::uuid)", [leagueId]),
    ]);
    for (const row of frozenResult.rows) frozenRoleWeights.set(row.player_id, parseRoundRankingRoleWeights(row.ranking_role_weights));
    for (const row of historyResult.rows) playersWithPriorOfficialRound.add(row.player_id);
    for (const row of overallResult.rows) {
      const values = { DEF: Number(row.def_overall), ALA_MEI: Number(row.ala_mei_overall), ATA: Number(row.ata_overall) };
      if (Object.values(values).every(Number.isFinite)) overallPositions.set(row.player_id, values);
    }
  }

  const group = <T extends { match_id: string }>(rows: T[], matchId: string) => rows.filter((row) => row.match_id === matchId);
  return {
    round: {
      ...round,
      round_players: roundPlayersResult.rows,
      matches: matchesResult.rows.map((match: any) => ({
        ...match,
        match_events: group(eventsResult.rows, match.id),
        match_players: group(participantsResult.rows, match.id),
        match_goalkeepers: group(goalkeepersResult.rows, match.id),
        match_goalkeeper_stints: group(stintsResult.rows, match.id),
      })),
    },
    players: membersResult.rows.map((player: any) => {
      const traits = Array.isArray(player.overall_traits) ? player.overall_traits : [];
      return {
        ...player,
        overall_traits: traits,
        is_competitive_profile_complete: player.member_category === "player" && player.is_selectable === true
          && Boolean(String(player.name || "").trim()) && Boolean(String(player.avatar_url || "").trim())
          && ["defensive", "offensive"].includes(player.player_profile) && traits.length >= 1 && traits.length <= 2,
      };
    }),
    frozenRoleWeights,
    playersWithPriorOfficialRound,
    overallPositions,
    voidedPlayerIds: new Set(overridesResult.rows.map((row: any) => row.player_id)),
  };
}

async function upsertRows(client: PoolClient, rows: ReturnType<typeof calculateRoundStatRows>) {
  const sql = `INSERT INTO public.player_round_stats (
      player_id, round_id, league_id, games, wins, draws, losses, goals, assists,
      goalkeeper_games, goalkeeper_goals, goalkeeper_assists, goalkeeper_own_goals,
      goalkeeper_wins, goalkeeper_draws, goalkeeper_losses, clean_sheets, goals_conceded,
      defensive_clean_games, defensive_one_goal_games, ranking_defensive_clean_games,
      ranking_defensive_one_goal_games, own_goals, team_goals_conceded, player_profile_locked,
      profile_decision_source, profile_appearance_number, profile_def_overall, profile_ata_overall,
      points, ranking_role_weights, ranking_position_bonus
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb,$32
    ) ON CONFLICT (player_id, round_id) DO UPDATE SET
      league_id=EXCLUDED.league_id, games=EXCLUDED.games, wins=EXCLUDED.wins, draws=EXCLUDED.draws,
      losses=EXCLUDED.losses, goals=EXCLUDED.goals, assists=EXCLUDED.assists,
      goalkeeper_games=EXCLUDED.goalkeeper_games, goalkeeper_goals=EXCLUDED.goalkeeper_goals,
      goalkeeper_assists=EXCLUDED.goalkeeper_assists, goalkeeper_own_goals=EXCLUDED.goalkeeper_own_goals,
      goalkeeper_wins=EXCLUDED.goalkeeper_wins, goalkeeper_draws=EXCLUDED.goalkeeper_draws,
      goalkeeper_losses=EXCLUDED.goalkeeper_losses, clean_sheets=EXCLUDED.clean_sheets,
      goals_conceded=EXCLUDED.goals_conceded, defensive_clean_games=EXCLUDED.defensive_clean_games,
      defensive_one_goal_games=EXCLUDED.defensive_one_goal_games,
      ranking_defensive_clean_games=EXCLUDED.ranking_defensive_clean_games,
      ranking_defensive_one_goal_games=EXCLUDED.ranking_defensive_one_goal_games,
      own_goals=EXCLUDED.own_goals, team_goals_conceded=EXCLUDED.team_goals_conceded,
      player_profile_locked=EXCLUDED.player_profile_locked, profile_decision_source=EXCLUDED.profile_decision_source,
      profile_appearance_number=EXCLUDED.profile_appearance_number, profile_def_overall=EXCLUDED.profile_def_overall,
      profile_ata_overall=EXCLUDED.profile_ata_overall, points=EXCLUDED.points,
      ranking_role_weights=EXCLUDED.ranking_role_weights, ranking_position_bonus=EXCLUDED.ranking_position_bonus`;
  for (const row of rows) await client.query(sql, [
    row.player_id, row.round_id, row.league_id, row.games, row.wins, row.draws, row.losses, row.goals, row.assists,
    row.goalkeeper_games, row.goalkeeper_goals, row.goalkeeper_assists, row.goalkeeper_own_goals,
    row.goalkeeper_wins, row.goalkeeper_draws, row.goalkeeper_losses, row.clean_sheets, row.goals_conceded,
    row.defensive_clean_games, row.defensive_one_goal_games, row.ranking_defensive_clean_games,
    row.ranking_defensive_one_goal_games, row.own_goals, row.team_goals_conceded, row.player_profile_locked,
    row.profile_decision_source, row.profile_appearance_number, row.profile_def_overall, row.profile_ata_overall,
    row.points, JSON.stringify(row.ranking_role_weights), row.ranking_position_bonus,
  ]);
}

export function pgRoundStatisticsRepository(pool: Pool): RoundStatisticsRepository {
  return {
    async recalculateRoundStats(actor: Actor, leagueId: string, roundId: string) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          await requireLeagueAdmin(client, leagueId);
          const context = await loadCalculationContext(client, leagueId, roundId);
          await upsertRows(client, calculateRoundStatRows(context));
          if (context.round.status === "finished" && context.round.round_type === "official") {
            await client.query("SELECT public.reconcile_fantasy_round_totals($1::uuid)", [roundId]);
          }
        });
      } catch (error) {
        if (error instanceof RoundStatisticsPersistenceError) throw error;
        throw new RoundStatisticsPersistenceError(error instanceof Error ? error.message : "Erro ao recalcular estatísticas.");
      }
    },

    async findRoundStatistics(actor: Actor, leagueId: string, roundId: string) {
      return withAuthenticatedTransaction(pool, actor, async (client) => {
        const round = await client.query<{ id: string; status: string; round_type: string }>(
          `SELECT id, status, round_type FROM public.rounds
           WHERE id = $1::uuid AND league_id = $2::uuid LIMIT 1`, [roundId, leagueId],
        );
        if (!round.rows[0] || round.rows[0].status !== "finished") return null;
        const stats = await client.query<any>(
          `SELECT stats.games, stats.wins, stats.draws, stats.losses, stats.goals, stats.assists,
                  COALESCE(stats.ranking_points, stats.points, 0)::float AS points,
                  row_to_json(player) AS player
           FROM public.player_round_stats stats
           JOIN public.players player ON player.id = stats.player_id
           WHERE stats.round_id = $1::uuid AND stats.league_id = $2::uuid`, [roundId, leagueId],
        );
        return buildRoundStatistics({ roundId, roundType: round.rows[0].round_type, rows: stats.rows });
      });
    },

    async findFriendlyStats(actor: Actor, leagueId: string): Promise<FriendlyStatsEntry[]> {
      return withAuthenticatedTransaction(pool, actor, async (client) => {
        const season = await client.query<{ id: string }>(
          "SELECT id FROM public.seasons WHERE league_id = $1::uuid AND status = 'active' LIMIT 1",
          [leagueId],
        );
        if (!season.rows[0]) return [];
        const seasonId = season.rows[0].id;
        const [view, rounds] = await Promise.all([
          client.query<any>(
            `SELECT * FROM public.player_season_stats
             WHERE season_id = $1::uuid AND round_type = 'friendly'
               AND player_is_selectable = true AND player_member_category = ANY($2::text[])`,
            [seasonId, ["player", "guest"]],
          ),
          client.query<{ best_goalkeeper_player_id: string | null }>(
            `SELECT best_goalkeeper_player_id FROM public.rounds
             WHERE season_id = $1::uuid AND round_type = 'friendly' AND status = 'finished'`, [seasonId],
          ),
        ]);
        const goalkeeperCounts = new Map<string, number>();
        for (const round of rounds.rows) if (round.best_goalkeeper_player_id) {
          goalkeeperCounts.set(round.best_goalkeeper_player_id, (goalkeeperCounts.get(round.best_goalkeeper_player_id) || 0) + 1);
        }
        return view.rows.map((row: any) => ({
          player: playerFromView(row), rounds: Number(row.rounds_count || 0), games: Number(row.games || 0),
          wins: Number(row.wins || 0), draws: Number(row.draws || 0), losses: Number(row.losses || 0),
          goals: Number(row.goals || 0), assists: Number(row.assists || 0),
          bestGoalkeeper: goalkeeperCounts.get(row.player_id) || 0,
        })).sort((a, b) => a.player.name.localeCompare(b.player.name, "pt-BR"));
      });
    },
  };
}
