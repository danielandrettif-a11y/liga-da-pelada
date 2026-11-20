import type { Actor } from "../../../shared/actor.js";
import {
  validateMessageBody,
} from "../domain/collective.js";

export type SendCollectiveMessageInput = {
  callupId: string;
  body: string;
  kind: "text" | "image" | "audio";
  mediaPath?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  duration?: number | null;
  replyToMessageId?: string | null;
};

export interface CollectiveRepository {
  getPreviousCallupId(actor: Actor, leagueId: string): Promise<{ callupId: string | null } | null>;
  getCandidates(actor: Actor, leagueId: string): Promise<any[] | null>;
  getPage(actor: Actor, leagueId: string, callupIds: string[], cursor: { createdAt: string; id: string } | null, limit: number): Promise<unknown | null>;
  sendMessage(
    actor: Actor,
    leagueId: string,
    input: SendCollectiveMessageInput,
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

}

export class ManageCollectiveUseCase {
  constructor(private readonly repository: CollectiveRepository) {}

  async getPreviousCallupId(actor: Actor, leagueId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leagueId)) return null;
    return this.repository.getPreviousCallupId(actor, leagueId);
  }

  async getCandidates(actor: Actor, leagueId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leagueId)) return null;
    return this.repository.getCandidates(actor, leagueId);
  }

  async getPage(actor: Actor, leagueId: string, callupIds: string[], cursor: { createdAt: string; id: string } | null, limit: number) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(leagueId) || !Array.isArray(callupIds) || !callupIds.length || callupIds.length > 12 || callupIds.some((id) => typeof id !== "string" || !uuid.test(id)) || !Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor && (typeof cursor.createdAt !== "string" || !Number.isFinite(Date.parse(cursor.createdAt)) || typeof cursor.id !== "string" || !uuid.test(cursor.id)))) return null;
    return this.repository.getPage(actor, leagueId, [...new Set(callupIds)], cursor, limit);
  }

  async sendMessage(
    actor: Actor,
    leagueId: string,
    input: SendCollectiveMessageInput,
  ) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(leagueId) || !uuid.test(input.callupId)) {
      return { success: false, error: "Convocação não informada." };
    }
    if (input.replyToMessageId && !uuid.test(input.replyToMessageId)) return { success: false, error: "Mensagem respondida inválida." };
    const body = (input.body || "").trim();
    if (body.length > 1000) return { success: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
    if (input.kind === "text") {
      if (!body) return { success: false, error: "Escreva uma mensagem ou anexe uma mídia." };
      if (input.mediaPath || input.mediaMime || input.mediaSize || input.duration) return { success: false, error: "Mensagem de texto não pode conter mídia." };
      return this.repository.sendMessage(actor, leagueId, { ...input, body, mediaPath: null, mediaMime: null, mediaSize: null, duration: null });
    }
    if (input.kind !== "image" && input.kind !== "audio") return { success: false, error: "Tipo de mensagem inválido." };
    const allowedMimes = input.kind === "image"
      ? new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
      : new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"]);
    if (!input.mediaMime || !allowedMimes.has(input.mediaMime)) return { success: false, error: "Tipo de mídia inválido." };
    if (!Number.isInteger(input.mediaSize) || Number(input.mediaSize) < 1 || Number(input.mediaSize) > 8 * 1024 * 1024) {
      return { success: false, error: "O arquivo pode ter no máximo 8 MB." };
    }
    const mediaPrefix = `${input.callupId}/${actor.userId}/`;
    const mediaSuffix = input.mediaPath?.slice(mediaPrefix.length) || "";
    if (!input.mediaPath?.startsWith(mediaPrefix) || !/^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i.test(mediaSuffix)) {
      return { success: false, error: "Caminho de mídia inválido." };
    }
    const duration = Number(input.duration || 0);
    if (input.kind === "audio" && (!Number.isInteger(duration) || duration < 1 || duration > 60)) {
      return { success: false, error: "O áudio pode ter no máximo 60 segundos." };
    }
    return this.repository.sendMessage(actor, leagueId, {
      ...input,
      body: body || (input.kind === "image" ? "Imagem" : "Áudio"),
      duration: input.kind === "audio" ? duration : null,
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
    if (!targets || targets.length === 0) return { success: false };
    return this.repository.markRead(actor, leagueId, targets);
  }

}
