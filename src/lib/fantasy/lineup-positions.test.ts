import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS, withFantasyPositionSnapshot } from "./config";
import { calculateFantasyPositionPackageBonus, getFantasySlotRoles, inferFantasyFormation, isValidFantasyFormationRoles } from "./lineup-positions";
import { calculatePositionBreakdown } from "./position-breakdown";

describe("pacotes de bônus por posição — BQ v6", () => {
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

  it("recompensa DEF pela proteção do gol (+1.25 CS, +0.5 1 gol)", () => {
    const input = { ...baseInput, slotRole: "DEF" as const, playerProfile: "defensive" as const };

    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 1, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(1.25);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 0, defensiveOneGoalGames: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(0.5);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 0, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
    expect(calculateFantasyPositionPackageBonus({ ...input, playerProfile: "midfield", defensiveCleanGames: 1, defensiveOneGoalGames: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });

  it("aplica bônus Muralha (+2.5) com >= 3 clean sheets para DEF", () => {
    const input = { ...baseInput, slotRole: "DEF" as const, playerProfile: "defensive" as const };

    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(6.25);

    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 4 }, DEFAULT_FANTASY_SETTINGS)).toBe(7.5);
  });

  it("aplica teto de 8 pontos para DEF", () => {
    const input = { ...baseInput, slotRole: "DEF" as const, playerProfile: "defensive" as const };

    // 5 clean sheets + 2 com 1 gol: 5 * 1.25 + 2 * 0.5 + Muralha 2.5 = 9.75 -> teto 8
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 5, defensiveOneGoalGames: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(8);

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
    expect(breakdown.grossBonus).toBe(9.75);
    expect(breakdown.appliedBonus).toBe(8);
    expect(breakdown.capReached).toBe(true);
  });

  it("recompensa MEI (+0.75 por assistência + Maestro +2.5 se >= 2)", () => {
    const input = { ...baseInput, slotRole: "MEI" as const, playerProfile: "midfield" as const };

    // 1 assistência: +0.75 de bônus
    expect(calculateFantasyPositionPackageBonus({ ...input, assists: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(0.75);

    // 2 assistências: 2 * 0.75 + 2.5 (Maestro) = 4
    expect(calculateFantasyPositionPackageBonus({ ...input, assists: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(4);

    // 3 assistências: 3 * 0.75 + 2.5 (Maestro) = 4.75
    expect(calculateFantasyPositionPackageBonus({ ...input, assists: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(4.75);
  });

  it("recompensa ATA de forma progressiva e mantém o pico de 2 gols", () => {
    const input = { ...baseInput, slotRole: "ATA" as const, playerProfile: "offensive" as const };

    // 1 gol: +0.5 de bônus posicional (gol básico +4 já está na base)
    expect(calculateFantasyPositionPackageBonus({ ...input, goals: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(0.5);

    // 2 gols: 2 * 0.5 + 2 de Artilheiro = 3
    expect(calculateFantasyPositionPackageBonus({ ...input, goals: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(3);

    // 3 gols: 3 * 0.5 + 2 de Artilheiro = 3.5
    expect(calculateFantasyPositionPackageBonus({ ...input, goals: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(3.5);
  });

  it("faz o ALA atingir o auge somente ao combinar ataque e proteção", () => {
    const input = { ...baseInput, slotRole: "ALA" as const, playerProfile: "wing" as const, goals: 4, assists: 3 };
    expect(calculateFantasyPositionPackageBonus(input, DEFAULT_FANTASY_SETTINGS)).toBe(3.5);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveOneGoalGames: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(6);
    expect(calculateFantasyPositionPackageBonus({ ...input, defensiveCleanGames: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(6);
    expect(calculateFantasyPositionPackageBonus({ ...input, playerProfile: "midfield", defensiveCleanGames: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });

  it("oferece quatro formações válidas e converte as legadas", () => {
    expect(getFantasySlotRoles(6, "balanced")).toEqual(["ATA", "ALA", "MEI", "DEF", "DEF", "GOL"]);
    expect(getFantasySlotRoles(6, "classic")).toEqual(["ATA", "MEI", "MEI", "DEF", "DEF", "GOL"]);
    expect(getFantasySlotRoles(6, "wide")).toEqual(["ATA", "ALA", "ALA", "DEF", "DEF", "GOL"]);
    expect(getFantasySlotRoles(6, "offensive")).toEqual(["ATA", "ATA", "MEI", "DEF", "DEF", "GOL"]);
    expect(getFantasySlotRoles(6, "2-1-2")).toEqual(getFantasySlotRoles(6, "offensive"));
    expect(inferFantasyFormation(6, getFantasySlotRoles(6, "2-2-1"))).toBe("classic");
    expect(isValidFantasyFormationRoles(6, ["ATA", "ATA", "ATA", "DEF", "DEF", "GOL"])).toBe(false);
  });

  it("preserva o pacote BQ v5 nos snapshots das rodadas 1 a 3", () => {
    const historical = withFantasyPositionSnapshot(DEFAULT_FANTASY_SETTINGS, { scoring_version: 5 });
    const input = { ...baseInput, slotRole: "MEI" as const, playerProfile: "midfield" as const, assists: 2 };
    expect(calculateFantasyPositionPackageBonus(input, historical)).toBe(5);
    expect(calculateFantasyPositionPackageBonus({ ...input, slotRole: "ALA", playerProfile: "wing" }, historical)).toBe(0);
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
