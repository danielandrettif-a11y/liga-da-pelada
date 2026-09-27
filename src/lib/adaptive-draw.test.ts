import { describe, expect, it } from "vitest";
import { drawTeamsAdaptive, type AdaptiveDrawPlayer } from "./adaptive-draw";

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe("sorteio adaptativo", () => {
  const players: AdaptiveDrawPlayer[] = Array.from({ length: 18 }, (_, index) => ({
    id: `p-${index}`,
    overall: 68 + index,
    speedRating: ((index % 3) + 1) as 1 | 2 | 3,
    playerProfile: (["defensive", "midfield", "offensive"] as const)[index % 3],
  }));

  it("mantem capacidade, unicidade e composicao equilibrada", () => {
    const result = drawTeamsAdaptive({ players, teamCount: 3, playersPerTeam: 6, random: seededRandom(42), iterations: 250 });
    expect(result.teams).toHaveLength(3);
    expect(result.teams.every((team) => team.length === 6)).toBe(true);
    expect(new Set(result.teams.flat()).size).toBe(18);
    expect(result.teamSummaries.every((team) => team.profiles.defensive === 2 && team.profiles.midfield === 2 && team.profiles.offensive === 2)).toBe(true);
    expect(result.balanceScore).toBeGreaterThan(80);
  });

  it("usa mediana do grupo e 2 estrelas sem inventar dados persistidos", () => {
    const result = drawTeamsAdaptive({
      players: [
        { id: "a", overall: 80, speedRating: 3, playerProfile: "offensive" },
        { id: "b", overall: null, speedRating: null, playerProfile: "defensive" },
        { id: "c", overall: 70, speedRating: 1, playerProfile: "midfield" },
        { id: "d", overall: null, speedRating: null, playerProfile: "offensive" },
      ],
      teamCount: 2,
      playersPerTeam: 2,
      random: seededRandom(7),
      iterations: 100,
    });
    expect(result.missingOverallCount).toBe(2);
    expect(result.missingSpeedCount).toBe(2);
    expect(result.teams.flat()).toHaveLength(4);
  });

  it("separa Bagres e Craques e compensa os níveis no equilíbrio completo", () => {
    const taggedPlayers: AdaptiveDrawPlayer[] = Array.from({ length: 18 }, (_, index) => ({
      id: `tag-${index}`,
      overall: 68 + (index % 7),
      speedRating: ((index % 3) + 1) as 1 | 2 | 3,
      playerProfile: (["defensive", "midfield", "offensive"] as const)[index % 3],
      balanceTag: index < 3
        ? (["craque_2", "craque_1", "craque_1"] as const)[index]
        : index < 6
          ? (["bagre_2", "bagre_1", "bagre_1"] as const)[index - 3]
          : null,
    }));
    const result = drawTeamsAdaptive({
      players: taggedPlayers,
      teamCount: 3,
      playersPerTeam: 6,
      random: seededRandom(19),
      iterations: 500,
    });
    const byId = new Map(taggedPlayers.map((player) => [player.id, player]));

    for (const team of result.teams) {
      const tags = team.map((id) => byId.get(id)?.balanceTag).filter(Boolean);
      expect(tags.filter((tag) => tag?.startsWith("craque_")).length).toBeLessThanOrEqual(1);
      expect(tags.filter((tag) => tag?.startsWith("bagre_")).length).toBeLessThanOrEqual(1);
    }
  });
});
