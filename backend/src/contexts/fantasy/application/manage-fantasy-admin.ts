import type { Actor } from "../../../shared/actor.js";
import {
  sortFantasyRankingEntries,
  type FantasyAdminConfigData,
  type FantasyRankingEntry,
  type FantasyRankingScope,
  type FantasyUserRoundHistoryDetail,
  type SeasonPassDashboardData,
} from "../domain/fantasy-admin.js";
import type { UserFantasyHistoryEntry } from "../domain/market-lineup.js";

export interface FantasyAdminRepository {
  isLeagueAdmin(leagueId: string, userId: string): Promise<boolean>;
  getRankingPeriodInputs(leagueId: string, userId: string): Promise<{ accounts: any[]; rounds: any[]; lineups: any[] } | null>;
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
  getAdminData(leagueId: string, userId: string): Promise<FantasyAdminConfigData>;
  updateSettings(leagueId: string, settings: Record<string, unknown>, userId: string): Promise<{ success: boolean; error?: string }>;
  reprocessRound(
    leagueId: string,
    roundId: string,
    userId: string,
    useCurrentRules?: boolean
  ): Promise<{ success: boolean; affectedRounds?: number; error?: string }>;
  createTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean; error?: string }>;
  processTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean; error?: string }>;
  resetTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean; error?: string }>;
}

export class ManageFantasyAdminUseCase {
  constructor(private readonly repo: FantasyAdminRepository) {}

  async getRankingPeriodInputs(actor: Actor, leagueId: string) {
    return this.repo.getRankingPeriodInputs(leagueId, actor.userId);
  }

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

    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).length === 0) {
      return { success: false, error: "Informe ao menos uma configuração." };
    }
    return this.repo.updateSettings(leagueId, settings, actor.userId);
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
    return this.repo.reprocessRound(leagueId, roundId, actor.userId, useCurrentRules);
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
    return this.repo.createTestSession(leagueId, roundId, actor.userId);
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
    return this.repo.processTestSession(leagueId, roundId, actor.userId);
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
    return this.repo.resetTestSession(leagueId, roundId, actor.userId);
  }
}
