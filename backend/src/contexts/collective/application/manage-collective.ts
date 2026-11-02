import type { Actor } from "../../../shared/actor.js";
import {
  type CollectiveMessage,
  type CollectiveSummary,
  type CollectiveRoomData,
  type CollectiveCursor,
  validateMessageBody,
  validateMessageKind,
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
    if (!cursor || typeof cursor.createdAt !== "string" || !cursor.createdAt
      || typeof cursor.id !== "string" || !cursor.id || Number.isNaN(Date.parse(cursor.createdAt))) {
      return { success: false as const, messages: [], error: "Cursor de paginação inválido." };
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
    if (!validateMessageKind(input.kind)) {
      return { success: false, error: "Tipo de mensagem inválido." };
    }
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const hasMedia = Boolean(input.mediaPath);
    if (!body && !hasMedia) {
      return { success: false, error: "Escreva uma mensagem ou anexe uma mídia." };
    }
    if (body.length > 1000) {
      return { success: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
    }
    if (input.kind === "text" && hasMedia) {
      return { success: false, error: "Mensagens de texto não podem conter mídia." };
    }
    if (input.kind !== "text" && !hasMedia) {
      return { success: false, error: "A mídia da mensagem não foi informada." };
    }
    if (hasMedia) {
      const expectedPrefix = `${input.callupId}/${actor.userId}/`;
      const fileName = input.mediaPath!.slice(expectedPrefix.length);
      if (!input.mediaPath!.startsWith(expectedPrefix) || !fileName || fileName.includes("/")) {
        return { success: false, error: "O caminho da mídia não pertence ao usuário autenticado." };
      }
    }
    if (hasMedia && (!Number.isInteger(input.mediaSize) || Number(input.mediaSize) < 1 || Number(input.mediaSize) > 8 * 1024 * 1024)) {
      return { success: false, error: "O arquivo pode ter no máximo 8 MB." };
    }
    const imageMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const audioMimes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"]);
    if (input.kind === "image" && !imageMimes.has(input.mediaMime || "")) {
      return { success: false, error: "Envie uma imagem válida." };
    }
    if (input.kind === "audio") {
      if (!audioMimes.has(input.mediaMime || "")) {
        return { success: false, error: "Envie um áudio válido." };
      }
      if (!Number.isInteger(input.duration) || Number(input.duration) < 1 || Number(input.duration) > 60) {
        return { success: false, error: "O áudio deve ter entre 1 e 60 segundos." };
      }
    }
    return this.repository.sendMessage(actor, leagueId, {
      ...input,
      body,
      duration: input.kind === "audio" ? input.duration : null,
      senderPlayerId: undefined,
    });
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
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > 100) return { success: false };
    const validTargets = targets.filter((target) => target && typeof target.callupId === "string"
      && Boolean(target.callupId) && typeof target.messageId === "string" && Boolean(target.messageId));
    if (validTargets.length !== targets.length) return { success: false };
    return this.repository.markRead(actor, leagueId, validTargets);
  }

  async getAdminPreviousCollective(actor: Actor, leagueId: string) {
    return this.repository.getAdminPreviousCollective(actor, leagueId);
  }
}
