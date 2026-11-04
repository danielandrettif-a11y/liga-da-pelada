import { calculateGoalkeeperMatchScouts } from "../../statistics/domain/goalkeeper-timeline.js";
import type { FantasySettings } from "./config.js";
import {
  calculateCostBenefit,
  calculateExpectedFantasyPoints,
  calculateFantasyForm,
  calculateFantasyGoalkeeperSlotPoints,
  calculateFantasyTrend,
  getFantasyPlayerTags,
  getFantasyRankedScoringSnapshot,
  type FantasyPerformance,
} from "./engine.js";
import type { FantasyLiveMatch } from "./live-projection.js";
import { buildRankedPointBreakdown } from "./ranked-scoring.js";
import type { FantasyPlayerPerformanceDetail } from "./market-lineup.js";

type PlayerIdentity = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  memberCategory: string | null;
  isGoalkeeper: boolean;
};

export type FantasyPlayerHistoryItem = {
  id: string;
  fantasyRoundId: string;
  roundNumber: number | null;
  roundDate: string | null;
  priceBefore: number;
  priceAfter: number;
  variationRate: number;
  priceChange: number;
  marketBand: string;
  roundRank: number | null;
  roundPercentile: number | null;
  roundPoints: number;
  goals: number;
  assists: number;
  wins: number;
  games: number;
  createdAt: string;
};

export type FantasyPlayerRoundDetailInput = {
  fantasyRoundId: string;
  roundNumber: number;
  roundDate: string | null;
  status: "open" | "live" | "finished";
  stats: FantasyPerformance;
  settings: FantasySettings;
  slotRole: "GOL" | "DEF" | "ATA" | null;
  isCaptain: boolean;
  basePoints: number;
  positionBonus: number;
  captainBonus: number;
  totalPoints: number;
  matches: FantasyLiveMatch[];
};

function aggregateSeasonStats(rows: Array<Record<string, unknown>>) {
  const result = { goals: 0, assists: 0, wins: 0, losses: 0, games: 0,
    goalkeeperGames: 0, goalsConceded: 0 };
  for (const row of rows) {
    result.goals += Number(row.goals || 0);
    result.assists += Number(row.assists || 0);
    result.wins += Number(row.wins || 0);
    result.losses += Number(row.losses || 0);
    result.games += Number(row.games || 0);
    result.goalkeeperGames += Number(row.goalkeeper_games || 0);
    result.goalsConceded += Number(row.goals_conceded || 0);
  }
  return result;
}

function buildBreakdown(input: FantasyPlayerRoundDetailInput) {
  const stats = input.stats;
  if (Number(input.settings.scoringVersion || 0) >= 14 && input.slotRole !== "GOL") {
    return buildRankedPointBreakdown({
      goals: stats.goals,
      assists: stats.assists,
      wins: stats.wins,
      draws: stats.draws || 0,
      losses: stats.losses || 0,
      ownGoals: stats.ownGoals || 0,
      goalkeeperAppearances: stats.goalkeeperGames || 0,
      goalkeeperGoalsConceded: stats.goalsConceded || 0,
      goalkeeperGoals: stats.goalkeeperGoals || 0,
      goalkeeperAssists: stats.goalkeeperAssists || 0,
      goalkeeperOwnGoals: stats.goalkeeperOwnGoals || 0,
      goalkeeperCleanSheets: stats.cleanSheets || 0,
      teamGoalsConceded: stats.teamGoalsConceded || 0,
      defensiveCleanGames: stats.defensiveCleanGames || 0,
      defensiveOneGoalGames: stats.defensiveOneGoalGames || 0,
      lineRole: stats.playerProfile === "defensive" ? "DEF" : "ATA",
    }, getFantasyRankedScoringSnapshot(input.settings)).map((item, index) => ({
      key: `ranked_${index}`, label: item.label, count: item.count,
      unitPoints: item.count ? item.points / item.count : item.points,
      points: item.points, icon: item.label.includes("Assist") ? "👟" : item.label.includes("gol") || item.label.includes("Gol") ? "⚽" : "🛡️",
    }));
  }

  const items = [
    { key: "goals", label: "Gols", count: stats.goals, unitPoints: input.settings.goalPoints, icon: "⚽" },
    { key: "assists", label: "Assistências", count: stats.assists, unitPoints: input.settings.assistPoints, icon: "👟" },
    { key: "wins", label: "Vitórias", count: stats.wins, unitPoints: input.settings.winPoints, icon: "🏆" },
    { key: "draws", label: "Empates", count: stats.draws || 0, unitPoints: input.settings.drawPoints, icon: "🤝" },
    { key: "losses", label: "Derrotas", count: stats.losses || 0, unitPoints: input.settings.lossPoints, icon: "❌" },
    { key: "goalkeeper_games", label: "Atuações no gol", count: stats.goalkeeperGames || 0,
      unitPoints: input.settings.goalkeeperSlotAppearancePoints, icon: "🧤" },
    { key: "goals_conceded", label: "Gols sofridos no gol", count: stats.goalsConceded || 0,
      unitPoints: input.settings.goalkeeperSlotGoalConcededPoints, icon: "🥅" },
    { key: "own_goals", label: "Gols contra", count: stats.ownGoals || 0, unitPoints: input.settings.ownGoalPoints, icon: "⚠️" },
  ].filter((item) => item.count > 0).map((item) => ({ ...item, points: item.count * item.unitPoints }));
  if (input.positionBonus !== 0) items.push({ key: "position_bonus", label: `Bônus da posição ${input.slotRole || ""}`,
    count: 1, unitPoints: input.positionBonus, points: input.positionBonus, icon: "⚡" });
  if (input.isCaptain) items.push({ key: "captain_bonus", label: `Capitão ×${input.settings.captainMultiplier}`,
    count: 1, unitPoints: input.captainBonus, points: input.captainBonus, icon: "👑" });
  return items;
}

function buildMatches(matches: FantasyLiveMatch[], playerId: string) {
  return matches.flatMap((match, index) => {
    const participant = match.players.find((item) => item.playerId === playerId);
    const goalkeeper = calculateGoalkeeperMatchScouts({
      status: match.status, teamAId: match.teamAId, teamBId: match.teamBId,
      scoreA: match.scoreA, scoreB: match.scoreB, goalkeepers: match.goalkeepers,
      goalkeeperStints: match.goalkeeperStints, officialElapsedSeconds: match.officialElapsedSeconds,
      durationSeconds: match.durationSeconds, events: match.events,
    }).get(playerId);
    if (!participant && !goalkeeper) return [];
    const teamId = participant?.teamId || goalkeeper?.teamId;
    const isTeamA = teamId === match.teamAId;
    const myScore = isTeamA ? match.scoreA : match.scoreB;
    const opponentScore = isTeamA ? match.scoreB : match.scoreA;
    const finished = match.status === "finished";
    return [{
      matchId: match.id, matchIndex: index + 1, status: match.status,
      scoreFormatted: `${match.scoreA} x ${match.scoreB}`, myScore, oppScore: opponentScore,
      result: finished ? myScore > opponentScore ? "win" : myScore < opponentScore ? "loss" : "draw" : "live",
      goals: match.events.filter((event) => event.playerId === playerId && !event.isOwnGoal).length,
      assists: match.events.filter((event) => event.assistPlayerId === playerId && !event.isOwnGoal).length,
      ownGoals: match.events.filter((event) => event.playerId === playerId && event.isOwnGoal).length,
      isGoalkeeper: Boolean(goalkeeper), goalsConcededInMatch: goalkeeper?.goalsConceded || 0,
    }];
  });
}

function buildRoundDetail(input: FantasyPlayerRoundDetailInput) {
  const goalkeeperBasePoints = calculateFantasyGoalkeeperSlotPoints(input.stats, input.settings);
  const breakdown = buildBreakdown(input);
  return {
    scoringVersion: input.settings.scoringVersion, roundNumber: input.roundNumber,
    roundDate: input.roundDate, status: input.status, stats: input.stats,
    basePoints: input.basePoints, pointsWithPosition: input.basePoints + input.positionBonus,
    totalPoints: input.totalPoints, positionBonus: input.positionBonus,
    positionLabel: input.slotRole === "DEF" ? "DEF/VOL" : input.slotRole === "ATA" ? "ATA/ALA" : input.slotRole,
    slotRole: input.slotRole, isCaptain: input.isCaptain,
    captainMultiplier: input.settings.captainMultiplier, captainBonus: input.captainBonus,
    goalkeeperPreview: { games: input.stats.goalkeeperGames || 0, goalsConceded: input.stats.goalsConceded || 0,
      cleanSheets: input.stats.cleanSheets || 0, basePoints: goalkeeperBasePoints,
      positionBonus: 0, totalPoints: goalkeeperBasePoints, usesOfficialRankedPoints: false,
      isGoalkeeperSlot: input.slotRole === "GOL" },
    breakdown, matchesBreakdown: buildMatches(input.matches, input.stats.playerId),
    rulesList: [
      { label: "Gol marcado", unitPoints: input.settings.goalPoints, icon: "⚽" },
      { label: "Assistência", unitPoints: input.settings.assistPoints, icon: "👟" },
      { label: "Vitória na partida", unitPoints: input.settings.winPoints, icon: "🏆" },
      { label: "Derrota na partida", unitPoints: input.settings.lossPoints, icon: "❌" },
      { label: "Atuação na vaga GOL", unitPoints: input.settings.goalkeeperSlotAppearancePoints, icon: "🧤" },
      { label: "Gol sofrido na vaga GOL", unitPoints: input.settings.goalkeeperSlotGoalConcededPoints, icon: "🛡️" },
    ],
  };
}

export function buildFantasyPlayerPerformanceDetail(input: {
  player: PlayerIdentity;
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  seasonStats: Array<Record<string, unknown>>;
  history: FantasyPlayerHistoryItem[];
  roundDetail: FantasyPlayerRoundDetailInput | null;
  cosmetics: { bannerAssetKey: string | null; frameKey: string | null };
}): FantasyPlayerPerformanceDetail {
  const averagePoints = input.roundsPlayed > 0 ? input.totalPoints / input.roundsPlayed : 0;
  const validHistory = input.history.filter((item) => item.games > 0);
  const recentPoints = validHistory.slice(-5).map((item) => item.roundPoints);
  const recentVariations = validHistory.slice(-5).map((item) => item.variationRate);
  const trend = calculateFantasyTrend(recentVariations);
  const form = calculateFantasyForm(recentPoints);
  const expectedPoints = calculateExpectedFantasyPoints({ seasonAverage: averagePoints, recentPoints });
  const costBenefit = calculateCostBenefit(expectedPoints, input.price);
  const stats = aggregateSeasonStats(input.seasonStats);
  const tags = getFantasyPlayerTags({ price: input.price, totalPoints: input.totalPoints,
    roundsPlayed: input.roundsPlayed, recentPoints, recentVariations, goals: stats.goals,
    assists: stats.assists, goalkeeperGames: stats.goalkeeperGames,
    goalsConceded: stats.goalsConceded, isGoalkeeper: input.player.isGoalkeeper });
  const roundDetail = input.roundDetail ? buildRoundDetail(input.roundDetail) : null;
  const history = roundDetail && input.roundDetail
    ? input.history.map((item) => item.fantasyRoundId === input.roundDetail?.fantasyRoundId
      ? { ...item, roundPoints: Number(roundDetail.totalPoints) } : item)
    : input.history;
  return {
    player: { id: input.player.id, name: input.player.name, avatarUrl: input.player.avatarUrl,
      profile: input.player.profile, memberCategory: input.player.memberCategory },
    price: input.price, totalPoints: input.totalPoints, roundsPlayed: input.roundsPlayed,
    averagePoints, stats, trend: trend.trend, trendLabel: trend.label, trendIcon: trend.icon,
    form: form.form, formLabel: form.label, formIcon: form.icon, formColorClass: form.colorClass,
    costBenefitScore: costBenefit.score, costBenefitRatio: costBenefit.ratio,
    costBenefitFormatted: costBenefit.formattedRatio, expectedPoints,
    recentPointsList: history.filter((item) => item.games > 0).slice(-5).map((item) => Number(item.roundPoints)),
    allTags: tags.allTags, compactTags: tags.compactTags, history, roundDetail,
    cosmetics: input.cosmetics,
  };
}
