import { describe, expect, it } from "vitest";
import { isPlayerAwardSeason, isPlayerRoundHistory } from "./player-history";

describe("player history API contracts", () => {
  it("validates a normalized round history row", () => {
    const numeric = { games: 2, wins: 1, draws: 0, losses: 1, goals: 2, assists: 1, points: 8.5,
      ranking_points: 8.5, ranking_position_bonus: 0.5, goalkeeper_games: 0, goalkeeper_goals: 0,
      goalkeeper_assists: 0, goalkeeper_own_goals: 0, goals_conceded: 0, clean_sheets: 0,
      own_goals: 0, defensive_clean_games: 1, defensive_one_goal_games: 1, team_goals_conceded: 1,
      ranking_defensive_clean_games: 1, ranking_defensive_one_goal_games: 1, legacy_points: 7 };
    expect(isPlayerRoundHistory({ id: "stat-1", player_id: "player-1", round_id: "round-1", ...numeric,
      player_profile_locked: "defensive", point_breakdown: [{ label: "Gols", count: 2, points: 10 }],
      rounds: { number: 4, date: "2026-10-20", scoring_snapshot: { version: 13 } } })).toBe(true);
  });

  it("validates seasonal award groups", () => {
    expect(isPlayerAwardSeason({ seasonId: "season-1", seasonNumber: 2, seasonStatus: "active",
      awards: [{ type: "topScorer", roundId: "round-1", roundNumber: 1, roundDate: "2026-10-20" }] })).toBe(true);
  });
});
