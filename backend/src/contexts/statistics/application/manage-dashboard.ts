import { buildDashboardData, type DashboardData } from "../domain/dashboard.js";

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
};

export interface DashboardRepository {
  getActiveSeasonId(leagueId: string): Promise<string | null>;
  getDashboardData(leagueId: string, seasonId: string): Promise<DashboardRawData>;
}

export type ManageDashboardService = {
  getDashboard(actor: { leagueId: string }): Promise<DashboardData>;
};

export function createManageDashboardService(
  repository: DashboardRepository,
): ManageDashboardService {
  return {
    async getDashboard(actor: { leagueId: string }): Promise<DashboardData> {
      if (!actor.leagueId) {
        throw new Error("ID da liga é obrigatório.");
      }

      const seasonId = await repository.getActiveSeasonId(actor.leagueId);
      if (!seasonId) {
        throw new Error("Temporada ativa não encontrada. Execute a migration 005.");
      }

      const raw = await repository.getDashboardData(actor.leagueId, seasonId);
      return buildDashboardData(raw);
    },
  };
}
