import { describe, expect, it } from "vitest";
import { validateRegisterGoalInput } from "./register-goal";

describe("validação do gol ao vivo", () => {
  const valid = { match_id: "match-1", team_id: "team-1", player_id: "player-1" };

  it("exige partida, time e autor", () => {
    for (const field of ["match_id", "team_id", "player_id"] as const) {
      expect(validateRegisterGoalInput({ ...valid, [field]: "" })).toBe("Dados do gol incompletos.");
    }
  });

  it("aceita gol comum e gol contra sem inventar regras de pontuação", () => {
    expect(validateRegisterGoalInput(valid)).toBeNull();
    expect(validateRegisterGoalInput({ ...valid, is_own_goal: true })).toBeNull();
  });
});
