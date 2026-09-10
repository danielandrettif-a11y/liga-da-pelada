import { describe, expect, it } from "vitest";
import { formatAwardMonth, parseMonthlyAwards } from "./monthly-awards";

describe("monthly awards", () => {
  it("normaliza somente categorias conhecidas", () => {
    expect(parseMonthlyAwards([
      { award_type: "bestDefenderMonth", period_start: "2026-09-01", points: "18.5", rounds_played: 3, is_final: true },
      { award_type: "unknown", period_start: "2026-09-01" },
    ])).toEqual([{
      type: "bestDefenderMonth",
      periodStart: "2026-09-01",
      points: 18.5,
      roundsPlayed: 3,
      isFinal: true,
    }]);
  });

  it("formata o mês sem deslocamento de fuso", () => {
    expect(formatAwardMonth("2026-09-01")).toBe("Setembro de 2026");
  });
});
