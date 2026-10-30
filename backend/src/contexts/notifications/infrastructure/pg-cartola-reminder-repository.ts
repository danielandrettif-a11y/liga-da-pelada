import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type {
  CartolaReminderMilestone,
  CartolaRoundReminderContext,
} from "../domain/cartola-reminder.js";
import type { CartolaReminderRepository } from "../application/manage-cartola-reminders.js";
import { NotificationPersistenceError } from "./pg-inbox-repository.js";

export function pgCartolaReminderRepository(pool: Pool): CartolaReminderRepository {
  return {
    async toggleReminders(leagueId, enabled, actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const authCheck = await client.query<{ allowed: boolean }>(
            "SELECT public.is_league_admin($1::uuid) AS allowed",
            [leagueId],
          );
          if (authCheck.rows[0]?.allowed !== true) {
            throw new NotificationPersistenceError("Somente administradores podem alterar o envio geral.", 403);
          }

          if (enabled) {
            const configResult = await client.query<{ cartola_email_tested_at: string | null }>(
              "SELECT cartola_email_tested_at FROM public.leagues WHERE id = $1::uuid LIMIT 1",
              [leagueId],
            );
            if (!configResult.rows[0]?.cartola_email_tested_at) {
              throw new NotificationPersistenceError("Envie e confirme primeiro o teste no seu e-mail.", 400);
            }
          }

          await client.query(
            `UPDATE public.leagues
             SET cartola_reminders_enabled = $2,
                 updated_at = NOW()
             WHERE id = $1::uuid`,
            [leagueId, enabled],
          );

          if (!enabled) {
            return { enabled: false, activeRoundToSchedule: null };
          }

          const activeRound = await client.query<{ id: string; date: string; start_time: string | null }>(
            `SELECT r.id, r.date, r.start_time
             FROM public.rounds r
             JOIN public.fantasy_rounds fr ON fr.round_id = r.id
             JOIN public.fantasy_seasons fs ON fs.id = fr.fantasy_season_id
             WHERE fs.league_id = $1::uuid
               AND fr.market_status = 'open'
               AND r.round_type = 'official'
               AND r.status != 'finished'
             ORDER BY fr.created_at DESC
             LIMIT 1`,
            [leagueId],
          );

          const roundRow = activeRound.rows[0];
          return {
            enabled: true,
            activeRoundToSchedule: roundRow
              ? {
                  id: roundRow.id,
                  date: roundRow.date,
                  startTime: roundRow.start_time || "08:00",
                }
              : null,
          };
        });
      } catch (error) {
        if (error instanceof NotificationPersistenceError) throw error;
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao alterar envio geral de lembretes.",
        );
      }
    },

    async cancelEmailReminders(userId) {
      try {
        await pool.query(
          `INSERT INTO public.user_notification_preferences (
             user_id, cartola_email_enabled, updated_at
           ) VALUES (
             $1::uuid, false, NOW()
           )
           ON CONFLICT (user_id) DO UPDATE SET
             cartola_email_enabled = false,
             updated_at = NOW()`,
          [userId],
        );
        return true;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao cancelar lembretes de e-mail.",
        );
      }
    },

    async claimDelivery(input) {
      try {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO public.cartola_reminder_deliveries (
             league_id, round_id, user_id, milestone, channel, status, updated_at
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4, $5, 'pending', NOW()
           )
           ON CONFLICT (round_id, user_id, milestone, channel) DO NOTHING
           RETURNING id`,
          [input.leagueId, input.roundId, input.userId, input.milestone, input.channel],
        );

        if (inserted.rows.length > 0) return true;

        const existing = await pool.query<{ id: string; status: string; updated_at: string }>(
          `SELECT id, status, updated_at
           FROM public.cartola_reminder_deliveries
           WHERE round_id = $1::uuid
             AND user_id = $2::uuid
             AND milestone = $3
             AND channel = $4
           LIMIT 1`,
          [input.roundId, input.userId, input.milestone, input.channel],
        );

        const row = existing.rows[0];
        if (!row) return false;

        const isStalePending =
          row.status === "pending" && Date.now() - new Date(row.updated_at).getTime() > 10 * 60 * 1000;

        if (row.status === "failed" || isStalePending) {
          const reclaimed = await pool.query<{ id: string }>(
            `UPDATE public.cartola_reminder_deliveries
             SET status = 'pending',
                 error_message = NULL,
                 updated_at = NOW()
             WHERE id = $1::uuid
               AND status = $2
             RETURNING id`,
            [row.id, row.status],
          );
          return reclaimed.rows.length > 0;
        }

        return false;
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao reivindicar entrega do lembrete.",
        );
      }
    },

    async saveDelivery(input) {
      try {
        await pool.query(
          `INSERT INTO public.cartola_reminder_deliveries (
             league_id, round_id, user_id, milestone, channel, status, provider_message_id, error_message, delivered_at, updated_at
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
             CASE WHEN $6 = 'delivered' THEN NOW() ELSE NULL END,
             NOW()
           )
           ON CONFLICT (round_id, user_id, milestone, channel) DO UPDATE SET
             status = EXCLUDED.status,
             provider_message_id = EXCLUDED.provider_message_id,
             error_message = EXCLUDED.error_message,
             delivered_at = EXCLUDED.delivered_at,
             updated_at = NOW()`,
          [
            input.leagueId,
            input.roundId,
            input.userId,
            input.milestone,
            input.channel,
            input.status,
            input.providerMessageId || null,
            input.error?.slice(0, 500) || null,
          ],
        );
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao salvar resultado da entrega.",
        );
      }
    },

    async getReminderContext(roundId) {
      try {
        const roundResult = await pool.query<{
          id: string;
          league_id: string;
          number: number;
          date: string;
          start_time: string | null;
          round_status: string;
          round_type: string;
          cartola_reminders_enabled: boolean | null;
          market_status: string | null;
          players_per_team: number;
          fantasy_round_id: string | null;
        }>(
          `SELECT r.id,
                  r.league_id,
                  r.number,
                  r.date,
                  r.start_time,
                  r.status AS round_status,
                  r.round_type,
                  l.cartola_reminders_enabled,
                  fr.market_status,
                  COALESCE((fr.settings_snapshot->>'players_per_team')::integer, l.players_per_team, 5) AS players_per_team,
                  fr.id AS fantasy_round_id
           FROM public.rounds r
           JOIN public.leagues l ON l.id = r.league_id
           LEFT JOIN public.fantasy_rounds fr ON fr.round_id = r.id
           WHERE r.id = $1::uuid
           LIMIT 1`,
          [roundId],
        );

        const round = roundResult.rows[0];
        if (!round || !round.fantasy_round_id) return null;

        const candidatesResult = await pool.query<{
          user_id: string;
          name: string;
          email: string | null;
          push_enabled: boolean;
          email_enabled: boolean;
          players_count: string;
        }>(
          `SELECT ap.user_id,
                  p.name,
                  u.email,
                  COALESCE(unp.cartola_push_enabled, true) AS push_enabled,
                  COALESCE(unp.cartola_email_enabled, true) AS email_enabled,
                  COALESCE(lineup.players_count, 0) AS players_count
           FROM public.league_members lm
           JOIN public.players p ON p.id = lm.player_id
           JOIN public.account_profiles ap ON ap.player_id = p.id
           LEFT JOIN auth.users u ON u.id = ap.user_id
           LEFT JOIN public.user_notification_preferences unp ON unp.user_id = ap.user_id
           LEFT JOIN (
             SELECT fl.user_id, COUNT(flp.id) AS players_count
             FROM public.fantasy_lineups fl
             LEFT JOIN public.fantasy_lineup_players flp ON flp.fantasy_lineup_id = fl.id
             WHERE fl.fantasy_round_id = $2::uuid
             GROUP BY fl.user_id
           ) lineup ON lineup.user_id = ap.user_id
           WHERE lm.league_id = $1::uuid
             AND lm.is_active = true
             AND p.is_selectable = true
             AND p.member_category = 'player'`,
          [round.league_id, round.fantasy_round_id],
        );

        const lineupThreshold = Number(round.players_per_team) || 5;

        return {
          roundId: round.id,
          leagueId: round.league_id,
          roundNumber: round.number,
          date: round.date,
          startTime: round.start_time || "08:00",
          roundStatus: round.round_status,
          roundType: round.round_type,
          remindersEnabled: round.cartola_reminders_enabled === true,
          marketStatus: round.market_status || "closed",
          playersPerTeam: lineupThreshold,
          candidates: candidatesResult.rows.map((row) => ({
            userId: row.user_id,
            email: row.email,
            name: row.name || "Jogador",
            pushEnabled: row.push_enabled !== false,
            emailEnabled: row.email_enabled !== false,
            lineupCompleted: Number(row.players_count) >= lineupThreshold,
          })),
        };
      } catch (error) {
        throw new NotificationPersistenceError(
          error instanceof Error ? error.message : "Erro ao carregar contexto do lembrete do Cartola.",
        );
      }
    },
  };
}

