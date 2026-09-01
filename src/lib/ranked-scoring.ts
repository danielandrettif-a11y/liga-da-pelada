export const RANKED_SCORING = {
  win: 4,
  goal: 3,
  assist: 2,
  draw: 1,
  loss: -1,
  ownGoal: -2,
  goalkeeperAppearance: 3,
  goalkeeperGoalConceded: -1,
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

/** Fonte única da pontuação Ranked. Não recebe perfil, tag ou posição do Cartola. */
export function calculateRankedPoints(stats: RankedScoringStats) {
  return (
    amount(stats.wins) * RANKED_SCORING.win
    + amount(stats.goals) * RANKED_SCORING.goal
    + amount(stats.assists) * RANKED_SCORING.assist
    + amount(stats.draws) * RANKED_SCORING.draw
    + amount(stats.losses) * RANKED_SCORING.loss
    + amount(stats.ownGoals) * RANKED_SCORING.ownGoal
    + amount(stats.goalkeeperAppearances) * RANKED_SCORING.goalkeeperAppearance
    + amount(stats.goalkeeperGoalsConceded) * RANKED_SCORING.goalkeeperGoalConceded
  );
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
    return count > 0 ? [{ label: count === 1 ? singular : plural, count, points: count * pointsEach }] : [];
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
