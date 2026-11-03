import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FinanceRepository } from "../application/manage-finance.js";
import type {
  ExpenseItem,
  ExpenseItemInput,
  PaymentAuditLogEntry,
  PaymentChargeLine,
  PaymentObligation,
  PaymentPlayer,
  PaymentRecipient,
  PaymentRecipientInput,
  PaymentRound,
  RoundExpenseSelection,
  RoundPaymentDetailsInput,
} from "../domain/finance.js";

export class PgFinanceRepository implements FinanceRepository {
  constructor(private readonly db: Pool) {}

  async checkCanAccess(actor: Actor, leagueId: string): Promise<boolean> {
    return withAuthenticatedTransaction(this.db, actor, async (client) => {
      const result = await client.query<{ allowed: boolean }>(
        "SELECT public.is_league_member($1::uuid) AS allowed",
        [leagueId],
      );
      return Boolean(result.rows[0]?.allowed);
    });
  }

  async checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean> {
    return withAuthenticatedTransaction(this.db, actor, async (client) => {
      const result = await client.query<{ is_admin: boolean }>(
        "SELECT public.is_league_admin($1::uuid) AS is_admin",
        [leagueId],
      );
      return Boolean(result.rows[0]?.is_admin);
    });
  }

  async recipientIsActive(leagueId: string, recipientId: string): Promise<boolean> {
    const result = await this.db.query(
      "SELECT 1 FROM public.payment_recipients WHERE id = $1::uuid AND league_id = $2::uuid AND is_active",
      [recipientId, leagueId],
    );
    return Boolean(result.rowCount);
  }

  async getExpenseInstallmentState(leagueId: string, id: string) {
    const result = await this.db.query<{ installment_count: number; registered_count: number }>(
      `SELECT item.installment_count,
              count(installment.id) FILTER (WHERE installment.status = 'active')::integer AS registered_count
       FROM public.league_expense_items item
       LEFT JOIN public.round_expense_installments installment ON installment.expense_item_id = item.id
       WHERE item.id = $1::uuid AND item.league_id = $2::uuid
       GROUP BY item.id, item.installment_count`,
      [id, leagueId],
    );
    const row = result.rows[0];
    return row ? { installmentCount: Number(row.installment_count), registeredCount: Number(row.registered_count) } : null;
  }

  async getRoundStatus(leagueId: string, roundId: string): Promise<string | null> {
    const result = await this.db.query<{ status: string }>(
      "SELECT status FROM public.rounds WHERE id = $1::uuid AND league_id = $2::uuid",
      [roundId, leagueId],
    );
    return result.rows[0]?.status || null;
  }

  async listActiveRoundExpenseItemIds(leagueId: string, roundId: string): Promise<string[]> {
    const result = await this.db.query<{ expense_item_id: string }>(
      `SELECT installment.expense_item_id
       FROM public.round_expense_installments installment
       JOIN public.rounds round_item ON round_item.id = installment.round_id
       WHERE installment.round_id = $1::uuid AND round_item.league_id = $2::uuid
         AND installment.status = 'active'`,
      [roundId, leagueId],
    );
    return [...new Set(result.rows.map((row) => row.expense_item_id))];
  }

  async getExpenseItems(leagueId: string, includeArchived: boolean): Promise<ExpenseItem[]> {
    const query = includeArchived
      ? `SELECT ei.*, pr.name as recipient_name, pr.pix_key as recipient_pix_key,
                ei.paid_installments_before_app + (SELECT count(*) FROM round_expense_installments installment WHERE installment.expense_item_id = ei.id AND installment.status = 'active') AS paid_installments
         FROM league_expense_items ei
         LEFT JOIN payment_recipients pr ON pr.id = ei.recipient_id
         WHERE ei.league_id = $1
         ORDER BY ei.created_at DESC`
      : `SELECT ei.*, pr.name as recipient_name, pr.pix_key as recipient_pix_key,
                ei.paid_installments_before_app + (SELECT count(*) FROM round_expense_installments installment WHERE installment.expense_item_id = ei.id AND installment.status = 'active') AS paid_installments
         FROM league_expense_items ei
         LEFT JOIN payment_recipients pr ON pr.id = ei.recipient_id
         WHERE ei.league_id = $1 AND ei.status = 'active'
         ORDER BY ei.created_at DESC`;

    const res = await this.db.query<any>(query, [leagueId]);
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      total_amount: Number(r.total_amount),
      installment_count: Number(r.installment_count),
      status: r.status,
      recipient_id: r.recipient_id,
      created_at: r.created_at,
      recipient: r.recipient_name ? { name: r.recipient_name, pix_key: r.recipient_pix_key } : null,
      paid_installments: Number(r.paid_installments || 0),
      paid_installments_before_app: Number(r.paid_installments_before_app || 0),
    }));
  }

  async saveExpenseItem(leagueId: string, userId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }> {
    try {
      await withAuthenticatedTransaction(this.db, { userId }, (client) => client.query(
        `INSERT INTO public.league_expense_items
          (league_id, name, description, total_amount, installment_count, recipient_id, created_by, status)
         SELECT $1::uuid, $2, $3, $4, $5, recipient.id, $7::uuid, 'active'
         FROM public.payment_recipients recipient
         WHERE recipient.id = $6::uuid AND recipient.league_id = $1::uuid AND recipient.is_active`,
        [leagueId, input.name, input.description || null, input.totalAmount, input.installmentCount, input.recipientId, userId],
      ).then((result) => {
        if (!result.rowCount) throw new Error("Escolha um PIX ativo desta pelada.");
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived", userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const updated = await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        const result = await client.query(
          `UPDATE public.league_expense_items SET status = $1, updated_at = now()
           WHERE id = $2::uuid AND league_id = $3::uuid`,
          [status, id, leagueId],
        );
        return Boolean(result.rowCount);
      });
      return updated ? { success: true } : { success: false, error: "Item não pertence a esta pelada." };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const updated = await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        const result = await client.query(
          `UPDATE public.league_expense_items SET paid_installments_before_app = $1, updated_at = now()
           WHERE id = $2::uuid AND league_id = $3::uuid`,
          [paidInstallments, id, leagueId],
        );
        return Boolean(result.rowCount);
      });
      return updated ? { success: true } : { success: false, error: "Item não pertence a esta pelada." };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getPaymentRecipients(leagueId: string, includeInactive: boolean): Promise<PaymentRecipient[]> {
    const query = includeInactive
      ? `SELECT id, name, pix_key, pix_type, is_active FROM payment_recipients WHERE league_id = $1 ORDER BY name ASC`
      : `SELECT id, name, pix_key, pix_type, is_active FROM payment_recipients WHERE league_id = $1 AND is_active = true ORDER BY name ASC`;
    const res = await this.db.query<any>(query, [leagueId]);
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      pix_key: r.pix_key,
      pix_type: r.pix_type,
      is_active: Boolean(r.is_active),
    }));
  }

  async savePaymentRecipient(leagueId: string, userId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }> {
    try {
      const saved = await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        if (input.id) {
          const result = await client.query(
            `UPDATE public.payment_recipients
             SET name = $1, pix_key = $2, pix_type = $3, is_active = $4
             WHERE id = $5::uuid AND league_id = $6::uuid`,
            [input.name, input.pixKey, input.pixType || null, input.active !== false, input.id, leagueId],
          );
          return Boolean(result.rowCount);
        }
        const result = await client.query(
          `INSERT INTO public.payment_recipients (league_id, name, pix_key, pix_type, is_active, created_by)
           VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)`,
          [leagueId, input.name, input.pixKey, input.pixType || null, input.active !== false, userId],
        );
        return Boolean(result.rowCount);
      });
      if (!saved) return { success: false, error: "Destinatário não pertence a esta pelada." };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setPaymentRecipientActive(leagueId: string, id: string, active: boolean, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const updated = await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        const result = await client.query(
          `UPDATE public.payment_recipients SET is_active = $1 WHERE id = $2::uuid AND league_id = $3::uuid`,
          [active, id, leagueId],
        );
        return Boolean(result.rowCount);
      });
      return updated ? { success: true } : { success: false, error: "Destinatário não pertence a esta pelada." };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getPaymentRounds(leagueId: string): Promise<PaymentRound[]> {
    const res = await this.db.query<any>(
      `SELECT round_item.id, round_item.number, round_item.date, round_item.status, round_item.round_type,
              round_item.payment_pix, round_item.payment_total, round_item.payment_recipient_name,
              COALESCE(round_item.payment_extra_time_total, 0) as payment_extra_time_total,
              COALESCE(round_item.payment_extra_time_player_ids, '[]'::jsonb) as payment_extra_time_player_ids,
              COALESCE(round_item.payment_ball_fund_total, 0) as payment_ball_fund_total,
              COALESCE(round_item.payment_ball_fund_player_ids, '[]'::jsonb) as payment_ball_fund_player_ids
       FROM rounds round_item
       JOIN seasons season ON season.id = round_item.season_id
       WHERE round_item.league_id = $1 AND season.status = 'active'
       ORDER BY round_item.date DESC, round_item.created_at DESC`,
      [leagueId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      number: Number(r.number),
      date: r.date,
      status: r.status,
      round_type: r.round_type,
      payment_pix: r.payment_pix,
      payment_total: r.payment_total ? Number(r.payment_total) : null,
      payment_recipient_name: r.payment_recipient_name,
      payment_extra_time_total: Number(r.payment_extra_time_total),
      payment_extra_time_player_ids: Array.isArray(r.payment_extra_time_player_ids) ? r.payment_extra_time_player_ids : [],
      payment_ball_fund_total: Number(r.payment_ball_fund_total),
      payment_ball_fund_player_ids: Array.isArray(r.payment_ball_fund_player_ids) ? r.payment_ball_fund_player_ids : [],
    }));
  }

  async getLatestFinishedRoundPaymentState(leagueId: string) {
    const roundRes = await this.db.query<{ id: string }>(
      `SELECT round_item.id
       FROM public.rounds round_item
       JOIN public.seasons season ON season.id = round_item.season_id
       WHERE round_item.league_id = $1 AND season.status = 'active' AND round_item.status = 'finished'
       ORDER BY round_item.date DESC, round_item.created_at DESC LIMIT 1`,
      [leagueId],
    );
    const roundId = roundRes.rows[0]?.id;
    if (!roundId) return null;

    const [participantsRes, paymentsRes] = await Promise.all([
      this.db.query<{ id: string; is_monthly_payer: boolean }>(
        `SELECT p.id, COALESCE(lm.is_monthly_payer, false) as is_monthly_payer
         FROM round_players rp
         JOIN players p ON p.id = rp.player_id
         LEFT JOIN league_members lm ON lm.player_id = p.id AND lm.league_id = $1
         WHERE rp.round_id = $2`,
        [leagueId, roundId],
      ),
      this.db.query<{ player_id: string; paid: boolean }>(
        `SELECT player_id, paid FROM round_payments WHERE round_id = $1`,
        [roundId],
      ),
    ]);

    return {
      participants: participantsRes.rows,
      payments: paymentsRes.rows,
    };
  }

  async getRoundPaymentWorkspace(leagueId: string, roundId: string): Promise<any | null> {
    const res = await this.db.query<any>(
      `SELECT public.get_round_payment_read_model(round_item.id) AS read_model
       FROM public.rounds round_item
       WHERE round_item.id = $1 AND round_item.league_id = $2`,
      [roundId, leagueId],
    );
    return res.rows[0]?.read_model || null;
  }

  async getRoundPaymentPlayers(leagueId: string, roundId: string): Promise<PaymentPlayer[]> {
    const res = await this.db.query<any>(
      `SELECT p.id, p.name, p.avatar_url,
              COALESCE(rp.paid, false) as paid,
              rp.paid_at
       FROM round_players rpl
       JOIN players p ON p.id = rpl.player_id
       LEFT JOIN round_payments rp ON rp.round_id = $2 AND rp.player_id = p.id
       JOIN rounds r ON r.id = rpl.round_id
       WHERE rpl.round_id = $2 AND r.league_id = $1
       ORDER BY p.name ASC`,
      [leagueId, roundId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatar_url: r.avatar_url,
      paid: Boolean(r.paid),
      paid_at: r.paid_at || null,
    }));
  }

  async getRoundPaymentObligations(leagueId: string, roundId: string): Promise<PaymentObligation[]> {
    const res = await this.db.query<any>(
      `SELECT obligation.id, obligation.round_id, obligation.player_id, obligation.recipient_name,
              obligation.recipient_pix, obligation.amount_due, obligation.amount_paid, obligation.status
       FROM round_payment_obligations obligation
       JOIN rounds round_item ON round_item.id = obligation.round_id
       WHERE obligation.round_id = $2 AND round_item.league_id = $1`,
      [leagueId, roundId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      round_id: r.round_id,
      player_id: r.player_id,
      recipient_name: r.recipient_name,
      recipient_pix: r.recipient_pix,
      amount_due: Number(r.amount_due),
      amount_paid: Number(r.amount_paid),
      status: r.status,
    }));
  }

  async setPaymentObligationPaid(leagueId: string, id: string, amountPaid: number, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        const result = await client.query<{ updated: boolean }>(
          `SELECT public.set_round_payment_obligation_paid($1::uuid, $2::numeric) AS updated
           WHERE EXISTS (
             SELECT 1 FROM public.round_payment_obligations obligation
             JOIN public.rounds round_item ON round_item.id = obligation.round_id
             WHERE obligation.id = $1::uuid AND round_item.league_id = $3::uuid
           )`,
          [id, amountPaid, leagueId],
        );
        return result.rows[0]?.updated ? { success: true } : { success: false, error: "Obrigação não encontrada." };
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean, changedByUserId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await withAuthenticatedTransaction(this.db, { userId: changedByUserId }, async (client) => {
        const participant = await client.query(
          `SELECT 1 FROM public.round_players participant
           JOIN public.rounds round_item ON round_item.id = participant.round_id
           WHERE participant.round_id = $1 AND participant.player_id = $2 AND round_item.league_id = $3`,
          [roundId, playerId, leagueId],
        );
        if (!participant.rowCount) return { success: false, error: "Jogador não participa desta rodada." };
        await client.query(
          `INSERT INTO public.round_payments (round_id, player_id, paid, paid_at)
           VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE null END)
           ON CONFLICT (round_id, player_id)
           DO UPDATE SET paid = $3, paid_at = CASE WHEN $3 THEN now() ELSE null END`,
          [roundId, playerId, paid],
        );
        await client.query("SELECT public.prune_collective_history_after_payment($1::uuid)", [roundId]);
        return { success: true };
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getRoundExpenseSelections(leagueId: string, roundId: string): Promise<RoundExpenseSelection[]> {
    const res = await this.db.query<any>(
      `SELECT installment.expense_item_id, installment.installment_number
       FROM round_expense_installments installment
       JOIN rounds round_item ON round_item.id = installment.round_id
       WHERE installment.round_id = $2 AND installment.status = 'active' AND round_item.league_id = $1`,
      [leagueId, roundId],
    );
    return res.rows.map((r) => ({
      expense_item_id: r.expense_item_id,
      installment_number: Number(r.installment_number),
    }));
  }

  async syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[], userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        const result = await client.query<{ synced: boolean }>(
          `SELECT public.sync_round_payment_plan($1::uuid, $2::uuid[]) AS synced
           WHERE EXISTS (SELECT 1 FROM public.rounds WHERE id = $1::uuid AND league_id = $3::uuid)
             AND NOT EXISTS (
               SELECT 1 FROM unnest($2::uuid[]) expense_id
               WHERE NOT EXISTS (SELECT 1 FROM public.league_expense_items item WHERE item.id = expense_id AND item.league_id = $3::uuid)
             )`,
          [roundId, expenseItemIds, leagueId],
        );
        return result.rows[0]?.synced ? { success: true } : { success: false, error: "Rodada ou despesa inválida." };
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateRoundPaymentDetails(leagueId: string, input: RoundPaymentDetailsInput, userId: string): Promise<{
    success: boolean;
    error?: string;
    details?: {
      pix: string;
      total: number;
      extraTimeTotal: number;
      extraTimePlayerIds: string[];
      ballFundTotal: number;
      ballFundPlayerIds: string[];
    };
  }> {
    try {
      const updated = await withAuthenticatedTransaction(this.db, { userId }, async (client) => {
        const result = await client.query<{ updated: boolean }>(
          `SELECT public.update_round_payment_details_v2($1::uuid, $2, $3::numeric, $4::numeric, $5::uuid[], $6::numeric, $7::uuid[]) AS updated
           WHERE EXISTS (SELECT 1 FROM public.rounds WHERE id = $1::uuid AND league_id = $8::uuid)`,
          [input.roundId, input.paymentPix, input.paymentTotal, input.extraTimeTotal,
            input.extraTimePlayerIds, input.ballFundTotal, input.ballFundPlayerIds, leagueId],
        );
        return Boolean(result.rows[0]?.updated);
      });
      if (!updated) return { success: false, error: "Rodada não encontrada." };
      return {
        success: true,
        details: {
          pix: input.paymentPix,
          total: Math.round(Number(input.paymentTotal) * 100) / 100,
          extraTimeTotal: Math.round(Number(input.extraTimeTotal) * 100) / 100,
          extraTimePlayerIds: input.extraTimePlayerIds || [],
          ballFundTotal: Math.round(Number(input.ballFundTotal) * 100) / 100,
          ballFundPlayerIds: input.ballFundPlayerIds || [],
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getRoundPaymentChargeLines(leagueId: string, roundId: string): Promise<PaymentChargeLine[]> {
    const res = await this.db.query<any>(
      `SELECT id, player_id, recipient_name, recipient_pix, label, amount, charge_type
       FROM round_payment_charge_lines charge
       JOIN rounds round_item ON round_item.id = charge.round_id
       WHERE charge.round_id = $2 AND round_item.league_id = $1`,
      [leagueId, roundId],
    );
    return res.rows.map((r) => ({
      id: Number(r.id),
      player_id: r.player_id,
      recipient_name: r.recipient_name,
      recipient_pix: r.recipient_pix,
      label: r.label,
      amount: Number(r.amount),
      charge_type: r.charge_type,
    }));
  }

  async getPaymentAuditLog(leagueId: string): Promise<PaymentAuditLogEntry[]> {
    const res = await this.db.query<any>(
      `SELECT pal.id, pal.round_id, pal.target_player_id, pal.paid, pal.changed_by_player_id, pal.created_at,
              pal.target_player_name,
              pal.changed_by_name,
              r.number as round_number, r.date as round_date, r.round_type
       FROM round_payment_audit pal
       JOIN rounds r ON r.id = pal.round_id
       WHERE r.league_id = $1
       ORDER BY pal.created_at DESC LIMIT 100`,
      [leagueId],
    );
    return res.rows.map((r) => ({
      id: Number(r.id),
      round_id: r.round_id,
      target_player_id: r.target_player_id,
      target_player_name: r.target_player_name || "Jogador",
      paid: Boolean(r.paid),
      changed_by_player_id: r.changed_by_player_id,
      changed_by_name: r.changed_by_name || "Sistema",
      created_at: r.created_at,
      round: {
        id: r.round_id,
        number: Number(r.round_number),
        date: r.round_date,
        round_type: r.round_type,
      },
    }));
  }
}
