import { describe, expect, it } from "vitest";
import { parseCallupFormat } from "./callup-format";

describe("formato da convocação", () => {
  it.each([[5, 2], [6, 3], [7, 6]])("aceita %i jogadores e %i times", (players, teams) => {
    expect(parseCallupFormat("callup", players, teams)).toEqual({
      callupId: "callup", playersPerTeam: players, teamsPerRound: teams,
    });
  });

  it.each([
    ["", 5, 2], ["callup", 4, 2], ["callup", 8, 2],
    ["callup", 5, 1], ["callup", 5, 7], ["callup", 5.5, 2],
    ["callup", Number.NaN, 2],
  ] as const)("recusa valores fora do formato: %s, %s, %s", (id, players, teams) => {
    expect(parseCallupFormat(id, players, teams)).toBeNull();
  });
});
