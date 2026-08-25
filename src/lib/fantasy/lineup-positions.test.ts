import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { calculateFantasyPositionPackageBonus } from "./lineup-positions";

describe("pacotes de bônus por posição", () => {
  it("recompensa DEF pela proteção do gol", () => {
    const input = { slotRole: "DEF" as const, playerProfile: "defensive" as const, goals: 0, assists: 0, games: 1, losses: 0, goalkeeperGames: 0, goalsConceded: 0, cleanSheets: 0 };

    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 1, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(2);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 0, defensiveOneGoalGames: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(1);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 0, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
    expect(calculateFantasyPositionPackageBonus({ ...input, playerProfile: "midfield", defensiveCleanGames: 1, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });

  it("recompensa MEI por criar e ATA por finalizar", () => {
    expect(
      calculateFantasyPositionPackageBonus(
        { slotRole: "MEI", playerProfile: "midfield", goals: 1, assists: 2, games: 1, losses: 0, goalkeeperGames: 0, goalsConceded: 0, cleanSheets: 0, defensiveCleanGames: 0, defensiveOneGoalGames: 0 },
        DEFAULT_FANTASY_SETTINGS,
      ),
    ).toBe(5);
    expect(
      calculateFantasyPositionPackageBonus(
        { slotRole: "ATA", playerProfile: "offensive", goals: 2, assists: 0, games: 1, losses: 0, goalkeeperGames: 0, goalsConceded: 0, cleanSheets: 0, defensiveCleanGames: 0, defensiveOneGoalGames: 0 },
        DEFAULT_FANTASY_SETTINGS,
      ),
    ).toBe(3);
  });

  it("dá o pacote de GOL a qualquer atleta escalado nessa vaga", () => {
    const stats = { playerProfile: "offensive" as const, goals: 0, assists: 0, games: 2, losses: 0, goalkeeperGames: 2, goalsConceded: 0, cleanSheets: 2, defensiveCleanGames: 0, defensiveOneGoalGames: 0 };

    expect(calculateFantasyPositionPackageBonus({ ...stats, slotRole: "GOL" }, DEFAULT_FANTASY_SETTINGS)).toBe(8);
    expect(calculateFantasyPositionPackageBonus({ ...stats, slotRole: "DEF" }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });
});
