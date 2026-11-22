export type FitnessRoundType = "official" | "friendly";

export type PlayerRoundFitness = {
  id: string;
  player_id: string;
  round_id: string;
  distance_km: number;
  average_speed_kmh: number;
  created_at: string;
  updated_at: string;
};

export type FitnessRoundEntry = {
  roundId: string;
  number: number;
  date: string;
  roundType: FitnessRoundType;
  fitness: PlayerRoundFitness | null;
};

export type FitnessMeasurement = {
  roundType: FitnessRoundType;
  distanceKm: number;
  averageSpeedKmh: number;
};

export type FitnessSummary = {
  distanceKm: number;
  averageSpeedKmh: number;
  metersPerMinute: number;
  entries: number;
};

export type FitnessSummaries = { official: FitnessSummary; friendly: FitnessSummary };

export class InvalidFitnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFitnessError";
  }
}

export function parseRosterUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidFitnessError(`${label} inválido.`);
  }
  return normalized;
}

export function normalizeFitnessInput(distance: unknown, pace: unknown): {
  distanceKm: number;
  averageSpeedKmh: number;
} {
  const distanceKm = Number(distance);
  const rawPace = Number(pace);
  if (!Number.isFinite(distanceKm) || distanceKm < 0.01 || distanceKm > 100) {
    throw new InvalidFitnessError("A distância deve ficar entre 0,01 e 100 km.");
  }
  if (!Number.isFinite(rawPace) || rawPace < 0.1 || rawPace > 1000) {
    throw new InvalidFitnessError("O ritmo deve ficar entre 0,1 e 1000 m/min.");
  }
  const speedKmh = rawPace > 35 ? (rawPace * 60) / 1000 : rawPace;
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    averageSpeedKmh: Math.round(speedKmh * 100) / 100,
  };
}

function summarizeType(rows: readonly FitnessMeasurement[], roundType: FitnessRoundType): FitnessSummary {
  const entries = rows.filter((row) => row.roundType === roundType);
  const averageSpeedKmh = entries.length
    ? Math.round((entries.reduce((sum, row) => sum + row.averageSpeedKmh, 0) / entries.length) * 100) / 100
    : 0;
  return {
    distanceKm: Math.round(entries.reduce((sum, row) => sum + row.distanceKm, 0) * 100) / 100,
    averageSpeedKmh,
    metersPerMinute: Math.round((averageSpeedKmh * 1000) / 60),
    entries: entries.length,
  };
}

export function summarizeFitness(rows: readonly FitnessMeasurement[]): FitnessSummaries {
  return { official: summarizeType(rows, "official"), friendly: summarizeType(rows, "friendly") };
}
