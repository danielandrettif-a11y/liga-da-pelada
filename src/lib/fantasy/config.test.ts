import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS, normalizeFantasySettingsRow } from "./config";

describe("normalizeFantasySettingsRow", () => {
  it("preserva os padrões quando não há configuração no banco", () => {
    expect(normalizeFantasySettingsRow(null)).toBe(DEFAULT_FANTASY_SETTINGS);
  });

  it("converte números do Postgres e completa campos ausentes", () => {
    const result = normalizeFantasySettingsRow({
      currency_name: "BQ$",
      initial_budget: "60",
      goal_points: "5.5",
      bet_rank_band_1: "7",
    });
    expect(result.currencyName).toBe("BQ$");
    expect(result.initialBudget).toBe(60);
    expect(result.goalPoints).toBe(5.5);
    expect(result.betRequiredRanks[0]).toBe(7);
    expect(result.marketVersion).toBe(10);
    expect(result.attackerGoalPoints).toBe(5);
    expect(result.goalkeeperLossPoints).toBe(-1);
  });
});
