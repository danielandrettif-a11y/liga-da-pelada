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
