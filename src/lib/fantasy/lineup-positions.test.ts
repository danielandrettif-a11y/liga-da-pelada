import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { calculateFantasyPositionPackageBonus } from "./lineup-positions";
import { calculatePositionBreakdown } from "./position-breakdown";

describe("pacotes de bônus por posição — BQ v5", () => {
  const baseInput = {
    goals: 0,
    assists: 0,
    games: 1,
    losses: 0,
    goalkeeperGames: 0,
    goalsConceded: 0,
    cleanSheets: 0,
    defensiveCleanGames: 0,
    defensiveOneGoalGames: 0,
  };

  it("recompensa DEF pela proteção do gol (+1.5 CS, +0.5 1 gol)", () => {
    const input = { ...baseInput, slotRole: "DEF" as const, playerProfile: "defensive" as const };

    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 1, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(1.5);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 0, defensiveOneGoalGames: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(0.5);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 0, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
    expect(calculateFantasyPositionPackageBonus({ ...input, playerProfile: "midfield", defensiveCleanGames: 1, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });

  it("aplica bônus Muralha (+3) com >= 3 clean sheets para DEF", () => {
    const input = { ...baseInput, slotRole: "DEF" as const, playerProfile: "defensive" as const };

    // 3 clean sheets: 3 * 1.5 + 3 (Muralha) = 7.5
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(7.5);

    // 4 clean sheets: 4 * 1.5 + 3 (Muralha) = 9
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 4 }, DEFAULT_FANTASY_SETTINGS)).toBe(9);
  });

  it("aplica teto de 10 pontos para DEF (bruto 11.5 -> aplicado 10)", () => {
    const input = { ...baseInput, slotRole: "DEF" as const, playerProfile: "defensive" as const };

    // 5 clean sheets + 2 com 1 gol: 5 * 1.5 (7.5) + 2 * 0.5 (1.0) + Muralha (3) = 11.5 -> teto 10
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 5, defensiveOneGoalGames: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(10);

    const breakdown = calculatePositionBreakdown({
      slotRole: "DEF",
      playerProfile: "defensive",
      goals: 0,
      assists: 0,
      defensiveCleanGames: 5,
      defensiveOneGoalGames: 2,
      goalkeeperGames: 0,
      cleanSheets: 0,
    });
    expect(breakdown.grossBonus).toBe(11.5);
    expect(breakdown.appliedBonus).toBe(10);
    expect(breakdown.capReached).toBe(true);
  });

  it("recompensa MEI (+1 por assistência + Maestro +3 se >= 2)", () => {
    const input = { ...baseInput, slotRole: "MEI" as const, playerProfile: "midfield" as const };

    // 1 assistência: +1 bônus
    expect(calculateFantasyPositionPackageBonus({ ...input, assists: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(1);

    // 2 assistências: 2 * 1 + 3 (Maestro) = 5
    expect(calculateFantasyPositionPackageBonus({ ...input, assists: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(5);

    // 3 assistências: 3 * 1 + 3 (Maestro) = 6
    expect(calculateFantasyPositionPackageBonus({ ...input, assists: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(6);
  });

  it("recompensa ATA exclusivamente com Artilheiro (+3 se >= 2 gols)", () => {
    const input = { ...baseInput, slotRole: "ATA" as const, playerProfile: "offensive" as const };

    // 1 gol: 0 bônus posicional (gol básico +4 já está na base)
    expect(calculateFantasyPositionPackageBonus({ ...input, goals: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);

    // 2 gols: +3 bônus (Artilheiro)
    expect(calculateFantasyPositionPackageBonus({ ...input, goals: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(3);

    // 3 gols: +3 bônus (Artilheiro uma vez)
    expect(calculateFantasyPositionPackageBonus({ ...input, goals: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(3);
  });

  it("dá o pacote de GOL (+4 por clean sheet) a qualquer atleta que realmente atuou no gol", () => {
    const stats = { ...baseInput, playerProfile: "offensive" as const, games: 2, goalkeeperGames: 2, cleanSheets: 2 };

    expect(calculateFantasyPositionPackageBonus({ ...stats, slotRole: "GOL" }, DEFAULT_FANTASY_SETTINGS)).toBe(8);
    // Não atuou no gol -> 0 mesmo se slotRole for GOL
    expect(calculateFantasyPositionPackageBonus({ ...stats, goalkeeperGames: 0, slotRole: "GOL" }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
    // Escalado em DEF mas atuou no gol -> 0
    expect(calculateFantasyPositionPackageBonus({ ...stats, slotRole: "DEF" }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });
});
