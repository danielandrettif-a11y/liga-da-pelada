export type PlayerHistoryRoundType = "official" | "friendly";
export type PlayerRoundHistory = {
  id: string; player_id: string; round_id: string; games: number; wins: number; draws: number; losses: number;
  goals: number; assists: number; points: number; ranking_points: number; ranking_position_bonus: number;
  goalkeeper_games: number; goalkeeper_goals: number; goalkeeper_assists: number; goalkeeper_own_goals: number;
  goals_conceded: number; clean_sheets: number; own_goals: number; defensive_clean_games: number;
  defensive_one_goal_games: number; team_goals_conceded: number; ranking_defensive_clean_games: number;
  ranking_defensive_one_goal_games: number; player_profile_locked: string | null; legacy_points: number;
  point_breakdown: Array<{ label: string; count: number; points: number }>;
  rounds: { number: number; date: string; scoring_snapshot: Record<string, unknown> | null };
};
export type PlayerAwardType = "roundMvp" | "topScorer" | "topAssister" | "kingOfWins"
  | "bestGoalkeeper" | "bestDefender" | "seasonTopScorer" | "seasonTopAssister";
export type PlayerAwardSeason = { seasonId: string; seasonNumber: number; seasonStatus: "active" | "finished";
  awards: Array<{ type: PlayerAwardType; roundId: string; roundNumber: number; roundDate: string }> };

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const historyNumbers = [
  "games", "wins", "draws", "losses", "goals", "assists", "points", "ranking_points",
  "ranking_position_bonus", "goalkeeper_games", "goalkeeper_goals", "goalkeeper_assists",
  "goalkeeper_own_goals", "goals_conceded", "clean_sheets", "own_goals", "defensive_clean_games",
  "defensive_one_goal_games", "team_goals_conceded", "ranking_defensive_clean_games",
  "ranking_defensive_one_goal_games", "legacy_points",
] as const;
const awardTypes = new Set<PlayerAwardType>([
  "roundMvp", "topScorer", "topAssister", "kingOfWins", "bestGoalkeeper", "bestDefender",
  "seasonTopScorer", "seasonTopAssister",
]);

export function isPlayerRoundHistory(value: unknown): value is PlayerRoundHistory {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.player_id !== "string" || typeof row.round_id !== "string"
    || !historyNumbers.every((field) => finite(row[field]))
    || !(row.player_profile_locked === null || typeof row.player_profile_locked === "string")
    || !Array.isArray(row.point_breakdown) || !row.point_breakdown.every((item) => {
      if (!item || typeof item !== "object") return false;
      const part = item as Record<string, unknown>;
      return typeof part.label === "string" && finite(part.count) && finite(part.points);
    }) || !row.rounds || typeof row.rounds !== "object") return false;
  const round = row.rounds as Record<string, unknown>;
  return finite(round.number) && typeof round.date === "string"
    && (round.scoring_snapshot === null || typeof round.scoring_snapshot === "object");
}

export function isPlayerAwardSeason(value: unknown): value is PlayerAwardSeason {
  if (!value || typeof value !== "object") return false;
  const season = value as Record<string, unknown>;
  return typeof season.seasonId === "string" && finite(season.seasonNumber)
    && (season.seasonStatus === "active" || season.seasonStatus === "finished")
    && Array.isArray(season.awards) && season.awards.every((value) => {
      if (!value || typeof value !== "object") return false;
      const award = value as Record<string, unknown>;
      return awardTypes.has(award.type as PlayerAwardType) && typeof award.roundId === "string"
        && finite(award.roundNumber) && typeof award.roundDate === "string";
    });
}
