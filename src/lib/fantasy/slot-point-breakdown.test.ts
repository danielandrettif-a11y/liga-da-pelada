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
  it("preserva a pontuação ATA da V11 sem aplicar faixas defensivas", () => {
    const v11Stats = {
      goals: 6,
      assists: 3,
      ownGoals: 0,
      teamGoalsConceded: 11,
      defensiveCleanGames: 4,
      defensiveOneGoalGames: 7,
    };

    expect(calculateFantasySlotPoints(v11Stats, "MEI", {
      ...DEFAULT_FANTASY_SETTINGS,
      scoringVersion: 11,
    })).toBe(26);
  });

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

  it("mostra as faixas configuráveis de um e dois gols para DEF", () => {
    const rows = buildFantasyColumnCLineSlotBreakdown("DEF", {
      teamGoalsConceded: 3,
      defensiveOneGoalGames: 1,
    }, 13, {
      ...DEFAULT_FANTASY_SETTINGS,
      defenderOneGoalConcededPoints: -0.75,
      defenderTwoGoalsConcededPoints: -1.75,
    });

    expect(rows.map(({ label, count, points }) => ({ label, count, points }))).toEqual([
      { label: "Faixa DEF · 1 gol sofrido", count: 1, points: -0.75 },
      { label: "Faixa DEF · 2 gols sofridos", count: 1, points: -1.75 },
    ]);
  });

  it("usa a mesma pontuação da Ranked em todas as vagas na V14", () => {
    const rankedStats = {
      goals: 2,
      assists: 1,
      ownGoals: 0,
      teamGoalsConceded: 3,
      defensiveCleanGames: 1,
      defensiveOneGoalGames: 0,
      goalkeeperGames: 1,
      goalkeeperGoals: 1,
      goalkeeperAssists: 0,
      goalkeeperOwnGoals: 0,
      goalsConceded: 1,
      cleanSheets: 0,
      playerProfile: "offensive" as const,
    };
    const settings = { ...DEFAULT_FANTASY_SETTINGS, scoringVersion: 14 };

    expect(calculateFantasySlotPoints(rankedStats, "ATA", settings)).toBe(13);
    expect(calculateFantasySlotPoints(rankedStats, "DEF", settings)).toBe(13);
    expect(calculateFantasySlotPoints(rankedStats, "GOL", settings)).toBe(7.5);
  });

  it("ignora gols sofridos pelo time na vaga GOL da V14", () => {
    const settings = { ...DEFAULT_FANTASY_SETTINGS, scoringVersion: 14 };
    const goalkeeperStats = {
      goals: 0,
      assists: 0,
      teamGoalsConceded: 8,
      goalkeeperGames: 2,
      goalsConceded: 2,
      cleanSheets: 0,
    };

    expect(calculateFantasySlotPoints(goalkeeperStats, "GOL", settings)).toBe(5);
  });
});
