import type { SupabaseClient } from "@supabase/supabase-js";

export type CollectivePageCursor = { createdAt: string; id: string };

export type CollectivePageMessage = {
  id: string;
  callupId: string;
  senderUserId: string | null;
  senderPlayerId: string | null;
  senderName: string;
  senderAvatarUrl: string | null;
  kind: "text" | "image" | "audio" | "system";
  body: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  duration: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  own: boolean;
  replyTo: { id: string; senderName: string; kind: string; body: string | null } | null;
};

export type CollectivePage = {
  messages: CollectivePageMessage[];
  hasMore: boolean;
  nextCursor: CollectivePageCursor | null;
  unreadCount: number;
  firstUnreadMessageId: string | null;
};

type RawCollectivePage = {
  messages?: Array<Record<string, unknown>>;
  has_more?: boolean;
  next_cursor?: { created_at?: string; id?: string } | null;
  unread_count?: number;
  first_unread_message_id?: string | null;
};

export async function readCollectivePage(
  client: SupabaseClient,
  userId: string,
  callupIds: string[],
  cursor: CollectivePageCursor | null = null,
  limit = 60,
): Promise<CollectivePage | null> {
  if (!callupIds.length) return null;
  const { data, error } = await client.rpc("get_collective_page", {
    p_callup_ids: callupIds,
    p_before_created_at: cursor?.createdAt || null,
    p_before_id: cursor?.id || null,
    p_limit: limit,
  });
  if (error || !data || typeof data !== "object") return null;

  const page = data as RawCollectivePage;
  const rows = Array.isArray(page.messages) ? page.messages : [];
  const mediaPaths = [...new Set(rows.map((row) => String(row.media_path || "")).filter(Boolean))];
  const signedByPath = new Map<string, string>();
  if (mediaPaths.length) {
    const { data: signed } = await client.storage.from("collective-media").createSignedUrls(mediaPaths, 3600);
    (signed || []).forEach((item, index) => {
      if (item.signedUrl) signedByPath.set(mediaPaths[index], item.signedUrl);
    });
  }

  return {
    messages: rows.map((row) => ({
      id: String(row.id),
      callupId: String(row.callup_id),
      senderUserId: row.sender_user_id ? String(row.sender_user_id) : null,
      senderPlayerId: row.sender_player_id ? String(row.sender_player_id) : null,
      senderName: String(row.sender_name || "Usuario"),
      senderAvatarUrl: row.sender_avatar_url ? String(row.sender_avatar_url) : null,
      kind: String(row.kind) as CollectivePageMessage["kind"],
      body: row.body === null || row.body === undefined ? null : String(row.body),
      mediaUrl: row.media_path ? signedByPath.get(String(row.media_path)) || null : null,
      mediaMime: row.media_mime ? String(row.media_mime) : null,
      duration: row.audio_duration_seconds === null || row.audio_duration_seconds === undefined
        ? null
        : Number(row.audio_duration_seconds),
      editedAt: row.edited_at ? String(row.edited_at) : null,
      deletedAt: row.deleted_at ? String(row.deleted_at) : null,
      createdAt: String(row.created_at),
      own: row.sender_user_id === userId,
      replyTo: row.reply_to_message_id ? {
        id: String(row.reply_to_message_id),
        senderName: String(row.reply_sender_name || "Usuario"),
        kind: String(row.reply_kind || "text"),
        body: row.reply_body === null || row.reply_body === undefined ? null : String(row.reply_body),
      } : null,
    })),
    hasMore: Boolean(page.has_more),
    nextCursor: page.next_cursor?.created_at && page.next_cursor.id
      ? { createdAt: String(page.next_cursor.created_at), id: String(page.next_cursor.id) }
      : null,
    unreadCount: Number(page.unread_count || 0),
    firstUnreadMessageId: page.first_unread_message_id ? String(page.first_unread_message_id) : null,
  };
}
