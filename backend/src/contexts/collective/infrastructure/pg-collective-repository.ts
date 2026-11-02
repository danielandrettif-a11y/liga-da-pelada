import type { Pool, PoolClient } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { CollectiveRepository } from "../application/manage-collective.js";
import { CollectiveAccessError, type CollectiveCursor, type CollectiveMessage, type CollectiveMessageKind, type CollectiveRoomData, type CollectiveSummary } from "../domain/collective.js";

type Candidate = {
  callup_id: string; date: string; round_id: string | null; round_number: number | null;
  round_status: string | null; payment_pix: string | null; payment_total: number | null;
  has_unpaid: boolean; is_admin: boolean;
};
type RawPage = {
  messages?: Array<Record<string, unknown>>; has_more?: boolean;
  next_cursor?: { created_at?: string; id?: string } | null;
  unread_count?: number; first_unread_message_id?: string | null;
};

export class PgCollectiveRepository implements CollectiveRepository {
  constructor(private readonly pool: Pool) {}

  private authenticated<T>(actor: Actor, operation: (client: PoolClient) => Promise<T>) {
    return withAuthenticatedTransaction(this.pool, actor, operation);
  }

  private async listCandidates(client: PoolClient, leagueId: string): Promise<Candidate[]> {
    const result = await client.query<Candidate>(
      `SELECT callup.id AS callup_id, callup.date, callup.round_id,
              round_item.number AS round_number, round_item.status AS round_status,
              round_item.payment_pix, round_item.payment_total,
              CASE WHEN round_item.id IS NULL THEN false ELSE EXISTS (
                SELECT 1 FROM public.round_players participant
                LEFT JOIN public.round_payments payment
                  ON payment.round_id = participant.round_id AND payment.player_id = participant.player_id
                WHERE participant.round_id = round_item.id AND COALESCE(payment.paid, false) = false
              ) END AS has_unpaid,
              public.is_league_admin($1::uuid) AS is_admin
       FROM public.callups callup
       JOIN public.leagues league ON league.id = callup.league_id
       LEFT JOIN public.rounds round_item ON round_item.id = callup.round_id
       WHERE callup.league_id = $1::uuid AND callup.status = 'converted'
         AND league.feature_tier = 'complete' AND public.can_access_collective_chat(callup.id)
       ORDER BY callup.date DESC, callup.created_at DESC LIMIT 12`,
      [leagueId],
    );
    return result.rows;
  }

  private selectActive(candidates: Candidate[], callupId?: string): Candidate | null {
    if (callupId) return candidates.find((candidate) => candidate.callup_id === callupId) || null;
    return candidates.find((candidate) => candidate.round_status !== "finished"
      || (Boolean(candidate.payment_pix) && Number(candidate.payment_total || 0) > 0 && candidate.has_unpaid))
      || candidates[0] || null;
  }

  private summary(candidate: Candidate, unreadCount: number): CollectiveSummary {
    return { callupId: candidate.callup_id, roundId: candidate.round_id,
      roundNumber: candidate.round_number == null ? null : Number(candidate.round_number),
      date: String(candidate.date), status: candidate.round_status, unreadCount };
  }

  private async readPage(client: PoolClient, actor: Actor, callupIds: string[], cursor: CollectiveCursor | null = null, limit = 60) {
    const result = await client.query<{ page: RawPage | string | null }>(
      "SELECT public.get_collective_page($1::uuid[], $2::timestamptz, $3::uuid, $4::integer) AS page",
      [callupIds, cursor?.createdAt || null, cursor?.id || null, limit],
    );
    const raw = result.rows[0]?.page;
    const page: RawPage = (typeof raw === "string" ? JSON.parse(raw) : raw) || {};
    const messages = Array.isArray(page.messages) ? page.messages : [];
    return {
      messages: messages.map((row): CollectiveMessage => ({
        id: String(row.id), callupId: String(row.callup_id), roundId: row.round_id ? String(row.round_id) : null,
        senderUserId: row.sender_user_id ? String(row.sender_user_id) : null,
        senderPlayerId: row.sender_player_id ? String(row.sender_player_id) : null,
        senderName: String(row.sender_name || "Usuario"), senderAvatarUrl: row.sender_avatar_url ? String(row.sender_avatar_url) : null,
        kind: String(row.kind) as CollectiveMessageKind, body: row.body == null ? null : String(row.body),
        mediaPath: row.media_path ? String(row.media_path) : null, mediaMime: row.media_mime ? String(row.media_mime) : null,
        mediaSize: row.media_size == null ? null : Number(row.media_size),
        duration: row.audio_duration_seconds == null ? null : Number(row.audio_duration_seconds),
        createdAt: String(row.created_at), editedAt: row.edited_at ? String(row.edited_at) : null,
        deletedAt: row.deleted_at ? String(row.deleted_at) : null, own: row.sender_user_id === actor.userId,
        replyTo: row.reply_to_message_id ? { id: String(row.reply_to_message_id),
          senderName: String(row.reply_sender_name || "Usuario"), kind: String(row.reply_kind || "text"),
          body: row.reply_body == null ? null : String(row.reply_body) } : null,
      })),
      hasMore: Boolean(page.has_more),
      nextCursor: page.next_cursor?.created_at && page.next_cursor.id
        ? { createdAt: String(page.next_cursor.created_at), id: String(page.next_cursor.id) } : null,
      unreadCount: Number(page.unread_count || 0),
      firstUnreadMessageId: page.first_unread_message_id ? String(page.first_unread_message_id) : null,
    };
  }

  async getActiveSummary(actor: Actor, leagueId: string): Promise<CollectiveSummary | null> {
    return this.authenticated(actor, async (client) => {
      const candidates = await this.listCandidates(client, leagueId);
      const active = this.selectActive(candidates);
      if (!active) return null;
      const page = await this.readPage(client, actor, candidates.map((item) => item.callup_id), null, 1);
      return this.summary(active, page.unreadCount);
    });
  }

  async getRoom(actor: Actor, leagueId: string, callupId?: string): Promise<CollectiveRoomData | null> {
    return this.authenticated(actor, async (client) => {
      const candidates = await this.listCandidates(client, leagueId);
      const active = this.selectActive(candidates, callupId);
      if (!active) return null;
      const callupIds = candidates.map((item) => item.callup_id);
      const page = await this.readPage(client, actor, callupIds);
      const readState = await client.query<{ last_read_message_id: string | null }>(
        "SELECT last_read_message_id FROM public.collective_reads WHERE callup_id = $1::uuid AND user_id = $2::uuid",
        [active.callup_id, actor.userId],
      );
      return { summary: this.summary(active, page.unreadCount), callupIds, messages: page.messages,
        isAdmin: Boolean(active.is_admin), currentUserId: actor.userId,
        firstUnreadMessageId: page.firstUnreadMessageId, lastReadMessageId: readState.rows[0]?.last_read_message_id || null,
        hasOlderMessages: page.hasMore, nextCursor: page.nextCursor };
    });
  }

  async getOlderMessages(actor: Actor, leagueId: string, callupId: string, cursor: CollectiveCursor) {
    return this.authenticated(actor, async (client) => {
      const candidates = await this.listCandidates(client, leagueId);
      if (!candidates.some((item) => item.callup_id === callupId)) throw new CollectiveAccessError();
      const page = await this.readPage(client, actor, candidates.map((item) => item.callup_id), cursor);
      return { messages: page.messages, hasOlderMessages: page.hasMore, nextCursor: page.nextCursor };
    });
  }

  async sendMessage(actor: Actor, leagueId: string, input: { callupId: string; body: string; kind: string;
    mediaPath?: string | null; mediaMime?: string | null; mediaSize?: number | null; duration?: number | null;
    replyToMessageId?: string | null; senderPlayerId?: string | null }) {
    return this.authenticated(actor, async (client) => {
      const context = await client.query<{ round_id: string | null; player_id: string | null }>(
        `SELECT callup.round_id, profile.player_id FROM public.callups callup
         LEFT JOIN public.account_profiles profile ON profile.user_id = $2::uuid
         WHERE callup.id = $1::uuid AND callup.league_id = $3::uuid AND public.can_access_collective_chat(callup.id)`,
        [input.callupId, actor.userId, leagueId],
      );
      const row = context.rows[0];
      if (!row?.player_id) return { success: false, error: "Jogador vinculado não encontrado nesta conta." };
      if (input.replyToMessageId) {
        const reply = await client.query("SELECT 1 FROM public.collective_messages WHERE id = $1::uuid AND callup_id = $2::uuid",
          [input.replyToMessageId, input.callupId]);
        if (!reply.rowCount) return { success: false, error: "A mensagem respondida não pertence a esta Coletiva." };
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.collective_messages
          (callup_id, round_id, sender_user_id, sender_player_id, body, kind, media_path, media_mime,
           media_size, audio_duration_seconds, reply_to_message_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11::uuid) RETURNING id`,
        [input.callupId, row.round_id, actor.userId, row.player_id, input.body || null, input.kind,
          input.mediaPath || null, input.mediaMime || null, input.mediaSize ?? null,
          input.duration ?? null, input.replyToMessageId || null],
      );
      return { success: true, messageId: inserted.rows[0]?.id };
    });
  }

  async editMessage(actor: Actor, leagueId: string, messageId: string, body: string) {
    return this.authenticated(actor, async (client) => {
      const result = await client.query(
        `UPDATE public.collective_messages message SET body = $1, edited_at = now() FROM public.callups callup
         WHERE message.id = $2::uuid AND message.callup_id = callup.id AND callup.league_id = $3::uuid
           AND message.sender_user_id = $4::uuid AND message.deleted_at IS NULL AND message.kind = 'text'`,
        [body, messageId, leagueId, actor.userId]);
      return result.rowCount ? { success: true } : { success: false, error: "Mensagem não encontrada ou sem permissão." };
    });
  }

  async deleteMessage(actor: Actor, leagueId: string, messageId: string) {
    return this.authenticated(actor, async (client) => {
      const result = await client.query(
        `UPDATE public.collective_messages message SET body = 'Mensagem removida', deleted_at = now() FROM public.callups callup
         WHERE message.id = $1::uuid AND message.callup_id = callup.id AND callup.league_id = $2::uuid
           AND (message.sender_user_id = $3::uuid OR public.is_league_admin($2::uuid))`,
        [messageId, leagueId, actor.userId]);
      return result.rowCount ? { success: true } : { success: false, error: "Mensagem não encontrada ou sem permissão." };
    });
  }

  async markRead(actor: Actor, leagueId: string, targets: Array<{ callupId: string; messageId: string }>) {
    return this.authenticated(actor, async (client) => {
      let updated = 0;
      for (const target of targets) {
        const message = await client.query<{ created_at: string }>(
          `SELECT message.created_at FROM public.collective_messages message JOIN public.callups callup ON callup.id = message.callup_id
           WHERE message.id = $1::uuid AND message.callup_id = $2::uuid AND callup.league_id = $3::uuid
             AND public.can_access_collective_chat(callup.id)`,
          [target.messageId, target.callupId, leagueId]);
        if (!message.rows[0]) continue;
        await client.query(
          `INSERT INTO public.collective_reads (callup_id, user_id, last_read_message_id, read_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4) ON CONFLICT (callup_id, user_id) DO UPDATE
           SET last_read_message_id = EXCLUDED.last_read_message_id, read_at = EXCLUDED.read_at
           WHERE public.collective_reads.last_read_message_id IS NULL
              OR (public.collective_reads.read_at, public.collective_reads.last_read_message_id)
                 < (EXCLUDED.read_at, EXCLUDED.last_read_message_id)`,
          [target.callupId, actor.userId, target.messageId, message.rows[0].created_at]);
        updated += 1;
      }
      return updated ? { success: true } : { success: false, error: "Nenhuma mensagem válida para marcar." };
    });
  }

  async getAdminPreviousCollective(actor: Actor, leagueId: string): Promise<CollectiveRoomData | null> {
    const callupId = await this.authenticated(actor, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT callup.id FROM public.callups callup JOIN public.rounds round_item ON round_item.id = callup.round_id
         WHERE callup.league_id = $1::uuid AND round_item.status = 'finished' AND public.is_league_admin($1::uuid)
         ORDER BY callup.date DESC LIMIT 1`, [leagueId]);
      return result.rows[0]?.id || null;
    });
    return callupId ? this.getRoom(actor, leagueId, callupId) : null;
  }
}
