/**
 * Scouts Básicos BQ v5 — fonte canônica compartilhada entre Ranked e Cartola.
 *
 * Todos os cálculos internos são feitos em centésimos inteiros para eliminar
 * erros de ponto flutuante (IEEE 754). O resultado final é dividido por 100.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Snapshot imutável gravado em cada rodada. */
export type BQBaseScoringSnapshot = {
  version: number;
  goal: number;
  assist: number;
  win: number;
  draw: number;
  loss: number;
  ownGoal: number;
  goalkeeperAppearance: number;
  goalkeeperGoalConceded: number;
  defenderGoal?: number;
  defenderAssist?: number;
  defenderCleanSheet?: number;
  defenderOneGoal?: number;
  defenderOneGoalConceded?: number;
  defenderTwoGoalsConceded?: number;
  teamGoalConceded?: number;
  goalkeeperCleanSheet?: number;
  goalkeeperOneGoal?: number;
  positionRules?: PositionScoringRules;
  primaryWeight?: number;
  secondaryWeight?: number;
  lineCleanSheetMinShare?: number;
  goalkeeperGoal?: number;
  goalkeeperAssist?: number;
  goalkeeperOwnGoal?: number;
};

export type LinePosition = "DEF" | "MEI" | "ALA" | "ATA";
export type PositionScoringRule = {
  goal: number; assist: number; cleanSheet: number; conceded: number; ownGoal: number;
};
export type PositionScoringRules = Record<LinePosition, PositionScoringRule>;

export const DEFAULT_POSITION_SCORING: PositionScoringRules = {
  DEF: { goal: 4.5, assist: 2.5, cleanSheet: 3, conceded: -1, ownGoal: -3 },
  MEI: { goal: 4.5, assist: 3.5, cleanSheet: 1, conceded: -0.6, ownGoal: -3 },
  ALA: { goal: 4.75, assist: 3, cleanSheet: 1.5, conceded: -0.8, ownGoal: -3 },
  ATA: { goal: 5.5, assist: 2.5, cleanSheet: 0, conceded: -0.4, ownGoal: -3 },
};

/** Estatísticas brutas de um atleta na rodada. */
export type BQPlayerStats = {
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  ownGoals: number;
  goalkeeperAppearances: number;
  goalkeeperGoalsConceded: number;
};

export type BQBasePointBreakdownItem = {
  key: keyof BQPlayerStats;
  label: string;
  count: number;
  unitPoints: number;
  points: number;
};

// ---------------------------------------------------------------------------
// Valores padrão BQ v5
// ---------------------------------------------------------------------------

export const BQ_SCORING_V5: BQBaseScoringSnapshot = {
  version: 5,
  goal: 4,
  assist: 2.5,
  win: 3,
  draw: 1,
  loss: -2.5,
  ownGoal: -3,
  goalkeeperAppearance: 2,
  goalkeeperGoalConceded: -1,
} as const;

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

/** Converte para centésimos inteiros, somando sem erro de arredondamento. */
function cents(value: number): number {
  return Math.round(value * 100);
}

function amount(value: number | null | undefined): number {
  return Number(value || 0);
}

/**
 * Calcula a pontuação-base BQ usando exclusivamente os 8 scouts padrão.
 * Nenhuma regra posicional (DEF, MEI, ATA, GOL) entra aqui.
 *
 * O capitão é aplicado externamente como razão exata 3/2 (sem arredondar
 * scouts individuais).
 */
export function calculateBQBasePoints(
  snapshot: BQBaseScoringSnapshot,
  stats: BQPlayerStats,
): number {
  const totalCents =
    amount(stats.goals) * cents(snapshot.goal) +
    amount(stats.assists) * cents(snapshot.assist) +
    amount(stats.wins) * cents(snapshot.win) +
    amount(stats.draws) * cents(snapshot.draw) +
    amount(stats.losses) * cents(snapshot.loss) +
    amount(stats.ownGoals) * cents(snapshot.ownGoal) +
    amount(stats.goalkeeperAppearances) * cents(snapshot.goalkeeperAppearance) +
    amount(stats.goalkeeperGoalsConceded) * cents(snapshot.goalkeeperGoalConceded);

  return totalCents / 100;
}

/** Converte snapshots legados (snake_case) e atuais para o formato canônico. */
export function normalizeBQScoringSnapshot(
  value: Record<string, unknown> | null | undefined,
): BQBaseScoringSnapshot {
  const source = value || {};
  const numeric = (camel: string, snake: string, fallback: number) =>
    Number(source[camel] ?? source[snake] ?? fallback);
  const rulesSource = source.positionRules && typeof source.positionRules === "object"
    ? source.positionRules as Record<string, unknown> : {};
  const positionRules = Object.fromEntries(
    (Object.keys(DEFAULT_POSITION_SCORING) as LinePosition[]).map((position) => {
      const candidate = rulesSource[position] && typeof rulesSource[position] === "object"
        ? rulesSource[position] as Record<string, unknown> : {};
      const fallback = DEFAULT_POSITION_SCORING[position];
      return [position, {
        goal: Number(candidate.goal ?? fallback.goal),
        assist: Number(candidate.assist ?? fallback.assist),
        cleanSheet: Number(candidate.cleanSheet ?? fallback.cleanSheet),
        conceded: Number(candidate.conceded ?? fallback.conceded),
        ownGoal: Number(candidate.ownGoal ?? fallback.ownGoal),
      }];
    }),
  ) as PositionScoringRules;
  return {
    version: numeric("version", "scoring_version", BQ_SCORING_V5.version),
    goal: numeric("goal", "goal_points", BQ_SCORING_V5.goal),
    assist: numeric("assist", "assist_points", BQ_SCORING_V5.assist),
    win: numeric("win", "win_points", BQ_SCORING_V5.win),
    draw: numeric("draw", "draw_points", BQ_SCORING_V5.draw),
    loss: numeric("loss", "loss_points", BQ_SCORING_V5.loss),
    ownGoal: numeric("ownGoal", "own_goal_points", BQ_SCORING_V5.ownGoal),
    goalkeeperAppearance: numeric(
      "goalkeeperAppearance",
      "goalkeeper_appearance_points",
      BQ_SCORING_V5.goalkeeperAppearance,
    ),
    goalkeeperGoalConceded: numeric(
      "goalkeeperGoalConceded",
      "goal_conceded_points",
      BQ_SCORING_V5.goalkeeperGoalConceded,
    ),
    defenderGoal: numeric("defenderGoal", "defender_goal_points", 5),
    defenderAssist: numeric("defenderAssist", "defender_assist_points", 3),
    defenderCleanSheet: numeric("defenderCleanSheet", "defender_clean_sheet_points", 3),
    defenderOneGoal: numeric("defenderOneGoal", "defender_one_goal_points", 1),
    defenderOneGoalConceded: numeric("defenderOneGoalConceded", "defender_one_goal_conceded_points", -0.75),
    defenderTwoGoalsConceded: numeric("defenderTwoGoalsConceded", "defender_two_goals_conceded_points", -1.75),
    teamGoalConceded: numeric("teamGoalConceded", "line_goal_conceded_points", -0.5),
    goalkeeperCleanSheet: numeric("goalkeeperCleanSheet", "goalkeeper_slot_clean_sheet_points", 4),
    goalkeeperOneGoal: numeric("goalkeeperOneGoal", "goalkeeper_slot_one_goal_points", 2),
    positionRules,
    primaryWeight: numeric("primaryWeight", "primary_position_weight", 0.7),
    secondaryWeight: numeric("secondaryWeight", "secondary_position_weight", 0.3),
    lineCleanSheetMinShare: numeric("lineCleanSheetMinShare", "line_clean_sheet_min_share", 0.5),
    goalkeeperGoal: numeric("goalkeeperGoal", "goalkeeper_goal_points", 5),
    goalkeeperAssist: numeric("goalkeeperAssist", "goalkeeper_assist_points", 3),
    goalkeeperOwnGoal: numeric("goalkeeperOwnGoal", "goalkeeper_own_goal_points", -3),
  };
}

/** Breakdown compartilhado por Ranked, Cartola ao vivo e histórico. */
export function buildBQBasePointBreakdown(
  snapshot: BQBaseScoringSnapshot,
  stats: BQPlayerStats,
  options: { suppressGoalkeeperRewards?: boolean } = {},
): BQBasePointBreakdownItem[] {
  const rows: Array<[keyof BQPlayerStats, string, number]> = [
    ["goals", "Gols", snapshot.goal],
    ["assists", "Assistências", snapshot.assist],
    ["wins", "Vitórias", snapshot.win],
    ["draws", "Empates", snapshot.draw],
    ["losses", "Derrotas", snapshot.loss],
    ["ownGoals", "Gols contra", snapshot.ownGoal],
    ["goalkeeperAppearances", "Jogos como goleiro", options.suppressGoalkeeperRewards ? 0 : snapshot.goalkeeperAppearance],
    ["goalkeeperGoalsConceded", "Gols sofridos como goleiro", snapshot.goalkeeperGoalConceded],
  ];
  return rows.flatMap(([key, label, unitPoints]) => {
    const count = amount(stats[key]);
    if (count === 0) return [];
    return [{ key, label, count, unitPoints, points: Math.round(count * unitPoints * 100) / 100 }];
  });
}

/**
 * Aplica o multiplicador de capitão como razão exata (ex: 3/2 = 1.5x).
 * Calcula em centésimos para manter a precisão.
 */
export function applyCaptainMultiplier(
  basePoints: number,
  multiplier: number,
): number {
  return Math.round(cents(basePoints) * multiplier) / 100;
}

/**
 * Converte um snapshot BQ para o formato de chaves usado em ranking_rules
 * (snake_case com event_type).
 */
export function snapshotToRankingRules(snapshot: BQBaseScoringSnapshot) {
  return [
    { event_type: "goal" as const, points: snapshot.goal },
    { event_type: "assist" as const, points: snapshot.assist },
    { event_type: "win" as const, points: snapshot.win },
    { event_type: "draw" as const, points: snapshot.draw },
    { event_type: "loss" as const, points: snapshot.loss },
    { event_type: "own_goal" as const, points: snapshot.ownGoal },
    { event_type: "goalkeeper_appearance" as const, points: snapshot.goalkeeperAppearance },
    { event_type: "goal_conceded" as const, points: snapshot.goalkeeperGoalConceded },
  ];
}

/**
 * Converte ranking_rules (formato BD) de volta para um BQBaseScoringSnapshot.
 */
export function rankingRulesToSnapshot(
  rules: Array<{ event_type: string; points: number }>,
  version = 5,
): BQBaseScoringSnapshot {
  const map = new Map(rules.map((r) => [r.event_type, r.points]));
  return {
    version,
    goal: map.get("goal") ?? BQ_SCORING_V5.goal,
    assist: map.get("assist") ?? BQ_SCORING_V5.assist,
    win: map.get("win") ?? BQ_SCORING_V5.win,
    draw: map.get("draw") ?? BQ_SCORING_V5.draw,
    loss: map.get("loss") ?? BQ_SCORING_V5.loss,
    ownGoal: map.get("own_goal") ?? BQ_SCORING_V5.ownGoal,
    goalkeeperAppearance: map.get("goalkeeper_appearance") ?? BQ_SCORING_V5.goalkeeperAppearance,
    goalkeeperGoalConceded: map.get("goal_conceded") ?? BQ_SCORING_V5.goalkeeperGoalConceded,
  };
}
