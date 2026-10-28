import { describe, expect, it } from "vitest";
import {
  calculateDraftBalanceScore,
  draftSelectionOrder,
  findBestDraftSwap,
  summarizeDraftTeams,
  type DraftBalancePlayer,
} from "./draft-balance.js";

const players: DraftBalancePlayer[] = [
  { id: "c1", teamSlot: 1, overall: 74, speedRating: 3, profile: "offensive", isCaptain: true },
  { id: "a", teamSlot: 1, overall: 76, speedRating: 3, profile: "offensive", isCaptain: false },
  { id: "c2", teamSlot: 2, overall: 70, speedRating: 2, profile: "midfield", isCaptain: true },
  { id: "b", teamSlot: 2, overall: 69, speedRating: 1, profile: "defensive", isCaptain: false },
  { id: "c3", teamSlot: 3, overall: 70, speedRating: 2, profile: "midfield", isCaptain: true },
  { id: "c", teamSlot: 3, overall: 70, speedRating: 2, profile: "defensive", isCaptain: false },
];

describe("draft balance domain", () => {
  it("keeps the snake order", () => {
    expect(Array.from({ length: 12 }, (_, index) => draftSelectionOrder(index + 1)))
      .toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1]);
  });

  it("uses the canonical missing attribute fallbacks", () => {
    const summaries = summarizeDraftTeams([...players, {
      id: "x", teamSlot: 3, overall: null, speedRating: null, profile: null, isCaptain: false,
    }]);
    expect(summaries[2]?.overallAverage).toBe(70);
    expect(summaries[2]?.starsAverage).toBe(2);
  });

  it("only suggests a non-captain swap that improves balance", () => {
    const score = calculateDraftBalanceScore(players);
    const suggestion = findBestDraftSwap(players);
    expect(suggestion?.projectedScore).toBeGreaterThan(score);
    expect([suggestion?.playerAId, suggestion?.playerBId]).not.toContain("c1");
  });
});
