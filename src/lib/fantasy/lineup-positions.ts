import type { FantasySettings } from "./config";
import { calculatePositionBonusValue, type PositionBreakdownInput } from "./position-breakdown";

export type FantasySlotRole = "GOL" | "DEF" | "MEI" | "ALA" | "ATA";
export type FantasyFormation = "balanced" | "classic" | "wide" | "offensive";
export type LegacyFantasyFormation = "2-1-2" | "2-2-1";
export type FantasyPlayerProfile = string | null | undefined;

export type FantasyLineupSlot = {
  playerId: string;
  slotIndex: number;
  slotRole: FantasySlotRole;
};

export function getFantasySlotRoles(
  playersPerTeam: number,
  formation: FantasyFormation | LegacyFantasyFormation,
): FantasySlotRole[] {
  const normalized = normalizeFantasyFormation(formation);
  const fieldRoles: Record<FantasyFormation, FantasySlotRole[]> = {
    balanced: ["ATA", "ALA", "MEI", "DEF", "DEF"],
    classic: ["ATA", "MEI", "MEI", "DEF", "DEF"],
    wide: ["ATA", "ALA", "ALA", "DEF", "DEF"],
    offensive: ["ATA", "ATA", "MEI", "DEF", "DEF"],
  };

  if (playersPerTeam === 5) return [...fieldRoles[normalized]];
  if (playersPerTeam === 6) return [...fieldRoles[normalized], "GOL"];

  return Array.from({ length: playersPerTeam }, (_, index) =>
    index === playersPerTeam - 1 ? "GOL" : "MEI",
  );
}

export function normalizeFantasyFormation(
  formation: FantasyFormation | LegacyFantasyFormation,
): FantasyFormation {
  if (formation === "2-1-2") return "offensive";
  if (formation === "2-2-1") return "classic";
  return formation;
}

export function inferFantasyFormation(
  playersPerTeam: number,
  roles: Array<string | null | undefined>,
): FantasyFormation | null {
  for (const formation of ["balanced", "classic", "wide", "offensive"] as const) {
    const expected = getFantasySlotRoles(playersPerTeam, formation);
    if (roles.length === expected.length && roles.every((role, index) => !role || role === expected[index])) {
      return formation;
    }
  }
  return null;
}

export function isValidFantasyFormationRoles(playersPerTeam: number, roles: string[]): boolean {
  return inferFantasyFormation(playersPerTeam, roles) !== null;
}

export function isCorrectFantasySlot(
  slotRole: FantasySlotRole,
  playerProfile: FantasyPlayerProfile,
): boolean {
  // O slot de goleiro é deliberadamente aberto: qualquer atleta pode assumir o
  // rodízio no gol, como descrito no guia de pontuação.
  if (slotRole === "GOL") return true;
  if (slotRole === "DEF") return playerProfile === "defensive";
  if (slotRole === "MEI") return playerProfile === "midfield";
  if (slotRole === "ALA") return playerProfile === "wing";
  return playerProfile === "offensive";
}

/**
 * Calcula o bônus posicional BQ v6.
 *
 * DEF: +1.25 por clean sheet, +0.5 por partida com 1 gol, Muralha +2.5 (≥3 CS), teto 8.
 * MEI: +0.75 por assistência, Maestro +2.5 (≥2 assistências), teto 6.
 * ALA: recompensa equilibrada por ataque e recomposição, Vai e Volta +2, teto 6.
 * ATA: +0.5 por gol, Artilheiro +2 (≥2 gols), teto 4.
 * GOL: +4 por clean sheet quando realmente atuou no gol.
 *
 * Delega para position-breakdown.ts para manter uma fonte única.
 */
export function calculateFantasyPositionPackageBonus(
  input: {
    slotRole: FantasySlotRole;
    playerProfile: FantasyPlayerProfile;
    goals: number;
    assists: number;
    games: number;
    losses: number;
    goalkeeperGames: number;
    goalsConceded: number;
    cleanSheets: number;
    defensiveCleanGames: number;
    defensiveOneGoalGames: number;
    suppressGoalkeeperRewards?: boolean;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _settings: FantasySettings,
): number {
  if (_settings.roleScoringActive === false) return 0;

  const breakdownInput: PositionBreakdownInput = {
    slotRole: input.slotRole,
    playerProfile: input.playerProfile,
    goals: input.goals,
    assists: input.assists,
    defensiveCleanGames: input.defensiveCleanGames,
    defensiveOneGoalGames: input.defensiveOneGoalGames,
    goalkeeperGames: input.goalkeeperGames,
    cleanSheets: input.cleanSheets,
    suppressGoalkeeperRewards: input.suppressGoalkeeperRewards ?? _settings.suppressGoalkeeperRewards,
    settings: _settings,
  };

  return calculatePositionBonusValue(breakdownInput);
}
