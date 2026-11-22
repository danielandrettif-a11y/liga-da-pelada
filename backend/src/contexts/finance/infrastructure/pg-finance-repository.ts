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

  private async withClient<T>(callback: (client: PoolClient) => Promise<T>, userId: string): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      if (!userId) throw new Error("Identidade autenticada obrigatória.");
      {
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true), set_config('search_path', 'public, auth', true)",
          [userId, JSON.stringify({ sub: userId, role: "authenticated" })],
        );
      }
      const res = await callback(client);
      if (res && typeof res === "object" && "success" in res && res.success === false) {
        await client.query("ROLLBACK");
        return res;
      }
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
        `SELECT public.is_league_admin($1::uuid) AS is_admin`,
        [leagueId],
      );
      return Boolean(res.rows[0]?.is_admin);
    }, actor.userId);
  }

  async getExpenseItems(leagueId: string, includeArchived: boolean, userId: string): Promise<ExpenseItem[]> {
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
           WHERE ei.league_id = $1 AND ei.status = 'active'
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
        paid_installments: Number(r.paid_installments || 0) + Number(r.paid_installments_before_app || 0),
        paid_installments_before_app: Number(r.paid_installments_before_app || 0),
      }));
    }, userId);
  }

  async saveExpenseItem(leagueId: string, userId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const recipient = await client.query("SELECT 1 FROM public.payment_recipients WHERE id=$1::uuid AND league_id=$2::uuid AND is_active", [input.recipientId, leagueId]);
        if (!recipient.rowCount) return { success: false, error: "Escolha um PIX ativo desta pelada." };
        await client.query(
          `INSERT INTO public.league_expense_items (league_id, name, description, total_amount, installment_count, recipient_id, created_by, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
          [leagueId, input.name, input.description || null, input.totalAmount, input.installmentCount, input.recipientId, userId],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived", userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const updated = await client.query(
          `UPDATE public.league_expense_items SET status = $1, updated_at = now() WHERE id = $2 AND league_id = $3`,
          [status, id, leagueId],
        );
        if (!updated.rowCount) return { success: false, error: "Item não encontrado nesta pelada." };
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const item = await client.query<{ installment_count: number; registered_count: number }>(
          `SELECT e.installment_count, (SELECT count(*)::int FROM public.round_expense_installments i WHERE i.expense_item_id=e.id AND i.status='active') AS registered_count
           FROM public.league_expense_items e WHERE e.id=$1::uuid AND e.league_id=$2::uuid FOR UPDATE`, [id, leagueId]);
        if (!item.rows[0]) return { success: false, error: "Item não pertence a esta pelada." };
        if (paidInstallments + item.rows[0].registered_count > item.rows[0].installment_count) {
          return { success: false, error: "A quantidade informada ultrapassa o total ao considerar as parcelas já lançadas." };
        }
        await client.query(
          `UPDATE public.league_expense_items SET paid_installments_before_app = $1, updated_at = now() WHERE id = $2 AND league_id = $3`,
          [paidInstallments, id, leagueId],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async getPaymentRecipients(leagueId: string, includeInactive: boolean, userId: string): Promise<PaymentRecipient[]> {
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
    }, userId);
  }

  async savePaymentRecipient(leagueId: string, userId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        if (input.id) {
          const updated = await client.query(
            `UPDATE public.payment_recipients SET name = $1, pix_key = $2, pix_type = $3, is_active = $4, updated_at = now() WHERE id = $5 AND league_id = $6`,
            [input.name, input.pixKey, input.pixType || null, input.active !== false, input.id, leagueId],
          );
          if (!updated.rowCount) return { success: false, error: "Destinatário não encontrado nesta pelada." };
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
    }, userId);
  }

  async setPaymentRecipientActive(leagueId: string, id: string, active: boolean, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const updated = await client.query(
          `UPDATE public.payment_recipients SET is_active = $1, updated_at = now() WHERE id = $2 AND league_id = $3`,
          [active, id, leagueId],
        );
        if (!updated.rowCount) return { success: false, error: "Destinatário não encontrado nesta pelada." };
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async getPaymentRounds(leagueId: string, userId: string): Promise<PaymentRound[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT id, number, date, status, round_type, payment_pix, payment_total, payment_recipient_name,
                COALESCE(payment_extra_time_total, 0) as payment_extra_time_total,
                COALESCE(payment_extra_time_player_ids, ARRAY[]::uuid[]) as payment_extra_time_player_ids,
                COALESCE(payment_ball_fund_total, 0) as payment_ball_fund_total,
                COALESCE(payment_ball_fund_player_ids, ARRAY[]::uuid[]) as payment_ball_fund_player_ids
         FROM public.rounds
         WHERE league_id = $1 AND season_id = (SELECT id FROM public.seasons WHERE league_id=$1 AND status='active' LIMIT 1)
         ORDER BY date DESC, created_at DESC`,
        [leagueId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        number: Number(r.number),
        date: r.date,
        status: r.status,
        round_type: r.round_type,
        payment_pix: r.payment_pix,
        payment_total: r.payment_total == null ? null : Number(r.payment_total),
        payment_recipient_name: r.payment_recipient_name,
        payment_extra_time_total: Number(r.payment_extra_time_total),
        payment_extra_time_player_ids: Array.isArray(r.payment_extra_time_player_ids) ? r.payment_extra_time_player_ids : [],
        payment_ball_fund_total: Number(r.payment_ball_fund_total),
        payment_ball_fund_player_ids: Array.isArray(r.payment_ball_fund_player_ids) ? r.payment_ball_fund_player_ids : [],
      }));
    }, userId);
  }

  async getLatestFinishedRoundPaymentState(leagueId: string, userId: string) {
    return this.withClient(async (client) => {
      const roundRes = await client.query<{ id: string }>(
        `SELECT id FROM public.rounds WHERE league_id = $1 AND season_id = (SELECT id FROM public.seasons WHERE league_id=$1 AND status='active' LIMIT 1) AND status = 'finished' ORDER BY date DESC, created_at DESC LIMIT 1`,
        [leagueId],
      );
      const roundId = roundRes.rows[0]?.id;
      if (!roundId) return null;

      const [participantsRes, paymentsRes] = await Promise.all([
        client.query<{ id: string }>(
          `SELECT rp.player_id AS id FROM public.round_players rp WHERE rp.round_id = $1`,
          [roundId],
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
    }, userId);
  }

  async getRoundPaymentWorkspace(roundId: string, leagueId: string, userId: string): Promise<any | null> {
    return this.withClient(async (client) => {
      const scoped = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid", [roundId, leagueId]);
      if (!scoped.rowCount) return null;
      const res = await client.query<{ model: any }>("SELECT public.get_round_payment_read_model($1::uuid) AS model", [roundId]);
      const model = res.rows[0]?.model;
      if (!model || typeof model !== "object") return null;
      return {
        players: (model.players || []).map((entry: any) => ({ ...(entry.player || {}), paid: Boolean(entry.paid), paid_at: entry.paid_at || null })),
        obligations: (model.obligations || []).map((row: any) => ({ ...row, amount_due: Number(row.amount_due), amount_paid: Number(row.amount_paid) })),
        chargeLines: (model.charge_lines || []).map((row: any) => ({ ...row, amount: Number(row.amount) })),
        expenseSelections: (model.expense_installments || []).map((row: any) => ({ expense_item_id: row.expense_item_id, installment_number: Number(row.installment_number) })),
      };
    }, userId);
  }

  async getRoundPaymentPlayers(leagueId: string, roundId: string, userId: string): Promise<PaymentPlayer[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT p.*,
                COALESCE(rp.paid, false) as paid,
                rp.paid_at
         FROM public.round_players rpl
         JOIN public.rounds r ON r.id=rpl.round_id AND r.league_id=$1::uuid
         JOIN public.players p ON p.id = rpl.player_id
         LEFT JOIN public.round_payments rp ON rp.round_id = $2 AND rp.player_id = p.id
         WHERE rpl.round_id = $2
         ORDER BY p.name ASC`,
        [leagueId, roundId],
      );
      return res.rows.map((r: any) => ({
        ...r,
        paid: Boolean(r.paid),
        paid_at: r.paid_at || null,
      }));
    }, userId);
  }

  async getRoundPaymentObligations(leagueId: string, roundId: string, userId: string): Promise<PaymentObligation[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT id, round_id, player_id, recipient_name, recipient_pix, amount_due, amount_paid, status
         FROM public.round_payment_obligations
         WHERE round_id = $1 AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id=round_id AND r.league_id=$2::uuid)`,
        [roundId, leagueId],
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
    }, userId);
  }

  async setPaymentObligationPaid(leagueId: string, id: string, amountPaid: number, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const scoped = await client.query("SELECT 1 FROM public.round_payment_obligations o JOIN public.rounds r ON r.id=o.round_id WHERE o.id=$1::uuid AND r.league_id=$2::uuid", [id, leagueId]);
        if (!scoped.rowCount) return { success: false, error: "Obrigação não encontrada nesta pelada." };
        await client.query(
          `SELECT public.set_round_payment_obligation_paid($1::uuid, $2::numeric)`,
          [id, amountPaid],
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const participant = await client.query("SELECT 1 FROM public.round_players rp JOIN public.rounds r ON r.id=rp.round_id WHERE r.id=$1::uuid AND r.league_id=$2::uuid AND r.status='finished' AND rp.player_id=$3::uuid", [roundId, leagueId, playerId]);
        if (!participant.rowCount) return { success: false, error: "Rodada finalizada ou participante não encontrado nesta pelada." };
        await client.query(
          `INSERT INTO public.round_payments (round_id, player_id, paid, paid_at)
           VALUES ($1::uuid, $2::uuid, $3, CASE WHEN $3 THEN now() ELSE null END)
           ON CONFLICT (round_id, player_id)
           DO UPDATE SET paid = $3, paid_at = CASE WHEN $3 THEN now() ELSE null END`,
          [roundId, playerId, paid],
        );

        if (paid) {
          await client.query("SAVEPOINT optional_collective_prune");
          try {
            await client.query("SELECT public.prune_collective_history_after_payment($1::uuid)", [roundId]);
            await client.query("RELEASE SAVEPOINT optional_collective_prune");
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT optional_collective_prune");
            await client.query("RELEASE SAVEPOINT optional_collective_prune");
          }
        }

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async getRoundExpenseSelections(leagueId: string, roundId: string, userId: string): Promise<RoundExpenseSelection[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT expense_item_id, installment_number
         FROM public.round_expense_installments
         WHERE round_id = $1 AND league_id=$2::uuid AND status = 'active'`,
        [roundId, leagueId],
      );
      return res.rows.map((r: any) => ({
        expense_item_id: r.expense_item_id,
        installment_number: Number(r.installment_number),
      }));
    }, userId);
  }

  async syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[], userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      try {
        const scoped = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid AND status='finished'", [roundId, leagueId]);
        if (!scoped.rowCount) return { success: false, error: "A cobrança só pode ser alterada em uma rodada finalizada desta pelada." };
        const result = await client.query<{ synced: boolean }>(
          `SELECT public.sync_round_payment_plan($1::uuid, $2::uuid[]) AS synced`,
          [roundId, expenseItemIds],
        );
        if (result.rows[0]?.synced !== true) return { success: false, error: "Não foi possível atualizar o rateio." };
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
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
    return this.withClient(async (client) => {
      try {
        const scoped = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid", [input.roundId, leagueId]);
        if (!scoped.rowCount) return { success: false, error: "Rodada fora da pelada selecionada." };
        const updated = await client.query<{ updated: boolean }>(
          "SELECT public.update_round_payment_details_v2($1::uuid,$2::text,$3::numeric,$4::numeric,$5::uuid[],$6::numeric,$7::uuid[]) AS updated",
          [input.roundId, input.paymentPix.trim(), input.paymentTotal, input.extraTimeTotal,
            input.extraTimeTotal > 0 ? [...new Set(input.extraTimePlayerIds || [])] : [], input.ballFundTotal,
            input.ballFundTotal > 0 ? [...new Set(input.ballFundPlayerIds || [])] : []],
        );
        if (!updated.rows[0]?.updated) return { success: false, error: "Rodada finalizada não encontrada." };
        const synced = await client.query<{ synced: boolean }>(
          "SELECT public.sync_round_payment_plan($1::uuid, ARRAY(SELECT DISTINCT expense_item_id FROM public.round_expense_installments WHERE round_id=$1::uuid AND league_id=$2::uuid AND status='active')) AS synced",
          [input.roundId, leagueId],
        );
        if (synced.rows[0]?.synced !== true) return { success: false, error: "Não foi possível atualizar o rateio." };
        return {
          success: true,
          details: {
            pix: input.paymentPix.trim(),
            total: Math.round(Number(input.paymentTotal) * 100) / 100,
            extraTimeTotal: Math.round(Number(input.extraTimeTotal) * 100) / 100,
            extraTimePlayerIds: input.extraTimeTotal > 0 ? [...new Set(input.extraTimePlayerIds || [])] : [],
            ballFundTotal: Math.round(Number(input.ballFundTotal) * 100) / 100,
            ballFundPlayerIds: input.ballFundTotal > 0 ? [...new Set(input.ballFundPlayerIds || [])] : [],
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }, userId);
  }

  async getRoundPaymentChargeLines(leagueId: string, roundId: string, userId: string): Promise<PaymentChargeLine[]> {
    return this.withClient(async (client) => {
      const res = await client.query<any>(
        `SELECT id, player_id, recipient_name, recipient_pix, label, amount, charge_type
         FROM public.round_payment_charge_lines
         WHERE round_id = $1 AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id=round_id AND r.league_id=$2::uuid)`,
        [roundId, leagueId],
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
    }, userId);
  }

  async getPaymentAuditLog(leagueId: string, userId: string): Promise<PaymentAuditLogEntry[]> {
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
         ORDER BY pal.id DESC LIMIT 1000`,
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
    }, userId);
  }
}
