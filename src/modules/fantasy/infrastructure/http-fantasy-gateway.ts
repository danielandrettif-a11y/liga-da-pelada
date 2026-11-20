import { ApiError } from "@/modules/shared/domain/api-error";
import { apiClient } from "@/modules/shared/infrastructure/api-client";
import type { FantasyLineupSubmission } from "../domain/lineup-submission";

export class FantasyApiError extends ApiError {
  constructor(
    message: string,
    public readonly status: number = 500,
    code?: string,
    fieldErrors?: Readonly<Record<string, unknown>>
  ) {
    super(message, status, fieldErrors, code);
  }
}

export type FantasyHttpGateway = {
  getDashboard(leagueId: string): Promise<any>;
  getMarketSource(leagueId: string): Promise<unknown>;
  getMarketContext(leagueId: string): Promise<{ seasonId: string; settings: any; testSession: any; fantasySeason: any; fantasyRounds: any[]; marketHealth: any; marketVersion: string | null }>;
  getPersonalMarketInputs(leagueId: string, activeRoundId?: string | null, latestRoundId?: string | null, testSessionId?: string | null): Promise<{ seasonId: string; lineup: any; latestLineup: any; portfolio: any; account: any; latestCardActivation: any }>;
  getPlayerDetail(leagueId: string, playerId: string, fantasyRoundId?: string): Promise<any>;
  getQuickHighlights(leagueId: string): Promise<any>;
  getMySummary(leagueId: string): Promise<any>;
  getMyHistory(leagueId: string): Promise<any>;
  getLiveMatchSnapshots(leagueId: string, roundId: string): Promise<any[]>;
  getLiveProjectionInputs(leagueId: string, roundId: string): Promise<{ settings: any; lineups: any[]; players: any[] }>;
  getRevealedInputs(leagueId: string, roundId: string): Promise<{ lineups: any[]; players: any[]; reserves: any[]; prices: any[]; profiles: any[]; predictions: any[]; activations: any[] }>;
  getRevealedLineups(leagueId: string, roundId?: string): Promise<any>;
  getRoundLineupOverview(leagueId: string, roundId?: string): Promise<any>;
  saveLineup(leagueId: string, roundId: string, input: FantasyLineupSubmission): Promise<any>;
  previewMarketV11(leagueId: string): Promise<any>;
  repairLegacyLineups(leagueId: string): Promise<any>;
  // Métodos da Subfatia 2 que adicionaremos a seguir
  getRanking(leagueId: string, scope?: string, roundId?: string): Promise<any>;
  getRankingPeriodInputs(leagueId: string): Promise<{ accounts: any[]; rounds: any[]; lineups: any[] }>;
  getUserHistory(leagueId: string, userId: string): Promise<any>;
  getUserRoundHistory(leagueId: string, userId: string, roundId: string): Promise<any>;
  getSeasonPassDashboard(leagueId: string): Promise<any>;
  getAdminData(leagueId: string): Promise<any>;
  updateSettings(leagueId: string, settings: any): Promise<any>;
  reprocessRound(leagueId: string, roundId: string, useCurrentRules?: boolean): Promise<any>;
  createTestSession(leagueId: string, roundId: string): Promise<any>;
  processTestSession(leagueId: string, roundId: string): Promise<any>;
  resetTestSession(leagueId: string, roundId: string): Promise<any>;
};

export function httpFantasyGateway(baseUrl: string, accessToken: string): FantasyHttpGateway {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  const send = apiClient({ accessToken, fallback: "Erro na API de Fantasy." });

  async function request<T>(endpoint: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
      response = await send(`${cleanBase}${endpoint}`, options);
    } catch (error) {
      if (error instanceof ApiError) {
        throw new FantasyApiError(error.message, error.statusCode ?? 500, error.code, error.fieldErrors);
      }
      throw new FantasyApiError("Falha de conexão com a API de Fantasy.", 503);
    }
    return response.json();
  }

  async function command(endpoint: string, options: RequestInit & { json?: unknown } = {}) {
    try {
      return await request(endpoint, options);
    } catch (error) {
      if (error instanceof FantasyApiError && (error.status === 400 || error.status === 403)) {
        return { success: false, error: error.message };
      }
      throw error;
    }
  }

  return {
    getDashboard(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/dashboard`);
    },
    getMarketSource(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/market-source`);
    },
    getMarketContext(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/market-context`);
    },
    getPersonalMarketInputs(leagueId, activeRoundId, latestRoundId, testSessionId) {
      const query = new URLSearchParams();
      if (activeRoundId) query.set("activeRoundId", activeRoundId);
      if (latestRoundId) query.set("latestRoundId", latestRoundId);
      if (testSessionId) query.set("testSessionId", testSessionId);
      const suffix = query.size ? `?${query.toString()}` : "";
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/personal-market-inputs${suffix}`);
    },
    getPlayerDetail(leagueId, playerId, fantasyRoundId) {
      const qs = fantasyRoundId ? `?fantasyRoundId=${encodeURIComponent(fantasyRoundId)}` : "";
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}${qs}`);
    },
    getQuickHighlights(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/quick-highlights`);
    },
    getMySummary(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/my-summary`);
    },
    getMyHistory(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/my-history`);
    },
    getLiveMatchSnapshots(leagueId, roundId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/match-snapshots`);
    },
    getLiveProjectionInputs(leagueId, roundId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/projection-inputs`);
    },
    getRevealedInputs(leagueId, roundId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/revealed-inputs`);
    },
    getRevealedLineups(leagueId, roundId) {
      const rId = roundId ? encodeURIComponent(roundId) : "active";
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${rId}/revealed-lineups`);
    },
    getRoundLineupOverview(leagueId, roundId) {
      const rId = roundId ? encodeURIComponent(roundId) : "active";
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${rId}/overview`);
    },
    async saveLineup(leagueId, roundId, input) {
      try {
        return await request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/lineup`, {
          method: "POST",
          json: input,
        });
      } catch (error) {
        if (error instanceof FantasyApiError && error.status === 400) return { success: false, error: error.message };
        throw error;
      }
    },
    previewMarketV11(leagueId) {
      return command(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/preview-market`, {
        method: "POST",
      });
    },
    repairLegacyLineups(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/repair-lineups`, {
        method: "POST",
      });
    },
    getRanking(leagueId, scope = "season", roundId) {
      const qs = `?scope=${encodeURIComponent(scope)}${roundId ? `&roundId=${encodeURIComponent(roundId)}` : ""}`;
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/ranking${qs}`);
    },
    getRankingPeriodInputs(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/ranking-period-inputs`);
    },
    getUserHistory(leagueId, userId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/users/${encodeURIComponent(userId)}/history`);
    },
    getUserRoundHistory(leagueId, userId, roundId) {
      return request(
        `/api/fantasy/leagues/${encodeURIComponent(leagueId)}/users/${encodeURIComponent(userId)}/rounds/${encodeURIComponent(roundId)}/history`
      );
    },
    getSeasonPassDashboard(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/season-pass`);
    },
    getAdminData(leagueId) {
      return request(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/admin-data`);
    },
    updateSettings(leagueId, settings) {
      return command(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/settings`, {
        method: "POST",
        json: settings,
      });
    },
    reprocessRound(leagueId, roundId, useCurrentRules = false) {
      return command(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/reprocess`, {
        method: "POST",
        json: { useCurrentRules },
      });
    },
    createTestSession(leagueId, roundId) {
      return command(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/test-session/create`, {
        method: "POST",
      });
    },
    processTestSession(leagueId, roundId) {
      return command(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/test-session/process`, {
        method: "POST",
      });
    },
    resetTestSession(leagueId, roundId) {
      return command(`/api/fantasy/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/test-session/reset`, {
        method: "POST",
      });
    },
  };
}
