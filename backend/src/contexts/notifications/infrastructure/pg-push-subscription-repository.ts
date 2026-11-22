import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { SerializedPushSubscription } from "../domain/push-subscription.js";
import type { StoredPushSubscription } from "../domain/push-delivery.js";
import type { PushSubscriptionRepository } from "../application/manage-preferences.js";
import type { PushDeliverySubscriptionRepository } from "../application/manage-delivery.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

export type CombinedPushSubscriptionRepository = PushSubscriptionRepository & PushDeliverySubscriptionRepository;

export function pgPushSubscriptionRepository(pool: Pool): CombinedPushSubscriptionRepository {
  return {
    async saveSubscription(userId: string, subscription: SerializedPushSubscription): Promise<boolean> {
      try {
        await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          await client.query(
            `INSERT INTO public.push_subscriptions (
               user_id, endpoint, p256dh, auth, expiration_time, user_agent, updated_at
             ) VALUES (
               $1::uuid, $2, $3, $4, $5, $6, NOW()
             )
             ON CONFLICT (endpoint) DO UPDATE SET
               user_id = EXCLUDED.user_id,
               p256dh = EXCLUDED.p256dh,
               auth = EXCLUDED.auth,
               expiration_time = EXCLUDED.expiration_time,
               user_agent = EXCLUDED.user_agent,
               updated_at = NOW()`,
            [
              userId,
              subscription.endpoint,
              subscription.keys.p256dh,
              subscription.keys.auth,
              subscription.expirationTime,
              subscription.userAgent || null,
            ],
          );
        });
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao salvar assinatura push.",
        );
      }
    },

    async removeSubscription(userId: string, endpoint: string): Promise<boolean> {
      try {
        await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          await client.query(
            `DELETE FROM public.push_subscriptions
             WHERE user_id = $1::uuid AND endpoint = $2`,
            [userId, endpoint],
          );
        });
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao remover assinatura push.",
        );
      }
    },

    async listSubscriptionsByUser(userId: string): Promise<StoredPushSubscription[]> {
      try {
        return await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          const result = await client.query<{
            endpoint: string;
            p256dh: string;
            auth: string;
            user_agent: string | null;
          }>(
            `SELECT endpoint, p256dh, auth, user_agent
             FROM public.push_subscriptions
             WHERE user_id = $1::uuid`,
            [userId],
          );
          return result.rows.map((row) => ({
            endpoint: row.endpoint,
            p256dh: row.p256dh,
            auth: row.auth,
            userAgent: row.user_agent,
          }));
        });
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao consultar assinaturas push.",
        );
      }
    },

    async removeExpiredEndpoints(userId: string, endpoints: string[]): Promise<boolean> {
      if (endpoints.length === 0) return true;
      try {
        await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          await client.query(
            `DELETE FROM public.push_subscriptions
             WHERE user_id = $1::uuid AND endpoint = ANY($2::text[])`,
            [userId, endpoints],
          );
        });
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao remover assinaturas expiradas.",
        );
      }
    },
  };
}
