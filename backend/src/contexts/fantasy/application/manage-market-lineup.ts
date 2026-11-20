import type { Actor } from "../../../shared/actor.js";
import {
  type FantasyLineupSubmission,
  type FantasyLineupSlot,
  type FantasyMarketDashboardData,
  type FantasyMarketPlayerSummary,
  type FantasyMarketQuickHighlights,
  type FantasyPlayerPerformanceDetail,
  type FantasyRoundOverview,
  type FantasyUserSummary,
  type SavedFantasyLineup,
  type UserFantasyHistoryEntry,
  type MyFantasyHistoryRow,
} from "../domain/market-lineup.js";

export interface FantasyMarketLineupRepository {
  isLeagueAdmin(leagueId: string, userId: string): Promise<boolean>;
  getDashboard(leagueId: string, userId: string): Promise<FantasyMarketDashboardData>;
  getMarketSource(leagueId: string, userId: string): Promise<unknown | null>;
  getMarketContext(leagueId: string, userId: string): Promise<{ seasonId: string; settings: any; testSession: any; fantasySeason: any; fantasyRounds: any[]; marketHealth: any; marketVersion: string | null } | null>;
  getPersonalMarketInputs(leagueId: string, userId: string, activeRoundId?: string, latestRoundId?: string, testSessionId?: string): Promise<any | null>;
  getPlayerDetail(
    leagueId: string,
    playerId: string,
    fantasyRoundId?: string
  ): Promise<FantasyPlayerPerformanceDetail | null>;
  getQuickHighlights(leagueId: string, userId: string): Promise<FantasyMarketQuickHighlights>;
  getMySummary(leagueId: string, userId: string): Promise<FantasyUserSummary | null>;
  getMyHistory(leagueId: string, userId: string): Promise<MyFantasyHistoryRow[]>;
  getLiveMatchSnapshots(leagueId: string, roundId: string, userId: string): Promise<any[] | null>;
  getLiveProjectionInputs(leagueId: string, roundId: string, userId: string): Promise<{ settings: any; lineups: any[]; players: any[] } | null>;
  getRevealedInputs(leagueId: string, roundId: string, userId: string): Promise<{ lineups: any[]; players: any[]; reserves: any[]; prices: any[]; profiles: any[]; predictions: any[]; activations: any[] } | null>;
  getRevealedLineups(
    leagueId: string,
    userId: string,
    roundId?: string
  ): Promise<{ allowed: boolean; error?: string; lineups: any[] }>;
  getRoundLineupOverview(leagueId: string, roundId?: string): Promise<FantasyRoundOverview>;
  saveLineup(params: {
    leagueId: string;
    roundId: string;
    userId: string;
    input: FantasyLineupSubmission;
  }): Promise<{ success: boolean; error?: string; lineupId?: string; confirmed?: boolean }>;
  previewMarketV11(leagueId: string, userId: string): Promise<{ success: boolean; preview?: unknown; error?: string }>;
  repairLegacyLineups(leagueId: string): Promise<{ success: boolean; repairedCount: number }>;
}

export class ManageFantasyMarketLineupUseCase {
  constructor(private readonly repo: FantasyMarketLineupRepository) {}

  async getDashboard(actor: Actor, leagueId: string): Promise<FantasyMarketDashboardData> {
    return this.repo.getDashboard(leagueId, actor.userId);
  }

  async getMarketSource(actor: Actor, leagueId: string): Promise<unknown | null> {
    return this.repo.getMarketSource(leagueId, actor.userId);
  }

  async getMarketContext(actor: Actor, leagueId: string) {
    return this.repo.getMarketContext(leagueId, actor.userId);
  }

  async getPersonalMarketInputs(actor: Actor, leagueId: string, activeRoundId?: string, latestRoundId?: string, testSessionId?: string) {
    return this.repo.getPersonalMarketInputs(leagueId, actor.userId, activeRoundId, latestRoundId, testSessionId);
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
    return this.repo.getQuickHighlights(leagueId, actor.userId);
  }

  async getMySummary(actor: Actor, leagueId: string): Promise<FantasyUserSummary | null> {
    return this.repo.getMySummary(leagueId, actor.userId);
  }

  async getMyHistory(actor: Actor, leagueId: string): Promise<MyFantasyHistoryRow[]> {
    return this.repo.getMyHistory(leagueId, actor.userId);
  }

  async getLiveMatchSnapshots(actor: Actor, leagueId: string, roundId: string): Promise<any[] | null> {
    return this.repo.getLiveMatchSnapshots(leagueId, roundId, actor.userId);
  }

  async getLiveProjectionInputs(actor: Actor, leagueId: string, roundId: string) {
    return this.repo.getLiveProjectionInputs(leagueId, roundId, actor.userId);
  }

  async getRevealedInputs(actor: Actor, leagueId: string, roundId: string) {
    return this.repo.getRevealedInputs(leagueId, roundId, actor.userId);
  }

  async getRevealedLineups(
    actor: Actor,
    leagueId: string,
    roundId?: string
  ): Promise<{ allowed: boolean; error?: string; lineups: any[] }> {
    return this.repo.getRevealedLineups(leagueId, actor.userId, roundId);
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
    input: FantasyLineupSubmission,
  ): Promise<{ success: boolean; error?: string; lineupId?: string; confirmed?: boolean }> {
    if (!input || !Array.isArray(input.playerIds) || !Array.isArray(input.slotAssignments)) return { success: false, error: "Escalação inválida." };
    return this.repo.saveLineup({
      leagueId,
      roundId,
      userId: actor.userId,
      input,
    });
  }

  async previewMarketV11(
    actor: Actor,
    leagueId: string
  ): Promise<{ success: boolean; preview?: unknown; error?: string }> {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) {
      return { success: false, error: "Acesso restrito a administradores da liga." };
    }
    return this.repo.previewMarketV11(leagueId, actor.userId);
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
