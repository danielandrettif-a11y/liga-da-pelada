import { describe, expect, it } from "vitest";
import { roundFormationChanged, swapRoundFormationPlayers } from "./round-team-formation";

const formation = [
  { teamId: "team-a", playerIds: ["a1", "a2"] },
  { teamId: "team-b", playerIds: ["b1", "b2"] },
  { teamId: "team-c", playerIds: ["c1", "c2"] },
];

describe("editor de formação permanente", () => {
  it("troca dois atletas entre times sem alterar a quantidade de cada time", () => {
    const result = swapRoundFormationPlayers(formation, "a1", "c2");

    expect(result).toEqual([
      { teamId: "team-a", playerIds: ["c2", "a2"] },
      { teamId: "team-b", playerIds: ["b1", "b2"] },
      { teamId: "team-c", playerIds: ["c1", "a1"] },
    ]);
    expect(result.map((team) => team.playerIds.length)).toEqual([2, 2, 2]);
    expect(roundFormationChanged(formation, result)).toBe(true);
  });

  it("não modifica o rascunho quando um atleta não existe", () => {
    expect(swapRoundFormationPlayers(formation, "a1", "inexistente")).toBe(formation);
    expect(roundFormationChanged(formation, formation)).toBe(false);
  });
});
