export type CollectiveMessageKind = "text" | "image" | "audio";

export interface CollectiveMessage {
  id: string;
  callupId: string;
  roundId?: string | null;
  senderUserId: string;
  senderPlayerId?: string | null;
  senderName?: string;
  body: string;
  kind: CollectiveMessageKind;
  mediaPath?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  audioDurationSeconds?: number | null;
  replyToMessageId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
}

export interface CollectiveSummary {
  callupId: string;
  roundId: string | null;
  roundNumber: number | null;
  date: string;
  status: string | null;
  unreadCount: number;
}

export interface CollectiveCursor {
  lastMessageId: string;
  lastCreatedAt: string;
}

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

export function validateMessageBody(body: string): { valid: boolean; error?: string } {
  const trimmed = body.trim();
  if (!trimmed) {
    return { valid: false, error: "A mensagem não pode ser vazia." };
  }
  if (trimmed.length > 1000) {
    return { valid: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
  }
  return { valid: true };
}

export function validateMessageKind(kind: string): kind is CollectiveMessageKind {
  return kind === "text" || kind === "image" || kind === "audio";
}
