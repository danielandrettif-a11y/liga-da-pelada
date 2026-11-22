import { describe, expect, it } from "vitest";
import { drawTeamsBySpeed, drawTeamsWithAttendance, parseSpeedRating } from "./speed-draw.js";

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe("speed draw domain", () => {
  it("balances every rating and treats unrated players as two stars", () => {
    const result = drawTeamsBySpeed({
      players: [
        { id: "fast-1", speedRating: 3 }, { id: "fast-2", speedRating: 3 },
        { id: "middle-1", speedRating: 2 }, { id: "unknown", speedRating: null },
        { id: "slow-1", speedRating: 1 }, { id: "slow-2", speedRating: 1 },
      ],
      teamCount: 2, playersPerTeam: 3, random: seededRandom(42),
    });
    expect(result.teams).toHaveLength(2);
    expect(result.teamSummaries).toEqual([
      { stars: { 1: 1, 2: 1, 3: 1 }, average: 2 },
      { stars: { 1: 1, 2: 1, 3: 1 }, average: 2 },
    ]);
    expect(result.unratedCount).toBe(1);
  });

  it("preserves attendance priority for starter and waiting teams", () => {
    const players = Array.from({ length: 6 }, (_, index) => ({
      id: `player-${index + 1}`, speedRating: (index % 3 + 1) as 1 | 2 | 3,
    }));
    const result = drawTeamsWithAttendance({
      players, attendanceOrder: players.map((player) => player.id),
      teamCount: 3, playersPerTeam: 2, random: seededRandom(7),
    });
    expect(result.teams[2]).toEqual(["player-5", "player-6"]);
    expect(result.attendanceOrder).toEqual(players.map((player) => player.id));
  });

  it("rejects ratings outside the supported range", () => {
    expect(() => parseSpeedRating(4)).toThrow("Avaliação de velocidade inválida");
  });
});
