import type { Actor } from "../../../shared/actor.js";
import {
  normalizeFitnessInput,
  parseRosterUuid,
  summarizeFitness,
  type FitnessMeasurement,
  type FitnessRoundEntry,
  type FitnessSummaries,
} from "../domain/fitness.js";

export interface FitnessRepository {
  listMyRounds(playerId: string, leagueId: string, actor: Actor): Promise<FitnessRoundEntry[]>;
  saveMyFitness(roundId: string, distanceKm: number, averageSpeedKmh: number, actor: Actor): Promise<string>;
  setMyVisibility(visible: boolean, actor: Actor): Promise<string>;
  listSummaryMeasurements(playerId: string, leagueId: string, actor: Actor): Promise<FitnessMeasurement[] | null>;
}

export function getMyFitnessRounds(
  playerId: string,
  leagueId: string,
  actor: Actor,
  repository: FitnessRepository,
): Promise<FitnessRoundEntry[]> {
  return repository.listMyRounds(
    parseRosterUuid(playerId, "Jogador"), parseRosterUuid(leagueId, "Pelada"), actor,
  );
}

export async function saveMyFitness(
  roundId: string,
  distance: unknown,
  pace: unknown,
  actor: Actor,
  repository: FitnessRepository,
): Promise<string> {
  const normalized = normalizeFitnessInput(distance, pace);
  return repository.saveMyFitness(
    parseRosterUuid(roundId, "Rodada"), normalized.distanceKm, normalized.averageSpeedKmh, actor,
  );
}

export function setMyFitnessVisibility(
  visible: boolean,
  actor: Actor,
  repository: FitnessRepository,
): Promise<string> {
  return repository.setMyVisibility(visible, actor);
}

export async function getPlayerFitnessSummaries(
  playerId: string,
  leagueId: string,
  actor: Actor,
  repository: FitnessRepository,
): Promise<FitnessSummaries | null> {
  const rows = await repository.listSummaryMeasurements(
    parseRosterUuid(playerId, "Jogador"), parseRosterUuid(leagueId, "Pelada"), actor,
  );
  return rows === null ? null : summarizeFitness(rows);
}
