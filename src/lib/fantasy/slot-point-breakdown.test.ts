import { describe, expect, it } from "vitest";
import { calculateFantasySlotPoints } from "./engine";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { buildFantasyColumnCLineSlotBreakdown } from "./slot-point-breakdown";

const stats = {
  goals: 6,
  assists: 3,
  ownGoals: 1,
  teamGoalsConceded: 16,
  defensiveCleanGames: 4,
  defensiveOneGoalGames: 2,
  goalkeeperGames: 2,
  goalkeeperGoals: 1,
  goalkeeperAssists: 1,
  goalkeeperOwnGoals: 1,
  goalsConceded: 3,
};

describe("buildFantasyColumnCLineSlotBreakdown", () => {
  it("detalha como 25 pontos o exemplo que antes aparecia como 43,5", () => {
    const rows = buildFantasyColumnCLineSlotBreakdown("ATA", {
      goals: 6,
      assists: 3,
      teamGoalsConceded: 13,
    }, 11);

    expect(rows.reduce((total, row) => total + row.points, 0)).toBe(25);
    expect(rows.map((row) => [row.label, row.points])).toEqual([
      ["Gols como ATA", 24],
      ["Assistências como ATA", 7.5],
      ["Gols sofridos pelo time", -6.5],
    ]);
  });

  it.each(["ATA", "MEI", "DEF"] as const)("fecha com o motor oficial para a vaga %s", (slotRole) => {
    const rows = buildFantasyColumnCLineSlotBreakdown(slotRole, stats, 12);
    const detailedTotal = rows.reduce((total, row) => total + row.points, 0);
    const officialTotal = calculateFantasySlotPoints(stats, slotRole, {
      ...DEFAULT_FANTASY_SETTINGS,
      scoringVersion: 12,
    });

    expect(detailedTotal).toBe(officialTotal);
  });

  it("não exibe vitórias, empates, derrotas nem bônus posicionais legados", () => {
    const labels = buildFantasyColumnCLineSlotBreakdown("ATA", stats, 12).map((row) => row.label);

    expect(labels).toEqual([
      "Gols como ATA",
      "Assistências como ATA",
      "Gols sofridos pelo time",
    ]);
  });
});
