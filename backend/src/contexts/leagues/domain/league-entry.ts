import { parseLeagueId } from "./league.js";

export type LeagueSelectionMode = "active" | "archived-quick";

export class InvalidLeagueEntryError extends Error {
  constructor(message = "Fluxo de entrada inválido.") {
    super(message);
    this.name = "InvalidLeagueEntryError";
  }
}

export function parseEntryFlowVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new InvalidLeagueEntryError("Versão do fluxo de entrada inválida.");
  }
  return value;
}

export function parseLeagueSelection(leagueId: string, mode: string): {
  leagueId: string;
  mode: LeagueSelectionMode;
} {
  if (mode !== "active" && mode !== "archived-quick") throw new InvalidLeagueEntryError();
  return { leagueId: parseLeagueId(leagueId), mode };
}
