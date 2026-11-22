import { describe, expect, it } from "vitest";
import { revealedLineupScore } from "./revealed-score.js";

describe("revealed lineup scores", () => {
  it("combines player points, reserve gain and a resolved scoring card", () => {
    expect(revealedLineupScore([{ points: 4 }, { points: "2.5" }], { pointsGain: 1 }, { status: "RESOLVED", bonus: 3 }))
      .toEqual({ playerPoints: 7.5, totalPoints: 10.5 });
  });
  it("does not add pending or monetary benefits as points", () => {
    const players = [{ points: 4 }];
    expect(revealedLineupScore(players, null, { status: "LOCKED", bonus: 5 }).totalPoints).toBe(4);
    expect(revealedLineupScore(players, null, { status: "RESOLVED", slug: "extra_credit", bonus: 5 }).totalPoints).toBe(4);
    expect(revealedLineupScore(players, null, { status: "RESOLVED", bonus: 3, details: { budgetRecovery: 2 } }).totalPoints).toBe(4);
    expect(revealedLineupScore(players, null, { status: "RESOLVED", bonus: 1, fallbackBonus: 2 }).totalPoints).toBe(6);
  });
});
