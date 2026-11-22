import type { Actor } from "../../../shared/actor.js";
import {
  type BQBaseScoringSnapshot,
  type ColumnCScoringSettings,
  validateBQScoringSnapshot,
  validateColumnCScoringSettings,
} from "../domain/scoring-policy.js";

export class StatisticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatisticsValidationError";
  }
}

export interface ScoringRulesRepository {
  getBQScoringRules(leagueId: string, actor: Actor): Promise<BQBaseScoringSnapshot>;
  getColumnCScoringRules(leagueId: string, actor: Actor): Promise<ColumnCScoringSettings>;
  saveBQScoringRules(
    leagueId: string,
    snapshot: BQBaseScoringSnapshot,
    actor: Actor,
  ): Promise<{ success: boolean; version?: number }>;
  saveColumnCScoringRules(
    leagueId: string,
    settings: ColumnCScoringSettings,
    options: { reprocessRanked?: boolean },
    actor: Actor,
  ): Promise<{ success: boolean; roundsReprocessed: number; playerRoundsReprocessed: number }>;
}

function parseUuid(id: unknown, label: string): string {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id.trim())) {
    throw new StatisticsValidationError(`${label} inválido.`);
  }
  return id.trim();
}

export async function getBQScoringRules(
  leagueId: string,
  actor: Actor,
  repository: ScoringRulesRepository,
): Promise<BQBaseScoringSnapshot> {
  const parsedLeagueId = parseUuid(leagueId, "Identificador da liga");
  return repository.getBQScoringRules(parsedLeagueId, actor);
}

export async function getColumnCScoringRules(
  leagueId: string,
  actor: Actor,
  repository: ScoringRulesRepository,
): Promise<ColumnCScoringSettings> {
  const parsedLeagueId = parseUuid(leagueId, "Identificador da liga");
  return repository.getColumnCScoringRules(parsedLeagueId, actor);
}

export async function saveBQScoringRules(
  leagueId: string,
  snapshot: unknown,
  actor: Actor,
  repository: ScoringRulesRepository,
): Promise<{ success: boolean; version?: number }> {
  const parsedLeagueId = parseUuid(leagueId, "Identificador da liga");
  const validatedSnapshot = validateBQScoringSnapshot(snapshot);
  return repository.saveBQScoringRules(parsedLeagueId, validatedSnapshot, actor);
}

export async function saveColumnCScoringRules(
  leagueId: string,
  settings: unknown,
  options: { reprocessRanked?: boolean } | undefined,
  actor: Actor,
  repository: ScoringRulesRepository,
): Promise<{ success: boolean; roundsReprocessed: number; playerRoundsReprocessed: number }> {
  const parsedLeagueId = parseUuid(leagueId, "Identificador da liga");
  const validatedSettings = validateColumnCScoringSettings(settings);
  return repository.saveColumnCScoringRules(
    parsedLeagueId,
    validatedSettings,
    { reprocessRanked: Boolean(options?.reprocessRanked) },
    actor,
  );
}
