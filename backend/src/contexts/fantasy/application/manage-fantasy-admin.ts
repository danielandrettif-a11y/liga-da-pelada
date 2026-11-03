import type { Actor } from "../../../shared/actor.js";
import type {
  FantasyRankingReadModel,
  FantasyUserHistoryReadModel,
  FantasyUserRoundHistoryReadModel,
} from "../domain/analytical-read-models.js";
import {
  buildFantasySettingsPayload,
  type FantasyAdminConfigData,
  type FantasyRankingScope,
  type SeasonPassDashboardData,
} from "../domain/fantasy-admin.js";

export interface FantasyAdminRepository {
  isLeagueAdmin(leagueId: string, userId: string): Promise<boolean>;
  getRanking(
    leagueId: string,
    scope: FantasyRankingScope,
    actorUserId: string,
    roundId?: string
  ): Promise<FantasyRankingReadModel[]>;
  getUserHistory(leagueId: string, userId: string, actorUserId: string): Promise<FantasyUserHistoryReadModel | null>;
  getUserRoundHistory(
    leagueId: string,
    userId: string,
    roundId: string,
    actorUserId: string
  ): Promise<FantasyUserRoundHistoryReadModel | null>;
  getSeasonPassDashboard(leagueId: string, userId: string): Promise<SeasonPassDashboardData>;
  getAdminData(leagueId: string, userId: string): Promise<FantasyAdminConfigData>;
  updateSettings(leagueId: string, settings: Record<string, number>, userId: string): Promise<{ success: boolean; error?: string }>;
  rebuildRoundStats(leagueId: string, roundId: string, userId: string): Promise<void>;
  reprocessRound(
    leagueId: string,
    roundId: string,
    useCurrentRules: boolean | undefined,
    userId: string
  ): Promise<{ success: boolean; affectedRounds: number }>;
  createTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean }>;
  processTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean }>;
  resetTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean }>;
}

export class ManageFantasyAdminUseCase {
  constructor(private readonly repo: FantasyAdminRepository) {}

  async getRanking(
    actor: Actor,
    leagueId: string,
    scope: FantasyRankingScope = "season",
    roundId?: string
  ): Promise<FantasyRankingReadModel[]> {
    return this.repo.getRanking(leagueId, scope, actor.userId, roundId);
  }

  async getUserHistory(
    actor: Actor,
    leagueId: string,
    userId: string
  ): Promise<FantasyUserHistoryReadModel | null> {
    return this.repo.getUserHistory(leagueId, userId, actor.userId);
  }

  async getUserRoundHistory(
    actor: Actor,
    leagueId: string,
    userId: string,
    roundId: string
  ): Promise<FantasyUserRoundHistoryReadModel | null> {
    return this.repo.getUserRoundHistory(leagueId, userId, roundId, actor.userId);
  }

  async getSeasonPassDashboard(actor: Actor, leagueId: string): Promise<SeasonPassDashboardData> {
    return this.repo.getSeasonPassDashboard(leagueId, actor.userId);
  }

  async getAdminData(
    actor: Actor,
    leagueId: string
  ): Promise<{ success: boolean; data?: FantasyAdminConfigData; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    const data = await this.repo.getAdminData(leagueId, actor.userId);
    return { success: true, data };
  }

  async updateSettings(
    actor: Actor,
    leagueId: string,
    settings: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }

    const validation = buildFantasySettingsPayload(settings);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    try {
      return await this.repo.updateSettings(leagueId, validation.payload, actor.userId);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erro ao salvar configurações." };
    }
  }

  async reprocessRound(
    actor: Actor,
    leagueId: string,
    roundId: string,
    useCurrentRules?: boolean
  ): Promise<{ success: boolean; affectedRounds?: number; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    try {
      await this.repo.rebuildRoundStats(leagueId, roundId, actor.userId);
    } catch (error) {
      const prefix = useCurrentRules
        ? "Não foi possível recalcular as estatísticas"
        : "Não foi possível reconstruir os scouts antes do reprocessamento";
      return { success: false, error: `${prefix}: ${error instanceof Error ? error.message : "erro desconhecido"}` };
    }
    try {
      const result = await this.repo.reprocessRound(leagueId, roundId, useCurrentRules, actor.userId);
      return useCurrentRules ? result : { success: result.success };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erro ao reprocessar o Cartola." };
    }
  }

  async createTestSession(
    actor: Actor,
    leagueId: string,
    roundId: string
  ): Promise<{ success: boolean; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    try { return await this.repo.createTestSession(leagueId, roundId, actor.userId); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : "Erro ao criar sessão de teste." }; }
  }

  async processTestSession(
    actor: Actor,
    leagueId: string,
    roundId: string
  ): Promise<{ success: boolean; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    try { return await this.repo.processTestSession(leagueId, roundId, actor.userId); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : "Erro ao processar sessão de teste." }; }
  }

  async resetTestSession(
    actor: Actor,
    leagueId: string,
    roundId: string
  ): Promise<{ success: boolean; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    try { return await this.repo.resetTestSession(leagueId, roundId, actor.userId); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : "Erro ao resetar sessão de teste." }; }
  }
}

