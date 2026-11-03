import { describe, expect, it } from "vitest";
import {
  buildFantasySettingsPayload,
  sortFantasyRankingEntries,
} from "./fantasy-admin.js";

describe("Fantasy Domain: Fantasy Admin & Ranking", () => {
  it("sorts ranking entries by totalPoints descending then patrimony", () => {
    const entries = [
      { userId: "u1", userName: "Alice", userAvatarUrl: null, totalPoints: 100.5, patrimony: 100, lastRoundPoints: 10, lineupsCount: 3 },
      { userId: "u2", userName: "Bob", userAvatarUrl: null, totalPoints: 120.0, patrimony: 95, lastRoundPoints: 15, lineupsCount: 3 },
      { userId: "u3", userName: "Charlie", userAvatarUrl: null, totalPoints: 100.5, patrimony: 110, lastRoundPoints: 8, lineupsCount: 3 },
    ];

    const sorted = sortFantasyRankingEntries(entries);
    expect(sorted[0].userId).toBe("u2"); // 120.0
    expect(sorted[0].rank).toBe(1);

    expect(sorted[1].userId).toBe("u3"); // 100.5, patrimony 110
    expect(sorted[1].rank).toBe(2);

    expect(sorted[2].userId).toBe("u1"); // 100.5, patrimony 100
    expect(sorted[2].rank).toBe(3);
  });

  it("builds the scoped settings payload and protects canonical scouts", () => {
    expect(buildFantasySettingsPayload({ goalPoints: 5 }).valid).toBe(false);
    expect(buildFantasySettingsPayload({ initialBudget: 75, captain_multiplier: 1.8,
      defenderOneGoalConcededPoints: -1 })).toEqual({ valid: true, payload: {
        initial_budget: 75,
        captain_multiplier: 1.8,
        defender_one_goal_conceded_points: -1,
      } });
  });
});

