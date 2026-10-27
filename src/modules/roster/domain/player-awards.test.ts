import { describe, expect, it } from "vitest";
import { isMonthlyAward, isMonthlyAwardWinner, isPlayerAchievementBelt } from "./player-awards";

describe("player award API contracts", () => {
  const award = { type: "goldenBootMonth", periodStart: "2026-09-01", points: 8,
    roundsPlayed: 4, isFinal: true, metricValue: 6 };

  it("validates monthly awards and winners", () => {
    expect(isMonthlyAward(award)).toBe(true);
    expect(isMonthlyAwardWinner({ ...award, playerId: "player-1", playerName: "Ana", avatarUrl: null })).toBe(true);
    expect(isMonthlyAward({ ...award, points: "8" })).toBe(false);
  });

  it("validates nested achievement belts", () => {
    expect(isPlayerAchievementBelt({ slug: "team_win_streak", name: "Sequência", description: "Recorde",
      recordValue: 3, unit: "vitórias", scope: "team", roundId: null, roundNumber: null,
      roundDate: null, team: { id: "team-1", name: "Azul", color: "#00f", crestUrl: null,
        members: [{ id: "player-1", name: "Ana", avatarUrl: null }] } })).toBe(true);
  });
});
