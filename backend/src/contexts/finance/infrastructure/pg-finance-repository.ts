import type { Pool, PoolClient } from "pg";
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

  private async withClient<T>(callback: (client: PoolClient) => Promise<T>, userId?: string): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      if (userId) {
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true), set_config('search_path', 'public, auth', true)",
          [userId, JSON.stringify({ sub: userId, role: "authenticated" })],
        );
      } else {
        await client.query("SET LOCAL search_path = public, auth");
      }
      const res = await callback(client);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const res = await client.query<{ is_admin: boolean }>(
        `SELECT (
           EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = $2 AND l.owner_id = $1)
           OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = $1 AND lm.league_id = $2 AND lm.role = 'admin')
           OR EXISTS (SELECT 1 FROM public.account_profiles ap WHERE ap.user_id = $1 AND ap.role = 'admin')
         ) as is_admin`,
        [actor.userId, leagueId],
      );
      return Boolean(res.rows[0]?.is_admin);
    }, actor.userId);
  }

  async getExpenseItems(leagueId: string, includeArchived: boolean): Promise<ExpenseItem[]> {
    return this.withClient(async (client) => {
      const query = includeArchived
        ? `SELECT ei.id, ei.league_id, ei.name, ei.description, ei.total_amount, ei.installment_count,
                  ei.recipient_id, ei.status, ei.created_at, ei.paid_installments_before_app,
                  pr.name as recipient_name, pr.pix_key as recipient_pix_key,
                  COALESCE((
                    SELECT count(*)::int
                    FROM public.round_expense_installments rei
                    WHERE rei.expense_item_id = ei.id AND rei.status = 'active'
                  ), 0) as paid_installments
           FROM public.league_expense_items ei
           LEFT JOIN public.payment_recipients pr ON pr.id = ei.recipient_id
           WHERE ei.league_id = $1
           ORDER BY ei.created_at DESC`
        : `SELECT ei.id, ei.league_id, ei.name, ei.description, ei.total_amount, ei.installment_count,
                  ei.recipient_id, ei.status, ei.created_at, ei.paid_installments_before_app,
                  pr.name as recipient_name, pr.pix_key as recipient_pix_key,
                  COALESCE((
                    SELECT count(*)::int
                    FROM public.round_expense_installments rei
                    WHERE rei.expense_item_id = ei.id AND rei.status = 'active'
                  ), 0) as paid_installments
           FROM public.league_expense_items ei
           LEFT JOIN public.payment_recipients pr ON pr.id = ei.recipient_id
           WHERE ei.league_id = $1 AND ei.status != 'archived'
           ORDER BY ei.created_at DESC`;

      const res = await client.query<any>(query, [leagueId]);
      return res.rows.map((r: any) => ({
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
    });
  }

  async saveExpenseItem(leagueId: string, userId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `INSERT INTO public.league_expense_items (league_id, name, description, total_amount, installment_count, recipient_id, created_by, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
          [leagueId, input.name, input.description || null, input.totalAmount, input.installmentCount, input.recipientId, userId],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }

  async setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived"): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `UPDATE public.league_expense_items SET status = $1, updated_at = now() WHERE id = $2 AND league_id = $3`,
          [status, id, leagueId],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }

  async setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `UPDATE public.league_expense_items SET paid_installments_before_app = $1, updated_at = now() WHERE id = $2 AND league_id = $3`,
          [paidInstallments, id, leagueId],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }

  async getPaymentRecipients(leagueId: string, includeInactive: boolean): Promise<PaymentRecipient[]> {
    return this.withClient(async (client) => {
      const query = includeInactive
        ? `SELECT id, name, pix_key, pix_type, is_active FROM public.payment_recipients WHERE league_id = $1 ORDER BY name ASC`
        : `SELECT id, name, pix_key, pix_type, is_active FROM public.payment_recipients WHERE league_id = $1 AND is_active = true ORDER BY name ASC`;
      const res = await client.query<any>(query, [leagueId]);
      return res.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        pix_key: r.pix_key,
        pix_type: r.pix_type,
        is_active: Boolean(r.is_active),
      }));
    });
  }

  async savePaymentRecipient(leagueId: string, userId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        if (input.id) {
          await client.query(
            `UPDATE public.payment_recipients SET name = $1, pix_key = $2, pix_type = $3, is_active = $4, updated_at = now() WHERE id = $5 AND league_id = $6`,
            [input.name, input.pixKey, input.pixType || null, input.active !== false, input.id, leagueId],
          );
        } else {
          await client.query(
            `INSERT INTO public.payment_recipients (league_id, name, pix_key, pix_type, is_active, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [leagueId, input.name, input.pixKey, input.pixType || null, input.active !== false, userId],
          );
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }

  async setPaymentRecipientActive(leagueId: string, id: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `UPDATE public.payment_recipients SET is_active = $1, updated_at = now() WHERE id = $2 AND league_id = $3`,
          [active, id, leagueId],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }

  async getPaymentRounds(leagueId: string): Promise<PaymentRound[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT id, number, date, status, round_type, payment_pix, payment_total, payment_recipient_name,
                COALESCE(payment_extra_time_total, 0) as payment_extra_time_total,
                COALESCE(payment_extra_time_player_ids, ARRAY[]::uuid[]) as payment_extra_time_player_ids,
                COALESCE(payment_ball_fund_total, 0) as payment_ball_fund_total,
                COALESCE(payment_ball_fund_player_ids, ARRAY[]::uuid[]) as payment_ball_fund_player_ids
         FROM public.rounds
         WHERE league_id = $1
         ORDER BY date DESC, number DESC`,
        [leagueId],
      );
      return res.rows.map((r: any) => ({
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
    });
  }

  async getLatestFinishedRoundPaymentState(leagueId: string) {
    return this.withClient(async (client) => {
      const roundRes = await client.query<{ id: string }>(
        `SELECT id FROM public.rounds WHERE league_id = $1 AND round_type = 'official' AND status = 'finished' ORDER BY date DESC, number DESC LIMIT 1`,
        [leagueId],
      );
      const roundId = roundRes.rows[0]?.id;
      if (!roundId) return null;

      const [participantsRes, paymentsRes] = await Promise.all([
        client.query<{ id: string; is_monthly_payer: boolean }>(
          `SELECT p.id, COALESCE(lm.is_monthly_payer, false) as is_monthly_payer
           FROM public.round_players rp
           JOIN public.players p ON p.id = rp.player_id
           LEFT JOIN public.league_members lm ON lm.player_id = p.id AND lm.league_id = $1
           WHERE rp.round_id = $2`,
          [leagueId, roundId],
        ),
        client.query<{ player_id: string; paid: boolean }>(
          `SELECT player_id, paid FROM public.round_payments WHERE round_id = $1`,
          [roundId],
        ),
      ]);

      return {
        participants: participantsRes.rows,
        payments: paymentsRes.rows,
      };
    });
  }

  async getRoundPaymentWorkspace(roundId: string): Promise<any | null> {
    return this.withClient(async (client) => {
      try {
        const rpcRes = await client.query<any>(
          `SELECT public.get_round_payment_read_model($1::uuid) as model`,
          [roundId],
        );
        if (rpcRes.rows[0]?.model) return rpcRes.rows[0].model;
      } catch {
        // Fallback para leitura direta da rodada se RPC nao estiver disponivel
      }
      const res = await client.query<any>(
        `SELECT r.id, r.number, r.date, r.status, r.round_type, r.payment_pix, r.payment_total, r.payment_recipient_name
         FROM public.rounds r WHERE r.id = $1 LIMIT 1`,
        [roundId],
      );
      return res.rows[0] || null;
    });
  }

  async getRoundPaymentPlayers(leagueId: string, roundId: string): Promise<PaymentPlayer[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT p.id, p.name, p.avatar_url,
                COALESCE(rp.paid, false) as paid,
                rp.paid_at
         FROM public.round_players rpl
         JOIN public.players p ON p.id = rpl.player_id
         LEFT JOIN public.round_payments rp ON rp.round_id = $2 AND rp.player_id = p.id
         WHERE rpl.round_id = $2
         ORDER BY p.name ASC`,
        [leagueId, roundId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        avatar_url: r.avatar_url,
        paid: Boolean(r.paid),
        paid_at: r.paid_at || null,
      }));
    });
  }

  async getRoundPaymentObligations(leagueId: string, roundId: string): Promise<PaymentObligation[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT id, round_id, player_id, recipient_name, recipient_pix, amount_due, amount_paid, status
         FROM public.round_payment_obligations
         WHERE round_id = $1`,
        [roundId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        round_id: r.round_id,
        player_id: r.player_id,
        recipient_name: r.recipient_name,
        recipient_pix: r.recipient_pix,
        amount_due: Number(r.amount_due),
        amount_paid: Number(r.amount_paid),
        status: r.status,
      }));
    });
  }

  async setPaymentObligationPaid(id: string, amountPaid: number): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `SELECT public.set_round_payment_obligation_paid($1::uuid, $2::numeric)`,
          [id, amountPaid],
        );
        return { success: true };
      } catch {
        try {
          await client.query(
            `UPDATE public.round_payment_obligations
             SET amount_paid = $1,
                 status = CASE WHEN $1 >= amount_due THEN 'paid' ELSE 'partial' END,
                 paid_at = CASE WHEN $1 >= amount_due THEN now() ELSE paid_at END,
                 updated_at = now()
             WHERE id = $2::uuid`,
            [amountPaid, id],
          );
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }
    });
  }

  async setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean, changedByUserId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `INSERT INTO public.round_payments (round_id, player_id, paid, paid_at)
           VALUES ($1::uuid, $2::uuid, $3, CASE WHEN $3 THEN now() ELSE null END)
           ON CONFLICT (round_id, player_id)
           DO UPDATE SET paid = $3, paid_at = CASE WHEN $3 THEN now() ELSE null END`,
          [roundId, playerId, paid],
        );

        // Inserir registro de auditoria defensivo se a tabela existir
        await client.query(
          `INSERT INTO public.round_payment_audit (round_id, target_player_id, paid, changed_by_user_id, created_at)
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, now())`,
          [roundId, playerId, paid, changedByUserId],
        ).catch(() => {});

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }

  async getRoundExpenseSelections(leagueId: string, roundId: string): Promise<RoundExpenseSelection[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT expense_item_id, installment_number
         FROM public.round_expense_installments
         WHERE round_id = $1 AND status = 'active'`,
        [roundId],
      );
      return res.rows.map((r: any) => ({
        expense_item_id: r.expense_item_id,
        installment_number: Number(r.installment_number),
      }));
    });
  }

  async syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[]): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        await client.query(
          `SELECT public.sync_round_payment_plan($1::uuid, $2::uuid[])`,
          [roundId, expenseItemIds],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
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
    return this.withClient(async (client) => {
      try {
        await client.query(
          `UPDATE public.rounds
           SET payment_pix = $1,
               payment_total = $2,
               payment_extra_time_total = $3,
               payment_extra_time_player_ids = $4,
               payment_ball_fund_total = $5,
               payment_ball_fund_player_ids = $6
           WHERE id = $7::uuid AND league_id = $8::uuid`,
          [
            input.paymentPix,
            input.paymentTotal,
            input.extraTimeTotal,
            input.extraTimePlayerIds || [],
            input.ballFundTotal,
            input.ballFundPlayerIds || [],
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
    });
  }

  async getRoundPaymentChargeLines(leagueId: string, roundId: string): Promise<PaymentChargeLine[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT id, player_id, recipient_name, recipient_pix, label, amount, charge_type
         FROM public.round_payment_charge_lines
         WHERE round_id = $1`,
        [roundId],
      );
      return res.rows.map((r: any) => ({
        id: Number(r.id),
        player_id: r.player_id,
        recipient_name: r.recipient_name,
        recipient_pix: r.recipient_pix,
        label: r.label,
        amount: Number(r.amount),
        charge_type: r.charge_type,
      }));
    });
  }

  async getPaymentAuditLog(leagueId: string): Promise<PaymentAuditLogEntry[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT pal.id, pal.round_id, pal.target_player_id, pal.paid, pal.changed_by_player_id, pal.created_at,
                COALESCE(pal.target_player_name, tp.name, 'Jogador') as target_player_name,
                COALESCE(pal.changed_by_name, cp.name, 'Sistema') as changed_by_name,
                r.number as round_number, r.date as round_date, r.round_type
         FROM public.round_payment_audit pal
         LEFT JOIN public.players tp ON tp.id = pal.target_player_id
         LEFT JOIN public.players cp ON cp.id = pal.changed_by_player_id
         JOIN public.rounds r ON r.id = pal.round_id
         WHERE r.league_id = $1
         ORDER BY pal.created_at DESC LIMIT 100`,
        [leagueId],
      );
      return res.rows.map((r: any) => ({
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
    });
  }
}
