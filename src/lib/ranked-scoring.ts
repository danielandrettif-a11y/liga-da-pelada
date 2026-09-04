import { BQ_SCORING_V5, calculateBQBasePoints, type BQBaseScoringSnapshot, type BQPlayerStats } from "./bq-scoring";

export const RANKED_SCORING = {
  win: BQ_SCORING_V5.win,
  goal: BQ_SCORING_V5.goal,
  assist: BQ_SCORING_V5.assist,
  draw: BQ_SCORING_V5.draw,
  loss: BQ_SCORING_V5.loss,
  ownGoal: BQ_SCORING_V5.ownGoal,
  goalkeeperAppearance: BQ_SCORING_V5.goalkeeperAppearance,
  goalkeeperGoalConceded: BQ_SCORING_V5.goalkeeperGoalConceded,
} as const;

export type RankedScoringStats = {
  wins?: number;
  goals?: number;
  assists?: number;
  draws?: number;
  losses?: number;
  ownGoals?: number;
  goalkeeperAppearances?: number;
  goalkeeperGoalsConceded?: number;
};

export type RankedPointBreakdownItem = {
  label: string;
  count: number;
  points: number;
};

function amount(value: number | null | undefined) {
  return Number(value || 0);
}

/**
 * Fonte única da pontuação Ranked. Delega para calculateBQBasePoints para
 * garantir paridade com o Cartola nos 8 scouts básicos.
 */
export function calculateRankedPoints(stats: RankedScoringStats, snapshot?: BQBaseScoringSnapshot) {
  const scoring = snapshot ?? BQ_SCORING_V5;
  const bqStats: BQPlayerStats = {
    goals: amount(stats.goals),
    assists: amount(stats.assists),
    wins: amount(stats.wins),
    draws: amount(stats.draws),
    losses: amount(stats.losses),
    ownGoals: amount(stats.ownGoals),
    goalkeeperAppearances: amount(stats.goalkeeperAppearances),
    goalkeeperGoalsConceded: amount(stats.goalkeeperGoalsConceded),
  };
  return calculateBQBasePoints(scoring, bqStats);
}

export function buildRankedPointBreakdown(stats: RankedScoringStats): RankedPointBreakdownItem[] {
  const entries: Array<[keyof RankedScoringStats, string, string, number]> = [
    ["goals", "Gol", "Gols", RANKED_SCORING.goal],
    ["assists", "Assistência", "Assistências", RANKED_SCORING.assist],
    ["wins", "Vitória", "Vitórias", RANKED_SCORING.win],
    ["draws", "Empate", "Empates", RANKED_SCORING.draw],
    ["losses", "Derrota", "Derrotas", RANKED_SCORING.loss],
    ["goalkeeperAppearances", "Jogo no gol", "Jogos no gol", RANKED_SCORING.goalkeeperAppearance],
    ["goalkeeperGoalsConceded", "Gol sofrido", "Gols sofridos", RANKED_SCORING.goalkeeperGoalConceded],
    ["ownGoals", "Gol contra", "Gols contra", RANKED_SCORING.ownGoal],
  ];

  return entries.flatMap(([key, singular, plural, pointsEach]) => {
    const count = amount(stats[key]);
    if (count <= 0) return [];
    // Calcula em centésimos para manter a precisão com decimais
    const points = Math.round(count * pointsEach * 100) / 100;
    return [{ label: count === 1 ? singular : plural, count, points }];
  });
}

export const RANKED_SCORING_RULES = [
  { key: "win", icon: "🏆", label: "Vitória", description: "Por vitória em uma partida.", points: RANKED_SCORING.win },
  { key: "goal", icon: "⚽", label: "Gol", description: "Por gol marcado.", points: RANKED_SCORING.goal },
  { key: "assist", icon: "🎯", label: "Assistência", description: "Por assistência registrada.", points: RANKED_SCORING.assist },
  { key: "draw", icon: "🤝", label: "Empate", description: "Por empate em uma partida.", points: RANKED_SCORING.draw },
  { key: "loss", icon: "❌", label: "Derrota", description: "Por derrota em uma partida.", points: RANKED_SCORING.loss },
  { key: "ownGoal", icon: "⚠️", label: "Gol contra", description: "Por gol contra registrado.", points: RANKED_SCORING.ownGoal },
] as const;

export const RANKED_GOALKEEPER_SCORING_RULES = [
  { key: "goalkeeperAppearance", icon: "🧤", label: "Atuação como goleiro", description: "Somente quando registrado no gol naquela partida.", points: RANKED_SCORING.goalkeeperAppearance },
  { key: "goalkeeperGoalConceded", icon: "🥅", label: "Gol sofrido", description: "Por gol sofrido enquanto estiver realmente no gol.", points: RANKED_SCORING.goalkeeperGoalConceded, suffix: " por gol" },
] as const;
