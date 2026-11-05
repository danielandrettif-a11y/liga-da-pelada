import { describe, expect, it } from "vitest";
import { buildFantasyDashboardAnalytics } from "./dashboard.js";

describe("Fantasy dashboard analytics", () => {
  it("builds market, popularity, insights and radar from canonical inputs", () => {
    const result = buildFantasyDashboardAnalytics({
      players: [{
        id: "p1", name: "Atleta", avatarUrl: null, profile: "offensive", isGoalkeeper: false,
        price: 10, totalPoints: 24, roundsPlayed: 2,
        stats: { goals: 3, assists: 1, wins: 2, games: 2 },
        history: [
          { points: 10, variation: 0.03, priceChange: 0.5 },
          { points: 14, variation: 0.04, priceChange: 0.7 },
        ],
        roundStats: { basePoints: 14 }, cosmetics: null, isInCurrentRound: true,
      }],
      currentLineups: ["u1", "u2", "u3"].map((userId) => ({
        userId, playerIds: ["p1"], captainPlayerId: "p1",
      })),
      previousLineups: [{ userId: "u1", playerIds: ["p1"] }],
      minSample: 3,
    });

    expect(result.market[0]).toMatchObject({
      id: "p1", trend: "UP", popularityPercent: 100, captainPercent: 100,
      selectionCount: 3, previousSelectionCount: 1, roundPoints: 14,
    });
    expect(result.insights).toMatchObject({
      topRoundPlayer: { id: "p1" }, mostSelectedPlayer: { id: "p1" },
    });
    expect(result.radar).toMatchObject({
      totalLineups: 3, hasMinSample: true,
      mostSelected: { player: { id: "p1" }, value: "100%" },
    });
  });
});
