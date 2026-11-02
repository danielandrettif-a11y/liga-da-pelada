export type CollectiveMessageKind = "text" | "image" | "audio" | "system";

export interface CollectiveReplyPreview {
  id: string;
  senderName: string;
  kind: string;
  body: string | null;
}

export interface CollectiveMessage {
  id: string;
  callupId: string;
  roundId: string | null;
  senderUserId: string | null;
  senderPlayerId: string | null;
  senderName: string;
  senderAvatarUrl: string | null;
  body: string | null;
  kind: CollectiveMessageKind;
  mediaPath: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  duration: number | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  own: boolean;
  replyTo: CollectiveReplyPreview | null;
}

export interface CollectiveSummary {
  callupId: string;
  roundId: string | null;
  roundNumber: number | null;
  date: string;
  status: string | null;
  unreadCount: number;
}

export interface CollectiveCursor { createdAt: string; id: string }

export interface CollectiveRoomData {
  summary: CollectiveSummary;
  callupIds: string[];
  messages: CollectiveMessage[];
  isAdmin: boolean;
  currentUserId: string;
  firstUnreadMessageId: string | null;
  lastReadMessageId: string | null;
  hasOlderMessages: boolean;
  nextCursor: CollectiveCursor | null;
}

export class CollectiveAccessError extends Error {
  constructor(message = "A Coletiva não pertence à pelada selecionada ou não está disponível para esta conta.") {
    super(message);
    this.name = "CollectiveAccessError";
  }
}

export function validateMessageBody(body: string): { valid: boolean; error?: string } {
  const trimmed = body.trim();
  if (!trimmed) return { valid: false, error: "A mensagem não pode ser vazia." };
  if (trimmed.length > 1000) return { valid: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
  return { valid: true };
}

export function validateMessageKind(kind: string): kind is Exclude<CollectiveMessageKind, "system"> {
  return kind === "text" || kind === "image" || kind === "audio";
}
