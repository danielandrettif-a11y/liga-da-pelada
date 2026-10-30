import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type {
  NotificationPreferencesRepository,
  RawPreferencesData,
} from "../application/manage-preferences.js";
import type { UpdateNotificationPreferencesInput } from "../domain/notification-preferences.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

export function pgNotificationPreferencesRepository(
  pool: Pool,
): NotificationPreferencesRepository {
  return {
    async getPreferences(userId: string, leagueId: string): Promise<RawPreferencesData> {
      try {
        return await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          const [prefResult, leagueResult] = await Promise.all([
            client.query<{
              match_push_enabled: boolean | null;
              callup_push_enabled: boolean | null;
              cartola_push_enabled: boolean | null;
              cartola_email_enabled: boolean | null;
              collective_push_enabled: boolean | null;
            }>(
              `SELECT match_push_enabled, callup_push_enabled, cartola_push_enabled, cartola_email_enabled, collective_push_enabled
               FROM public.user_notification_preferences
               WHERE user_id = $1::uuid
               LIMIT 1`,
              [userId],
            ),
            client.query<{
              cartola_reminders_enabled: boolean | null;
              cartola_email_tested_at: string | null;
            }>(
              `SELECT cartola_reminders_enabled, cartola_email_tested_at
               FROM public.leagues
               WHERE id = $1::uuid
               LIMIT 1`,
              [leagueId],
            ),
          ]);

          return {
            preference: prefResult.rows[0] || null,
            leagueSettings: leagueResult.rows[0] || null,
          };
        });
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao carregar preferências de notificação.",
        );
      }
    },

    async updatePreferences(
      userId: string,
      input: UpdateNotificationPreferencesInput,
    ): Promise<boolean> {
      try {
        await withAuthenticatedTransaction(pool, { userId }, async (client) => {
          await client.query(
            `INSERT INTO public.user_notification_preferences (
               user_id, match_push_enabled, callup_push_enabled, cartola_push_enabled, cartola_email_enabled, collective_push_enabled, updated_at
             ) VALUES (
               $1::uuid, $2, $3, $4, $5, $6, NOW()
             )
             ON CONFLICT (user_id) DO UPDATE SET
               match_push_enabled = EXCLUDED.match_push_enabled,
               callup_push_enabled = EXCLUDED.callup_push_enabled,
               cartola_push_enabled = EXCLUDED.cartola_push_enabled,
               cartola_email_enabled = EXCLUDED.cartola_email_enabled,
               collective_push_enabled = EXCLUDED.collective_push_enabled,
               updated_at = NOW()`,
            [
              userId,
              input.matchPushEnabled,
              input.callupPushEnabled,
              input.cartolaPushEnabled,
              input.cartolaEmailEnabled,
              input.collectivePushEnabled,
            ],
          );
        });
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao atualizar preferências de notificação.",
        );
      }
    },
  };
}

