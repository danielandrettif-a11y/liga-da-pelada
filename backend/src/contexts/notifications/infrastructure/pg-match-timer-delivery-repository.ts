import type { Pool } from "pg";
import type { MatchTimerDeliveryRepository } from "../application/manage-delivery.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

export function pgMatchTimerDeliveryRepository(pool: Pool): MatchTimerDeliveryRepository {
  return {
    async listSubscriptionsForRound(roundId) {
      try {
        const result = await pool.query<{
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
        }>(
          `SELECT DISTINCT subscription.endpoint, subscription.p256dh, subscription.auth, subscription.user_agent
           FROM public.round_players round_player
           JOIN public.account_profiles profile ON profile.player_id = round_player.player_id
           JOIN public.push_subscriptions subscription ON subscription.user_id = profile.user_id
           LEFT JOIN public.user_notification_preferences preference ON preference.user_id = profile.user_id
           WHERE round_player.round_id = $1::uuid
             AND COALESCE(preference.match_push_enabled, true) = true`,
          [roundId],
        );
        return result.rows.map((row) => ({
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
          userAgent: row.user_agent,
        }));
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao consultar destinatários do alerta da partida.",
        );
      }
    },

    async removeExpiredEndpoints(endpoints) {
      if (endpoints.length === 0) return true;
      try {
        await pool.query(
          "DELETE FROM public.push_subscriptions WHERE endpoint = ANY($1::text[])",
          [endpoints],
        );
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao remover assinaturas expiradas.",
        );
      }
    },
  };
}
