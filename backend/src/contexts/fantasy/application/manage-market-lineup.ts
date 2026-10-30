import type { Actor } from "../../../shared/actor.js";
import {
  validateLineupSubmission,
  type FantasyLineupSlot,
  type FantasyMarketDashboardData,
  type FantasyMarketPlayerSummary,
  type FantasyMarketQuickHighlights,
  type FantasyPlayerPerformanceDetail,
  type FantasyRoundOverview,
  type FantasyUserSummary,
  type SavedFantasyLineup,
  type UserFantasyHistoryEntry,
} from "../domain/market-lineup.js";

export interface FantasyMarketLineupRepository {
  isLeagueAdmin(leagueId: string, userId: string): Promise<boolean>;
  getDashboard(leagueId: string, userId: string): Promise<FantasyMarketDashboardData>;
  getPlayerDetail(
    leagueId: string,
    playerId: string,
    fantasyRoundId?: string
  ): Promise<FantasyPlayerPerformanceDetail | null>;
  getQuickHighlights(leagueId: string): Promise<FantasyMarketQuickHighlights>;
  getMySummary(leagueId: string, userId: string): Promise<FantasyUserSummary | null>;
  getMyHistory(leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]>;
  getRevealedLineups(
    leagueId: string,
    roundId?: string
  ): Promise<{ allowed: boolean; error?: string; lineups: any[] }>;
  getRoundLineupOverview(leagueId: string, roundId?: string): Promise<FantasyRoundOverview>;
  getMarketRoundInfo(
    leagueId: string,
    roundId: string
  ): Promise<{ isMarketOpen: boolean; playerPrices: Map<string, number>; userBudget: number }>;
  saveLineup(params: {
    leagueId: string;
    roundId: string;
    userId: string;
    captainPlayerId: string;
    slots: FantasyLineupSlot[];
    totalCost: number;
  }): Promise<{ success: boolean; error?: string; lineupId?: string }>;
  previewMarketV11(leagueId: string): Promise<{ success: boolean; data?: any; error?: string }>;
  repairLegacyLineups(leagueId: string): Promise<{ success: boolean; repairedCount: number }>;
}

export class ManageFantasyMarketLineupUseCase {
  constructor(private readonly repo: FantasyMarketLineupRepository) {}

  async getDashboard(actor: Actor, leagueId: string): Promise<FantasyMarketDashboardData> {
    return this.repo.getDashboard(leagueId, actor.userId);
  }

  async getPlayerDetail(
    actor: Actor,
    leagueId: string,
    playerId: string,
    fantasyRoundId?: string
  ): Promise<FantasyPlayerPerformanceDetail | null> {
    return this.repo.getPlayerDetail(leagueId, playerId, fantasyRoundId);
  }

  async getQuickHighlights(actor: Actor, leagueId: string): Promise<FantasyMarketQuickHighlights> {
    return this.repo.getQuickHighlights(leagueId);
  }

  async getMySummary(actor: Actor, leagueId: string): Promise<FantasyUserSummary | null> {
    return this.repo.getMySummary(leagueId, actor.userId);
  }

  async getMyHistory(actor: Actor, leagueId: string): Promise<UserFantasyHistoryEntry[]> {
    return this.repo.getMyHistory(leagueId, actor.userId);
  }

  async getRevealedLineups(
    actor: Actor,
    leagueId: string,
    roundId?: string
  ): Promise<{ allowed: boolean; error?: string; lineups: any[] }> {
    return this.repo.getRevealedLineups(leagueId, roundId);
  }

  async getRoundLineupOverview(
    actor: Actor,
    leagueId: string,
    roundId?: string
  ): Promise<FantasyRoundOverview> {
    return this.repo.getRoundLineupOverview(leagueId, roundId);
  }

  async saveLineup(
    actor: Actor,
    leagueId: string,
    roundId: string,
    slots: FantasyLineupSlot[],
    captainPlayerId: string
  ): Promise<{ success: boolean; error?: string; lineupId?: string }> {
    const marketInfo = await this.repo.getMarketRoundInfo(leagueId, roundId);

    const validation = validateLineupSubmission({
      slots,
      captainPlayerId,
      availableBudget: marketInfo.userBudget,
      playerPrices: marketInfo.playerPrices,
      isMarketOpen: marketInfo.isMarketOpen,
    });

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    return this.repo.saveLineup({
      leagueId,
      roundId,
      userId: actor.userId,
      captainPlayerId,
      slots,
      totalCost: validation.totalCost,
    });
  }

  async previewMarketV11(
    actor: Actor,
    leagueId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    return this.repo.previewMarketV11(leagueId);
  }

  async repairLegacyLineups(
    actor: Actor,
    leagueId: string
  ): Promise<{ success: boolean; repairedCount?: number; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    const result = await this.repo.repairLegacyLineups(leagueId);
    return { success: true, repairedCount: result.repairedCount };
  }
}
