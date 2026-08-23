import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "./config";

export type FantasyPerformance = {
  playerId: string;
  games: number;
  wins: number;
  draws: number;
  losses?: number;
  goals: number;
  assists: number;
  goalkeeperGames?: number;
  goalsConceded?: number;
  teamGoalsConceded?: number;
  recentPoints: number[];
  seasonPoints: number[];
  currentPrice: number;
};

export type FantasyPriceResult = FantasyPerformance & {
  roundPoints: number;
  score: number;
  marketBand: FantasyTrend;
  roundRank: number | null;
  roundPercentile: number | null;
  variationRate: number;
  nextPrice: number;
};

export type FantasyTrend = "UP" | "STABLE" | "DOWN";

export type FantasyFormLevel = "EXCELLENT" | "GOOD" | "REGULAR" | "POOR" | "TERRIBLE";

export type FantasyTagType =
  | "HIGH_VALUE"
  | "TREND_UP"
  | "TREND_DOWN"
  | "MOST_SELECTED"
  | "MOST_CAPTAINED"
  | "REVELATION"
  | "HOT_SCORER"
  | "HOT_PLAYMAKER"
  | "GOOD_GOALKEEPER"
  | "BUDGET"
  | "PREMIUM";

export type FantasyTagItem = {
  type: FantasyTagType;
  label: string;
  icon?: string;
  variant: "accent" | "success" | "warning" | "danger" | "muted" | "purple";
  priority: number; // Menor número = maior prioridade
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFantasyPlayerPoints(
  stats: Pick<
    FantasyPerformance,
    "goals" | "assists" | "wins" | "losses" | "goalkeeperGames" | "goalsConceded" | "teamGoalsConceded"
  >,
  settings: FantasySettings = DEFAULT_FANTASY_SETTINGS,
) {
  return (
    stats.goals * settings.goalPoints +
    stats.assists * settings.assistPoints +
    stats.wins * settings.winPoints +
    (stats.losses || 0) * ((stats.goalkeeperGames || 0) > 0 ? settings.goalkeeperLossPoints : settings.lossPoints) +
    (stats.goalkeeperGames || 0) * settings.goalkeeperAppearancePoints +
    // A penalidade defensiva é compartilhada entre quem entrou em campo.
    // Para rodadas antigas, o fallback preserva o dado histórico do goleiro.
    (stats.teamGoalsConceded ?? stats.goalsConceded ?? 0) * settings.teamGoalConcededPoints
  );
}

export function predictionIsCorrect<T>(choice: T | null | undefined, leaders: T[], leaderValue: number) {
  return leaderValue > 0 && choice != null && leaders.includes(choice);
}

export function validateFantasyDraft(input: {
  playerIds: string[];
  captainPlayerId?: string | null;
  prices: Map<string, number>;
  budget: number;
  maxPlayers?: number;
}) {
  const maxPlayers = input.maxPlayers ?? 5;
  const uniqueIds = [...new Set(input.playerIds)];
  if (uniqueIds.length !== input.playerIds.length) return { valid: false, error: "Jogador repetido na escalação." };
  if (uniqueIds.length > maxPlayers) return { valid: false, error: `A escalação aceita no máximo ${maxPlayers} jogadores.` };
  if (input.captainPlayerId && !uniqueIds.includes(input.captainPlayerId)) {
    return { valid: false, error: "O capitão precisa estar entre os jogadores escalados." };
  }
  const cost = roundMoney(
    uniqueIds.reduce((total, id) => total + (input.prices.get(id) ?? Number.POSITIVE_INFINITY), 0)
  );
  if (!Number.isFinite(cost)) return { valid: false, error: "Preço de jogador inválido." };
  if (cost > input.budget) return { valid: false, error: "A escalação ultrapassa o patrimônio disponível." };
  return { valid: true, cost, complete: uniqueIds.length === maxPlayers && Boolean(input.captainPlayerId) };
}

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function percentiles(values: Array<{ playerId: string; value: number }>): Map<string, number> {
  const sorted = [...values].sort((a, b) => a.value - b.value || a.playerId.localeCompare(b.playerId));
  const result = new Map<string, number>();
  if (sorted.length <= 1) {
    sorted.forEach((item) => result.set(item.playerId, 0.5));
    return result;
  }
  sorted.forEach((item, index) => result.set(item.playerId, index / (sorted.length - 1)));
  return result;
}

/**
 * Balanceamento V2: o preço depende exclusivamente dos pontos-base da rodada.
 * A posição percentual usa o meio do grupo empatado (midrank), garantindo que
 * pontuações iguais sempre recebam a mesma faixa e a mesma variação.
 */
export function calculateFantasyPrices(
  players: FantasyPerformance[],
  settings: FantasySettings = DEFAULT_FANTASY_SETTINGS
): FantasyPriceResult[] {
  const participants = players.filter((player) => player.games > 0);
  if (!participants.length) {
    return players.map((player) => ({
      ...player,
      roundPoints: 0,
      score: 0.5,
      marketBand: "STABLE" as const,
      roundRank: null,
      roundPercentile: null,
      variationRate: 0,
      nextPrice: player.currentPrice,
    }));
  }

  const ranked = participants
    .map((player) => ({ player, roundPoints: calculateFantasyPlayerPoints(player, settings) }))
    .sort((a, b) => b.roundPoints - a.roundPoints || a.player.playerId.localeCompare(b.player.playerId));
  const allTied = ranked[0]?.roundPoints === ranked[ranked.length - 1]?.roundPoints;
  const groups: Array<{ start: number; end: number; percentile: number; marketBand: FantasyTrend }> = [];

  for (let start = 0; start < ranked.length;) {
    let end = start;
    while (end + 1 < ranked.length && ranked[end + 1].roundPoints === ranked[start].roundPoints) end += 1;
    const percentile = ranked.length === 1 ? 0.5 : ((start + end) / 2) / (ranked.length - 1);
    groups.push({
      start,
      end,
      percentile,
      marketBand: allTied ? "STABLE" : percentile < 0.3 ? "UP" : percentile < 0.6 ? "STABLE" : "DOWN",
    });
    start = end + 1;
  }

  const bandRange = (band: FantasyTrend) => {
    const percentiles = groups.filter((group) => group.marketBand === band).map((group) => group.percentile);
    return { min: Math.min(...percentiles), max: Math.max(...percentiles) };
  };
  const upRange = bandRange("UP");
  const downRange = bandRange("DOWN");
  const byId = new Map<string, FantasyPriceResult>();

  for (const { start, end, percentile, marketBand } of groups) {
    const variationRate = marketBand === "UP"
      ? upRange.max === upRange.min
        ? settings.maxPriceIncrease
        : settings.maxPriceIncrease
          - ((percentile - upRange.min) / (upRange.max - upRange.min)) * (settings.maxPriceIncrease - 0.03)
      : marketBand === "DOWN"
        ? downRange.max === downRange.min
          ? -settings.maxPriceDecrease
          : -(0.02 + ((percentile - downRange.min) / (downRange.max - downRange.min)) * (settings.maxPriceDecrease - 0.02))
        : 0;

    for (let index = start; index <= end; index += 1) {
      const { player, roundPoints } = ranked[index];
      const nextPrice = roundMoney(
        Math.max(settings.minPlayerPrice, Math.min(settings.maxPlayerPrice, player.currentPrice * (1 + variationRate)))
      );
      byId.set(player.playerId, {
        ...player,
        roundPoints,
        score: 1 - percentile,
        marketBand,
        roundRank: start + 1,
        roundPercentile: percentile,
        variationRate,
        nextPrice,
      });
    }
  }

  // Jogadores ausentes mantêm preço e variação = 0
  return players.map(
    (player) =>
      byId.get(player.playerId) || {
        ...player,
        roundPoints: 0,
        score: 0.5,
        marketBand: "STABLE" as const,
        roundRank: null,
        roundPercentile: null,
        variationRate: 0,
        nextPrice: player.currentPrice,
      }
  );
}

/**
 * Calcula a Tendência de Mercado do jogador:
 * Em Alta: 2+ valorizações relevantes (> +1.5%) nas últimas 3 rodadas
 * Em Baixa: 2+ desvalorizações relevantes (< -1.5%) nas últimas 3 rodadas
 * Estável: demais casos
 */
export function calculateFantasyTrend(recentVariations: number[]): {
  trend: FantasyTrend;
  label: string;
  icon: string;
} {
  const lastThree = recentVariations.slice(-3);
  const positiveCount = lastThree.filter((v) => v >= 0.015).length;
  const negativeCount = lastThree.filter((v) => v <= -0.015).length;

  if (positiveCount >= 2) {
    return { trend: "UP", label: "Em Alta", icon: "🔥" };
  }
  if (negativeCount >= 2) {
    return { trend: "DOWN", label: "Em Baixa", icon: "📉" };
  }
  return { trend: "STABLE", label: "Estável", icon: "➡️" };
}

/**
 * Calcula a Forma Recente do atleta baseada na média de pontos das últimas 3 rodadas válidas:
 * 🔥 Excelente (>= 15 pts)
 * 🟢 Boa (>= 10 pts)
 * ⚪ Regular (>= 6 pts)
 * 🟠 Ruim (>= 3 pts)
 * 🔴 Péssima (< 3 pts)
 */
export function calculateFantasyForm(recentPoints: number[]): {
  form: FantasyFormLevel;
  label: string;
  icon: string;
  colorClass: string;
  recentAverage: number;
} {
  if (!recentPoints.length) {
    return { form: "REGULAR", label: "Estreante", icon: "⚪", colorClass: "text-muted", recentAverage: 0 };
  }
  const lastThree = recentPoints.slice(-3);
  const recentAverage = average(lastThree);

  if (recentAverage >= 15) {
    return { form: "EXCELLENT", label: "Excelente", icon: "🔥", colorClass: "text-warning", recentAverage };
  }
  if (recentAverage >= 10) {
    return { form: "GOOD", label: "Boa", icon: "🟢", colorClass: "text-success", recentAverage };
  }
  if (recentAverage >= 6) {
    return { form: "REGULAR", label: "Regular", icon: "⚪", colorClass: "text-foreground", recentAverage };
  }
  if (recentAverage >= 3) {
    return { form: "POOR", label: "Ruim", icon: "🟠", colorClass: "text-warning/80", recentAverage };
  }
  return { form: "TERRIBLE", label: "Péssima", icon: "🔴", colorClass: "text-danger", recentAverage };
}

/**
 * Custo-Benefício:
 * Relação entre a média de pontos e o preço atual.
 * Ex: Média 11.5 pts / C$ 12.0 = 0.96 pts/C$ -> Score ~8.8/10
 */
export function calculateCostBenefit(
  averagePoints: number,
  currentPrice: number
): {
  ratio: number;
  score: number;
  formattedRatio: string;
  formattedScore: string;
} {
  const safePrice = Math.max(1, currentPrice);
  const safeAvg = Math.max(0, averagePoints);
  const ratio = safeAvg / safePrice;

  // Escala calibrada: 0 pts/C$ = 0/10, 0.5 pts/C$ = 5.0/10, 1.0 pts/C$ = 8.0/10, >= 1.5 pts/C$ = 10.0/10
  let score = 0;
  if (ratio <= 0.5) {
    score = (ratio / 0.5) * 5.0;
  } else if (ratio <= 1.0) {
    score = 5.0 + ((ratio - 0.5) / 0.5) * 3.0;
  } else {
    score = 8.0 + Math.min(2.0, ((ratio - 1.0) / 0.5) * 2.0);
  }
  score = Math.round(score * 10) / 10;

  return {
    ratio: Math.round(ratio * 100) / 100,
    score,
    formattedRatio: `${ratio.toFixed(2).replace(".", ",")} pts/C$`,
    formattedScore: `${score.toFixed(1).replace(".", ",")}/10`,
  };
}

/**
 * Sistema de Tags Automáticas com Prioridade:
 * Retorna lista de tags qualificadas, ordenadas por relevância.
 * Apenas no máximo 2 tags são exibidas no card compacto para preservar clareza visual mobile.
 */
export function getFantasyPlayerTags(params: {
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  recentPoints: number[];
  recentVariations: number[];
  goals: number;
  assists: number;
  goalkeeperGames?: number;
  goalsConceded?: number;
  isGoalkeeper?: boolean;
  popularityPercent?: number;
  captainPercent?: number;
  isMostSelected?: boolean;
  isMostCaptained?: boolean;
  maxTagsCompact?: number;
}): { allTags: FantasyTagItem[]; compactTags: FantasyTagItem[] } {
  const {
    price,
    roundsPlayed,
    totalPoints,
    recentPoints,
    recentVariations,
    goals,
    assists,
    goalkeeperGames = 0,
    goalsConceded = 0,
    isGoalkeeper = false,
    popularityPercent = 0,
    captainPercent = 0,
    isMostSelected = false,
    isMostCaptained = false,
    maxTagsCompact = 2,
  } = params;

  const avgPoints = roundsPlayed > 0 ? totalPoints / roundsPlayed : 0;
  const trend = calculateFantasyTrend(recentVariations);
  const form = calculateFantasyForm(recentPoints);
  const costBenefit = calculateCostBenefit(avgPoints, price);

  const tags: FantasyTagItem[] = [];

  // 1. Mais Escalado
  if (isMostSelected || popularityPercent >= 45) {
    tags.push({
      type: "MOST_SELECTED",
      label: "Mais Escalado",
      icon: "👑",
      variant: "accent",
      priority: 1,
    });
  }

  // 2. Mais Capitaneado
  if (isMostCaptained || captainPercent >= 25) {
    tags.push({
      type: "MOST_CAPTAINED",
      label: "Mais Capitão",
      icon: "©",
      variant: "warning",
      priority: 2,
    });
  }

  // 3. Bom Custo-Benefício (preço equilibrado com excelente retorno)
  if (costBenefit.score >= 8.0 && avgPoints >= 7.0) {
    tags.push({
      type: "HIGH_VALUE",
      label: "Bom Custo-Benefício",
      icon: "💎",
      variant: "accent",
      priority: 3,
    });
  }

  // 4. Revelação (barato/médio, boa forma e pontuando bem)
  if (price <= 12.0 && form.recentAverage >= 11.0 && roundsPlayed >= 2 && roundsPlayed <= 8) {
    tags.push({
      type: "REVELATION",
      label: "Revelação",
      icon: "🚀",
      variant: "purple",
      priority: 4,
    });
  }

  // 5. Em Alta
  if (trend.trend === "UP") {
    tags.push({
      type: "TREND_UP",
      label: "Em Alta",
      icon: "🔥",
      variant: "success",
      priority: 5,
    });
  }

  // 6. Em Baixa
  if (trend.trend === "DOWN") {
    tags.push({
      type: "TREND_DOWN",
      label: "Em Baixa",
      icon: "📉",
      variant: "danger",
      priority: 6,
    });
  }

  // 7. Artilheiro em Forma
  if (goals >= 3 && form.recentAverage >= 10.0) {
    tags.push({
      type: "HOT_SCORER",
      label: "Artilheiro em Forma",
      icon: "🎯",
      variant: "warning",
      priority: 7,
    });
  }

  // 8. Garçom em Forma
  if (assists >= 3 && form.recentAverage >= 9.0) {
    tags.push({
      type: "HOT_PLAYMAKER",
      label: "Garçom em Forma",
      icon: "🍽️",
      variant: "accent",
      priority: 8,
    });
  }

  // 9. Premium
  if (price >= 18.0) {
    tags.push({
      type: "PREMIUM",
      label: "Premium",
      icon: "💸",
      variant: "purple",
      priority: 9,
    });
  }

  // 10. Barato / Oportunidade
  if (price <= 8.0 && avgPoints >= 5.0) {
    tags.push({
      type: "BUDGET",
      label: "Barato",
      icon: "💰",
      variant: "muted",
      priority: 10,
    });
  }

  tags.sort((a, b) => a.priority - b.priority);

  return {
    allTags: tags,
    compactTags: tags.slice(0, maxTagsCompact),
  };
}

/**
 * Agregador de Popularidade e Radar Cartola:
 * Calcula % escalado, % capitão, mais comprado e mais vendido.
 * Aplica proteção de amostra mínima para evitar distorção com poucos usuários.
 */
export function calculateMarketPopularity(params: {
  currentLineups: Array<{
    userId: string;
    playerIds: string[];
    captainPlayerId?: string | null;
    topScorerPlayerId?: string | null;
    topAssistPlayerId?: string | null;
  }>;
  previousLineups?: Array<{
    userId: string;
    playerIds: string[];
  }>;
  minSample?: number;
}) {
  const { currentLineups, previousLineups = [], minSample = 3 } = params;
  const totalLineups = currentLineups.length;
  const hasMinSample = totalLineups >= minSample;

  const selectionCounts = new Map<string, number>();
  const captainCounts = new Map<string, number>();
  const scorerPredictionCounts = new Map<string, number>();
  const assistPredictionCounts = new Map<string, number>();

  for (const lineup of currentLineups) {
    for (const pid of lineup.playerIds) {
      selectionCounts.set(pid, (selectionCounts.get(pid) || 0) + 1);
    }
    if (lineup.captainPlayerId) {
      captainCounts.set(lineup.captainPlayerId, (captainCounts.get(lineup.captainPlayerId) || 0) + 1);
    }
    if (lineup.topScorerPlayerId) {
      scorerPredictionCounts.set(lineup.topScorerPlayerId, (scorerPredictionCounts.get(lineup.topScorerPlayerId) || 0) + 1);
    }
    if (lineup.topAssistPlayerId) {
      assistPredictionCounts.set(lineup.topAssistPlayerId, (assistPredictionCounts.get(lineup.topAssistPlayerId) || 0) + 1);
    }
  }

  // Comparações de compra e venda (delta entre rodadas)
  const previousSelectionCounts = new Map<string, number>();
  const hasPreviousHistory = previousLineups.length > 0;
  if (hasPreviousHistory) {
    for (const prev of previousLineups) {
      for (const pid of prev.playerIds) {
        previousSelectionCounts.set(pid, (previousSelectionCounts.get(pid) || 0) + 1);
      }
    }
  }

  const buyersDelta = new Map<string, number>();
  const allKnownPlayerIds = new Set([...selectionCounts.keys(), ...previousSelectionCounts.keys()]);
  for (const pid of allKnownPlayerIds) {
    const cur = selectionCounts.get(pid) || 0;
    const prev = previousSelectionCounts.get(pid) || 0;
    buyersDelta.set(pid, cur - prev);
  }

  function getPopularity(playerId: string) {
    const count = selectionCounts.get(playerId) || 0;
    const percent = totalLineups > 0 ? Math.round((count / totalLineups) * 100) : 0;
    const captainCount = captainCounts.get(playerId) || 0;
    const captainPercent = totalLineups > 0 ? Math.round((captainCount / totalLineups) * 100) : 0;
    const delta = hasPreviousHistory ? buyersDelta.get(playerId) || 0 : 0;

    return {
      count,
      percent,
      captainCount,
      captainPercent,
      buyersDelta: delta,
      hasHistory: hasPreviousHistory,
      hasMinSample,
    };
  }

  return {
    totalLineups,
    hasMinSample,
    hasPreviousHistory,
    getPopularity,
    selectionCounts,
    captainCounts,
    buyersDelta,
    scorerPredictionCounts,
    assistPredictionCounts,
  };
}
