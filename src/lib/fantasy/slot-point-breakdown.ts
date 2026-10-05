import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "./config";
import { COLUMN_C_SCORING, inferTwoGoalGames } from "../column-c-scoring";
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
  const configurableColumnC = scoringVersion >= 13;
  const goalPoints = configurableColumnC
    ? (role === "DEF" ? settings.defenderGoalPoints : settings.attackerGoalPoints)
    : COLUMN_C_SCORING[role].goal;
  const assistPoints = configurableColumnC
    ? (role === "DEF" ? settings.defenderAssistPoints : settings.attackerAssistPoints)
    : COLUMN_C_SCORING[role].assist;
  const lineGoalsConceded = Math.max(0, amount(stats.teamGoalsConceded) - amount(stats.goalsConceded));
  const oneGoalGames = role === "DEF" ? amount(stats.defensiveOneGoalGames) : 0;
  const twoGoalGames = role === "DEF" ? inferTwoGoalGames(lineGoalsConceded, oneGoalGames) : 0;
  const tieredDefensePenalty = role === "DEF" && scoringVersion >= 13;
  const rows: Array<[string, string, number, number]> = [
    ["goals", `Gols como ${role}`, Math.max(0, amount(stats.goals) - amount(stats.goalkeeperGoals)), goalPoints],
    ["assists", `Assistências como ${role}`, Math.max(0, amount(stats.assists) - amount(stats.goalkeeperAssists)), assistPoints],
    ["teamGoalsConceded", "Gols sofridos pelo time", tieredDefensePenalty ? 0 : lineGoalsConceded, configurableColumnC ? settings.lineGoalConcededPoints : COLUMN_C_SCORING[role].conceded],
    ["defensiveCleanGames", "Faixa DEF · 0 gols sofridos", role === "DEF" ? amount(stats.defensiveCleanGames) : 0, configurableColumnC ? settings.defenderCleanSheetPoints : COLUMN_C_SCORING.DEF.cleanSheet],
    ["defensiveOneGoalGames", "Faixa DEF · 1 gol sofrido", role === "DEF" && scoringVersion >= 12 ? oneGoalGames : 0, tieredDefensePenalty ? settings.defenderOneGoalConcededPoints : COLUMN_C_SCORING.DEF.oneGoal],
    ["defensiveTwoGoalGames", "Faixa DEF · 2 gols sofridos", tieredDefensePenalty ? twoGoalGames : 0, settings.defenderTwoGoalsConcededPoints],
    ["ownGoals", "Gols contra na linha", Math.max(0, amount(stats.ownGoals) - amount(stats.goalkeeperOwnGoals)), configurableColumnC ? settings.ownGoalPoints : COLUMN_C_SCORING[role].ownGoal],
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
