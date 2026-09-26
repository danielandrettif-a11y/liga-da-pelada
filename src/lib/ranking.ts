import type { Player } from "./types";
import type { PlayerAwardSeason } from "./awards";

export type RankingAwards = {
  roundMvp: number;
  topScorer: number;
  topAssister: number;
  kingOfWins: number;
};

export type RankingBestRound = {
  roundId: string;
  roundNumber: number;
  date: string;
  points: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  games: number;
  pointBreakdown: Array<{
    label: string;
    count: number;
    points: number;
  }>;
  countedInTop6: boolean;
};

export type RankingEntry = {
  player: Player;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  overall?: number | null;
  overallTrend?: "rising" | "steady" | "falling" | null;
  overallPositions?: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
  overallGoalkeeperGames?: number;
  totalRawPoints?: number;
  bestRounds?: RankingBestRound[];
  minPointsToEnterTop6?: number | null;
  winRate: number;
  awards: RankingAwards;
  awardSeasons: PlayerAwardSeason[];
  seasonPosition: number;
  positionChange: number | null;
  fitness?: { distanceKm: number; averageSpeedKmh: number; entries: number } | null;
  cosmetics?: {
    frameKey: string | null;
    auraKey: string | null;
    titleName: string | null;
    bannerAssetKey: string | null;
    nameplateKey: string | null;
  } | null;
};

export type RankingExperienceData = {
  seasonLabel: string;
  general: RankingEntry[];
  monthly: {
    key: string;
    label: string;
    entries: RankingEntry[];
  } | null;
  latestRound: {
    id: string;
    number: number;
    date: string;
    entries: RankingEntry[];
  } | null;
};

export type RankingFilter = "general" | "goals" | "assists" | "wins" | "winRate" | "awards" | "overall" | "overallDef" | "overallAlaMei" | "overallAta" | "overallGol";
export type RankingView = "season" | "month" | "latest";

export function rankingActivePlayerIds(
  recentRoundIds: string[],
  rows: Array<{ round_id: string; player_id: string; games: number }>,
) {
  const recent = new Set(recentRoundIds.slice(0, 3));
  return new Set(rows.flatMap((row) => (
    recent.has(row.round_id) && Number(row.games || 0) > 0 ? [row.player_id] : []
  )));
}
