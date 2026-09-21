import { describe, expect, it } from "vitest";
import { suggestNextMatchRotation } from "./next-match";

const teams = [
  { id: "blue", name: "Azul", position: 1 },
  { id: "yellow", name: "Amarelo", position: 2 },
  { id: "red", name: "Vermelho", position: 3 },
  { id: "green", name: "Verde", position: 4 },
];

describe("suggestNextMatchRotation", () => {
  it("mantém o vencedor e chama o time que mais esperou", () => {
    const result = suggestNextMatchRotation(teams, [
      { id: "m1", team_a_id: "blue", team_b_id: "yellow", score_a: 2, score_b: 0, match_order: 1 },
    ], "m1");
    expect(result).toMatchObject({ teamAId: "blue", teamBId: "red", outgoingTeamId: "yellow", reason: "winner_stays" });
  });

  it("tira no empate o time que já vinha jogando", () => {
    const matches = [
      { id: "m1", team_a_id: "blue", team_b_id: "yellow", score_a: 2, score_b: 0, match_order: 1 },
      { id: "m2", team_a_id: "blue", team_b_id: "red", score_a: 1, score_b: 1, match_order: 2 },
    ];
    const result = suggestNextMatchRotation(teams.slice(0, 3), matches, "m2");
    expect(result).toMatchObject({ teamAId: "red", teamBId: "yellow", outgoingTeamId: "blue", reason: "draw_longest_streak" });
  });

  it("usa a ordem inicial quando a sequência empata", () => {
    const result = suggestNextMatchRotation(teams.slice(0, 3), [
      { id: "m1", team_a_id: "blue", team_b_id: "yellow", score_a: 0, score_b: 0, match_order: 1 },
    ], "m1");
    expect(result).toMatchObject({ stayingTeamId: "yellow", incomingTeamId: "red", outgoingTeamId: "blue", reason: "draw_initial_order" });
  });

  it("com quatro times chama quem não joga há mais tempo", () => {
    const matches = [
      { id: "m1", team_a_id: "blue", team_b_id: "yellow", score_a: 2, score_b: 0, match_order: 1 },
      { id: "m2", team_a_id: "blue", team_b_id: "red", score_a: 2, score_b: 1, match_order: 2 },
    ];
    expect(suggestNextMatchRotation(teams, matches, "m2")?.incomingTeamId).toBe("green");
  });
});
