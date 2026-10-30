import type { Actor } from "../../../shared/actor.js";
import {
  sortFantasyRankingEntries,
  validateFantasySettingsUpdate,
  type FantasyAdminConfigData,
  type FantasyRankingEntry,
  type FantasyRankingScope,
  type FantasyUserRoundHistoryDetail,
  type SeasonPassDashboardData,
} from "../domain/fantasy-admin.js";
import type { UserFantasyHistoryEntry } from "../domain/market-lineup.js";

export interface FantasyAdminRepository {
  isLeagueAdmin(leagueId: string, userId: string): Promise<boolean>;
  getRankingRawEntries(
    leagueId: string,
    scope: FantasyRankingScope,
    roundId?: string
  ): Promise<Array<{
    userId: string;
    userName: string;
    userAvatarUrl: string | null;
    totalPoints: number;
    patrimony: number;
    lastRoundPoints: number | null;
    lineupsCount: number;
  }>>;
  getUserHistory(leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]>;
  getUserRoundHistory(
    leagueId: string,
    userId: string,
    roundId: string
  ): Promise<FantasyUserRoundHistoryDetail | null>;
  getSeasonPassDashboard(leagueId: string, userId: string): Promise<SeasonPassDashboardData>;
  getAdminData(leagueId: string): Promise<FantasyAdminConfigData>;
  updateSettings(leagueId: string, settings: { initialBudget?: number }): Promise<{ success: boolean }>;
  reprocessRound(
    leagueId: string,
    roundId: string,
    useCurrentRules?: boolean
  ): Promise<{ success: boolean; reprocessedLineupsCount: number }>;
  createTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }>;
  processTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }>;
  resetTestSession(leagueId: string, roundId: string): Promise<{ success: boolean }>;
}

export class ManageFantasyAdminUseCase {
  constructor(private readonly repo: FantasyAdminRepository) {}

  async getRanking(
    actor: Actor,
    leagueId: string,
    scope: FantasyRankingScope = "season",
    roundId?: string
  ): Promise<FantasyRankingEntry[]> {
    const raw = await this.repo.getRankingRawEntries(leagueId, scope, roundId);
    return sortFantasyRankingEntries(raw);
  }

  async getUserHistory(
    actor: Actor,
    leagueId: string,
    userId: string
  ): Promise<UserFantasyHistoryEntry[]> {
    return this.repo.getUserHistory(leagueId, userId);
  }

  async getUserRoundHistory(
    actor: Actor,
    leagueId: string,
    userId: string,
    roundId: string
  ): Promise<FantasyUserRoundHistoryDetail | null> {
    return this.repo.getUserRoundHistory(leagueId, userId, roundId);
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
    const data = await this.repo.getAdminData(leagueId);
    return { success: true, data };
  }

  async updateSettings(
    actor: Actor,
    leagueId: string,
    settings: { initialBudget?: number }
  ): Promise<{ success: boolean; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }

    const validation = validateFantasySettingsUpdate(settings);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    return this.repo.updateSettings(leagueId, {
      initialBudget: validation.normalizedBudget,
    });
  }

  async reprocessRound(
    actor: Actor,
    leagueId: string,
    roundId: string,
    useCurrentRules?: boolean
  ): Promise<{ success: boolean; reprocessedLineupsCount?: number; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    return this.repo.reprocessRound(leagueId, roundId, useCurrentRules);
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
    return this.repo.createTestSession(leagueId, roundId);
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
    return this.repo.processTestSession(leagueId, roundId);
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
    return this.repo.resetTestSession(leagueId, roundId);
  }
}
