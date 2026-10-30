import type { Actor } from "../../../shared/actor.js";
import type { FriendlyStatsEntry, RoundStatistics } from "../domain/round-statistics.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RoundStatisticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoundStatisticsValidationError";
  }
}

function uuid(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(normalized)) throw new RoundStatisticsValidationError(`${label} inválida.`);
  return normalized;
}

export interface RoundStatisticsRepository {
  recalculateRoundStats(actor: Actor, leagueId: string, roundId: string): Promise<void>;
  findRoundStatistics(actor: Actor, leagueId: string, roundId: string): Promise<RoundStatistics | null>;
  findFriendlyStats(actor: Actor, leagueId: string): Promise<FriendlyStatsEntry[]>;
}

export class ManageRoundStatisticsUseCase {
  constructor(private readonly repository: RoundStatisticsRepository) {}

  async calculateRoundStats(actor: Actor, leagueId: string, roundId: string) {
    await this.repository.recalculateRoundStats(actor, uuid(leagueId, "Pelada"), uuid(roundId, "Rodada"));
    return { success: true as const };
  }

  getRoundStatistics(actor: Actor, leagueId: string, roundId: string) {
    return this.repository.findRoundStatistics(actor, uuid(leagueId, "Pelada"), uuid(roundId, "Rodada"));
  }

  getFriendlyStats(actor: Actor, leagueId: string) {
    return this.repository.findFriendlyStats(actor, uuid(leagueId, "Pelada"));
  }
}
