import { describe, expect, it } from "vitest";
import {
  sortFantasyRankingEntries,
  validateFantasySettingsUpdate,
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

  it("validates initial budget bounds", () => {
    expect(validateFantasySettingsUpdate({ initialBudget: 10 }).valid).toBe(false);
    expect(validateFantasySettingsUpdate({ initialBudget: 600 }).valid).toBe(false);

    const validResult = validateFantasySettingsUpdate({ initialBudget: 120.456 });
    expect(validResult.valid).toBe(true);
    expect(validResult.normalizedBudget).toBe(120.46);
  });
});
