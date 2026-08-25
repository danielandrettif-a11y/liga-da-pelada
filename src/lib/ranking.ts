import type { Player } from "./types";
import type { PlayerAwardSeason } from "./awards";

export type RankingAwards = {
  topScorer: number;
  topAssister: number;
  bestGoalkeeper: number;
};

export type RankingBestRound = {
  roundId: string;
  roundNumber: number;
  date: string;
  points: number;
  goals: number;
  assists: number;
  wins: number;
  games: number;
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
  latestRound: {
    id: string;
    number: number;
    date: string;
    entries: RankingEntry[];
  } | null;
};

export type RankingFilter = "general" | "goals" | "assists" | "wins" | "winRate" | "awards";
export type RankingView = "season" | "latest";
