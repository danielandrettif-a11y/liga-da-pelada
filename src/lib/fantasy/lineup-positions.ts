import type { FantasySettings } from "./config";
import { calculatePositionBonusValue, type PositionBreakdownInput } from "./position-breakdown";

export type FantasySlotRole = "GOL" | "DEF" | "MEI" | "ATA";
export type FantasyPlayerProfile = string | null | undefined;

export type FantasyLineupSlot = {
  playerId: string;
  slotIndex: number;
  slotRole: FantasySlotRole;
};

export function getFantasySlotRoles(
  playersPerTeam: number,
  formation: "2-1-2" | "2-2-1",
): FantasySlotRole[] {
  if (playersPerTeam === 6) {
    return formation === "2-1-2"
      ? ["ATA", "ATA", "MEI", "DEF", "DEF", "GOL"]
      : ["ATA", "MEI", "MEI", "DEF", "DEF", "GOL"];
  }

  if (playersPerTeam === 5) {
    return formation === "2-1-2"
      ? ["ATA", "ATA", "MEI", "DEF", "DEF"]
      : ["ATA", "MEI", "MEI", "DEF", "DEF"];
  }

  return Array.from({ length: playersPerTeam }, (_, index) =>
    index === playersPerTeam - 1 ? "GOL" : "MEI",
  );
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
  return playerProfile === "offensive";
}

/**
 * Calcula o bônus posicional BQ v5.
 *
 * DEF: +1.5 por clean sheet, +0.5 por partida com 1 gol, Muralha +3 (≥3 CS), teto 10.
 * MEI: +1 por assistência, Maestro +3 (≥2 assistências).
 * ATA: Artilheiro +3 (≥2 gols).
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
  };

  return calculatePositionBonusValue(breakdownInput);
}
