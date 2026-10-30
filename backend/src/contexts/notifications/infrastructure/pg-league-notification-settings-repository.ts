import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { LeagueNotificationSettingsRepository } from "../application/manage-delivery.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

export function pgLeagueNotificationSettingsRepository(pool: Pool): LeagueNotificationSettingsRepository {
  return {
    async recordEmailTestedAt(leagueId: string, actor: { userId: string }, testedAt: string): Promise<boolean> {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          const authCheck = await client.query<{ allowed: boolean }>(
            "SELECT public.is_league_admin($1::uuid) AS allowed",
            [leagueId],
          );
          if (authCheck.rows[0]?.allowed !== true) {
            throw new NotificationPersistenceError("Somente administradores podem registrar o teste.", 403);
          }

          await client.query(
            `UPDATE public.leagues
             SET cartola_email_tested_at = $2::timestamptz,
                 updated_at = NOW()
             WHERE id = $1::uuid`,
            [leagueId, testedAt],
          );
        });
        return true;
      } catch (error) {
        if (error instanceof NotificationPersistenceError) throw error;
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao registrar teste de e-mail na liga.",
        );
      }
    },
  };
}

