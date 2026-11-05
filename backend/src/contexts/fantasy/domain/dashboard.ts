import {
  calculateCostBenefit,
  calculateExpectedFantasyPoints,
  calculateFantasyForm,
  calculateFantasyTrend,
  calculateMarketPopularity,
  getFantasyPlayerTags,
} from "./engine.js";

export type FantasyDashboardPlayerInput = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  isGoalkeeper: boolean;
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  stats: Record<string, number>;
  history: Array<{ points: number; variation: number; priceChange: number }>;
  roundStats?: any;
  cosmetics?: Record<string, unknown> | null;
  isInCurrentRound: boolean;
};

type DashboardLineupInput = {
  userId: string;
  playerIds: string[];
  captainPlayerId?: string | null;
  topScorerPlayerId?: string | null;
  topAssistPlayerId?: string | null;
};

const byNumberDesc = (field: string) => (a: Record<string, any>, b: Record<string, any>) =>
  Number(b[field] || 0) - Number(a[field] || 0) || String(a.name).localeCompare(String(b.name), "pt-BR");

function highlight(player: Record<string, any> | undefined, value: string, extra: string, badge: string) {
  return player ? { player, value, extra, badge } : null;
}

export function buildFantasyDashboardAnalytics(input: {
  players: FantasyDashboardPlayerInput[];
  currentLineups: DashboardLineupInput[];
  previousLineups: Array<Pick<DashboardLineupInput, "userId" | "playerIds">>;
  minSample: number;
}) {
  const popularity = calculateMarketPopularity({
    currentLineups: input.currentLineups,
    previousLineups: input.previousLineups,
    minSample: input.minSample,
  });
  const market = input.players.map((player) => {
    const recent = player.history.slice(-5);
    const recentPoints = recent.map((item) => item.points);
    const variations = recent.map((item) => item.variation);
    const trend = calculateFantasyTrend(variations);
    const form = calculateFantasyForm(recentPoints);
    const average = player.roundsPlayed ? player.totalPoints / player.roundsPlayed : 0;
    const expected = calculateExpectedFantasyPoints({ seasonAverage: average, recentPoints });
    const costBenefit = calculateCostBenefit(expected, player.price);
    const popular = popularity.getPopularity(player.id);
    const round = player.roundStats || {};
    const tags = getFantasyPlayerTags({
      price: player.price, totalPoints: player.totalPoints, roundsPlayed: player.roundsPlayed,
      recentPoints, recentVariations: variations, goals: player.stats.goals || 0,
      assists: player.stats.assists || 0, goalkeeperGames: player.stats.goalkeeperGames || 0,
      goalsConceded: player.stats.goalsConceded || 0, isGoalkeeper: player.isGoalkeeper,
      popularityPercent: popular.percent, captainPercent: popular.captainPercent,
    });
    return {
      id: player.id, name: player.name, avatarUrl: player.avatarUrl, profile: player.profile,
      isGoalkeeper: player.isGoalkeeper,
      isGoodGoalkeeper: player.isGoalkeeper && Number(player.stats.goalkeeperGames || 0) > 0
        && Number(player.stats.goalsConceded || 0) / Number(player.stats.goalkeeperGames || 1) <= 1,
      goalkeeperConcededAverage: player.stats.goalkeeperGames
        ? Number(player.stats.goalsConceded || 0) / player.stats.goalkeeperGames : null,
      price: player.price, totalPoints: player.totalPoints, roundsPlayed: player.roundsPlayed,
      goals: player.stats.goals || 0, assists: player.stats.assists || 0,
      wins: player.stats.wins || 0, losses: player.stats.losses || 0, games: player.stats.games || 0,
      goalkeeperGames: player.stats.goalkeeperGames || 0, goalkeeperGoals: player.stats.goalkeeperGoals || 0,
      goalkeeperAssists: player.stats.goalkeeperAssists || 0, goalkeeperOwnGoals: player.stats.goalkeeperOwnGoals || 0,
      goalkeeperWins: player.stats.goalkeeperWins || 0, goalkeeperDraws: player.stats.goalkeeperDraws || 0,
      goalkeeperLosses: player.stats.goalkeeperLosses || 0, goalsConceded: player.stats.goalsConceded || 0,
      cleanSheets: player.stats.cleanSheets || 0, goalkeeperPoints: player.stats.goalkeeperPoints || 0,
      roundGoalkeeperGames: round.goalkeeperGames || 0, roundGoalkeeperGoals: round.goalkeeperGoals || 0,
      roundGoalkeeperAssists: round.goalkeeperAssists || 0, roundGoalkeeperOwnGoals: round.goalkeeperOwnGoals || 0,
      roundGoalkeeperWins: round.goalkeeperWins || 0, roundGoalkeeperDraws: round.goalkeeperDraws || 0,
      roundGoalkeeperLosses: round.goalkeeperLosses || 0,
      roundGoalkeeperGoalsConceded: round.goalsConceded || 0,
      roundGoalkeeperCleanSheets: round.cleanSheets || 0,
      roundGoalkeeperPoints: round.goalkeeperPoints || 0,
      teamGoalsConceded: player.stats.teamGoalsConceded || 0,
      isInCurrentRound: player.isInCurrentRound,
      variation: recent.at(-1)?.variation || 0, priceChange: recent.at(-1)?.priceChange || 0,
      roundPoints: Number(round.basePoints || recent.at(-1)?.points || 0),
      trend: trend.trend, trendLabel: trend.label, trendIcon: trend.icon,
      form: form.form, formLabel: form.label, formIcon: form.icon, formColorClass: form.colorClass,
      recentPointsList: recentPoints.slice().reverse(), costBenefitScore: costBenefit.score,
      costBenefitRatio: costBenefit.ratio, costBenefitFormatted: costBenefit.formattedRatio,
      expectedPoints: expected, popularityPercent: popular.percent, demandPremiumPercent: 0,
      selectionCount: popular.count, previousSelectionCount: popular.previousCount,
      previousPopularityPercent: popular.previousPercent, marketShareDelta: popular.marketShareDelta,
      captainPercent: popular.captainPercent, buyersDelta: popular.buyersDelta,
      hasPreviousHistory: popular.hasHistory, allTags: tags.allTags, compactTags: tags.compactTags,
      cosmetics: player.cosmetics || null,
    };
  });

  const popularitySorted = [...market].sort(byNumberDesc("popularityPercent"));
  const captainSorted = [...market].sort(byNumberDesc("captainPercent"));
  const valuation = [...market].filter((item) => item.variation > 0).sort(byNumberDesc("variation"));
  const depreciation = [...market].filter((item) => item.variation < 0)
    .sort((a, b) => a.variation - b.variation);
  const costBenefit = [...market].sort(byNumberDesc("costBenefitScore"));
  const form = [...market].sort(byNumberDesc("expectedPoints"));
  const bought = [...market].filter((item) => item.marketShareDelta > 0).sort(byNumberDesc("marketShareDelta"));
  const sold = [...market].filter((item) => item.marketShareDelta < 0)
    .sort((a, b) => a.marketShareDelta - b.marketShareDelta);
  const round = [...market].sort(byNumberDesc("roundPoints"));
  const topList = (title: string, subtitle: string, items: Record<string, any>[], field: string, suffix: string) =>
    items.length ? { title, subtitle, contextLabel: "Próxima rodada", players: items.slice(0, 5).map((player) => ({
      player, value: `${player[field]}${suffix}`,
    })) } : null;
  const radar = {
    totalLineups: popularity.totalLineups, hasMinSample: popularity.hasMinSample,
    mostSelected: highlight(popularitySorted[0]?.popularityPercent ? popularitySorted[0] : undefined,
      `${popularitySorted[0]?.popularityPercent || 0}%`, "dos cartoleiros escalaram", "Mais Escalado"),
    mostCaptained: highlight(captainSorted[0]?.captainPercent ? captainSorted[0] : undefined,
      `${captainSorted[0]?.captainPercent || 0}%`, "como capitão da rodada", "Mais Capitão"),
    topValuation: highlight(valuation[0], `+${((valuation[0]?.variation || 0) * 100).toFixed(1)}%`,
      `+C$ ${(valuation[0]?.priceChange || 0).toFixed(2)}`, "Maior Valorização"),
    topDepreciation: highlight(depreciation[0], `${((depreciation[0]?.variation || 0) * 100).toFixed(1)}%`,
      `-C$ ${Math.abs(depreciation[0]?.priceChange || 0).toFixed(2)}`, "Maior Queda"),
    bestCostBenefit: highlight(costBenefit[0], `${(costBenefit[0]?.expectedPoints || 0).toFixed(1)} pts`,
      costBenefit[0]?.costBenefitFormatted || "", "Melhor Custo-Benefício"),
    bestForm: highlight(form[0], `${(form[0]?.expectedPoints || 0).toFixed(1)} pts`, "projeção recente", "Melhor Forma"),
    mostBought: highlight(bought[0], `+${(bought[0]?.marketShareDelta || 0).toFixed(1)} p.p.`, "desde a rodada anterior", "Mais Comprado"),
    mostSold: highlight(sold[0], `${(sold[0]?.marketShareDelta || 0).toFixed(1)} p.p.`, "desde a rodada anterior", "Mais Vendido"),
    favoriteScorer: null, favoriteAssist: null, comparison: null, latestWithdrawal: null,
    topLists: {
      mostSelected: topList("Mais escalados", "Preferidos do mercado", popularitySorted, "popularityPercent", "%"),
      mostCaptained: topList("Mais capitaneados", "Escolhas para capitão", captainSorted, "captainPercent", "%"),
      topValuation: topList("Valorizações", "Quem mais subiu", valuation, "priceChange", ""),
      topDepreciation: topList("Desvalorizações", "Quem mais caiu", depreciation, "priceChange", ""),
      bestCostBenefit: topList("Custo-benefício", "Retorno por preço", costBenefit, "costBenefitScore", ""),
      bestForm: topList("Melhor forma", "Projeção recente", form, "expectedPoints", " pts"),
      mostBought: topList("Mais comprados", "Crescimento no mercado", bought, "marketShareDelta", " p.p."),
      mostSold: topList("Mais vendidos", "Queda no mercado", sold, "marketShareDelta", " p.p."),
      favoriteScorers: null, favoriteAssists: null, goalkeepers: null,
      previousRoundGoals: null, previousRoundAssists: null, previousRoundEfficiency: null,
      previousRoundDefense: null,
    },
  };
  return {
    market, radar,
    insights: {
      topRoundPlayer: Number(round[0]?.roundPoints || 0) > 0 ? round[0] : null,
      mostSelectedPlayer: Number(popularitySorted[0]?.selectionCount || 0) > 0 ? popularitySorted[0] : null,
      topValuationPlayer: valuation[0] || null,
      topDepreciationPlayer: depreciation[0] || null,
    },
  };
}
