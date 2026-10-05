/** Regras posicionais da Coluna C com penalidade defensiva por faixa, vigentes na v13. */
export const COLUMN_C_SCORING_VERSION = 13;

export type ColumnCLineRole = "DEF" | "ATA";
export type ColumnCSlotRole = ColumnCLineRole | "GOL";

export const COLUMN_C_SCORING = {
  ATA: { goal: 4, assist: 2.5, conceded: -0.5, cleanSheet: 0, ownGoal: -3 },
  DEF: {
    goal: 5,
    assist: 3,
    conceded: -0.5,
    cleanSheet: 3,
    oneGoal: 1,
    oneGoalConceded: -0.75,
    twoGoalsConceded: -1.75,
    ownGoal: -3,
  },
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

export type ColumnCLineScoringOptions = {
  goal?: number;
  assist?: number;
  conceded?: number;
  cleanSheet?: number;
  oneGoal?: number;
  oneGoalConceded?: number;
  twoGoalsConceded?: number;
  ownGoal?: number;
};

export type ColumnCGoalkeeperScoringOptions = {
  appearance?: number;
  goal?: number;
  assist?: number;
  conceded?: number;
  cleanSheet?: number;
  oneGoal?: number;
  ownGoal?: number;
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

/** Em partidas até dois gols: sofridos = jogos_de_1 + 2 × jogos_de_2. */
export function inferTwoGoalGames(goalsConceded: number, oneGoalGames: number) {
  return Math.max(0, (count(goalsConceded) - count(oneGoalGames)) / 2);
}

export function calculateColumnCLinePoints(
  role: ColumnCLineRole,
  stats: ColumnCStats,
  scoringVersion = COLUMN_C_SCORING_VERSION,
  options: ColumnCLineScoringOptions = {},
) {
  const rule = COLUMN_C_SCORING[role];
  const progressiveDefense = role === "DEF" && scoringVersion >= 12;
  const tieredDefensePenalty = role === "DEF" && scoringVersion >= 13;
  const oneGoalGames = count(stats.defensiveOneGoalGames);
  const twoGoalGames = inferTwoGoalGames(count(stats.teamGoalsConceded), oneGoalGames);
  const concededPoints = tieredDefensePenalty
    ? oneGoalGames * cents(options.oneGoalConceded ?? COLUMN_C_SCORING.DEF.oneGoalConceded)
      + twoGoalGames * cents(options.twoGoalsConceded ?? COLUMN_C_SCORING.DEF.twoGoalsConceded)
    : count(stats.teamGoalsConceded) * cents(options.conceded ?? rule.conceded);
  return (
    count(stats.goals) * cents(options.goal ?? rule.goal)
    + count(stats.assists) * cents(options.assist ?? rule.assist)
    + concededPoints
    + count(stats.defensiveCleanGames) * cents(role === "DEF" ? (options.cleanSheet ?? rule.cleanSheet) : rule.cleanSheet)
    + (progressiveDefense ? oneGoalGames * cents(options.oneGoal ?? COLUMN_C_SCORING.DEF.oneGoal) : 0)
    + count(stats.ownGoals) * cents(options.ownGoal ?? rule.ownGoal)
  ) / 100;
}

export function calculateColumnCGoalkeeperPoints(
  stats: ColumnCStats,
  scoringVersion = COLUMN_C_SCORING_VERSION,
  options: ColumnCGoalkeeperScoringOptions = {},
) {
  const rule = COLUMN_C_SCORING.GOL;
  const progressiveDefense = scoringVersion >= 12;
  const cleanSheetPoints = progressiveDefense ? (options.cleanSheet ?? rule.cleanSheet) : 2;
  const oneGoalGames = progressiveDefense
    ? inferOneGoalGames(
        count(stats.goalkeeperGames),
        count(stats.goalkeeperCleanSheets),
        count(stats.goalkeeperGoalsConceded),
      )
    : 0;
  return (
    count(stats.goalkeeperGames) * cents(options.appearance ?? rule.appearance)
    + count(stats.goalkeeperGoals) * cents(options.goal ?? rule.goal)
    + count(stats.goalkeeperAssists) * cents(options.assist ?? rule.assist)
    + count(stats.goalkeeperGoalsConceded) * cents(options.conceded ?? rule.conceded)
    + count(stats.goalkeeperCleanSheets) * cents(cleanSheetPoints)
    + oneGoalGames * cents(options.oneGoal ?? rule.oneGoal)
    + count(stats.goalkeeperOwnGoals) * cents(options.ownGoal ?? rule.ownGoal)
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
  lineOptions: ColumnCLineScoringOptions = {},
  goalkeeperOptions: ColumnCGoalkeeperScoringOptions = {},
) {
  const lineStats: ColumnCStats = {
    goals: Math.max(0, count(stats.goals) - count(stats.goalkeeperGoals)),
    assists: Math.max(0, count(stats.assists) - count(stats.goalkeeperAssists)),
    ownGoals: Math.max(0, count(stats.ownGoals) - count(stats.goalkeeperOwnGoals)),
    teamGoalsConceded: Math.max(0, count(stats.teamGoalsConceded) - count(stats.goalkeeperGoalsConceded)),
    defensiveCleanGames: count(stats.defensiveCleanGames),
    defensiveOneGoalGames: count(stats.defensiveOneGoalGames),
  };
  return calculateColumnCLinePoints(role, lineStats, scoringVersion, lineOptions)
    + calculateColumnCGoalkeeperPoints(stats, scoringVersion, goalkeeperOptions);
}

export function profileToColumnCRole(profile: string | null | undefined): ColumnCLineRole {
  return profile === "defensive" ? "DEF" : "ATA";
}
