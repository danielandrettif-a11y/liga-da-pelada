import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { LeagueNotificationSettingsRepository } from "../application/manage-delivery.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

export function pgLeagueNotificationSettingsRepository(pool: Pool): LeagueNotificationSettingsRepository {
  return {
    async getEmailTestRecipient(leagueId, actor) {
      try {
        const playerName = await withAuthenticatedTransaction(pool, actor, async (client) => {
          const authCheck = await client.query<{ allowed: boolean }>(
            "SELECT public.is_league_admin($1::uuid) AS allowed",
            [leagueId],
          );
          if (authCheck.rows[0]?.allowed !== true) {
            throw new NotificationPersistenceError("Somente administradores podem executar o teste.", 403);
          }

          const profile = await client.query<{ name: string | null }>(
            `SELECT COALESCE(NULLIF(BTRIM(player.nickname), ''), NULLIF(BTRIM(player.name), '')) AS name
             FROM public.account_profiles profile
             LEFT JOIN public.players player ON player.id = profile.player_id
             WHERE profile.user_id = $1::uuid
             LIMIT 1`,
            [actor.userId],
          );
          return profile.rows[0]?.name || null;
        });

        const email = actor.email?.trim();
        if (!email) {
          throw new NotificationPersistenceError("Somente um ADM com e-mail pode executar o teste.", 400);
        }
        return { email, name: playerName || actor.name?.trim() || email.split("@")[0] || "Jogador" };
      } catch (error) {
        if (error instanceof NotificationPersistenceError) throw error;
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao validar destinatário do teste de e-mail.",
        );
      }
    },

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

