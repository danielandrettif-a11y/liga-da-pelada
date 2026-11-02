import { buildDashboardData, type DashboardData } from "../domain/dashboard.js";
import type { Actor } from "../../../shared/actor.js";

export type DashboardRawData = {
  league?: {
    matchDuration?: number;
    preseasonEnabled?: boolean;
    stadiumName?: string | null;
    stadiumMapUrl?: string | null;
    eventDurationMinutes?: number;
  } | null;
  nextRound?: any | null;
  nextFriendly?: any | null;
  liveMatch?: any | null;
  lastRound?: any | null;
  activeCallups?: any[] | null;
  nextRoundWeather?: unknown;
};

export interface DashboardRepository {
  getActiveSeasonId(actor: Actor, leagueId: string): Promise<string | null>;
  getDashboardData(actor: Actor, leagueId: string, seasonId: string): Promise<DashboardRawData>;
}

export type ManageDashboardService = {
  getDashboard(actor: Actor, leagueId: string): Promise<DashboardData>;
};

export function createManageDashboardService(
  repository: DashboardRepository,
): ManageDashboardService {
  return {
    async getDashboard(actor: Actor, leagueId: string): Promise<DashboardData> {
      if (!leagueId) {
        throw new Error("ID da liga é obrigatório.");
      }

      const seasonId = await repository.getActiveSeasonId(actor, leagueId);
      if (!seasonId) {
        throw new Error("Temporada ativa não encontrada. Execute a migration 005.");
      }

      const raw = await repository.getDashboardData(actor, leagueId, seasonId);
      return buildDashboardData(raw);
    },
  };
}
