import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { CollectiveRepository } from "../application/manage-collective.js";
import type {
  CollectiveMessage,
  CollectiveSummary,
  CollectiveRoomData,
  CollectiveCursor,
} from "../domain/collective.js";

export class PgCollectiveRepository implements CollectiveRepository {
  constructor(private readonly pool: Pool) {}

  async getActiveSummary(actor: Actor, leagueId: string): Promise<CollectiveSummary | null> {
    const res = await this.pool.query(
      `SELECT c.id as callup_id, c.date, c.status as callup_status,
              r.id as round_id, r.number as round_number, r.status as round_status
       FROM callups c
       LEFT JOIN rounds r ON r.id = c.round_id
       WHERE c.league_id = $1 AND c.status = 'converted'
       ORDER BY c.date DESC
       LIMIT 1`,
      [leagueId]
    ).catch(() => ({ rows: [] }));

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const unreadRes = await this.pool.query(
      `SELECT count(*)::int as unread
       FROM collective_messages cm
       LEFT JOIN collective_reads cr ON cr.callup_id = cm.callup_id AND cr.user_id = $1
       WHERE cm.callup_id = $2
         AND cm.deleted_at IS NULL
         AND (cr.read_at IS NULL OR cm.created_at > cr.read_at)`,
      [actor.userId, row.callup_id]
    ).catch(() => ({ rows: [{ unread: 0 }] }));

    const unreadCount = Number(unreadRes.rows[0]?.unread || 0);

    return {
      callupId: row.callup_id,
      roundId: row.round_id || null,
      roundNumber: row.round_number || null,
      date: row.date,
      status: row.round_status || row.callup_status || null,
      unreadCount,
    };
  }

  async getRoom(actor: Actor, leagueId: string, callupId?: string): Promise<CollectiveRoomData | null> {
    const summary = await this.getActiveSummary(actor, leagueId);
    if (!summary) return null;

    const targetCallupId = callupId || summary.callupId;

    const messagesRes = await this.pool.query(
      `SELECT cm.id, cm.callup_id, cm.round_id, cm.sender_user_id, cm.sender_player_id,
              cm.body, cm.kind, cm.media_path, cm.media_mime, cm.media_size,
              cm.audio_duration_seconds, cm.reply_to_message_id, cm.created_at, cm.edited_at, cm.deleted_at,
              p.name as sender_name
       FROM collective_messages cm
       LEFT JOIN players p ON p.id = cm.sender_player_id
       WHERE cm.callup_id = $1
       ORDER BY cm.created_at ASC
       LIMIT 50`,
      [targetCallupId]
    ).catch(() => ({ rows: [] }));

    const messages: CollectiveMessage[] = messagesRes.rows.map((r: any) => ({
      id: r.id,
      callupId: r.callup_id,
      roundId: r.round_id,
      senderUserId: r.sender_user_id,
      senderPlayerId: r.sender_player_id,
      senderName: r.sender_name || "Jogador",
      body: r.body,
      kind: r.kind || "text",
      mediaPath: r.media_path,
      mediaMime: r.media_mime,
      mediaSize: r.media_size ? Number(r.media_size) : null,
      audioDurationSeconds: r.audio_duration_seconds ? Number(r.audio_duration_seconds) : null,
      replyToMessageId: r.reply_to_message_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
    }));

    return {
      summary,
      callupIds: [targetCallupId],
      messages,
      isAdmin: false,
      currentUserId: actor.userId,
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      hasOlderMessages: false,
      nextCursor: null,
    };
  }

  async getOlderMessages(
    _actor: Actor,
    _leagueId: string,
    callupId: string,
    cursor: CollectiveCursor
  ): Promise<{ messages: CollectiveMessage[]; hasOlderMessages: boolean; nextCursor: CollectiveCursor | null }> {
    const res = await this.pool.query(
      `SELECT cm.id, cm.callup_id, cm.round_id, cm.sender_user_id, cm.sender_player_id,
              cm.body, cm.kind, cm.media_path, cm.media_mime, cm.media_size,
              cm.audio_duration_seconds, cm.reply_to_message_id, cm.created_at, cm.edited_at, cm.deleted_at,
              p.name as sender_name
       FROM collective_messages cm
       LEFT JOIN players p ON p.id = cm.sender_player_id
       WHERE cm.callup_id = $1 AND cm.created_at < $2
       ORDER BY cm.created_at DESC
       LIMIT 30`,
      [callupId, cursor.lastCreatedAt]
    ).catch(() => ({ rows: [] }));

    const messages: CollectiveMessage[] = res.rows.map((r: any) => ({
      id: r.id,
      callupId: r.callup_id,
      roundId: r.round_id,
      senderUserId: r.sender_user_id,
      senderPlayerId: r.sender_player_id,
      senderName: r.sender_name || "Jogador",
      body: r.body,
      kind: r.kind || "text",
      mediaPath: r.media_path,
      mediaMime: r.media_mime,
      mediaSize: r.media_size ? Number(r.media_size) : null,
      audioDurationSeconds: r.audio_duration_seconds ? Number(r.audio_duration_seconds) : null,
      replyToMessageId: r.reply_to_message_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
    })).reverse();

    const first = messages[0];
    return {
      messages,
      hasOlderMessages: res.rows.length >= 30,
      nextCursor: first
        ? { lastMessageId: first.id, lastCreatedAt: first.createdAt }
        : null,
    };
  }

  async sendMessage(
    actor: Actor,
    _leagueId: string,
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
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const res = await this.pool.query(
      `INSERT INTO collective_messages (callup_id, sender_user_id, sender_player_id, body, kind, media_path, media_mime, media_size, audio_duration_seconds, reply_to_message_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING id`,
      [
        input.callupId,
        actor.userId,
        input.senderPlayerId || null,
        input.body || "",
        input.kind || "text",
        input.mediaPath || null,
        input.mediaMime || null,
        input.mediaSize || null,
        input.duration || null,
        input.replyToMessageId || null,
      ]
    ).catch((err) => ({ rows: [], error: err }));

    if ("error" in res && res.error) {
      return { success: false, error: (res.error as any).message || "Falha ao gravar mensagem." };
    }
    return { success: true, messageId: res.rows[0]?.id };
  }

  async editMessage(
    actor: Actor,
    _leagueId: string,
    messageId: string,
    body: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await this.pool.query(
      `UPDATE collective_messages
       SET body = $1, edited_at = now()
       WHERE id = $2 AND sender_user_id = $3 AND deleted_at IS NULL AND kind = 'text'`,
      [body, messageId, actor.userId]
    ).catch((err) => ({ rowCount: 0, error: err }));

    return { success: (res as any).rowCount > 0 };
  }

  async deleteMessage(
    actor: Actor,
    _leagueId: string,
    messageId: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await this.pool.query(
      `UPDATE collective_messages
       SET body = 'Mensagem removida', deleted_at = now()
       WHERE id = $1 AND sender_user_id = $2`,
      [messageId, actor.userId]
    ).catch((err) => ({ rowCount: 0, error: err }));

    return { success: (res as any).rowCount > 0 };
  }

  async markRead(
    actor: Actor,
    _leagueId: string,
    targets: Array<{ callupId: string; messageId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    for (const target of targets) {
      await this.pool.query(
        `INSERT INTO collective_reads (callup_id, user_id, last_read_message_id, read_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (callup_id, user_id) DO UPDATE
         SET last_read_message_id = EXCLUDED.last_read_message_id, read_at = now()`,
        [target.callupId, actor.userId, target.messageId]
      ).catch(() => {});
    }
    return { success: true };
  }

  async getAdminPreviousCollective(actor: Actor, leagueId: string): Promise<CollectiveRoomData | null> {
    const prevRes = await this.pool.query(
      `SELECT c.id
       FROM callups c
       JOIN rounds r ON r.id = c.round_id
       WHERE c.league_id = $1 AND r.status = 'finished'
       ORDER BY c.date DESC
       LIMIT 1`,
      [leagueId]
    ).catch(() => ({ rows: [] }));

    if (prevRes.rows.length === 0) return null;
    return this.getRoom(actor, leagueId, prevRes.rows[0].id);
  }
}
