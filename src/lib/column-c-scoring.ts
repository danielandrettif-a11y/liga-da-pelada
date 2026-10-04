/** Regras posicionais da Coluna C com proteção regressiva, vigentes na v12. */
export const COLUMN_C_SCORING_VERSION = 12;

export type ColumnCLineRole = "DEF" | "ATA";
export type ColumnCSlotRole = ColumnCLineRole | "GOL";

export const COLUMN_C_SCORING = {
  ATA: { goal: 4, assist: 2.5, conceded: -0.5, cleanSheet: 0, ownGoal: -3 },
  DEF: { goal: 5, assist: 3, conceded: -0.5, cleanSheet: 2, oneGoal: 1, ownGoal: -3 },
  GOL: { goal: 5, assist: 3, conceded: -0.5, cleanSheet: 4, oneGoal: 2, appearance: 1, ownGoal: -3 },
} as const;

export type ColumnCStats = {
  goals?: number;
  assists?: number;
  ownGoals?: number;
  teamGoalsConceded?: number;
  defensiveCleanGames?: number;
  defensiveOneGoalGames?: number;
  goalkeeperGames?: number;
  goalkeeperGoals?: number;
  goalkeeperAssists?: number;
  goalkeeperOwnGoals?: number;
  goalkeeperGoalsConceded?: number;
  goalkeeperCleanSheets?: number;
};

const count = (value: number | null | undefined) => Number(value || 0);
const cents = (value: number) => Math.round(value * 100);

/**
 * Como cada partida termina ao chegar a dois gols, as atuações não limpas
 * sofreram uma ou duas vezes. Logo: jogos com 1 = 2 × não limpos − sofridos.
 */
export function inferOneGoalGames(games: number, cleanSheets: number, goalsConceded: number) {
  const nonCleanGames = Math.max(0, count(games) - count(cleanSheets));
  return Math.max(0, Math.min(nonCleanGames, nonCleanGames * 2 - count(goalsConceded)));
}

export function calculateColumnCLinePoints(
  role: ColumnCLineRole,
  stats: ColumnCStats,
  scoringVersion = COLUMN_C_SCORING_VERSION,
) {
  const rule = COLUMN_C_SCORING[role];
  const progressiveDefense = role === "DEF" && scoringVersion >= 12;
  return (
    count(stats.goals) * cents(rule.goal)
    + count(stats.assists) * cents(rule.assist)
    + count(stats.teamGoalsConceded) * cents(rule.conceded)
    + count(stats.defensiveCleanGames) * cents(rule.cleanSheet)
    + (progressiveDefense ? count(stats.defensiveOneGoalGames) * cents(COLUMN_C_SCORING.DEF.oneGoal) : 0)
    + count(stats.ownGoals) * cents(rule.ownGoal)
  ) / 100;
}

export function calculateColumnCGoalkeeperPoints(
  stats: ColumnCStats,
  scoringVersion = COLUMN_C_SCORING_VERSION,
) {
  const rule = COLUMN_C_SCORING.GOL;
  const progressiveDefense = scoringVersion >= 12;
  const cleanSheetPoints = progressiveDefense ? rule.cleanSheet : 2;
  const oneGoalGames = progressiveDefense
    ? inferOneGoalGames(
        count(stats.goalkeeperGames),
        count(stats.goalkeeperCleanSheets),
        count(stats.goalkeeperGoalsConceded),
      )
    : 0;
  return (
    count(stats.goalkeeperGames) * cents(rule.appearance)
    + count(stats.goalkeeperGoals) * cents(rule.goal)
    + count(stats.goalkeeperAssists) * cents(rule.assist)
    + count(stats.goalkeeperGoalsConceded) * cents(rule.conceded)
    + count(stats.goalkeeperCleanSheets) * cents(cleanSheetPoints)
    + oneGoalGames * cents(rule.oneGoal)
    + count(stats.goalkeeperOwnGoals) * cents(rule.ownGoal)
  ) / 100;
}

/**
 * Ranked: soma a atuação de linha e a atuação no gol sem duplicar eventos.
 * Os agregados totais incluem os eventos de goleiro; por isso eles são
 * retirados antes de calcular a parcela de linha.
 */
export function calculateColumnCRankedPoints(
  role: ColumnCLineRole,
  stats: ColumnCStats,
  scoringVersion = COLUMN_C_SCORING_VERSION,
) {
  const lineStats: ColumnCStats = {
    goals: Math.max(0, count(stats.goals) - count(stats.goalkeeperGoals)),
    assists: Math.max(0, count(stats.assists) - count(stats.goalkeeperAssists)),
    ownGoals: Math.max(0, count(stats.ownGoals) - count(stats.goalkeeperOwnGoals)),
    teamGoalsConceded: Math.max(0, count(stats.teamGoalsConceded) - count(stats.goalkeeperGoalsConceded)),
    defensiveCleanGames: count(stats.defensiveCleanGames),
    defensiveOneGoalGames: count(stats.defensiveOneGoalGames),
  };
  return calculateColumnCLinePoints(role, lineStats, scoringVersion)
    + calculateColumnCGoalkeeperPoints(stats, scoringVersion);
}

export function profileToColumnCRole(profile: string | null | undefined): ColumnCLineRole {
  return profile === "defensive" ? "DEF" : "ATA";
}
