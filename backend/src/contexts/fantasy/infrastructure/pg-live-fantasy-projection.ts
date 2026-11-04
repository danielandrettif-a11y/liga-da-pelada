import type { PoolClient } from "pg";
import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "../domain/config.js";
import {
  projectFantasyLiveLineups,
  projectFantasyLiveStats,
  type FantasyLiveMatch,
} from "../domain/live-projection.js";

type ProjectionRow = ReturnType<typeof projectFantasyLiveLineups>[number];
type StoredProjectionPlayer = {
  player_id: string;
  slot_role: string | null;
  total_points: number | string | null;
};

export type FantasyLiveProjectionReadModel = {
  roundId: string;
  fantasyRoundId: string;
  isLive: boolean;
  byUserId: Map<string, ProjectionRow>;
  storedPlayersByUserId: Map<string, StoredProjectionPlayer[]>;
  statsByPlayer: ReturnType<typeof projectFantasyLiveStats>;
  settings: FantasySettings;
  matches: FantasyLiveMatch[];
  round: {
    number: number;
    date: string | null;
    status: string;
    marketStatus: string;
  };
};

const settingKeys = {
  goalPoints: "goal_points",
  attackerGoalPoints: "attacker_goal_points",
  attackerAssistPoints: "attacker_assist_points",
  defenderGoalPoints: "defender_goal_points",
  defenderAssistPoints: "defender_assist_points",
  defenderCleanSheetPoints: "defender_clean_sheet_points",
  defenderOneGoalPoints: "defender_one_goal_points",
  defenderOneGoalConcededPoints: "defender_one_goal_conceded_points",
  defenderTwoGoalsConcededPoints: "defender_two_goals_conceded_points",
  lineGoalConcededPoints: "line_goal_conceded_points",
  assistPoints: "assist_points",
  winPoints: "win_points",
  drawPoints: "draw_points",
  lossPoints: "loss_points",
  goalkeeperLossPoints: "goalkeeper_loss_points",
  goalkeeperAppearancePoints: "goalkeeper_appearance_points",
  goalConcededPoints: "goal_conceded_points",
  goalkeeperSlotAppearancePoints: "goalkeeper_slot_appearance_points",
  goalkeeperSlotGoalConcededPoints: "goalkeeper_slot_goal_conceded_points",
  goalkeeperSlotCleanSheetPoints: "goalkeeper_slot_clean_sheet_points",
  goalkeeperSlotOneGoalPoints: "goalkeeper_slot_one_goal_points",
  teamGoalConcededPoints: "team_goal_conceded_points",
  ownGoalPoints: "own_goal_points",
  captainMultiplier: "captain_multiplier",
  topScorerPredictionPoints: "top_scorer_prediction_points",
  topAssistPredictionPoints: "top_assist_prediction_points",
} as const satisfies Partial<Record<keyof FantasySettings, string>>;

function fantasySettings(round: any, stored: any): FantasySettings {
  const snapshot = round.settings_snapshot || {};
  const result: FantasySettings = {
    ...DEFAULT_FANTASY_SETTINGS,
    scoringVersion: Number(snapshot.scoring_version ?? round.scoring_version ?? DEFAULT_FANTASY_SETTINGS.scoringVersion),
    roleScoringActive: snapshot.role_scoring_active !== false,
    suppressGoalkeeperRewards: Boolean(round.suppress_goalkeeper_rewards),
  };
  for (const [property, column] of Object.entries(settingKeys) as Array<[keyof typeof settingKeys, string]>) {
    const fallback = DEFAULT_FANTASY_SETTINGS[property] as number | undefined;
    (result as Record<string, unknown>)[property] = Number(snapshot[column] ?? stored?.[column] ?? fallback ?? 0);
  }
  return result;
}

function grouped<T extends { match_id: string }>(rows: T[]) {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(row.match_id, [...(result.get(row.match_id) || []), row]);
  return result;
}

export async function readLiveFantasyProjection(
  client: PoolClient,
  input: { leagueId: string; fantasySeasonId: string; targetRoundId?: string },
): Promise<FantasyLiveProjectionReadModel | null> {
  const roundResult = await client.query<any>(
    `SELECT fantasy_round.id, fantasy_round.round_id, fantasy_round.market_status,
            fantasy_round.scoring_version, fantasy_round.settings_snapshot,
            round_item.status, round_item.suppress_goalkeeper_rewards, round_item.date,
            round_item.start_time, round_item.number
     FROM public.fantasy_rounds fantasy_round
     JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
     WHERE fantasy_round.fantasy_season_id=$1::uuid
       AND ($2::uuid IS NOT NULL OR fantasy_round.market_status IN ('open','in_progress'))
       AND ($2::uuid IS NULL OR fantasy_round.round_id=$2::uuid)
     ORDER BY CASE WHEN round_item.status<>'finished' AND fantasy_round.market_status IN ('open','in_progress') THEN 0 ELSE 1 END,
       round_item.date DESC, round_item.number DESC LIMIT 1`,
    [input.fantasySeasonId, input.targetRoundId || null],
  );
  const round = roundResult.rows[0];
  if (!round || (!input.targetRoundId && round.status === "finished")) return null;

  const [settingsResult, lineupsResult, membersResult, matchesResult] = await Promise.all([
    client.query<any>("SELECT * FROM public.fantasy_settings WHERE league_id=$1::uuid LIMIT 1", [input.leagueId]),
    client.query<any>(
      `SELECT lineup.id,lineup.user_id,lineup.status,lineup.score_breakdown,lineup.captain_player_id,
              lineup.top_scorer_player_id,lineup.top_assist_player_id,
              COALESCE(players.items,'[]'::jsonb) players,COALESCE(reserves.items,'[]'::jsonb) reserves
       FROM public.fantasy_lineups lineup
       LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('player_id',item.player_id,
         'slot_role',item.slot_role,'player_profile_locked',item.player_profile_locked,
         'total_points',item.total_points) ORDER BY item.slot_index) items
         FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id) players ON true
       LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('player_id',reserve.player_id,'slot_role',reserve.slot_role)) items
         FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id=lineup.id) reserves ON true
       WHERE lineup.fantasy_round_id=$1::uuid`, [round.id]),
    client.query<any>(
      `SELECT member.player_id,member.player_profile,player.member_category,player.is_selectable
       FROM public.league_members member JOIN public.players player ON player.id=member.player_id
       WHERE member.league_id=$1::uuid AND member.is_active=true`, [input.leagueId]),
    client.query<any>(
      `SELECT id,status,team_a_id,team_b_id,score_a,score_b,duration_seconds,
              timer_accumulated_seconds,eligibility_elapsed_offset_seconds,timer_started_at
       FROM public.matches WHERE round_id=$1::uuid`, [round.round_id]),
  ]);

  const matchIds = matchesResult.rows.map((item: any) => item.id);
  const empty = { rows: [] as any[] };
  const [eventsResult, playersResult, goalkeepersResult, stintsResult] = matchIds.length ? await Promise.all([
    client.query<any>(`SELECT match_id,player_id,assist_player_id,team_id,is_own_goal,
      goalkeeper_a_player_id,goalkeeper_b_player_id FROM public.match_events
      WHERE match_id=ANY($1::uuid[]) AND event_type='goal'`, [matchIds]),
    client.query<any>(`SELECT match_id,player_id,team_id,result_eligible,scoring_eligible
      FROM public.match_players WHERE match_id=ANY($1::uuid[])`, [matchIds]),
    client.query<any>(`SELECT match_id,player_id,team_id FROM public.match_goalkeepers WHERE match_id=ANY($1::uuid[])`, [matchIds]),
    client.query<any>(`SELECT match_id,player_id,team_id,entered_elapsed_seconds,left_elapsed_seconds,selected_at
      FROM public.match_goalkeeper_stints WHERE match_id=ANY($1::uuid[])`, [matchIds]),
  ]) : [empty, empty, empty, empty];

  const eventsByMatch = grouped(eventsResult.rows);
  const playersByMatch = grouped(playersResult.rows);
  const goalkeepersByMatch = grouped(goalkeepersResult.rows);
  const stintsByMatch = grouped(stintsResult.rows);
  const profileByPlayer = new Map(membersResult.rows.map((item: any) => [item.player_id, item.player_profile]));
  const eligiblePredictionPlayerIds = new Set<string>(membersResult.rows
    .filter((item: any) => item.member_category === "player" && item.is_selectable)
    .map((item: any) => String(item.player_id)));
  const settings = fantasySettings(round, settingsResult.rows[0]);
  const matches: FantasyLiveMatch[] = matchesResult.rows.map((match: any) => {
    const events = eventsByMatch.get(match.id) || [];
    const accumulated = Number(match.eligibility_elapsed_offset_seconds || 0) + Number(match.timer_accumulated_seconds || 0);
    const running = match.timer_started_at
      ? Math.max(0, Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000))
      : 0;
    return {
      id: match.id,
      status: match.status,
      teamAId: match.team_a_id,
      teamBId: match.team_b_id,
      scoreA: Number(match.score_a || 0),
      scoreB: Number(match.score_b || 0),
      players: (playersByMatch.get(match.id) || []).map((item: any) => ({
        playerId: item.player_id, teamId: item.team_id, resultEligible: Boolean(item.result_eligible),
        scoringEligible: item.scoring_eligible !== false, playerProfile: profileByPlayer.get(item.player_id) || null,
      })),
      goalkeepers: (goalkeepersByMatch.get(match.id) || []).map((item: any) => ({ playerId: item.player_id, teamId: item.team_id })),
      goalkeeperStints: (stintsByMatch.get(match.id) || []).map((item: any) => ({
        playerId: item.player_id, teamId: item.team_id, enteredElapsedSeconds: Number(item.entered_elapsed_seconds || 0),
        leftElapsedSeconds: item.left_elapsed_seconds, selectedAt: item.selected_at,
      })),
      officialElapsedSeconds: accumulated + running,
      durationSeconds: Number(match.duration_seconds || 0),
      events: events.map((item: any) => ({ playerId: item.player_id, assistPlayerId: item.assist_player_id,
        teamId: item.team_id, isOwnGoal: Boolean(item.is_own_goal), goalkeeperAPlayerId: item.goalkeeper_a_player_id,
        goalkeeperBPlayerId: item.goalkeeper_b_player_id })),
    };
  });
  const stats = projectFantasyLiveStats(matches, settings, {
    suppressGoalkeeperRewards: Boolean(round.suppress_goalkeeper_rewards),
  });
  const projections = projectFantasyLiveLineups(lineupsResult.rows
    .filter((lineup: any) => lineup.players?.length > 0)
    .map((lineup: any) => ({
      id: lineup.id, userId: lineup.user_id, playerIds: lineup.players.map((item: any) => item.player_id),
      slots: lineup.players.filter((item: any) => item.slot_role).map((item: any) => ({
        playerId: item.player_id, slotRole: item.slot_role, playerProfile: item.player_profile_locked,
      })),
      captainPlayerId: lineup.captain_player_id, topScorerPlayerId: lineup.top_scorer_player_id,
      topAssistPlayerId: lineup.top_assist_player_id, cardBonus: Number(lineup.score_breakdown?.cardBonus || 0),
      reserve: lineup.reserves?.[0] ? { playerId: lineup.reserves[0].player_id, slotRole: lineup.reserves[0].slot_role } : null,
    })), stats, settings, eligiblePredictionPlayerIds);
  return { roundId: round.round_id, fantasyRoundId: round.id,
    isLive: round.market_status !== "finished" && round.status !== "finished",
    byUserId: new Map(projections.map((item) => [item.userId, item])),
    storedPlayersByUserId: new Map(lineupsResult.rows.map((item: any) => [item.user_id, item.players || []])),
    statsByPlayer: stats, settings, matches,
    round: { number: Number(round.number || 0), date: round.date || null,
      status: round.status, marketStatus: round.market_status } };
}
