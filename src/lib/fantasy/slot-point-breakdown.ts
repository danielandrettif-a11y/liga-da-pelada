import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "./config";
import type { FantasySlotRole } from "./lineup-positions";

export type FantasySlotPointBreakdownItem = {
  key: string;
  label: string;
  count: number;
  unitPoints: number;
  points: number;
};

export type FantasyColumnCSlotStats = {
  goals?: number;
  assists?: number;
  ownGoals?: number;
  teamGoalsConceded?: number;
  defensiveCleanGames?: number;
  defensiveOneGoalGames?: number;
  goalkeeperGoals?: number;
  goalkeeperAssists?: number;
  goalkeeperOwnGoals?: number;
  goalsConceded?: number;
};

const amount = (value: number | null | undefined) => Number(value || 0);

/**
 * Detalha a parcela de linha da pontuação por vaga da Coluna C.
 * Scouts feitos enquanto o atleta estava no gol são retirados para não serem
 * cobrados ou premiados novamente quando ele foi escalado como ATA ou DEF.
 */
export function buildFantasyColumnCLineSlotBreakdown(
  slotRole: FantasySlotRole,
  stats: FantasyColumnCSlotStats,
  scoringVersion: number,
  settings: FantasySettings = DEFAULT_FANTASY_SETTINGS,
): FantasySlotPointBreakdownItem[] {
  const role = slotRole === "DEF" ? "DEF" : "ATA";
  const goalPoints = role === "DEF" ? settings.defenderGoalPoints : settings.attackerGoalPoints;
  const assistPoints = role === "DEF" ? settings.defenderAssistPoints : settings.attackerAssistPoints;
  const rows: Array<[string, string, number, number]> = [
    ["goals", `Gols como ${role}`, Math.max(0, amount(stats.goals) - amount(stats.goalkeeperGoals)), goalPoints],
    ["assists", `Assistências como ${role}`, Math.max(0, amount(stats.assists) - amount(stats.goalkeeperAssists)), assistPoints],
    ["teamGoalsConceded", "Gols sofridos pelo time", Math.max(0, amount(stats.teamGoalsConceded) - amount(stats.goalsConceded)), settings.lineGoalConcededPoints],
    ["defensiveCleanGames", "Faixa DEF · 0 gols sofridos", role === "DEF" ? amount(stats.defensiveCleanGames) : 0, settings.defenderCleanSheetPoints],
    ["defensiveOneGoalGames", "Faixa DEF · 1 gol sofrido", role === "DEF" && scoringVersion >= 12 ? amount(stats.defensiveOneGoalGames) : 0, settings.defenderOneGoalPoints],
    ["ownGoals", "Gols contra na linha", Math.max(0, amount(stats.ownGoals) - amount(stats.goalkeeperOwnGoals)), settings.ownGoalPoints],
  ];

  return rows
    .filter(([, , count]) => count !== 0)
    .map(([key, label, count, unitPoints]) => ({
      key,
      label,
      count,
      unitPoints,
      points: Math.round(count * unitPoints * 100) / 100,
    }));
}
