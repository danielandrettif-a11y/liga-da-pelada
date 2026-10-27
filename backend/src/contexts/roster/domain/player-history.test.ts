import { describe, expect, it } from "vitest";
import { buildPlayerAwardSeasons, buildPlayerRoundHistory, type PlayerRoundHistorySource } from "./player-history.js";

const source = (overrides: Partial<PlayerRoundHistorySource> = {}): PlayerRoundHistorySource => ({
  id: "stat-1", player_id: "player-1", round_id: "round-1", games: 2, wins: 1, draws: 0,
  losses: 1, goals: 2, assists: 1, points: 7, ranking_points: 8.5, ranking_position_bonus: 0.5,
  goalkeeper_games: 0, goalkeeper_goals: 0, goalkeeper_assists: 0, goalkeeper_own_goals: 0,
  goals_conceded: 0, clean_sheets: 0, own_goals: 0, defensive_clean_games: 1,
  defensive_one_goal_games: 1, team_goals_conceded: 1, ranking_defensive_clean_games: 1,
  ranking_defensive_one_goal_games: 1, player_profile_locked: "defensive", round_number: 4,
  round_date: "2026-10-20", scoring_snapshot: { version: 13 }, ...overrides,
});

describe("player history", () => {
  it("builds the canonical ranked score and its positional breakdown", () => {
    const [row] = buildPlayerRoundHistory([source()], "official");
    expect(row).toMatchObject({ points: 8.5, ranking_points: 8.5, legacy_points: 7,
      rounds: { number: 4, date: "2026-10-20" } });
    expect(row.point_breakdown).toEqual(expect.arrayContaining([
      { label: "Gols como DEF", count: 2, points: 10 },
      { label: "Bônus posicional", count: 1, points: 0.5 },
    ]));
  });

  it("keeps friendly points independent from ranked points", () => {
    expect(buildPlayerRoundHistory([source()], "friendly")[0]?.points).toBe(7);
  });

  it("recreates round and season awards using all eligible competitors", () => {
    const rounds = [{ id: "round-1", number: 1, date: "2026-10-20", seasonId: "season-1",
      seasonNumber: 2, seasonStatus: "active" as const, bestGoalkeeperPlayerId: null }];
    const base = { roundId: "round-1", assists: 0, wins: 1, games: 2, defensiveCleanGames: 0,
      defensiveOneGoalGames: 0, teamGoalsConceded: 2, playerProfile: "offensive",
      memberCategory: "player", selectable: true };
    const seasons = buildPlayerAwardSeasons("player-1", rounds, [
      { ...base, playerId: "player-1", goals: 3, points: 9 },
      { ...base, playerId: "player-2", goals: 1, points: 5 },
    ]);
    expect(seasons).toHaveLength(1);
    expect(seasons[0]?.awards.map((award) => award.type))
      .toEqual(expect.arrayContaining(["roundMvp", "topScorer", "kingOfWins", "seasonTopScorer"]));
  });
});
