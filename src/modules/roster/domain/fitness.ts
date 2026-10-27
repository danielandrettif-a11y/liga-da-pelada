import type { PlayerRoundFitness, RoundType } from "@/lib/types";

export type FitnessRoundEntry = {
  roundId: string;
  number: number;
  date: string;
  roundType: RoundType;
  fitness: PlayerRoundFitness | null;
};

export type FitnessSummary = {
  distanceKm: number;
  averageSpeedKmh: number;
  metersPerMinute: number;
  entries: number;
};

export type FitnessSummaries = { official: FitnessSummary; friendly: FitnessSummary };
