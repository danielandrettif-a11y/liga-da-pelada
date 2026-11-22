import type { RoundType } from "@/lib/types";
import { isRosterPlayer, type RosterPlayer } from "./player-catalog";

export type RosterStatisticsRoundType = Extract<RoundType, "official" | "friendly">;

export type RosterPlayerStatistics = RosterPlayer & {
  rounds: number;
  games: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  legacyPoints: number;
  overall?: number;
  overallPositions?: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
};

export type RosterGroups = {
  officialPlayers: RosterPlayerStatistics[];
  activeGuests: RosterPlayerStatistics[];
  wags: RosterPlayerStatistics[];
  supporters: RosterPlayerStatistics[];
};

const statisticsFields = [
  "rounds", "games", "goals", "assists", "wins", "draws", "losses", "points", "legacyPoints",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOverallPositions(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const positions = value as Record<string, unknown>;
  return ["DEF", "ALA_MEI", "ATA", "GOL"].every((position) => isFiniteNumber(positions[position]));
}

export function isRosterPlayerStatistics(value: unknown): value is RosterPlayerStatistics {
  if (!isRosterPlayer(value)) return false;
  const statistics = value as unknown as Record<string, unknown>;
  return statisticsFields.every((field) => isFiniteNumber(statistics[field]))
    && (statistics.overall === undefined || isFiniteNumber(statistics.overall))
    && (statistics.overallPositions === undefined || statistics.overallPositions === null
      || isOverallPositions(statistics.overallPositions));
}

export function isRosterGroups(value: unknown): value is RosterGroups {
  if (!value || typeof value !== "object") return false;
  const groups = value as Record<string, unknown>;
  return ["officialPlayers", "activeGuests", "wags", "supporters"].every((group) => (
    Array.isArray(groups[group]) && groups[group].every(isRosterPlayerStatistics)
  ));
}
