import { isParticipantScoringEligible } from "@/lib/scoring-eligibility";
import { projectFantasyLiveLineups, projectFantasyLiveStats } from "@/lib/fantasy/live-projection";
import type { FantasySettings } from "@/lib/fantasy/config";

export function normalizeLiveMatchSnapshots<T extends { match_players?: Array<Record<string, any>> }>(
  matches: T[],
  roundNumber?: number | null,
): T[] {
  return matches.map((match) => ({
    ...match,
    match_players: (match.match_players || []).map((player) => ({
      ...player,
      scoring_eligible: isParticipantScoringEligible(roundNumber, player.scoring_eligible),
    })),
  }));
}

// The dashboard counts only events belonging to the matches in its selected round.
export function dashboardEventsFromSnapshots(matches: any[], selectedMatchIds: string[]) {
  const selected = new Set(selectedMatchIds);
  return matches.flatMap((match) => selected.has(match.id)
    ? (match.match_events || []).map((event: any) => ({
        player_id: event.player_id,
        assist_player_id: event.assist_player_id,
        is_own_goal: event.is_own_goal,
      }))
    : []);
}

export function fantasyGoalkeeperTimeline(match: any) {
  return {
    goalkeeperStints: (match.match_goalkeeper_stints || []).map((item: any) => ({
      playerId: item.player_id, teamId: item.team_id,
      enteredElapsedSeconds: Number(item.entered_elapsed_seconds || 0),
      leftElapsedSeconds: item.left_elapsed_seconds, selectedAt: item.selected_at,
    })),
    officialElapsedSeconds: Number(match.eligibility_elapsed_offset_seconds || 0)
      + Number(match.timer_accumulated_seconds || 0)
      + (match.timer_started_at ? Math.max(0, Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000)) : 0),
    durationSeconds: Number(match.duration_seconds || 0),
    events: (match.match_events || []).map((item: any) => ({
      playerId: item.player_id, assistPlayerId: item.assist_player_id, teamId: item.team_id,
      isOwnGoal: Boolean(item.is_own_goal), goalkeeperAPlayerId: item.goalkeeper_a_player_id,
      goalkeeperBPlayerId: item.goalkeeper_b_player_id,
    })),
  };
}

export function buildLiveLineupProjections(input: {
  matches: any[]; lineups: any[]; memberships: any[]; settings: FantasySettings; suppressGoalkeeperRewards: boolean;
}) {
  const members = input.memberships.map((membership) => {
    const player = Array.isArray(membership.players) ? membership.players[0] : membership.players;
    return { ...player, id: membership.player_id, player_profile: membership.player_profile };
  });
  const profiles = new Map(members.map((player) => [player.id, player.player_profile]));
  const eligible = new Set<string>(members.filter((player) => player.member_category === "player" && player.is_selectable).map((player) => String(player.id)));
  const stats = projectFantasyLiveStats(input.matches.map((match) => ({
    id: match.id, status: match.status, teamAId: match.team_a_id, teamBId: match.team_b_id,
    scoreA: Number(match.score_a || 0), scoreB: Number(match.score_b || 0),
    players: (match.match_players || []).map((item: any) => ({ playerId: item.player_id, teamId: item.team_id,
      resultEligible: Boolean(item.result_eligible), scoringEligible: item.scoring_eligible !== false,
      playerProfile: profiles.get(item.player_id) || null })),
    goalkeepers: (match.match_goalkeepers || []).map((item: any) => ({ playerId: item.player_id, teamId: item.team_id })),
    ...fantasyGoalkeeperTimeline(match),
  })), input.settings, { suppressGoalkeeperRewards: input.suppressGoalkeeperRewards });
  const projections = projectFantasyLiveLineups(input.lineups
    .filter((lineup) => (lineup.fantasy_lineup_players || []).length > 0)
    .map((lineup) => ({
      id: lineup.id, userId: lineup.user_id,
      playerIds: lineup.fantasy_lineup_players.map((player: any) => player.player_id),
      slots: lineup.fantasy_lineup_players.filter((player: any) => player.slot_role).map((player: any) => ({
        playerId: player.player_id, slotRole: player.slot_role, playerProfile: player.player_profile_locked,
      })),
      captainPlayerId: lineup.captain_player_id, topScorerPlayerId: lineup.top_scorer_player_id,
      topAssistPlayerId: lineup.top_assist_player_id, cardBonus: Number(lineup.score_breakdown?.cardBonus || 0),
      reserve: lineup.fantasy_lineup_reserves?.[0] ? {
        playerId: lineup.fantasy_lineup_reserves[0].player_id, slotRole: lineup.fantasy_lineup_reserves[0].slot_role,
      } : null,
    })), stats, input.settings, eligible);
  return { stats, projections };
}
