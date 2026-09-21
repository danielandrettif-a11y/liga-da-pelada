import { describe, expect, it } from "vitest";
import { previewRoundReshuffle } from "./round-reshuffle";

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const players = Array.from({ length: 13 }, (_, index) => ({
  id: `p-${index + 1}`,
  overall: 66 + index,
  speedRating: ([1, 2, 3] as const)[index % 3],
  playerProfile: (["defensive", "midfield", "offensive"] as const)[index % 3],
  isGoalkeeper: index === 0 || index === 7,
}));

describe("prévia de nova formação", () => {
  it.each(["random", "balanced", "speed", "adaptive"] as const)("mantém capacidade e unicidade no modo %s", (mode) => {
    const result = previewRoundReshuffle({
      players,
      capacities: [5, 4, 4],
      mode,
      random: seededRandom(42),
    });

    expect(result.teams.map((team) => team.length)).toEqual([5, 4, 4]);
    expect(new Set(result.teams.flat()).size).toBe(13);
    expect(result.summaries).toHaveLength(3);
  });

  it("gera uma nova disposição no sorteio aleatório", () => {
    const first = previewRoundReshuffle({ players, capacities: [5, 4, 4], mode: "random", random: seededRandom(7) });
    const second = previewRoundReshuffle({ players, capacities: [5, 4, 4], mode: "random", random: seededRandom(9) });

    expect(first.teams).not.toEqual(second.teams);
  });
});
