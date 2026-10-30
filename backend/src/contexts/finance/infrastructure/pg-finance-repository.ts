import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
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

  async checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean> {
    const res = await this.db.query<{ is_admin: boolean }>(
      `SELECT (lm.role = 'admin' OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = $1 AND p.is_app_admin = true)) as is_admin
       FROM league_members lm
       WHERE lm.player_id = $1 AND lm.league_id = $2
       LIMIT 1`,
      [actor.userId, leagueId],
    );
    return Boolean(res.rows[0]?.is_admin);
  }

  async getExpenseItems(leagueId: string, includeArchived: boolean): Promise<ExpenseItem[]> {
    const query = includeArchived
      ? `SELECT ei.*, pr.name as recipient_name, pr.pix_key as recipient_pix_key
         FROM expense_items ei
         LEFT JOIN payment_recipients pr ON pr.id = ei.recipient_id
         WHERE ei.league_id = $1
         ORDER BY ei.created_at DESC`
      : `SELECT ei.*, pr.name as recipient_name, pr.pix_key as recipient_pix_key
         FROM expense_items ei
         LEFT JOIN payment_recipients pr ON pr.id = ei.recipient_id
         WHERE ei.league_id = $1 AND ei.status != 'archived'
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
      await this.db.query(
        `INSERT INTO expense_items (league_id, name, description, total_amount, installment_count, recipient_id, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
        [leagueId, input.name, input.description || null, input.totalAmount, input.installmentCount, input.recipientId, userId],
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived"): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.query(
        `UPDATE expense_items SET status = $1 WHERE id = $2 AND league_id = $3`,
        [status, id, leagueId],
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.query(
        `UPDATE expense_items SET paid_installments_before_app = $1 WHERE id = $2 AND league_id = $3`,
        [paidInstallments, id, leagueId],
      );
      return { success: true };
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
      if (input.id) {
        await this.db.query(
          `UPDATE payment_recipients SET name = $1, pix_key = $2, pix_type = $3, is_active = $4 WHERE id = $5 AND league_id = $6`,
          [input.name, input.pixKey, input.pixType || null, input.active !== false, input.id, leagueId],
        );
      } else {
        await this.db.query(
          `INSERT INTO payment_recipients (league_id, name, pix_key, pix_type, is_active, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [leagueId, input.name, input.pixKey, input.pixType || null, input.active !== false, userId],
        );
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setPaymentRecipientActive(leagueId: string, id: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.query(
        `UPDATE payment_recipients SET is_active = $1 WHERE id = $2 AND league_id = $3`,
        [active, id, leagueId],
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getPaymentRounds(leagueId: string): Promise<PaymentRound[]> {
    const res = await this.db.query<any>(
      `SELECT id, number, date, status, round_type, payment_pix, payment_total, payment_recipient_name,
              COALESCE(payment_extra_time_total, 0) as payment_extra_time_total,
              COALESCE(payment_extra_time_player_ids, '[]'::jsonb) as payment_extra_time_player_ids,
              COALESCE(payment_ball_fund_total, 0) as payment_ball_fund_total,
              COALESCE(payment_ball_fund_player_ids, '[]'::jsonb) as payment_ball_fund_player_ids
       FROM rounds
       WHERE league_id = $1
       ORDER BY date DESC, number DESC`,
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
      `SELECT id FROM rounds WHERE league_id = $1 AND round_type = 'official' AND status = 'finished' ORDER BY date DESC, number DESC LIMIT 1`,
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

  async getRoundPaymentWorkspace(roundId: string): Promise<any | null> {
    const res = await this.db.query<any>(
      `SELECT r.id, r.number, r.date, r.status, r.round_type, r.payment_pix, r.payment_total, r.payment_recipient_name
       FROM rounds r WHERE r.id = $1 LIMIT 1`,
      [roundId],
    );
    return res.rows[0] || null;
  }

  async getRoundPaymentPlayers(leagueId: string, roundId: string): Promise<PaymentPlayer[]> {
    const res = await this.db.query<any>(
      `SELECT p.id, p.name, p.avatar_url,
              COALESCE(rp.paid, false) as paid,
              rp.paid_at
       FROM round_players rpl
       JOIN players p ON p.id = rpl.player_id
       LEFT JOIN round_payments rp ON rp.round_id = $2 AND rp.player_id = p.id
       WHERE rpl.round_id = $2
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
      `SELECT id, round_id, player_id, recipient_name, recipient_pix, amount_due, amount_paid, status
       FROM payment_obligations
       WHERE round_id = $1`,
      [roundId],
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

  async setPaymentObligationPaid(id: string, amountPaid: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.query(
        `UPDATE payment_obligations
         SET amount_paid = $1,
             status = CASE WHEN $1 >= amount_due THEN 'paid' ELSE 'partial' END
         WHERE id = $2`,
        [amountPaid, id],
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean, changedByUserId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.query(
        `INSERT INTO round_payments (round_id, player_id, paid, paid_at, changed_by)
         VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE null END, $4)
         ON CONFLICT (round_id, player_id)
         DO UPDATE SET paid = $3, paid_at = CASE WHEN $3 THEN now() ELSE null END, changed_by = $4`,
        [roundId, playerId, paid, changedByUserId],
      );

      // Inserir registro de auditoria
      await this.db.query(
        `INSERT INTO payment_audit_log (round_id, target_player_id, paid, changed_by_player_id, created_at)
         VALUES ($1, $2, $3, $4, now())`,
        [roundId, playerId, paid, changedByUserId],
      );

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getRoundExpenseSelections(leagueId: string, roundId: string): Promise<RoundExpenseSelection[]> {
    const res = await this.db.query<any>(
      `SELECT expense_item_id, installment_number FROM round_expense_selections WHERE round_id = $1`,
      [roundId],
    );
    return res.rows.map((r) => ({
      expense_item_id: r.expense_item_id,
      installment_number: Number(r.installment_number),
    }));
  }

  async syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.query(`DELETE FROM round_expense_selections WHERE round_id = $1`, [roundId]);
      for (const id of expenseItemIds) {
        await this.db.query(
          `INSERT INTO round_expense_selections (round_id, expense_item_id, installment_number)
           VALUES ($1, $2, 1)`,
          [roundId, id],
        );
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateRoundPaymentDetails(leagueId: string, input: RoundPaymentDetailsInput): Promise<{
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
      await this.db.query(
        `UPDATE rounds
         SET payment_pix = $1,
             payment_total = $2,
             payment_extra_time_total = $3,
             payment_extra_time_player_ids = $4,
             payment_ball_fund_total = $5,
             payment_ball_fund_player_ids = $6
         WHERE id = $7 AND league_id = $8`,
        [
          input.paymentPix,
          input.paymentTotal,
          input.extraTimeTotal,
          JSON.stringify(input.extraTimePlayerIds),
          input.ballFundTotal,
          JSON.stringify(input.ballFundPlayerIds),
          input.roundId,
          leagueId,
        ],
      );
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
       FROM payment_charge_lines
       WHERE round_id = $1`,
      [roundId],
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
              tp.name as target_player_name,
              cp.name as changed_by_name,
              r.number as round_number, r.date as round_date, r.round_type
       FROM payment_audit_log pal
       LEFT JOIN players tp ON tp.id = pal.target_player_id
       LEFT JOIN players cp ON cp.id = pal.changed_by_player_id
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
