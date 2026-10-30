import {
  calculateRankedPoints,
  normalizeBQScoringSnapshot,
} from "./scoring-policy.js";

export type StatisticsPlayer = {
  id: string;
  name: string;
  nickname?: string | null;
  avatar_url?: string | null;
  player_profile?: string | null;
  is_goalkeeper?: boolean;
  member_category?: string | null;
  is_selectable?: boolean;
};

export type RoundStatisticEntry = {
  player: StatisticsPlayer;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  winRate: number;
  isBestGoalkeeper: boolean;
};

export type RoundStatistics = {
  roundId: string;
  roundType: "official" | "friendly";
  entries: RoundStatisticEntry[];
  highlights: {
    scorers: RoundStatisticEntry[];
    assisters: RoundStatisticEntry[];
    topPoints: RoundStatisticEntry[];
    goalkeepers: RoundStatisticEntry[];
  };
};

export type FriendlyStatsEntry = {
  player: StatisticsPlayer;
  rounds: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  bestGoalkeeper: number;
};

export function buildRoundStatistics(input: {
  roundId: string;
  roundType: string;
  bestGoalkeeperPlayerId?: string | null;
  rows: Array<{
    player: StatisticsPlayer;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    points: number;
  }>;
}): RoundStatistics {
  const entries = input.rows
    .filter((row) => row.player && Number(row.games || 0) > 0)
    .map((row) => {
      const games = Number(row.games || 0);
      const wins = Number(row.wins || 0);
      const draws = Number(row.draws || 0);
      return {
        player: row.player,
        games,
        wins,
        draws,
        losses: Number(row.losses || 0),
        goals: Number(row.goals || 0),
        assists: Number(row.assists || 0),
        points: Number(row.points || 0),
        winRate: Math.round(((wins * 3 + draws) / (games * 3)) * 100),
        isBestGoalkeeper: row.player.id === input.bestGoalkeeperPlayerId,
      };
    })
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.points - a.points
      || a.player.name.localeCompare(b.player.name, "pt-BR"));

  const leaders = (key: "goals" | "assists" | "points", requirePositive = true) => {
    const maximum = Math.max(0, ...entries.map((entry) => entry[key]));
    if (requirePositive && maximum <= 0) return [];
    return entries.filter((entry) => entry[key] === maximum);
  };

  return {
    roundId: input.roundId,
    roundType: input.roundType === "friendly" ? "friendly" : "official",
    entries,
    highlights: {
      scorers: leaders("goals"),
      assisters: leaders("assists"),
      topPoints: input.roundType === "friendly" ? [] : leaders("points"),
      goalkeepers: entries.filter((entry) => entry.isBestGoalkeeper),
    },
  };
}

export type RankingRoleWeight = { role: "DEF" | "MEI" | "ATA"; overall: number; weight: 1 | 0.5 };
export type RoundStatRow = {
  player_id: string; round_id: string; league_id: string;
  games: number; wins: number; draws: number; losses: number; goals: number; assists: number;
  goalkeeper_games: number; goalkeeper_goals: number; goalkeeper_assists: number;
  goalkeeper_own_goals: number; goalkeeper_wins: number; goalkeeper_draws: number;
  goalkeeper_losses: number; clean_sheets: number; goals_conceded: number;
  defensive_clean_games: number; defensive_one_goal_games: number;
  ranking_defensive_clean_games: number; ranking_defensive_one_goal_games: number;
  own_goals: number; team_goals_conceded: number;
  player_profile_locked: string | null; profile_decision_source: string | null;
  profile_appearance_number: number | null; profile_def_overall: number | null; profile_ata_overall: number | null;
  ranking_role_weights: RankingRoleWeight[]; ranking_position_bonus: number; points: number;
};

export type RoundCalculationContext = {
  round: {
    id: string; league_id: string; date: string; created_at: string; number: number; status: string;
    round_type: string; suppress_goalkeeper_rewards: boolean; scoring_version: number;
    scoring_snapshot: Record<string, unknown> | null;
    round_players: Array<{
      player_id: string; player_profile_locked: string | null; profile_decision_source: string | null;
      profile_appearance_number: number | null; profile_def_overall: number | null; profile_ata_overall: number | null;
    }>;
    matches: Array<{
      id: string; status: string; team_a_id: string; team_b_id: string; score_a: number; score_b: number;
      duration_seconds: number; timer_accumulated_seconds: number; eligibility_elapsed_offset_seconds: number;
      match_events: Array<{
        event_type: string; player_id: string; assist_player_id: string | null; team_id: string;
        goalkeeper_a_player_id: string | null; goalkeeper_b_player_id: string | null; is_own_goal: boolean;
      }>;
      match_players: Array<{ player_id: string; team_id: string; result_eligible: boolean; scoring_eligible: boolean | null }>;
      match_goalkeepers: Array<{ player_id: string; team_id: string }>;
      match_goalkeeper_stints: Array<{
        player_id: string; team_id: string; entered_elapsed_seconds: number;
        left_elapsed_seconds: number | null; selected_at: string;
      }>;
    }>;
  };
  players: Array<{
    id: string; name: string; avatar_url: string | null; member_category: string; is_selectable: boolean;
    player_profile: string | null; overall_traits: string[]; is_competitive_profile_complete: boolean;
  }>;
  frozenRoleWeights: Map<string, RankingRoleWeight[]>;
  playersWithPriorOfficialRound: Set<string>;
  overallPositions: Map<string, { DEF: number; ALA_MEI: number; ATA: number }>;
  voidedPlayerIds: Set<string>;
};

type GoalkeeperScout = {
  playerId: string; teamId: string; goalkeeperGames: number; goalsConceded: number; cleanSheets: number;
  goalkeeperGoals: number; goalkeeperAssists: number; goalkeeperOwnGoals: number;
  goalkeeperWins: number; goalkeeperDraws: number; goalkeeperLosses: number;
};

function calculateGoalkeeperScouts(match: RoundCalculationContext["round"]["matches"][number]) {
  const goalEvents = match.match_events.filter((event) => event.event_type === "goal");
  const stints = match.match_goalkeeper_stints || [];
  const legacy = stints.length === 0;
  const source = legacy
    ? match.match_goalkeepers.map((item) => ({ ...item, entered_elapsed_seconds: 0, left_elapsed_seconds: null, selected_at: "" }))
    : stints;
  const officialElapsed = Math.max(0, Number(match.timer_accumulated_seconds || 0)
    + Number(match.eligibility_elapsed_offset_seconds || 0));
  const actualDuration = Math.max(0, officialElapsed || Number(match.duration_seconds || 0));
  const lastByTeam = new Map<string, typeof source[number]>();
  for (const stint of source) {
    const previous = lastByTeam.get(stint.team_id);
    if (!previous || Number(stint.entered_elapsed_seconds) > Number(previous.entered_elapsed_seconds)
      || (Number(stint.entered_elapsed_seconds) === Number(previous.entered_elapsed_seconds)
        && String(stint.selected_at || "") >= String(previous.selected_at || ""))) lastByTeam.set(stint.team_id, stint);
  }
  const stats = new Map<string, GoalkeeperScout>();
  const seconds = new Map<string, number>();
  for (const stint of source) {
    const start = Math.max(0, Number(stint.entered_elapsed_seconds || 0));
    const end = stint.left_elapsed_seconds == null ? actualDuration : Math.max(start, Number(stint.left_elapsed_seconds));
    const played = Math.max(0, end - start);
    const recorded = goalEvents.some((event) => event.goalkeeper_a_player_id === stint.player_id
      || event.goalkeeper_b_player_id === stint.player_id);
    if (!legacy && match.status === "finished" && played === 0 && !recorded
      && !(officialElapsed === 0 && lastByTeam.get(stint.team_id) === stint)) continue;
    seconds.set(stint.player_id, (seconds.get(stint.player_id) || 0) + played);
    if (!stats.has(stint.player_id)) stats.set(stint.player_id, {
      playerId: stint.player_id, teamId: stint.team_id, goalkeeperGames: 1, goalsConceded: 0, cleanSheets: 0,
      goalkeeperGoals: 0, goalkeeperAssists: 0, goalkeeperOwnGoals: 0,
      goalkeeperWins: 0, goalkeeperDraws: 0, goalkeeperLosses: 0,
    });
  }
  const keeperAt = (event: typeof goalEvents[number], teamId: string) => {
    const snapshot = teamId === match.team_a_id ? event.goalkeeper_a_player_id
      : teamId === match.team_b_id ? event.goalkeeper_b_player_id : null;
    return snapshot || match.match_goalkeepers.find((item) => item.team_id === teamId)?.player_id || null;
  };
  const eventGoalsA = goalEvents.filter((event) => event.team_id === match.team_a_id).length;
  const eventGoalsB = goalEvents.filter((event) => event.team_id === match.team_b_id).length;
  for (const event of goalEvents) {
    const concedingTeam = event.team_id === match.team_a_id ? match.team_b_id : match.team_a_id;
    const conceding = keeperAt(event, concedingTeam);
    if (conceding && stats.has(conceding)) stats.get(conceding)!.goalsConceded += 1;
    const scorerTeam = event.is_own_goal ? concedingTeam : event.team_id;
    if (keeperAt(event, scorerTeam) === event.player_id && stats.has(event.player_id)) {
      if (event.is_own_goal) stats.get(event.player_id)!.goalkeeperOwnGoals += 1;
      else stats.get(event.player_id)!.goalkeeperGoals += 1;
    }
    if (!event.is_own_goal && event.assist_player_id && keeperAt(event, event.team_id) === event.assist_player_id
      && stats.has(event.assist_player_id)) stats.get(event.assist_player_id)!.goalkeeperAssists += 1;
  }
  for (const scout of stats.values()) {
    const teamA = scout.teamId === match.team_a_id;
    const goalsFor = teamA ? Number(match.score_a) : Number(match.score_b);
    const goalsAgainst = teamA ? Number(match.score_b) : Number(match.score_a);
    if (legacy) scout.goalsConceded += Math.max(0, goalsAgainst - (teamA ? eventGoalsB : eventGoalsA));
    const qualifies = legacy || officialElapsed === 0 || (seconds.get(scout.playerId) || 0) * 2 >= actualDuration;
    if (scout.goalsConceded === 0 && qualifies) scout.cleanSheets = 1;
    if (goalsFor > goalsAgainst) scout.goalkeeperWins = 1;
    else if (goalsFor === goalsAgainst) scout.goalkeeperDraws = 1;
    else scout.goalkeeperLosses = 1;
  }
  return stats;
}

function parseRoleWeights(value: unknown): RankingRoleWeight[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): RankingRoleWeight[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (!["DEF", "MEI", "ATA"].includes(String(item.role)) || !Number.isFinite(Number(item.overall))) return [];
    const weight = Number(item.weight);
    if (weight !== 1 && weight !== 0.5) return [];
    return [{ role: item.role as RankingRoleWeight["role"], overall: Number(item.overall), weight }];
  }).slice(0, 2);
}

export const parseRoundRankingRoleWeights = parseRoleWeights;

function resolveRole(positions: { DEF: number; ALA_MEI: number; ATA: number }, profile: string | null, force: boolean): RankingRoleWeight[] {
  const preferred = profile === "defensive" ? "DEF" : profile === "midfield" ? "MEI" : profile === "offensive" ? "ATA" : null;
  const candidates = [
    { role: "DEF" as const, overall: Number(positions.DEF) },
    { role: "MEI" as const, overall: Number(positions.ALA_MEI) },
    { role: "ATA" as const, overall: Number(positions.ATA) },
  ].filter((item) => Number.isFinite(item.overall));
  const selected = force && preferred ? candidates.find((item) => item.role === preferred)
    : candidates.sort((a, b) => b.overall - a.overall || Number(b.role === preferred) - Number(a.role === preferred)
      || ["DEF", "MEI", "ATA"].indexOf(a.role) - ["DEF", "MEI", "ATA"].indexOf(b.role))[0];
  return selected ? [{ ...selected, weight: 1 }] : [];
}

function positionBonus(stats: RoundStatRow, roleWeights: RankingRoleWeight[]): number {
  const primary = roleWeights.find((item) => item.weight === 1);
  if (!primary) return 0;
  if (primary.role === "ATA") return Math.min(Math.max(stats.goals, 0) * 2, 7);
  let gross = 0;
  if (primary.role === "DEF") {
    gross += stats.ranking_defensive_clean_games * 1.25;
    gross += stats.ranking_defensive_one_goal_games * 0.5;
    gross += Math.min(stats.assists * 0.5, 1.5);
    gross += Math.min(stats.draws * 1, 2);
    if (stats.ranking_defensive_clean_games >= 3) gross += 2.5;
    return Math.round(Math.min(gross, 10) * 100) / 100;
  }
  gross += stats.goals * 0.5 + stats.assists * 0.75;
  gross += stats.ranking_defensive_clean_games * 0.5 + stats.ranking_defensive_one_goal_games * 0.25;
  if (stats.goals + stats.assists >= 1
    && stats.ranking_defensive_clean_games + stats.ranking_defensive_one_goal_games >= 2) gross += 1.5;
  return Math.round((Math.min(gross, 6) * 8 / 6) * 100) / 100;
}

export function calculateRoundStatRows(context: RoundCalculationContext): RoundStatRow[] {
  const { round } = context;
  const scoring = normalizeBQScoringSnapshot(round.scoring_snapshot);
  const columnC = Number(scoring.version) >= 11;
  const countsForRanking = round.round_type !== "friendly";
  const playerById = new Map(context.players.map((player) => [player.id, player]));
  const roundPlayerById = new Map(round.round_players.map((player) => [player.player_id, player]));
  const currentProfile = new Map(context.players.map((player) => [player.id, player.player_profile]));
  const profile = new Map(round.round_players.map((player) => [
    player.player_id,
    player.player_profile_locked || currentProfile.get(player.player_id) || null,
  ]));
  const rows = new Map<string, RoundStatRow>();
  for (const player of round.round_players) rows.set(player.player_id, {
    player_id: player.player_id, round_id: round.id, league_id: round.league_id,
    games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0,
    goalkeeper_games: 0, goalkeeper_goals: 0, goalkeeper_assists: 0, goalkeeper_own_goals: 0,
    goalkeeper_wins: 0, goalkeeper_draws: 0, goalkeeper_losses: 0, clean_sheets: 0, goals_conceded: 0,
    defensive_clean_games: 0, defensive_one_goal_games: 0,
    ranking_defensive_clean_games: 0, ranking_defensive_one_goal_games: 0,
    own_goals: 0, team_goals_conceded: 0,
    player_profile_locked: player.player_profile_locked || profile.get(player.player_id) || null,
    profile_decision_source: player.profile_decision_source || null,
    profile_appearance_number: player.profile_appearance_number || null,
    profile_def_overall: player.profile_def_overall || null,
    profile_ata_overall: player.profile_ata_overall || null,
    ranking_role_weights: [], ranking_position_bonus: 0, points: 0,
  });

  for (const match of round.matches.filter((item) => item.status === "finished")) {
    const draw = Number(match.score_a) === Number(match.score_b);
    const winner = draw ? null : Number(match.score_a) > Number(match.score_b) ? match.team_a_id : match.team_b_id;
    const goalkeeperScouts = calculateGoalkeeperScouts(match);
    const goalkeeperIds = new Set(goalkeeperScouts.keys());
    const scoringEligible = new Set(match.match_players
      .filter((participant) => round.number < 7 || participant.scoring_eligible !== false)
      .map((participant) => participant.player_id));
    const processTeam = (teamId: string, result: "win" | "draw" | "loss") => {
      const conceded = teamId === match.team_a_id ? Number(match.score_b) : Number(match.score_a);
      for (const participant of match.match_players.filter((item) => item.team_id === teamId && item.result_eligible
        && (round.number < 7 || item.scoring_eligible !== false) && !context.voidedPlayerIds.has(item.player_id))) {
        const row = rows.get(participant.player_id);
        if (!row) continue;
        row.games += 1;
        row.team_goals_conceded += conceded;
        const receivesDefense = profile.get(participant.player_id) === "defensive" || Number(round.scoring_version || 5) >= 7;
        if (!goalkeeperIds.has(participant.player_id)) {
          if (conceded === 0) row.ranking_defensive_clean_games += 1;
          else if (conceded === 1) row.ranking_defensive_one_goal_games += 1;
          if (receivesDefense) {
            if (conceded === 0) row.defensive_clean_games += 1;
            else if (conceded === 1) row.defensive_one_goal_games += 1;
          }
        }
        if (result === "win") row.wins += 1;
        else if (result === "draw") row.draws += 1;
        else row.losses += 1;
      }
    };
    processTeam(match.team_a_id, draw ? "draw" : winner === match.team_a_id ? "win" : "loss");
    processTeam(match.team_b_id, draw ? "draw" : winner === match.team_b_id ? "win" : "loss");
    for (const keeper of goalkeeperScouts.values()) {
      if (context.voidedPlayerIds.has(keeper.playerId) || !scoringEligible.has(keeper.playerId)) continue;
      const row = rows.get(keeper.playerId);
      if (!row) continue;
      row.goalkeeper_games += keeper.goalkeeperGames; row.goals_conceded += keeper.goalsConceded;
      row.clean_sheets += keeper.cleanSheets; row.goalkeeper_wins += keeper.goalkeeperWins;
      row.goalkeeper_draws += keeper.goalkeeperDraws; row.goalkeeper_losses += keeper.goalkeeperLosses;
      row.goalkeeper_goals += keeper.goalkeeperGoals; row.goalkeeper_assists += keeper.goalkeeperAssists;
      row.goalkeeper_own_goals += keeper.goalkeeperOwnGoals;
    }
    for (const event of match.match_events.filter((item) => item.event_type === "goal")) {
      if (event.is_own_goal) {
        if (scoringEligible.has(event.player_id) && !context.voidedPlayerIds.has(event.player_id)) {
          const row = rows.get(event.player_id); if (row) row.own_goals += 1;
        }
        continue;
      }
      if (scoringEligible.has(event.player_id) && !context.voidedPlayerIds.has(event.player_id)) {
        const row = rows.get(event.player_id); if (row) row.goals += 1;
      }
      if (event.assist_player_id && scoringEligible.has(event.assist_player_id)
        && !context.voidedPlayerIds.has(event.assist_player_id)) {
        const row = rows.get(event.assist_player_id); if (row) row.assists += 1;
      }
    }
  }

  return [...rows.values()].map((row) => {
    const player = playerById.get(row.player_id);
    const primaryTrait = player?.overall_traits?.[0] || null;
    const lineRole = row.player_profile_locked === "defensive" ? "DEF" : "ATA";
    const fallbackRole = primaryTrait === "defensive" ? "DEF" : primaryTrait === "midfield" ? "MEI" : "ATA";
    const frozen = context.frozenRoleWeights.get(row.player_id) || [];
    const overall = context.overallPositions.get(row.player_id);
    const roleWeights: RankingRoleWeight[] = !countsForRanking || row.games <= 0 || !player?.is_competitive_profile_complete
      ? [] : columnC ? [{ role: lineRole, overall: 0, weight: 1 }]
        : frozen.length ? frozen : overall ? resolveRole(overall, primaryTrait, !context.playersWithPriorOfficialRound.has(row.player_id))
          : [{ role: fallbackRole, overall: 0, weight: 1 }];
    row.ranking_role_weights = roleWeights;
    row.ranking_position_bonus = columnC ? 0 : positionBonus(row, roleWeights);
    row.points = countsForRanking ? calculateRankedPoints({
      wins: row.wins, goals: row.goals, assists: row.assists, draws: row.draws, losses: row.losses,
      ownGoals: row.own_goals,
      goalkeeperAppearances: !columnC && round.suppress_goalkeeper_rewards ? 0 : row.goalkeeper_games,
      goalkeeperGoalsConceded: row.goals_conceded, goalkeeperGoals: row.goalkeeper_goals,
      goalkeeperAssists: row.goalkeeper_assists, goalkeeperOwnGoals: row.goalkeeper_own_goals,
      goalkeeperCleanSheets: row.clean_sheets, teamGoalsConceded: row.team_goals_conceded,
      defensiveCleanGames: row.ranking_defensive_clean_games,
      defensiveOneGoalGames: row.ranking_defensive_one_goal_games, lineRole,
    }, scoring) : 0;
    return row;
  });
}
