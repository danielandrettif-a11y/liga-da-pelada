import { describe, expect, it } from "vitest";
import { fantasyCardRequiresSavedLineup } from "./eligibility";

describe("fantasyCardRequiresSavedLineup", () => {
  it("não bloqueia cartas sem alvo antes de salvar a escalação", () => {
    expect(fantasyCardRequiresSavedLineup({
      slug: "super_captain",
      effectType: "CAPTAIN_MULTIPLIER",
      requiresTarget: "NONE",
    })).toBe(false);
  });

  it("mantém a escalação obrigatória para cartas que escolhem titulares", () => {
    expect(fantasyCardRequiresSavedLineup({
      slug: "golden_goal",
      effectType: "CONDITIONAL_PLAYER_BONUS",
      requiresTarget: "SINGLE_PLAYER",
      targetFilter: "ANY_IN_LINEUP",
    })).toBe(true);
  });

  it("permite cartas voltadas ao mercado sem escalação salva", () => {
    expect(fantasyCardRequiresSavedLineup({
      slug: "all_in",
      effectType: "CONDITIONAL_PLAYER_BONUS",
      requiresTarget: "SINGLE_PLAYER",
      targetFilter: "ANY_IN_MARKET",
    })).toBe(false);
  });
});
