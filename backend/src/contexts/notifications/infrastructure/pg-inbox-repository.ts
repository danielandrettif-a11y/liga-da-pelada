import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type {
  DesiredInboxNotification,
  InboxNotificationRecord,
} from "../domain/inbox-notification.js";
import type { InboxRepository } from "../application/manage-inbox.js";

export class NotificationPersistenceError extends Error {
  readonly statusCode: number;

  constructor(message = "Erro de persistência de notificações.", statusCode = 500) {
    super(message);
    this.name = "NotificationPersistenceError";
    this.statusCode = statusCode;
  }
}

export function pgInboxRepository(pool: Pool): InboxRepository {
  return {
    async getPreview(userId: string): Promise<InboxNotificationRecord[]> {
      try {
        return await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          const result = await client.query<InboxNotificationRecord>(
            `SELECT id, title, body, href, notification_type, state, read_at, created_at, updated_at
             FROM public.user_inbox_notifications
             WHERE user_id = $1::uuid
               AND state = 'active'
               AND read_at IS NULL
             ORDER BY updated_at DESC
             LIMIT 10`,
            [userId],
          );
          return result.rows;
        });
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao carregar prévia do inbox.",
        );
      }
    },

    async markRead(userId: string, ids?: string[]): Promise<boolean> {
      try {
        await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          if (ids && ids.length > 0) {
            await client.query(
              `UPDATE public.user_inbox_notifications
               SET read_at = NOW(), state = 'resolved', resolved_at = NOW(), updated_at = NOW()
               WHERE user_id = $1::uuid
                 AND id = ANY($2::uuid[])`,
              [userId, ids],
            );
          } else {
            await client.query(
              `UPDATE public.user_inbox_notifications
               SET read_at = NOW(), state = 'resolved', resolved_at = NOW(), updated_at = NOW()
               WHERE user_id = $1::uuid
                 AND read_at IS NULL`,
              [userId],
            );
          }
        });
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao marcar notificações como lidas.",
        );
      }
    },

    async syncAndList(
      userId: string,
      leagueId: string,
      desired: DesiredInboxNotification[],
    ): Promise<InboxNotificationRecord[]> {
      try {
        return await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          const keys = desired.map((item) => item.key);

          if (keys.length > 0) {
            const existingRes = await client.query<{
              id: string;
              dedupe_key: string;
              read_at: string | null;
              state: string;
            }>(
              `SELECT id, dedupe_key, read_at, state
               FROM public.user_inbox_notifications
               WHERE user_id = $1::uuid
                 AND dedupe_key = ANY($2::text[])`,
              [userId, keys],
            );

            const existingMap = new Map(existingRes.rows.map((row) => [row.dedupe_key, row]));

            const toInsert = desired.filter((item) => {
              const ex = existingMap.get(item.key);
              if (ex && (ex.read_at || ex.state === "resolved")) {
                return false;
              }
              return !ex;
            });

            for (const item of toInsert) {
              await client.query(
                `INSERT INTO public.user_inbox_notifications (
                   user_id, league_id, notification_type, dedupe_key, title, body, href, state, read_at, resolved_at, created_at, updated_at
                 ) VALUES (
                   $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'active', NULL, NULL, NOW(), NOW()
                 )
                 ON CONFLICT (user_id, dedupe_key) DO UPDATE SET
                   title = EXCLUDED.title,
                   body = EXCLUDED.body,
                   href = EXCLUDED.href,
                   updated_at = NOW()
                 WHERE user_inbox_notifications.read_at IS NULL
                   AND user_inbox_notifications.state != 'resolved'`,
                [userId, leagueId, item.type, item.key, item.title, item.body, item.href],
              );
            }

            // Resolver notificações ativas que já foram solucionadas (exceto callup_withdrawal)
            await client.query(
              `UPDATE public.user_inbox_notifications
               SET state = 'resolved', resolved_at = NOW(), updated_at = NOW()
               WHERE user_id = $1::uuid
                 AND state = 'active'
                 AND notification_type != 'callup_withdrawal'
                 AND NOT (dedupe_key = ANY($2::text[]))`,
              [userId, keys],
            );
          } else {
            // Nenhuma notificação desejada: resolver todas as ativas (exceto callup_withdrawal)
            await client.query(
              `UPDATE public.user_inbox_notifications
               SET state = 'resolved', resolved_at = NOW(), updated_at = NOW()
               WHERE user_id = $1::uuid
                 AND state = 'active'
                 AND notification_type != 'callup_withdrawal'`,
              [userId],
            );
          }

          const result = await client.query<InboxNotificationRecord>(
            `SELECT id, title, body, href, notification_type, state, read_at, created_at, updated_at
             FROM public.user_inbox_notifications
             WHERE user_id = $1::uuid
             ORDER BY updated_at DESC
             LIMIT 30`,
            [userId],
          );
          return result.rows;
        });
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao sincronizar notificações do inbox.",
        );
      }
    },
  };
}

