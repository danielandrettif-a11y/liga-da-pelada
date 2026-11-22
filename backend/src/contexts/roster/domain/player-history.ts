export type PlayerHistoryRoundType = "official" | "friendly";

export type RankedPointBreakdownItem = { label: string; count: number; points: number };

export type PlayerRoundHistorySource = {
  id: string;
  player_id: string;
  round_id: string;
  games: unknown;
  wins: unknown;
  draws: unknown;
  losses: unknown;
  goals: unknown;
  assists: unknown;
  points: unknown;
  ranking_points: unknown;
  ranking_position_bonus: unknown;
  goalkeeper_games: unknown;
  goalkeeper_goals: unknown;
  goalkeeper_assists: unknown;
  goalkeeper_own_goals: unknown;
  goals_conceded: unknown;
  clean_sheets: unknown;
  own_goals: unknown;
  defensive_clean_games: unknown;
  defensive_one_goal_games: unknown;
  team_goals_conceded: unknown;
  ranking_defensive_clean_games: unknown;
  ranking_defensive_one_goal_games: unknown;
  player_profile_locked: string | null;
  round_number: unknown;
  round_date: string | Date;
  scoring_snapshot: Record<string, unknown> | null;
};

export type PlayerRoundHistory = {
  id: string;
  player_id: string;
  round_id: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  ranking_points: number;
  ranking_position_bonus: number;
  goalkeeper_games: number;
  goalkeeper_goals: number;
  goalkeeper_assists: number;
  goalkeeper_own_goals: number;
  goals_conceded: number;
  clean_sheets: number;
  own_goals: number;
  defensive_clean_games: number;
  defensive_one_goal_games: number;
  team_goals_conceded: number;
  ranking_defensive_clean_games: number;
  ranking_defensive_one_goal_games: number;
  player_profile_locked: string | null;
  legacy_points: number;
  point_breakdown: RankedPointBreakdownItem[];
  rounds: { number: number; date: string; scoring_snapshot: Record<string, unknown> | null };
};

type ScoringSnapshot = {
  version: number; goal: number; assist: number; win: number; draw: number; loss: number;
  ownGoal: number; goalkeeperAppearance: number; goalkeeperGoalConceded: number;
  defenderGoal: number; defenderAssist: number; defenderCleanSheet: number; defenderOneGoal: number;
  defenderOneGoalConceded: number; defenderTwoGoalsConceded: number; teamGoalConceded: number;
  goalkeeperCleanSheet: number; goalkeeperOneGoal: number;
};

const defaults: ScoringSnapshot = {
  version: 5, goal: 4, assist: 2.5, win: 3, draw: 1, loss: -2.5, ownGoal: -3,
  goalkeeperAppearance: 2, goalkeeperGoalConceded: -1, defenderGoal: 5, defenderAssist: 3,
  defenderCleanSheet: 3, defenderOneGoal: 1, defenderOneGoalConceded: -0.75,
  defenderTwoGoalsConceded: -1.75, teamGoalConceded: -0.5, goalkeeperCleanSheet: 4,
  goalkeeperOneGoal: 2,
};

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: unknown): number {
  return Math.round(numeric(value) * 100) / 100;
}

function dateText(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function snapshot(value: Record<string, unknown> | null): ScoringSnapshot {
  const source = value || {};
  const read = (camel: keyof ScoringSnapshot, snake: string) => numeric(source[camel] ?? source[snake] ?? defaults[camel]);
  return {
    version: read("version", "scoring_version"), goal: read("goal", "goal_points"),
    assist: read("assist", "assist_points"), win: read("win", "win_points"),
    draw: read("draw", "draw_points"), loss: read("loss", "loss_points"),
    ownGoal: read("ownGoal", "own_goal_points"),
    goalkeeperAppearance: read("goalkeeperAppearance", "goalkeeper_appearance_points"),
    goalkeeperGoalConceded: read("goalkeeperGoalConceded", "goal_conceded_points"),
    defenderGoal: read("defenderGoal", "defender_goal_points"),
    defenderAssist: read("defenderAssist", "defender_assist_points"),
    defenderCleanSheet: read("defenderCleanSheet", "defender_clean_sheet_points"),
    defenderOneGoal: read("defenderOneGoal", "defender_one_goal_points"),
    defenderOneGoalConceded: read("defenderOneGoalConceded", "defender_one_goal_conceded_points"),
    defenderTwoGoalsConceded: read("defenderTwoGoalsConceded", "defender_two_goals_conceded_points"),
    teamGoalConceded: read("teamGoalConceded", "line_goal_conceded_points"),
    goalkeeperCleanSheet: read("goalkeeperCleanSheet", "goalkeeper_slot_clean_sheet_points"),
    goalkeeperOneGoal: read("goalkeeperOneGoal", "goalkeeper_slot_one_goal_points"),
  };
}

function inferOneGoalGames(games: number, cleanSheets: number, goalsConceded: number): number {
  const nonClean = Math.max(0, games - cleanSheets);
  return Math.max(0, Math.min(nonClean, nonClean * 2 - goalsConceded));
}

function inferTwoGoalGames(goalsConceded: number, oneGoalGames: number): number {
  return Math.max(0, (goalsConceded - oneGoalGames) / 2);
}

function breakdown(row: PlayerRoundHistorySource): RankedPointBreakdownItem[] {
  const scoring = snapshot(row.scoring_snapshot);
  const amount = (key: keyof PlayerRoundHistorySource) => numeric(row[key]);
  if (scoring.version >= 11) {
    const role = row.player_profile_locked === "defensive" ? "DEF" : "ATA";
    const goalkeeperGoals = amount("goalkeeper_goals");
    const goalkeeperAssists = amount("goalkeeper_assists");
    const goalkeeperOwnGoals = amount("goalkeeper_own_goals");
    const goalkeeperConceded = amount("goals_conceded");
    const lineConceded = Math.max(0, amount("team_goals_conceded") - goalkeeperConceded);
    const oneGoalGames = role === "DEF" ? amount("defensive_one_goal_games") : 0;
    const progressive = scoring.version >= 12;
    const tiered = scoring.version >= 13 && role === "DEF";
    const goalkeeperOneGoalGames = progressive
      ? inferOneGoalGames(amount("goalkeeper_games"), amount("clean_sheets"), goalkeeperConceded) : 0;
    const rows: Array<[string, number, number]> = [
      [`Gols como ${role}`, Math.max(0, amount("goals") - goalkeeperGoals), role === "DEF" ? scoring.defenderGoal : scoring.goal],
      [`Assistências como ${role}`, Math.max(0, amount("assists") - goalkeeperAssists), role === "DEF" ? scoring.defenderAssist : scoring.assist],
      ["Gols sofridos pelo time", tiered ? 0 : lineConceded, scoring.teamGoalConceded],
      ["Clean sheets como DEF", role === "DEF" ? amount("defensive_clean_games") : 0, scoring.defenderCleanSheet],
      ["Clean sheet regressivo com 1 gol sofrido como DEF", progressive && role === "DEF" ? oneGoalGames : 0, scoring.defenderOneGoal],
      ["Jogos com 1 gol sofrido como DEF", progressive && role === "DEF" ? oneGoalGames : 0, tiered ? scoring.defenderOneGoalConceded : scoring.defenderOneGoal],
      ["Jogos com 2 gols sofridos como DEF", tiered ? inferTwoGoalGames(lineConceded, oneGoalGames) : 0, scoring.defenderTwoGoalsConceded],
      ["Gols contra na linha", Math.max(0, amount("own_goals") - goalkeeperOwnGoals), scoring.ownGoal],
      ["Atuações no gol", amount("goalkeeper_games"), scoring.goalkeeperAppearance],
      ["Gols feitos no gol", goalkeeperGoals, scoring.defenderGoal],
      ["Assistências no gol", goalkeeperAssists, scoring.defenderAssist],
      ["Gols sofridos no gol", goalkeeperConceded, scoring.goalkeeperGoalConceded],
      ["Clean sheets no gol", amount("clean_sheets"), progressive ? scoring.goalkeeperCleanSheet : 2],
      ["Jogos com 1 gol sofrido no gol", goalkeeperOneGoalGames, scoring.goalkeeperOneGoal],
      ["Gols contra no gol", goalkeeperOwnGoals, scoring.ownGoal],
    ];
    return rows.flatMap(([label, count, unit]) => count > 0
      ? [{ label, count, points: rounded(count * unit) }] : []);
  }
  const rows: Array<[string, number, number]> = [
    ["Gols", amount("goals"), scoring.goal], ["Assistências", amount("assists"), scoring.assist],
    ["Vitórias", amount("wins"), scoring.win], ["Empates", amount("draws"), scoring.draw],
    ["Derrotas", amount("losses"), scoring.loss], ["Gols contra", amount("own_goals"), scoring.ownGoal],
    ["Jogos como goleiro", amount("goalkeeper_games"), scoring.goalkeeperAppearance],
    ["Gols sofridos como goleiro", amount("goals_conceded"), scoring.goalkeeperGoalConceded],
  ];
  return rows.flatMap(([label, count, unit]) => count !== 0
    ? [{ label, count, points: rounded(count * unit) }] : []);
}

export function buildPlayerRoundHistory(
  rows: readonly PlayerRoundHistorySource[], roundType: PlayerHistoryRoundType,
): PlayerRoundHistory[] {
  return rows.map((row) => {
    const positionBonus = rounded(row.ranking_position_bonus);
    const pointBreakdown = breakdown(row);
    if (positionBonus !== 0) pointBreakdown.push({ label: "Bônus posicional", count: 1, points: positionBonus });
    const legacyPoints = rounded(row.points);
    const canonicalPoints = roundType === "official" ? rounded(row.ranking_points ?? row.points) : legacyPoints;
    return {
      id: row.id, player_id: row.player_id, round_id: row.round_id,
      games: numeric(row.games), wins: numeric(row.wins), draws: numeric(row.draws), losses: numeric(row.losses),
      goals: numeric(row.goals), assists: numeric(row.assists), points: canonicalPoints,
      ranking_points: canonicalPoints, ranking_position_bonus: positionBonus,
      goalkeeper_games: numeric(row.goalkeeper_games), goalkeeper_goals: numeric(row.goalkeeper_goals),
      goalkeeper_assists: numeric(row.goalkeeper_assists), goalkeeper_own_goals: numeric(row.goalkeeper_own_goals),
      goals_conceded: numeric(row.goals_conceded), clean_sheets: numeric(row.clean_sheets),
      own_goals: numeric(row.own_goals), defensive_clean_games: numeric(row.defensive_clean_games),
      defensive_one_goal_games: numeric(row.defensive_one_goal_games),
      team_goals_conceded: numeric(row.team_goals_conceded),
      ranking_defensive_clean_games: numeric(row.ranking_defensive_clean_games),
      ranking_defensive_one_goal_games: numeric(row.ranking_defensive_one_goal_games),
      player_profile_locked: row.player_profile_locked, legacy_points: legacyPoints, point_breakdown: pointBreakdown,
      rounds: { number: numeric(row.round_number), date: dateText(row.round_date), scoring_snapshot: row.scoring_snapshot },
    };
  });
}

export type PlayerAwardType = "roundMvp" | "topScorer" | "topAssister" | "kingOfWins"
  | "bestGoalkeeper" | "bestDefender" | "seasonTopScorer" | "seasonTopAssister";
export type PlayerAwardSeason = { seasonId: string; seasonNumber: number; seasonStatus: "active" | "finished";
  awards: Array<{ type: PlayerAwardType; roundId: string; roundNumber: number; roundDate: string }> };
export type AwardRound = { id: string; number: number; date: string; seasonId: string; seasonNumber: number;
  seasonStatus: "active" | "finished"; bestGoalkeeperPlayerId: string | null };
export type AwardStat = { playerId: string; roundId: string; goals: number; assists: number; wins: number;
  points: number; games: number; defensiveCleanGames: number; defensiveOneGoalGames: number;
  teamGoalsConceded: number; playerProfile: string | null; memberCategory: string | null; selectable: boolean };

function addAward(season: PlayerAwardSeason, type: PlayerAwardType, round: AwardRound): void {
  season.awards.push({ type, roundId: round.id, roundNumber: round.number, roundDate: round.date });
}

export function buildPlayerAwardSeasons(
  targetPlayerId: string, rounds: readonly AwardRound[], stats: readonly AwardStat[],
): PlayerAwardSeason[] {
  const eligible = stats.filter((stat) => stat.selectable && stat.memberCategory === "player");
  const byRound = new Map<string, AwardStat[]>();
  for (const stat of eligible) byRound.set(stat.roundId, [...(byRound.get(stat.roundId) || []), stat]);
  const seasons = new Map<string, PlayerAwardSeason>();
  const ensure = (round: AwardRound) => {
    const current = seasons.get(round.seasonId) || { seasonId: round.seasonId, seasonNumber: round.seasonNumber,
      seasonStatus: round.seasonStatus, awards: [] };
    seasons.set(round.seasonId, current);
    return current;
  };
  for (const round of rounds) {
    const rows = byRound.get(round.id) || [];
    const target = rows.find((row) => row.playerId === targetPlayerId);
    if (!target) continue;
    const season = ensure(round);
    const most = (key: "points" | "goals" | "assists" | "wins") => Math.max(0, ...rows.map((row) => row[key]));
    if (most("points") > 0 && target.points === most("points")) addAward(season, "roundMvp", round);
    if (most("goals") > 0 && target.goals === most("goals")) addAward(season, "topScorer", round);
    if (most("assists") > 0 && target.assists === most("assists")) addAward(season, "topAssister", round);
    if (most("wins") > 0 && target.wins === most("wins")) addAward(season, "kingOfWins", round);
    const defenders = rows.filter((row) => row.playerProfile === "defensive" && row.games > 0).sort((left, right) => {
      const protection = (row: AwardStat) => (row.defensiveCleanGames * 2 + row.defensiveOneGoalGames) / row.games;
      return protection(right) - protection(left)
        || left.teamGoalsConceded / left.games - right.teamGoalsConceded / right.games
        || right.games - left.games || left.playerId.localeCompare(right.playerId);
    });
    if (defenders[0]?.playerId === targetPlayerId) addAward(season, "bestDefender", round);
  }
  const roundsBySeason = new Map<string, AwardRound[]>();
  for (const round of rounds) roundsBySeason.set(round.seasonId, [...(roundsBySeason.get(round.seasonId) || []), round]);
  for (const [seasonId, seasonRounds] of roundsBySeason) {
    const ids = new Set(seasonRounds.map((round) => round.id));
    const aggregate = new Map<string, { goals: number; assists: number; games: number }>();
    for (const stat of eligible) {
      if (!ids.has(stat.roundId)) continue;
      const total = aggregate.get(stat.playerId) || { goals: 0, assists: 0, games: 0 };
      total.goals += stat.goals; total.assists += stat.assists; total.games += stat.games;
      aggregate.set(stat.playerId, total);
    }
    const reference = [...seasonRounds].sort((a, b) => b.date.localeCompare(a.date))[0];
    const target = aggregate.get(targetPlayerId);
    if (!reference || !target) continue;
    for (const metric of ["goals", "assists"] as const) {
      const best = Math.max(0, ...[...aggregate.values()].map((item) => item[metric]));
      if (best <= 0 || target[metric] !== best) continue;
      const fewestGames = Math.min(...[...aggregate.values()].filter((item) => item[metric] === best).map((item) => item.games));
      if (target.games !== fewestGames) continue;
      const season = ensure(reference);
      season.awards.push({ type: metric === "goals" ? "seasonTopScorer" : "seasonTopAssister",
        roundId: `season-${seasonId}`, roundNumber: 0, roundDate: reference.date });
    }
  }
  return [...seasons.values()].sort((left, right) => right.seasonNumber - left.seasonNumber);
}
