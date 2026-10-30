import type { Actor } from "../../../shared/actor.js";
import {
  type CollectiveMessage,
  type CollectiveSummary,
  type CollectiveRoomData,
  type CollectiveCursor,
  validateMessageBody,
} from "../domain/collective.js";

export interface CollectiveRepository {
  getActiveSummary(actor: Actor, leagueId: string): Promise<CollectiveSummary | null>;

  getRoom(actor: Actor, leagueId: string, callupId?: string): Promise<CollectiveRoomData | null>;

  getOlderMessages(
    actor: Actor,
    leagueId: string,
    callupId: string,
    cursor: CollectiveCursor
  ): Promise<{ messages: CollectiveMessage[]; hasOlderMessages: boolean; nextCursor: CollectiveCursor | null }>;

  sendMessage(
    actor: Actor,
    leagueId: string,
    input: {
      callupId: string;
      body: string;
      kind: string;
      mediaPath?: string | null;
      mediaMime?: string | null;
      mediaSize?: number | null;
      duration?: number | null;
      replyToMessageId?: string | null;
      senderPlayerId?: string | null;
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  editMessage(
    actor: Actor,
    leagueId: string,
    messageId: string,
    body: string
  ): Promise<{ success: boolean; error?: string }>;

  deleteMessage(
    actor: Actor,
    leagueId: string,
    messageId: string
  ): Promise<{ success: boolean; error?: string }>;

  markRead(
    actor: Actor,
    leagueId: string,
    targets: Array<{ callupId: string; messageId: string }>
  ): Promise<{ success: boolean; error?: string }>;

  getAdminPreviousCollective(actor: Actor, leagueId: string): Promise<CollectiveRoomData | null>;
}

export class ManageCollectiveUseCase {
  constructor(private readonly repository: CollectiveRepository) {}

  async getActiveSummary(actor: Actor, leagueId: string): Promise<CollectiveSummary | null> {
    return this.repository.getActiveSummary(actor, leagueId);
  }

  async getRoom(actor: Actor, leagueId: string, callupId?: string): Promise<CollectiveRoomData | null> {
    return this.repository.getRoom(actor, leagueId, callupId);
  }

  async getOlderMessages(
    actor: Actor,
    leagueId: string,
    callupId: string,
    cursor: CollectiveCursor
  ) {
    if (!callupId) {
      return { success: false as const, messages: [], error: "Convocação não informada." };
    }
    const res = await this.repository.getOlderMessages(actor, leagueId, callupId, cursor);
    return { success: true as const, ...res };
  }

  async sendMessage(
    actor: Actor,
    leagueId: string,
    input: {
      callupId: string;
      body: string;
      kind: string;
      mediaPath?: string | null;
      mediaMime?: string | null;
      mediaSize?: number | null;
      duration?: number | null;
      replyToMessageId?: string | null;
      senderPlayerId?: string | null;
    }
  ) {
    if (!input.callupId) {
      return { success: false, error: "Convocação não informada." };
    }
    if (!input.body && !input.mediaPath) {
      return { success: false, error: "Escreva uma mensagem ou anexe uma mídia." };
    }
    if (input.body && input.body.length > 1000) {
      return { success: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
    }
    return this.repository.sendMessage(actor, leagueId, input);
  }

  async editMessage(actor: Actor, leagueId: string, messageId: string, body: string) {
    if (!messageId) return { success: false, error: "Mensagem inválida." };
    const validation = validateMessageBody(body);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    return this.repository.editMessage(actor, leagueId, messageId, body.trim());
  }

  async deleteMessage(actor: Actor, leagueId: string, messageId: string) {
    if (!messageId) return { success: false, error: "Mensagem inválida." };
    return this.repository.deleteMessage(actor, leagueId, messageId);
  }

  async markRead(actor: Actor, leagueId: string, targets: Array<{ callupId: string; messageId: string }>) {
    if (!targets || targets.length === 0) return { success: false };
    return this.repository.markRead(actor, leagueId, targets);
  }

  async getAdminPreviousCollective(actor: Actor, leagueId: string) {
    return this.repository.getAdminPreviousCollective(actor, leagueId);
  }
}
