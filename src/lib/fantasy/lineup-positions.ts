import type { FantasySettings } from "./config";

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
  settings: FantasySettings,
): number {
  if (settings.roleScoringActive === false) return 0;
  if (input.slotRole === "GOL") {
    // GOL é uma escolha do cartoleiro. O bônus exige atuação real no gol;
    // cada jogo sem sofrer gol rende +4, sem limite por rodada.
    return input.goalkeeperGames > 0 ? input.cleanSheets * 4 : 0;
  }

  if (!isCorrectFantasySlot(input.slotRole, input.playerProfile)) return 0;

  if (input.slotRole === "DEF") {
    // O scout-base de DEF já dá a primeira metade; a vaga correta completa o total.
    return input.defensiveCleanGames * 2 + input.defensiveOneGoalGames;
  }

  if (input.slotRole === "MEI") {
    // A assistência básica já vale +3. O pacote completa para +4 e concede
    // o Maestro da Rodada ao atingir duas ou mais assistências.
    return input.assists * (4 - settings.assistPoints) + (input.assists >= 2 ? 3 : 0);
  }

  // O gol básico vale +5 para todos. O atacante recebe somente o prêmio de
  // Artilheiro quando marca ao menos dois na rodada.
  return input.goals >= 2 ? 3 : 0;
}
