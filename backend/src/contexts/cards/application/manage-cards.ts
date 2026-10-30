import type { Actor } from "../../../shared/actor.js";
import {
  validateCardActivation,
  validatePackClaim,
  type FantasyActiveCardDTO,
  type FantasyCardDefinition,
  type FantasyPackDTO,
  type FantasyUserCardDTO,
} from "../domain/cards.js";

export interface CardsRepository {
  isLeagueAdmin(leagueId: string, userId: string): Promise<boolean>;
  getMyPacks(leagueId: string, userId: string): Promise<{
    availablePacks: FantasyPackDTO[];
    claimedCount: number;
    totalPacks: number;
  }>;
  restoreMyPassPacks(leagueId: string, userId: string, fantasySeasonId: string): Promise<{ success: boolean; error?: string }>;
  openPack(leagueId: string, userId: string, packId: string): Promise<{
    success: boolean;
    offers?: [FantasyCardDefinition, FantasyCardDefinition];
    error?: string;
  }>;
  getPackById(leagueId: string, packId: string): Promise<FantasyPackDTO | null>;
  claimPackCard(
    leagueId: string,
    userId: string,
    packId: string,
    chosenSlug: string
  ): Promise<{ success: boolean; error?: string; chosenCard?: FantasyCardDefinition }>;
  getMyInventory(leagueId: string, userId: string): Promise<{
    cards: FantasyUserCardDTO[];
    groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  }>;
  getMyInventoryCount(leagueId: string, userId: string): Promise<number>;
  getActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<FantasyActiveCardDTO | null>;
  getCardDefinition(cardSlug: string): Promise<FantasyCardDefinition | null>;
  isRoundOpen(leagueId: string, roundId: string): Promise<boolean>;
  activateCardForRound(params: {
    leagueId: string;
    userId: string;
    roundId: string;
    userCardId: string;
    targetPlayerId?: string | null;
    targetPlayer2Id?: string | null;
    targetPrediction?: string | null;
  }): Promise<{ success: boolean; error?: string }>;
  removeActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<{ success: boolean; error?: string }>;
  generatePacksForFinishedRound(leagueId: string, roundId: string): Promise<number>;
  giveMyAccountTestPack(leagueId: string, userId: string): Promise<{ success: boolean; error?: string }>;
  resetMyAccountCards(leagueId: string, userId: string): Promise<{
    success: boolean;
    deletedCardsCount?: number;
    deletedActivationsCount?: number;
    deletedPacksCount?: number;
    error?: string;
  }>;
  distributePackToAllLineupUsers(leagueId: string): Promise<{
    success: boolean;
    awardedUsersCount?: number;
    roundNumber?: number;
    error?: string;
  }>;
  auditAndRepairCurrentSeasonPacks(leagueId: string): Promise<{ success: boolean; error?: string }>;
  grantFantasyPackToUser(leagueId: string, targetUserId: string): Promise<{ success: boolean; error?: string }>;
}

export class ManageCardsUseCase {
  constructor(private readonly repo: CardsRepository) {}

  async getMyPacks(actor: Actor, leagueId: string) {
    return this.repo.getMyPacks(leagueId, actor.userId);
  }

  async restoreMyPassPacks(actor: Actor, leagueId: string, fantasySeasonId: string) {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) return { success: false, error: "Apenas administradores." };
    return this.repo.restoreMyPassPacks(leagueId, actor.userId, fantasySeasonId);
  }

  async openPack(actor: Actor, leagueId: string, packId: string) {
    return this.repo.openPack(leagueId, actor.userId, packId);
  }

  async claimPackCard(actor: Actor, leagueId: string, packId: string, chosenSlug: string) {
    const pack = await this.repo.getPackById(leagueId, packId);
    if (!pack) return { success: false, error: "Pacote não encontrado." };

    const validation = validatePackClaim({ pack, chosenSlug });
    if (!validation.valid) return { success: false, error: validation.error };

    return this.repo.claimPackCard(leagueId, actor.userId, packId, chosenSlug);
  }

  async getMyInventory(actor: Actor, leagueId: string) {
    return this.repo.getMyInventory(leagueId, actor.userId);
  }

  async getMyInventoryCount(actor: Actor, leagueId: string) {
    return this.repo.getMyInventoryCount(leagueId, actor.userId);
  }

  async getActiveCardForRound(actor: Actor, leagueId: string, roundId: string) {
    return this.repo.getActiveCardForRound(leagueId, actor.userId, roundId);
  }

  async activateCardForRound(
    actor: Actor,
    leagueId: string,
    params: {
      roundId: string;
      userCardId: string;
      cardSlug: string;
      targetPlayerId?: string | null;
      targetPlayer2Id?: string | null;
      targetPrediction?: string | null;
    }
  ) {
    const isRoundOpen = await this.repo.isRoundOpen(leagueId, params.roundId);
    const cardDef = await this.repo.getCardDefinition(params.cardSlug);
    if (!cardDef) return { success: false, error: "Definição de carta não encontrada." };

    const validation = validateCardActivation({
      cardDefinition: cardDef,
      targetPlayerId: params.targetPlayerId,
      isRoundOpen,
    });
    if (!validation.valid) return { success: false, error: validation.error };

    return this.repo.activateCardForRound({
      leagueId,
      userId: actor.userId,
      roundId: params.roundId,
      userCardId: params.userCardId,
      targetPlayerId: params.targetPlayerId,
      targetPlayer2Id: params.targetPlayer2Id,
      targetPrediction: params.targetPrediction,
    });
  }

  async removeActiveCardForRound(actor: Actor, leagueId: string, roundId: string) {
    return this.repo.removeActiveCardForRound(leagueId, actor.userId, roundId);
  }

  async generatePacksForFinishedRound(actor: Actor, leagueId: string, roundId: string) {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) return 0;
    return this.repo.generatePacksForFinishedRound(leagueId, roundId);
  }

  async giveMyAccountTestPack(actor: Actor, leagueId: string) {
    return this.repo.giveMyAccountTestPack(leagueId, actor.userId);
  }

  async resetMyAccountCards(actor: Actor, leagueId: string) {
    return this.repo.resetMyAccountCards(leagueId, actor.userId);
  }

  async distributePackToAllLineupUsers(actor: Actor, leagueId: string) {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) return { success: false, error: "Apenas administradores." };
    return this.repo.distributePackToAllLineupUsers(leagueId);
  }

  async auditAndRepairCurrentSeasonPacks(actor: Actor, leagueId: string) {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) return { success: false, error: "Apenas administradores." };
    return this.repo.auditAndRepairCurrentSeasonPacks(leagueId);
  }

  async grantFantasyPackToUser(actor: Actor, leagueId: string, targetUserId: string) {
    const isAdmin = await this.repo.isLeagueAdmin(leagueId, actor.userId);
    if (!isAdmin) return { success: false, error: "Apenas administradores." };
    return this.repo.grantFantasyPackToUser(leagueId, targetUserId);
  }
}
