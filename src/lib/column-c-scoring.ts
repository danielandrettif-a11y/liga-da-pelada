/** Regras posicionais da Coluna C, vigentes a partir da pontuação v11. */
export const COLUMN_C_SCORING_VERSION = 11;

export type ColumnCLineRole = "DEF" | "ATA";
export type ColumnCSlotRole = ColumnCLineRole | "GOL";

export const COLUMN_C_SCORING = {
  ATA: { goal: 4, assist: 2.5, conceded: -0.5, cleanSheet: 0, ownGoal: -3 },
  DEF: { goal: 5, assist: 3, conceded: -0.5, cleanSheet: 2, ownGoal: -3 },
  GOL: { goal: 5, assist: 3, conceded: -0.5, cleanSheet: 2, appearance: 1, ownGoal: -3 },
} as const;

export type ColumnCStats = {
  goals?: number;
  assists?: number;
  ownGoals?: number;
  teamGoalsConceded?: number;
  defensiveCleanGames?: number;
  goalkeeperGames?: number;
  goalkeeperGoals?: number;
  goalkeeperAssists?: number;
  goalkeeperOwnGoals?: number;
  goalkeeperGoalsConceded?: number;
  goalkeeperCleanSheets?: number;
};

const count = (value: number | null | undefined) => Number(value || 0);
const cents = (value: number) => Math.round(value * 100);

export function calculateColumnCLinePoints(role: ColumnCLineRole, stats: ColumnCStats) {
  const rule = COLUMN_C_SCORING[role];
  return (
    count(stats.goals) * cents(rule.goal)
    + count(stats.assists) * cents(rule.assist)
    + count(stats.teamGoalsConceded) * cents(rule.conceded)
    + count(stats.defensiveCleanGames) * cents(rule.cleanSheet)
    + count(stats.ownGoals) * cents(rule.ownGoal)
  ) / 100;
}

export function calculateColumnCGoalkeeperPoints(stats: ColumnCStats) {
  const rule = COLUMN_C_SCORING.GOL;
  return (
    count(stats.goalkeeperGames) * cents(rule.appearance)
    + count(stats.goalkeeperGoals) * cents(rule.goal)
    + count(stats.goalkeeperAssists) * cents(rule.assist)
    + count(stats.goalkeeperGoalsConceded) * cents(rule.conceded)
    + count(stats.goalkeeperCleanSheets) * cents(rule.cleanSheet)
    + count(stats.goalkeeperOwnGoals) * cents(rule.ownGoal)
  ) / 100;
}

/**
 * Ranked: soma a atuação de linha e a atuação no gol sem duplicar eventos.
 * Os agregados totais incluem os eventos de goleiro; por isso eles são
 * retirados antes de calcular a parcela de linha.
 */
export function calculateColumnCRankedPoints(role: ColumnCLineRole, stats: ColumnCStats) {
  const lineStats: ColumnCStats = {
    goals: Math.max(0, count(stats.goals) - count(stats.goalkeeperGoals)),
    assists: Math.max(0, count(stats.assists) - count(stats.goalkeeperAssists)),
    ownGoals: Math.max(0, count(stats.ownGoals) - count(stats.goalkeeperOwnGoals)),
    teamGoalsConceded: Math.max(0, count(stats.teamGoalsConceded) - count(stats.goalkeeperGoalsConceded)),
    defensiveCleanGames: count(stats.defensiveCleanGames),
  };
  return calculateColumnCLinePoints(role, lineStats) + calculateColumnCGoalkeeperPoints(stats);
}

export function profileToColumnCRole(profile: string | null | undefined): ColumnCLineRole {
  return profile === "defensive" ? "DEF" : "ATA";
}
